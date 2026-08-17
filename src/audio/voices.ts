/**
 * 소리의 «악기»층. engine이 오실레이터·잡음·필터를 준다면, 여기는 그것으로 만든
 * 재료 — 쇠·종·스침·잔해·숨 — 을 준다. 레시피(synth.ts)는 이 재료만 조립한다.
 *
 * **왜 나눴나.** 레시피에 필터 계수와 배음비가 섞여 있으면 «이 소리가 무엇을 뜻하는가»가
 * 숫자에 묻힌다. 재료를 여기로 빼면 레시피 쪽에는 «도장이 떨어지고, 책상이 울고,
 * 쇳조각이 남는다»는 문장만 남는다. 소리를 고치는 일은 대개 재료가 아니라 조립을 고치는 일이다.
 */

import { burst, grains, tone, voice } from './engine'

/** 놓을 자리. 거의 모든 재료가 이 둘을 받는다. */
export interface Placed {
  readonly delay?: number
  readonly pan?: number
}

/**
 * ±cents 안에서 흔들린 주파수.
 *
 * 같은 값으로 고정하면 열 번 들을 때 열 번 다 똑같아서 «녹음»으로 들린다.
 * 몇 센트만 매번 달라도 귀는 그것을 «그때그때 일어나는 사건»으로 받아들인다.
 * 룰 엔진이 아니라 소리라서 무작위를 써도 된다 — 판정에는 영향이 없다.
 */
export function vary(hz: number, cents: number): number {
  return hz * Math.pow(2, ((Math.random() * 2 - 1) * cents) / 1200)
}

/**
 * 남는 쇳소리. 좁은 잡음을 아주 높은 Q(22)로 때리면 «음정이 있는 쇳소리»가 된다.
 * 같은 음정을 오실레이터로 내면 너무 깨끗해서 악기가 되고, 잡음을 거치면 가장자리가 거칠다.
 */
export function ring(at: number, hz: number, gain: number, decay: number, at2: Placed = {}): void {
  burst(at, {
    gain,
    attack: 0.004,
    decay,
    filter: 'bandpass',
    frequency: vary(hz, 25),
    q: 22,
    delay: at2.delay,
    pan: at2.pan,
  })
}

/**
 * 때린 쇠. ring()이 «남는 울림»이라면 이쪽은 «맞는 순간»이다.
 *
 * 비정수비 FM이 핵심이다. 2.76 같은 값은 어떤 배음렬에도 속하지 않는 주파수들을 만들어서,
 * 귀가 «음»이 아니라 «부딪힌 금속»으로 듣는다. index를 키울수록 두껍고 거칠어진다.
 */
export function metal(
  at: number,
  hz: number,
  gain: number,
  decay: number,
  index: number,
  at2: Placed & { readonly ratio?: number; readonly wobble?: number } = {},
): void {
  tone(at, {
    type: 'sine',
    from: vary(hz, 20),
    gain,
    attack: 0.003,
    decay,
    fm: { ratio: at2.ratio ?? 2.76, index },
    /* depth는 0~1 비율이다. gain을 곱하던 앞선 방식은 봉투 최대치를 넘겨 소리를 터뜨렸다. */
    wobble: at2.wobble === undefined ? undefined : { rate: 6.3, depth: at2.wobble },
    delay: at2.delay,
    pan: at2.pan,
  })
}

/**
 * 스치는 잡음. 필터가 from에서 to로 미끄러지는 동안만 들린다.
 * 방향이 있어야 «움직이는 것»으로 들리고, 없으면 그냥 잡음 덩어리다.
 */
export function whoosh(
  at: number,
  from: number,
  to: number,
  gain: number,
  attack: number,
  decay: number,
  at2: Placed = {},
): void {
  burst(at, {
    gain,
    attack,
    decay,
    filter: 'bandpass',
    frequency: from,
    toFrequency: to,
    q: 1.2,
    delay: at2.delay,
    pan: at2.pan,
  })
}

/**
 * 잔해. 부딪힌 뒤에 흩어지는 것들 — 종잇장, 유리 부스러기, 흔들리는 쇠붙이.
 *
 * **큰 소리에 이게 없으면 «충돌»이 아니라 «신호»로 들린다.** 실제 사건에는 언제나
 * 본체보다 오래 남는 부스러기가 있고, 귀는 그 뒤처리를 듣고 사건의 크기를 가늠한다.
 * curve 2.2는 앞쪽에 몰아 뿌린다는 뜻이다 — 부딪힌 직후가 가장 어수선하다.
 */
export function debris(
  at: number,
  count: number,
  gain: number,
  spread: number,
  band: readonly [number, number],
  at2: Placed = {},
): void {
  grains(at, {
    count,
    spread,
    minHz: band[0],
    maxHz: band[1],
    gain,
    decay: 0.05,
    q: 2.6,
    curve: 2.2,
    delay: at2.delay,
  })
}

/**
 * 웅성거림. 낮은 대역의 알갱이를 길고 고르게 흩뿌리면 «사람들이 뭐라고 하는» 소리가 된다.
 * 개별 알갱이가 무슨 소리인지 알아들을 수 없어야 한다 — 알아들리는 순간 웅성거림이 아니다.
 */
export function murmur(
  at: number,
  count: number,
  gain: number,
  spread: number,
  at2: Placed = {},
): void {
  grains(at, {
    count,
    spread,
    minHz: 240,
    maxHz: 900,
    gain,
    decay: 0.11,
    q: 6,
    curve: 0.9,
    delay: at2.delay,
  })
}

/** 모음의 공명점. 이 세 값이 «무슨 소리를 내고 있는가»를 정한다. */
export const VOWEL = {
  /** 닫힌 «우». 가장 어둡고 정체가 덜 분명하다. */
  oo: [300, 870, 2240],
  /** 반쯤 열린 «어». 신음에 가장 가깝다. */
  uh: [570, 840, 2410],
  /** 열린 «아». 놀람·비명 쪽. */
  ah: [730, 1090, 2440],
} as const satisfies Record<string, readonly [number, number, number]>

/**
 * 숨. 목소리가 아니라 숨인 이유는, 정체가 덜 분명한 쪽이 더 오래 불편하기 때문이다.
 * slide를 1보다 작게 주면 목이 풀리며 주저앉는다 — 이 파일에서 «절망»을 옮기는 수단이다.
 */
export function breath(
  at: number,
  vowel: readonly [number, number, number],
  gain: number,
  attack: number,
  decay: number,
  at2: Placed & { readonly slide?: number } = {},
): void {
  voice(at, {
    formants: vowel,
    gain,
    attack,
    decay,
    slide: at2.slide,
    delay: at2.delay,
    pan: at2.pan,
  })
}

/**
 * 신음. 숨과 달리 음높이가 있어서 «사람»이라는 게 분명해진다.
 * 분명한 만큼 아껴 쓴다 — 자주 나오면 소리가 아니라 배우가 된다.
 */
export function moan(
  at: number,
  vowel: readonly [number, number, number],
  pitch: number,
  toPitch: number,
  gain: number,
  attack: number,
  decay: number,
  at2: Placed = {},
): void {
  voice(at, {
    formants: vowel,
    pitch,
    toPitch,
    slide: toPitch / pitch,
    gain,
    attack,
    decay,
    delay: at2.delay,
    pan: at2.pan,
  })
}

/**
 * 종 한 번. 배음비가 이 함수의 전부다.
 *
 * 1.2는 단3도다 — 장3도(1.26)로 바꾸면 같은 코드가 «교회 축가»가 되고, 빼면 «전자음»이 된다.
 * 0.5(험음)는 때린 음보다 한 옥타브 아래 남는 울림이고, 이게 있어야 종이 무거워진다.
 *
 * 각 배음에 FM을 걸고 좌우로 벌리고 음량을 흔든다. 순수 사인으로만 쌓으면 배음이 일곱 개뿐이라
 * «종 흉내»에 그치는데, 배음마다 제 배음을 갖고 서로 다른 속도로 요동치면 실제 쇠처럼 빽빽해진다.
 * 위로 갈수록 작고 빨리 죽는다 — 안 그러면 쇠붙이가 아니라 오르간이 된다.
 */
export function bell(at: number, root: number, gain: number, length: number): void {
  const partials = [
    { ratio: 0.5, gain: 1.0, decay: 1.0, fm: 0.5, pan: 0, wob: 0.9 },
    { ratio: 1.0, gain: 0.72, decay: 0.85, fm: 1.2, pan: -0.25, wob: 1.7 },
    { ratio: 1.2, gain: 0.5, decay: 0.62, fm: 1.6, pan: 0.3, wob: 2.6 },
    { ratio: 1.5, gain: 0.3, decay: 0.45, fm: 2.1, pan: -0.4, wob: 3.9 },
    { ratio: 2.0, gain: 0.19, decay: 0.34, fm: 2.4, pan: 0.45, wob: 5.1 },
    { ratio: 2.52, gain: 0.1, decay: 0.2, fm: 3.0, pan: -0.55, wob: 6.8 },
    { ratio: 3.01, gain: 0.06, decay: 0.14, fm: 3.4, pan: 0.6, wob: 8.3 },
  ]
  for (const p of partials) {
    const hz = vary(root * p.ratio, 12)
    const level = gain * p.gain
    tone(at, {
      type: 'sine',
      from: hz,
      gain: level,
      attack: 0.005,
      decay: length * p.decay,
      fm: { ratio: 1.41, index: hz * p.fm * 0.12 },
      /* 배음마다 다른 속도로 흔들린다. 같은 속도면 전체가 한 덩어리로 떨려 «오르간»이 된다. */
      wobble: { rate: p.wob, depth: 0.22 },
      pan: p.pan,
    })
  }
  /* 때리는 순간의 쇳조각과 그 자리에서 튀는 부스러기. 종은 «울림»만으로는 안 된다. */
  metal(at, root * 4.09, gain * 0.3, length * 0.09, root * 3.2, { ratio: 3.31 })
  debris(at, 9, gain * 0.22, 0.16, [1800, 6000])
}
