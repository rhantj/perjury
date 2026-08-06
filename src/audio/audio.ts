/**
 * 소리. 배경음 2곡과 효과음 3종을 켜고 끄는 곳이다.
 *
 * **음원 파일이 하나도 없어도 정상 동작한다.** 정적 import를 쓰면 파일이 없는 동안
 * 빌드가 깨져 main이 막히므로, glob으로 «있는 것만» 읽고 없으면 조용히 넘어간다.
 * 소리는 게임 진행에 필요한 것이 아니라서, 실패가 판을 멈추게 두지 않는다(절대 규칙 4와 같은 태도).
 *
 * 파일을 넣는 곳은 `src/assets/audio/`이고 이름이 곧 계약이다:
 *   bgm_intro.mp3 · bgm_table.mp3 · sfx_suggest.mp3 · sfx_refute.mp3 · sfx_perjury.mp3
 */

/*
 * Vite가 해시를 붙이고 base('/perjury/')까지 반영한 URL을 준다.
 * public/에 두면 이 두 가지를 손으로 맞춰야 하고, 로컬만 되고 배포본은 404가 나는 함정에 걸린다.
 */
const SOURCES = import.meta.glob<string>('../assets/audio/*.mp3', {
  eager: true,
  query: '?url',
  import: 'default',
})

export type BgmName = 'intro' | 'table'
export type SfxName = 'suggest' | 'refute' | 'perjury'

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
let current: { name: BgmName; el: HTMLAudioElement } | null = null

/**
 * 재생 거부를 삼킨다. 자동재생 정책·코덱 미지원·파일 없음이 전부 여기로 오는데,
 * 어느 쪽이든 «소리가 안 난다»가 옳은 결과다. 던지면 호출한 화면이 같이 죽는다.
 */
function play(el: HTMLAudioElement): void {
  void el.play().catch(() => {})
}

/** 볼륨을 목표까지 끌고 간다. 끝나면 done을 부른다. */
function fade(el: HTMLAudioElement, to: number, done?: () => void): void {
  const from = el.volume
  const steps = Math.max(1, Math.round(FADE_MS / FADE_TICK_MS))
  let step = 0
  const timer = window.setInterval(() => {
    step += 1
    const ratio = step / steps
    /* 0~1 밖으로 나가면 브라우저가 던진다 — 부동소수점 오차만으로도 넘어간다. */
    el.volume = Math.min(1, Math.max(0, from + (to - from) * ratio))
    if (step >= steps) {
      window.clearInterval(timer)
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

  const url = urlOf(`bgm_${name}`)
  if (!url) return

  const previous = current
  if (previous) {
    fade(previous.el, 0, () => {
      previous.el.pause()
    })
  }

  const el = new Audio(url)
  el.loop = true
  el.volume = 0
  current = { name, el }
  play(el)
  if (!muted) fade(el, BGM_VOLUME)
}

/**
 * 효과음 한 방. 매번 새 Audio를 만드는 이유는 하나를 돌려 쓰면
 * 앞의 소리가 아직 울리는 중에 다음 것이 그것을 잘라먹기 때문이다.
 * 파일은 브라우저가 캐시하므로 새로 받지 않는다.
 */
export function playSfx(name: SfxName): void {
  if (muted || !unlocked) return
  const url = urlOf(`sfx_${name}`)
  if (!url) return
  const el = new Audio(url)
  el.volume = SFX_VOLUME
  play(el)
}

/** 첫 클릭에서 부른다. 이걸 부르기 전에는 어떤 소리도 나지 않는다. */
export function unlock(): void {
  if (unlocked) return
  unlocked = true
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

  const el = current?.el
  if (!el) return
  if (next) {
    fade(el, 0, () => el.pause())
    return
  }
  play(el)
  fade(el, BGM_VOLUME)
}
