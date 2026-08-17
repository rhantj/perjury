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

import { bed, burst, channel, grains, now, sendToReverb, sustain, tone, voice } from './engine'
import type { BedSpec, SustainSpec, VibratoSpec } from './engine'

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

/**
 * 유성기 표면잡음. 판이 도는 동안 바늘이 긁어 내는 «치직·톡».
 *
 * **경성을 소리로 옮기는 가장 짧은 길이다.** 어떤 음을 얹든 이 잡음이 위에 깔리는 순간
 * 곡은 «지금 나는 소리»가 아니라 «오래된 판에 담긴 소리»가 된다. 시대는 음정이 아니라
 * 매체가 정한다.
 *
 * 크기가 전부다. 들리게 넣으면 잡음이 주인공이 되고 방의 공기를 덮어 버리므로,
 * «있는지 없는지 모르겠는데 빼면 허전한» 자리에 묶는다.
 */
interface Crackle {
  readonly gain: number
  readonly minMs: number
  readonly maxMs: number
}

/**
 * 한 소절. 요나누키 단음계(라·도·레·미·솔) 다섯 음만 쓴다 — 2도와 6도를 뺀 이 음계가
 * 신민요·초기 트로트의 뼈대라, 다른 장치 없이 음계만으로 시대가 읽힌다.
 *
 * **국악기의 정체는 배음이 아니라 «음 하나가 가만히 있지 않는다»는 것이다.** 그래서
 * 오실레이터를 그냥 울리지 않고 톱니파를 사람 목과 비슷한 공명점에 통과시킨 뒤(해금·대금 쪽 음색),
 * 농현(vibrato)을 걸고 음을 살짝 위에서 짚어 내려앉힌다. 이 셋 중 하나만 빼도 즉시 신디사이저다.
 */
interface Melody {
  /** 고를 음(Hz). 음계 순서대로 놓는다 — 인접한 자리로 걷기 위해 순서가 의미를 갖는다. */
  readonly notes: readonly number[]
  /** 목의 공명점 셋. 낮고 좁을수록 어둡고 «먼» 악기가 된다. */
  readonly formants: readonly [number, number, number]
  /** 한 소절의 음 개수 범위. */
  readonly least: number
  readonly most: number
  /** 음과 음 사이(초). */
  readonly step: number
  readonly attack: number
  readonly decay: number
  readonly gain: number
  readonly vibrato: VibratoSpec
  readonly minMs: number
  readonly maxMs: number
}

interface Track {
  readonly layers: readonly SustainSpec[]
  readonly bed: BedSpec
  readonly sprinkle: Sprinkle
  readonly pulse?: Pulse
  readonly melody?: Melody
  readonly crackle?: Crackle
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
      /* 흔들림 폭을 키웠다. 늘어난 판이 도는 «늘어짐»은 음정이 미세하게 어긋날 때 생긴다. */
      { type: 'triangle', hz: 55.0, gain: 0.28, drift: { cents: 8, rate: 0.055 } },
      { type: 'triangle', hz: 55.28, gain: 0.28, drift: { cents: 10, rate: 0.041 } },
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
      /* 멜로디가 같은 음역을 쓰게 되어 뒤로 물렸다. 둘이 자주 겹치면 둘 다 «배경»이 된다. */
      gain: 0.07,
      attack: 0.02,
      decay: 4.6,
      minMs: 19000,
      maxMs: 36000,
    },
    /*
     * 라(220) 자리의 요나누키 단음계. 소절을 4~6음으로 길게 잡고 잔향에 깊이 담근다 —
     * 표지는 «멀리 어디선가 유성기가 돌고 있다»는 자리라, 가까이 들리면 그건 배경이 아니라 곡이다.
     */
    melody: {
      notes: [220.0, 261.6, 293.7, 329.6, 392.0, 440.0],
      formants: [420, 1180, 2650],
      least: 4,
      most: 6,
      step: 0.62,
      attack: 0.1,
      decay: 0.68,
      gain: 0.19,
      vibrato: { rate: 5.4, cents: 24 },
      /* 15~27초는 «한 번 듣고 마는» 간격이었다. 곡이라면 소절이 돌아와야 한다. */
      minMs: 9000,
      maxMs: 17000,
    },
    crackle: { gain: 0.055, minMs: 140, maxMs: 620 },
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
      { type: 'triangle', hz: 36.71, gain: 0.3, drift: { cents: 9, rate: 0.037 } },
      { type: 'triangle', hz: 36.94, gain: 0.3, drift: { cents: 11, rate: 0.029 } },
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
    /*
     * 레(146.8) 자리의 같은 음계. 표지와 갈리는 것은 세 가지다 —
     * **두세 음뿐이고, 한 옥타브 아래고, 공명점이 더 좁다.** 사람이 둘러앉아 있는 방이라
     * 곡이 앞으로 나오면 안 된다. 소절이 길면 그건 배경이 아니라 «누가 연주하고 있다»가 된다.
     *
     * 농현은 오히려 표지보다 깊다(28센트). 느리고 크게 흔들리는 음 두 개가
     * 짧은 소절보다 더 오래 방에 남는다.
     */
    melody: {
      notes: [146.8, 174.6, 196.0, 220.0, 261.6, 293.7],
      formants: [360, 980, 2400],
      least: 2,
      most: 3,
      step: 0.78,
      attack: 0.13,
      decay: 0.85,
      gain: 0.14,
      vibrato: { rate: 4.6, cents: 28 },
      minMs: 12000,
      maxMs: 22000,
    },
    /* 표지의 절반. 심문 중에 판 긁는 소리가 또렷하면 방이 아니라 다방이 된다. */
    crackle: { gain: 0.03, minMs: 220, maxMs: 900 },
  },
}

/**
 * 한 소절을 연주한다.
 *
 * **다음 음을 인접한 자리에서 고른다.** 음계에서 무작위로 뽑으면 그건 선율이 아니라
 * «음이 흩어진» 것이다. 가끔 두 칸을 뛰어야 소절에 오르내리는 모양이 생긴다.
 *
 * 소절 전체를 몇 센트 틀어 두는 것이 유성기 판의 늘어짐(wow)이다 — 음 하나가 아니라
 * 소절 통째로 어긋나야 «판이 늘어난 것»으로 들리고, 음마다 다르면 그냥 음정이 틀린 연주다.
 */
function phrase(melody: Melody, out: AudioNode): void {
  const scale = melody.notes
  const wow = Math.pow(2, ((Math.random() * 2 - 1) * 16) / 1200)
  const count = melody.least + Math.floor(Math.random() * (melody.most - melody.least + 1))
  const at = now() + 0.01
  let index = Math.floor(Math.random() * scale.length)

  for (let i = 0; i < count; i += 1) {
    const note = scale[index]
    /* noUncheckedIndexedAccess — 범위 안이어도 타입에는 undefined가 섞여 있다. */
    if (note === undefined) return
    const hz = note * wow
    const last = i === count - 1

    const level = melody.gain * (last ? 1 : 0.8 + Math.random() * 0.24)
    const decay = last ? melody.decay * 2.1 : melody.decay
    const delay = i * melody.step
    const pan = (i % 2 === 0 ? -1 : 1) * 0.18

    voice(at, {
      formants: melody.formants,
      /* 살짝 위에서 짚어 제자리로 내려앉는다. 국악에서 음을 처음부터 «정확히» 짚는 일은 드물다. */
      pitch: hz * 1.012,
      toPitch: hz,
      gain: level,
      attack: melody.attack,
      /* 마지막 음만 길게 남긴다. 소절이 «끝났다»가 아니라 «잦아들었다»가 되어야 한다. */
      decay,
      /* 7. 좁게 조이면 «모음»은 또렷해지는데 통과하는 에너지가 줄어 멜로디가 통째로 묻힌다. */
      q: 7,
      vibrato: melody.vibrato,
      delay,
      pan,
      target: out,
    })

    /*
     * **몸통.** 포먼트는 «어떤 악기인가»를 정할 뿐 소리의 심이 되지 못한다 —
     * 좁은 대역통과 세 개만 남기면 잔향과 공기에 그대로 묻혀 «있었나?» 싶게 들린다.
     * 같은 음정의 삼각파를 밑에 깔아야 배경 위로 선이 떠오른다.
     */
    tone(at, {
      type: 'triangle',
      from: hz * 1.012,
      to: hz,
      gain: level * 0.62,
      attack: melody.attack,
      decay,
      fm: { ratio: 2.01, index: hz * 0.22 },
      vibrato: melody.vibrato,
      delay,
      pan,
      target: out,
    })

    /* 켜거나 부는 사람의 입김·활 소리. 이게 없으면 음은 나는데 «연주자»가 없다. */
    burst(at, {
      gain: melody.gain * 0.42,
      attack: 0.02,
      decay: 0.12,
      filter: 'bandpass',
      frequency: hz * 4.2,
      q: 1.1,
      delay: i * melody.step,
      target: out,
    })

    const walk = Math.random() < 0.72 ? 1 : 2
    index = Math.min(scale.length - 1, Math.max(0, index + (Math.random() < 0.5 ? -walk : walk)))
  }
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

  const melody = track.melody
  if (melody) {
    stops.push(repeat(melody.minMs, melody.maxMs, () => phrase(melody, out)))
  }

  /*
   * 표면잡음은 «가끔 한 톨»이 아니라 «계속 자잘하게»여야 판이 도는 것으로 들린다.
   * 한 번에 한두 알갱이씩, 0.2~0.9초 간격으로 끊임없이 떨어뜨린다.
   */
  const crackle = track.crackle
  if (crackle) {
    stops.push(
      repeat(crackle.minMs, crackle.maxMs, () => {
        grains(now() + 0.01, {
          count: 1 + Math.floor(Math.random() * 3),
          spread: 0.08,
          minHz: 1600,
          maxHz: 7200,
          gain: crackle.gain,
          /* 8ms. 이보다 길면 «톡»이 아니라 «칙»이 되어 공기와 구별이 안 된다. */
          decay: 0.008,
          q: 1.4,
          target: out,
        })
      }),
    )
  }

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
