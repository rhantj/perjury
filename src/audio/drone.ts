/**
 * 배경음. 녹음된 곡 대신 «계속 울리는 저음 + 가끔 떨어지는 한 음»을 실시간으로 쌓는다.
 *
 * **왜 절차적인가.** 두 곡을 mp3로 넣으면 그것만으로 번들이 수 MB다. 이 판의 배경음은
 * 멜로디가 필요한 게 아니라 «방의 공기»라서, 멎지 않는 저역 하나와 간헐음 몇 개면 된다.
 * 그리고 루프 이음매가 없다 — 파일 루프는 몇 분 듣다 보면 끊기는 지점이 귀에 걸린다.
 *
 * 두 곡의 차이는 **박동이 있느냐**다. 표지·브리핑(intro)은 정지한 방이라 저역만 깔리고,
 * 원탁(table)은 심문이 도는 자리라 낮은 맥박이 일정하게 찍힌다.
 */

import { channel, now, sustain, tone } from './engine'

export type BgmName = 'intro' | 'table'

export interface DroneHandle {
  /** 0~1. audio.ts의 페이드가 50ms마다 이걸 부른다. */
  setGain(value: number): void
  stop(): void
}

/** 지속음 한 겹. 살짝 어긋난 짝을 겹치면 «웅—웅» 하는 느린 맥놀이가 생겨 방이 살아 있게 들린다. */
interface Layer {
  readonly type: OscillatorType
  readonly hz: number
  readonly gain: number
}

/** 가끔 떨어지는 한 음. 음정을 돌아가며 쓰지 않고 무작위로 고른다 — 순서가 읽히면 곡이 «반복»으로 들린다. */
interface Sprinkle {
  readonly type: OscillatorType
  readonly notes: readonly number[]
  readonly gain: number
  readonly attack: number
  readonly decay: number
  readonly minMs: number
  readonly maxMs: number
}

interface Track {
  readonly layers: readonly Layer[]
  readonly sprinkle: Sprinkle
  /** 저역 맥박. 없으면 박동 없는 곡이다. */
  readonly pulse?: {
    readonly from: number
    readonly to: number
    readonly gain: number
    readonly decay: number
    readonly everyMs: number
  }
}

const TRACKS: Record<BgmName, Track> = {
  /*
   * 표지·브리핑. A1을 바닥에 깔고 5도만 얹는다. 3도를 넣지 않는 이유는 그 순간
   * 곡에 «장조/단조»가 생겨 감정이 정해지기 때문이다 — 아직 아무 일도 안 일어난 화면이다.
   */
  intro: {
    layers: [
      { type: 'triangle', hz: 55.0, gain: 0.34 },
      { type: 'triangle', hz: 55.35, gain: 0.34 },
      { type: 'sine', hz: 110.0, gain: 0.16 },
      { type: 'sine', hz: 164.8, gain: 0.07 },
    ],
    sprinkle: {
      type: 'sine',
      notes: [440.0, 523.3, 659.3],
      gain: 0.15,
      attack: 0.01,
      decay: 3.4,
      minMs: 7000,
      maxMs: 15000,
    },
  },

  /*
   * 원탁. 바닥을 D1까지 내려 방을 좁히고, 2.1초마다 저역을 한 번 친다.
   * 사람 안정 시 심박(약 1초)보다 느리게 잡은 값이다 — 심박과 같으면 초조하고,
   * 이만큼 느리면 «누군가 기다리고 있다»로 들린다.
   */
  table: {
    layers: [
      { type: 'triangle', hz: 36.7, gain: 0.36 },
      { type: 'triangle', hz: 36.95, gain: 0.36 },
      { type: 'sine', hz: 73.4, gain: 0.14 },
      { type: 'triangle', hz: 110.0, gain: 0.06 },
    ],
    sprinkle: {
      type: 'triangle',
      notes: [293.7, 349.2, 440.0],
      gain: 0.09,
      attack: 0.006,
      decay: 1.4,
      minMs: 6000,
      maxMs: 13000,
    },
    pulse: { from: 55, to: 41, gain: 0.4, decay: 0.5, everyMs: 2100 },
  },
}

/** 무작위 간격으로 되풀이한다. 멈추는 손잡이를 돌려준다. */
function repeat(minMs: number, maxMs: number, run: () => void): () => void {
  const wait = () => minMs + Math.random() * (maxMs - minMs)
  let timer = window.setTimeout(function tick() {
    run()
    timer = window.setTimeout(tick, wait())
  }, wait())
  return () => window.clearTimeout(timer)
}

/**
 * 곡을 건다. 컨텍스트가 없으면 null — 호출부(audio.ts)는 이걸 «소리 없음»으로 받는다.
 *
 * 볼륨 0에서 시작한다. 페이드를 audio.ts가 쥐고 있어야 곡을 갈아탈 때
 * 앞 곡이 잦아드는 동안 뒷 곡이 올라오는 겹침이 만들어진다.
 */
export function startDrone(name: BgmName): DroneHandle | null {
  const out = channel()
  if (!out) return null

  const track = TRACKS[name]
  const stops: Array<() => void> = []

  for (const layer of track.layers) {
    const stop = sustain(layer.type, layer.hz, layer.gain, out)
    if (stop) stops.push(stop)
  }

  const sprinkle = track.sprinkle
  stops.push(
    repeat(sprinkle.minMs, sprinkle.maxMs, () => {
      const hz = sprinkle.notes[Math.floor(Math.random() * sprinkle.notes.length)]
      /* noUncheckedIndexedAccess — 범위 안이어도 타입에는 undefined가 섞여 있다. */
      if (hz === undefined) return
      tone(now() + 0.01, {
        type: sprinkle.type,
        from: hz,
        gain: sprinkle.gain,
        attack: sprinkle.attack,
        decay: sprinkle.decay,
        target: out,
      })
    }),
  )

  const pulse = track.pulse
  if (pulse) {
    stops.push(
      repeat(pulse.everyMs, pulse.everyMs, () => {
        tone(now() + 0.01, {
          type: 'sine',
          from: pulse.from,
          to: pulse.to,
          gain: pulse.gain,
          attack: 0.01,
          decay: pulse.decay,
          target: out,
        })
      }),
    )
  }

  return {
    setGain(value) {
      /*
       * setValueAtTime으로 툭툭 옮기면 50ms마다 계단이 생겨 «지직»거린다.
       * setTargetAtTime은 목표로 부드럽게 수렴하므로 페이드가 매끈하게 이어진다.
       */
      out.gain.setTargetAtTime(Math.min(1, Math.max(0, value)), now(), 0.02)
    },
    stop() {
      for (const stop of stops) stop()
      out.disconnect()
    },
  }
}
