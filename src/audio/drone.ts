/**
 * 배경음. 녹음된 곡 대신 «방 하나»를 실시간으로 짓는다.
 *
 * **왜 절차적인가.** 두 곡을 mp3로 넣으면 그것만으로 번들이 수 MB다. 이 판의 배경음은
 * 멜로디가 필요한 게 아니라 «방의 공기»라서, 지속음 몇 겹과 걸러진 잡음이면 된다.
 * 그리고 루프 이음매가 없다 — 파일 루프는 몇 분 듣다 보면 끊기는 지점이 귀에 걸린다.
 *
 * **곡을 «스산하게» 만드는 것은 음이 아니라 네 가지다.**
 * 1. **잔향** — 소리가 벽에 부딪혀 돌아와야 «넓고 빈 방»이 된다. 마른 소리는 책상 위 스피커다.
 * 2. **공기** — 걸러진 잡음이 바닥에 깔려야 방이 «비어 있다»고 들린다. 완전한 무음은 오히려 죽은 화면이다.
 * 3. **움직임** — 아무것도 변하지 않는 곡은 30초면 지겹다. 차단점과 음정을 아주 느리게 흔든다.
 * 4. **불협** — 완전히 맞는 화음은 편안하다. 어긋난 한 쌍을 «들릴락 말락» 깔면 이유 없이 불안해진다.
 *
 * 두 곡의 차이는 **방의 크기와 무엇이 움직이느냐**다. 표지·브리핑(intro)은 아무도 없는
 * 큰 방이라 잔향이 길고 공기만 흐르고, 원탁(table)은 사람이 둘러앉은 좁은 방이라
 * 잔향이 짧게 붙고 저역 두드림이 불규칙하게 끼어든다.
 */

import { bed, channel, now, sendToReverb, sustain, tone } from './engine'
import type { BedSpec, SustainSpec } from './engine'

export type BgmName = 'intro' | 'table'

export interface DroneHandle {
  /** 0~1. audio.ts의 페이드가 50ms마다 이걸 부른다. */
  setGain(value: number): void
  stop(): void
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

/** 저역 두드림. 간격이 일정하면 메트로놈이라, 범위로 준다. */
interface Pulse {
  readonly from: number
  readonly to: number
  readonly gain: number
  readonly decay: number
  readonly minMs: number
  readonly maxMs: number
}

interface Track {
  readonly layers: readonly SustainSpec[]
  readonly bed: BedSpec
  readonly sprinkle: Sprinkle
  readonly pulse?: Pulse
  /** 이 곡이 방에 젖는 정도. 큰 방일수록 높다. */
  readonly room: number
}

const TRACKS: Record<BgmName, Track> = {
  /*
   * 표지·브리핑. A1을 바닥에 깔고 5도만 얹는다. 3도를 넣지 않는 이유는 그 순간
   * 곡에 «장조/단조»가 생겨 감정이 정해지기 때문이다 — 아직 아무 일도 안 일어난 화면이다.
   *
   * 대신 맨 위에 1568Hz 한 쌍을 «거의 안 들리게» 얹었다. 3.4Hz로 맥놀이하는 고음은
   * 귀에 «소리»가 아니라 «냉기»로 걸린다. 이걸 키우면 즉시 공포영화가 되므로 0.012에 묶어 둔다.
   */
  intro: {
    room: 0.62,
    layers: [
      { type: 'triangle', hz: 55.0, gain: 0.28, drift: { cents: 4, rate: 0.055 } },
      { type: 'triangle', hz: 55.28, gain: 0.28, drift: { cents: 5, rate: 0.041 } },
      { type: 'sine', hz: 110.0, gain: 0.12 },
      { type: 'sine', hz: 164.8, gain: 0.05 },
      { type: 'sine', hz: 1568.0, gain: 0.012, drift: { cents: 9, rate: 0.07 } },
      { type: 'sine', hz: 1571.4, gain: 0.012 },
    ],
    /* 30초에 한 번 오가는 밝기. 의식적으로는 안 들리고, 없으면 곡이 멎어 있다. */
    bed: { gain: 0.085, cutoff: 380, depth: 220, rate: 0.033 },
    /*
     * 간헐음을 11~24초로 늘리고 꼬리를 4.6초로 뺐다. 잔향이 그 위에 다시 붙으므로
     * 소리가 «멀리서 울리다 사라지는» 것으로 들린다. 잦으면 그냥 «삐 소리 나는 화면»이다.
     */
    sprinkle: {
      type: 'sine',
      notes: [440.0, 523.3, 659.3],
      gain: 0.1,
      attack: 0.02,
      decay: 4.6,
      minMs: 11000,
      maxMs: 24000,
    },
  },

  /*
   * 원탁. 바닥을 D1까지 내려 방을 좁힌다. 잔향을 intro보다 낮춘 이유는
   * 사람이 둘러앉은 자리이기 때문이다 — 여기까지 넓으면 심문이 아니라 폐허가 된다.
   *
   * 587.3(D)과 622.3(D#)은 반음 차다. 이 한 쌍이 이 곡에서 가장 중요한 값이다.
   * 소리로는 거의 안 잡히는데, 빼고 들어보면 방이 갑자기 «안전»해진다.
   */
  table: {
    room: 0.46,
    layers: [
      { type: 'triangle', hz: 36.71, gain: 0.3, drift: { cents: 5, rate: 0.037 } },
      { type: 'triangle', hz: 36.94, gain: 0.3, drift: { cents: 6, rate: 0.029 } },
      { type: 'sine', hz: 73.4, gain: 0.11 },
      { type: 'triangle', hz: 110.0, gain: 0.045 },
      { type: 'sine', hz: 587.3, gain: 0.016, drift: { cents: 7, rate: 0.05 } },
      { type: 'sine', hz: 622.3, gain: 0.013 },
    ],
    bed: { gain: 0.11, cutoff: 260, depth: 150, rate: 0.026 },
    /* 415.3은 D의 트라이톤이다. 세 음 중 하나만 어긋나 있어서 떨어질 때마다 «잘못 짚은» 느낌이 남는다. */
    sprinkle: {
      type: 'triangle',
      notes: [293.7, 349.2, 415.3],
      gain: 0.06,
      attack: 0.01,
      decay: 2.6,
      minMs: 9000,
      maxMs: 19000,
    },
    /*
     * 예전에는 2.1초 정박이었는데, 정확히 일정한 간격은 «심장»이 아니라 «메트로놈»으로 들린다.
     * 2.6~3.6초로 흩으면 같은 소리가 «저 밖에서 누가 움직이고 있다»가 된다.
     */
    pulse: { from: 58, to: 30, gain: 0.34, decay: 0.9, minMs: 2600, maxMs: 3600 },
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

  /* 채널째로 방에 넣는다. 음마다 따로 보내면 잔향이 겹겹이 쌓여 곡이 진창이 된다. */
  sendToReverb(out, track.room)

  for (const layer of track.layers) {
    const stop = sustain(layer, out)
    if (stop) stops.push(stop)
  }

  const stopBed = bed(track.bed, out)
  if (stopBed) stops.push(stopBed)

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
      repeat(pulse.minMs, pulse.maxMs, () => {
        tone(now() + 0.01, {
          type: 'sine',
          from: pulse.from,
          to: pulse.to,
          gain: pulse.gain,
          attack: 0.012,
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
