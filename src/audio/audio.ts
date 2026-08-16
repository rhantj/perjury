/**
 * 소리. 배경음 2곡과 효과음 12종을 켜고 끄는 곳이다.
 *
 * **음원 파일이 하나도 없어도 정상 동작한다.** 파일이 있으면 그것을 틀고, 없으면
 * 그 자리에서 합성한다(engine·synth·drone). 소리는 게임 진행에 필요한 것이 아니라서,
 * 어느 쪽도 안 되면 조용히 넘어간다 — 실패가 판을 멈추게 두지 않는다(절대 규칙 4).
 *
 * **파일이 항상 이긴다.** 합성음은 «없는 것보다 낫다»는 자리를 메우는 것이지 최종본이
 * 아니다. 나중에 진짜 음원을 넣으면 아래 이름만 맞추면 코드를 고치지 않아도 그쪽이 쓰인다:
 *   bgm_intro · bgm_table · sfx_suggest · sfx_refute · sfx_perjury · sfx_challenge ·
 *   sfx_caught · sfx_wrongCall · sfx_round · sfx_myTurn · sfx_draw · sfx_ousted ·
 *   sfx_win · sfx_lose  (전부 `src/assets/audio/<이름>.mp3`)
 */

import { resume, setSfxGain } from './engine'
import { playSynthSfx } from './synth'
import { startDrone } from './drone'
import type { SfxName } from './synth'
import type { BgmName, DroneHandle } from './drone'

export type { SfxName } from './synth'
export type { BgmName } from './drone'

/*
 * Vite가 해시를 붙이고 base('/perjury/')까지 반영한 URL을 준다.
 * public/에 두면 이 두 가지를 손으로 맞춰야 하고, 로컬만 되고 배포본은 404가 나는 함정에 걸린다.
 *
 * 정적 import를 쓰면 파일이 없는 동안 빌드가 깨져 main이 막히므로,
 * glob으로 «있는 것만» 읽는다. 지금은 하나도 없어서 이 객체가 비어 있다.
 */
const SOURCES = import.meta.glob<string>('../assets/audio/*.mp3', {
  eager: true,
  query: '?url',
  import: 'default',
})

function urlOf(file: string): string | undefined {
  return SOURCES[`../assets/audio/${file}.mp3`]
}

/** 배경음은 계속 깔리므로 낮게 둔다. 대사를 읽는 화면이라 소리가 앞서면 방해가 된다. */
const BGM_VOLUME = 0.32
const SFX_VOLUME = 0.55
/** 곡을 갈아탈 때 겹치는 시간. 뚝 끊으면 화면 전환보다 소리가 먼저 튄다. */
const FADE_MS = 700
const FADE_TICK_MS = 50

const MUTED_KEY = 'perjury:muted'

function readMuted(): boolean {
  /* 사파리 프라이빗 모드는 localStorage 접근 자체가 던진다. 소리 설정 때문에 화면이 죽으면 안 된다. */
  try {
    return localStorage.getItem(MUTED_KEY) === '1'
  } catch {
    return false
  }
}

let muted = readMuted()
/**
 * 브라우저는 사용자가 페이지를 한 번 건드리기 전까지 재생을 거부한다.
 * 표지의 [게임 시작]이 그 지점이라, 그 전에 요청된 곡은 여기 넣어 두고 열리는 순간 튼다.
 */
let unlocked = false
let pending: BgmName | null = null

/**
 * 배경음 하나를 다루는 손잡이. 파일이든 합성이든 이 모양으로 감싸서
 * 페이드·음소거가 «무엇이 울리고 있는지» 몰라도 되게 한다.
 */
type BgmHandle = DroneHandle

interface Track {
  readonly name: BgmName
  readonly handle: BgmHandle
  /** 지금 볼륨. 페이드가 여기서 출발한다 — 합성음 쪽은 노드에서 현재값을 되읽을 수 없다. */
  gain: number
  /** 진행 중인 페이드. 새 페이드가 시작되면 이걸 먼저 끈다. */
  timer: number
}

let current: Track | null = null

/**
 * 재생 거부를 삼킨다. 자동재생 정책·코덱 미지원이 전부 여기로 오는데,
 * 어느 쪽이든 «소리가 안 난다»가 옳은 결과다. 던지면 호출한 화면이 같이 죽는다.
 */
function play(el: HTMLAudioElement): void {
  void el.play().catch(() => {})
}

function fileHandle(url: string): BgmHandle {
  const el = new Audio(url)
  el.loop = true
  el.volume = 0
  play(el)
  return {
    setGain(value) {
      /* 0~1 밖으로 나가면 브라우저가 던진다 — 부동소수점 오차만으로도 넘어간다. */
      el.volume = Math.min(1, Math.max(0, value))
    },
    stop() {
      el.pause()
    },
  }
}

function handleFor(name: BgmName): BgmHandle | null {
  const url = urlOf(`bgm_${name}`)
  return url ? fileHandle(url) : startDrone(name)
}

/**
 * 볼륨을 목표까지 끌고 간다. 끝나면 done을 부른다.
 *
 * 같은 곡에 페이드가 겹치면(음소거를 빠르게 껐다 켰다) 두 타이머가 서로 다른 목표로
 * 볼륨을 잡아당겨 소리가 떨린다. 그래서 새로 걸기 전에 이전 것을 끈다.
 */
function fade(track: Track, to: number, done?: () => void): void {
  window.clearInterval(track.timer)
  const from = track.gain
  const steps = Math.max(1, Math.round(FADE_MS / FADE_TICK_MS))
  let step = 0
  track.timer = window.setInterval(() => {
    step += 1
    const ratio = step / steps
    track.gain = Math.min(1, Math.max(0, from + (to - from) * ratio))
    track.handle.setGain(track.gain)
    if (step >= steps) {
      window.clearInterval(track.timer)
      done?.()
    }
  }, FADE_TICK_MS)
}

/**
 * 배경음을 건다. 같은 곡이면 아무것도 하지 않는다 —
 * 화면이 리렌더될 때마다 곡이 처음으로 되감기면 소리가 끊겨 들린다.
 */
export function playBgm(name: BgmName): void {
  if (current?.name === name) return

  if (!unlocked) {
    pending = name
    return
  }

  const previous = current
  if (previous) {
    fade(previous, 0, () => previous.handle.stop())
  }

  const handle = handleFor(name)
  if (!handle) {
    current = null
    return
  }

  /*
   * 음소거 중에도 곡은 «틀어 두고» 볼륨만 0으로 둔다.
   * 소리를 다시 켰을 때 곡이 처음부터 시작하지 않고 흐르던 자리에서 올라오게 하려는 것이다.
   */
  const track: Track = { name, handle, gain: 0, timer: 0 }
  handle.setGain(0)
  current = track
  if (!muted) fade(track, BGM_VOLUME)
}

/**
 * 배경음을 멎게 한다. playBgm의 짝이다.
 *
 * 음소거와 다르다. 음소거는 «틀어 둔 채 볼륨만 0»이라 효과음까지 같이 잠기지만,
 * 이건 곡 자체를 끊으므로 효과음은 그대로 들린다. 소리를 하나씩 확인할 때 필요하다.
 * 다시 걸면 처음부터 시작한다 — 흐르던 자리를 지키고 싶으면 setMuted를 쓴다.
 */
export function stopBgm(): void {
  pending = null
  const track = current
  if (!track) return
  current = null
  fade(track, 0, () => track.handle.stop())
}

/**
 * 효과음 한 방. 파일이 있으면 매번 새 Audio를 만든다 — 하나를 돌려 쓰면
 * 앞의 소리가 아직 울리는 중에 다음 것이 그것을 잘라먹기 때문이다.
 * 파일은 브라우저가 캐시하므로 새로 받지 않는다.
 */
export function playSfx(name: SfxName): void {
  if (muted || !unlocked) return
  const url = urlOf(`sfx_${name}`)
  if (url) {
    const el = new Audio(url)
    el.volume = SFX_VOLUME
    play(el)
    return
  }
  playSynthSfx(name)
}

/** 첫 클릭에서 부른다. 이걸 부르기 전에는 어떤 소리도 나지 않는다. */
export function unlock(): void {
  if (unlocked) return
  unlocked = true
  /* 합성음 쪽은 컨텍스트를 깨워야 한다 — 안 깨우면 예약만 쌓이고 아무것도 울리지 않는다. */
  resume()
  setSfxGain(SFX_VOLUME)
  const queued = pending
  pending = null
  if (queued) playBgm(queued)
}

export function isMuted(): boolean {
  return muted
}

export function setMuted(next: boolean): void {
  muted = next
  try {
    localStorage.setItem(MUTED_KEY, next ? '1' : '0')
  } catch {
    /* 저장에 실패해도 이번 판 동안은 설정이 살아 있다. 다음 방문에 기억하지 못할 뿐이다. */
  }

  const track = current
  if (!track) return
  fade(track, next ? 0 : BGM_VOLUME)
}
