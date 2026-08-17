/**
 * 결과의 소리 여섯. 판이 «어떻게 됐다»에 붙는다 — 개시·발각·오판·퇴출·승리·패배.
 *
 * 행동의 소리(제안·반증·위증·지목·차례·추첨)는 sfx-actions.ts에 있다.
 * 이쪽은 한 판에 몇 번 안 나므로 **길고 풍부해도 된다** — 웅성거림·종·공·신음처럼
 * 자주 쓰면 피로해지는 재료가 전부 여기 모여 있는 것이 그래서다.
 *
 * 열두 종이 서로 어떻게 갈리는지는 synth.ts 첫머리의 배치표에 있다.
 * **소리를 고치기 전에 그 표를 먼저 본다.**
 */

import { burst, tone } from './engine'
import { bell, breath, debris, metal, moan, murmur, ring, vary, whoosh, VOWEL } from './voices'

/*
 * 신문 개시. **종이 있는 자리는 여기와 승리뿐이고, 개정 전 웅성거림은 여기에만 있다.**
 *
 * 사람들이 자리를 잡는 동안(웅성거림 18) 방이 숨을 들이키고, 0.5초 끝에서 종이 떨어지고,
 * 그 순간 방이 조용해진다. 예고 없이 치면 알림음이고, 차오른 뒤에 치면 개시가 된다.
 * 종은 146.8이 아니라 110이다 — 한 음만 낮춰도 «알리는 종»이 «부르는 종»이 된다.
 */
export function round(at: number): void {
  murmur(at, 18, 0.07, 0.46)
  whoosh(at, 300, 1500, 0.19, 0.5, 0.12)
  burst(at, {
    gain: 0.2,
    attack: 0.001,
    decay: 0.03,
    filter: 'bandpass',
    frequency: 4200,
    q: 1.2,
    delay: 0.5,
  })
  bell(at + 0.5, 110, 0.34, 3.6)
  tone(at, {
    type: 'sine',
    from: 55,
    to: 41,
    gain: 0.4,
    attack: 0.012,
    decay: 1.9,
    fm: { ratio: 1.41, index: 38 },
    wobble: { rate: 2.3, depth: 0.05 },
    delay: 0.5,
  })
  /* 여운처럼 한 번 더. 같은 크기로 치면 «두 번»이 되고, 절반이면 «울림»이 된다. */
  bell(at + 1.6, 110, 0.15, 3.0)
}

/*
 * 발각. **전 대역을 쓰는 유일한 소리이고, 밝은 파편과 방청석 반응도 여기에만 있다.**
 * 200Hz부터 9kHz까지 한꺼번에 터지므로 다른 무엇과도 헷갈릴 수 없다.
 *
 * 두 번 온다. 1단(0초)은 유리·쇠가 깨지는 파열, 그 사이 잡음이 위로 쓸려 올라간 뒤
 * 2단(0.36초)에서 바닥이 24Hz까지 꺼지고 «어» 신음이 한 옥타브 주저앉는다.
 * 발각의 무게는 들킨 순간이 아니라 그 다음에 온다. 방청석은 2단 뒤에 반응한다 —
 * 사람은 사건이 끝나고 나서야 소리를 낸다.
 */
export function caught(at: number): void {
  burst(at, { gain: 0.5, attack: 0.002, decay: 0.36, filter: 'bandpass', frequency: 3000, q: 0.5 })
  tone(at, {
    type: 'triangle',
    from: 150,
    to: 42,
    gain: 0.56,
    attack: 0.004,
    decay: 0.7,
    fm: { ratio: 1.72, index: 300 },
  })
  metal(at, 1174.7, 0.18, 0.34, 1800, { ratio: 3.31, pan: 0.3, wobble: 0.4 })
  metal(at, 1760, 0.12, 0.26, 2400, { ratio: 2.76, delay: 0.02, pan: -0.35 })
  debris(at, 30, 0.18, 0.75, [1600, 9000])

  whoosh(at, 700, 3000, 0.22, 0.28, 0.03, { delay: 0.05 })

  /*
   * **공(gong).** 웅장함을 만드는 유일한 겹이다. 종(bell)을 쓰지 않은 이유는
   * 종이 신문 개시·승리의 것이라 여기 들어오면 세 소리가 전부 흐려지기 때문이다.
   *
   * 공은 종과 다르다 — 배음비가 비정수(2.76·3.31)라 음정이 잡히지 않고, 낮고, 길게 번진다.
   * 「무슨 음인지 모르겠는데 크고 오래 남는 쇠」가 «큰일 났다»의 소리다.
   */
  metal(at, 55, 0.42, 2.6, 210, { ratio: 2.76, delay: 0.3, wobble: 0.25 })
  metal(at, 73.4, 0.3, 2.2, 260, { ratio: 3.31, delay: 0.32, pan: -0.3, wobble: 0.35 })
  metal(at, 87.3, 0.2, 1.8, 300, { ratio: 2.76, delay: 0.34, pan: 0.35, wobble: 0.45 })

  tone(at, {
    type: 'sine',
    from: 80,
    to: 24,
    gain: 0.72,
    attack: 0.006,
    decay: 2.4,
    fm: { ratio: 1.41, index: 55 },
    wobble: { rate: 2.7, depth: 0.08 },
    delay: 0.36,
  })
  moan(at, VOWEL.uh, 196, 98, 0.18, 0.12, 1.5, { delay: 0.36, pan: -0.25 })
  metal(at, 466.2, 0.13, 1.1, 660, { delay: 0.36, pan: -0.3, wobble: 0.45 })
  ring(at, 698.5, 0.06, 0.85, { delay: 0.4, pan: 0.5 })
  /*
   * 방청석이 두 번 반응한다. 처음은 «헉»(짧고 몰려 있음), 그다음이 술렁임(길고 흩어짐).
   * 한 번만 두면 그건 반응이 아니라 배경이다 — 사람은 놀란 뒤에 «말»을 한다.
   */
  murmur(at, 16, 0.13, 0.5, { delay: 0.6 })
  murmur(at, 34, 0.1, 2.6, { delay: 1.0 })
  breath(at, VOWEL.ah, 0.12, 0.05, 0.5, { delay: 0.58, pan: 0.4 })
  burst(at, {
    gain: 0.13,
    attack: 0.02,
    decay: 1.9,
    filter: 'lowpass',
    frequency: 320,
    delay: 0.4,
  })
}

/*
 * 오판. **이 판에서 유일한 «버즈»다.** 27Hz로 진폭을 흔들면 소리가 지직거리는데,
 * 그게 세상 모든 «틀렸습니다» 신호의 정체다. 다만 게임쇼 부저처럼 밝게 두면 우스워지므로
 * 98·103.8Hz까지 끌어내리고 아래로 미끄러뜨렸다 — 낮은 버즈는 조롱이 아니라 «경고»가 된다.
 *
 * 잘못 지목했다는 건 민망한 게 아니라 이제 내가 노출됐다는 뜻이라, 끝에 저역이 한 번 꺼진다.
 * 1.4초. 웅성거림은 넣지 않았다 — 그건 발각의 것이다.
 */
export function wrongCall(at: number): void {
  burst(at, { gain: 0.24, attack: 0.002, decay: 0.09, filter: 'lowpass', frequency: 600 })
  /*
   * 버즈를 절반으로 줄였다(0.42 → 0.2). 김빠짐은 «틀렸다»고 알리는 데서 오는 게 아니라
   * **알린 다음에 아무 일도 일어나지 않는 데서** 온다. 버즈는 그 뒤를 열어 주는 짧은 신호일 뿐이다.
   */
  tone(at, {
    type: 'sawtooth',
    from: 98,
    to: 82,
    gain: 0.26,
    attack: 0.008,
    decay: 0.2,
    /* 버즈는 깊게 판다. 0.7이면 음량이 30%까지 내려갔다 올라오며 «지직»거린다. */
    wobble: { rate: 27, depth: 0.7 },
    pan: -0.2,
  })
  tone(at, {
    type: 'sawtooth',
    from: 103.8,
    to: 87,
    gain: 0.22,
    attack: 0.008,
    decay: 0.18,
    wobble: { rate: 31, depth: 0.62 },
    pan: 0.25,
  })
  /*
   * 여기서부터가 «김빠짐»이다. 세 가지가 동시에 있어야 한다.
   *
   * **바람이 샌다** — 대역이 2600에서 260까지 0.9초에 걸쳐 주저앉는다. 「푸슈——」.
   * **늘어진다** — 음정이 처지는데 농현까지 느리고 깊게(3.1Hz·70센트) 걸려 흐물거린다.
   *   테이프가 늘어질 때 나는 소리이고, 이 판에서 «맥이 풀렸다»를 옮기는 겹이다.
   * **끝이 없다** — 마지막에 힘없는 «툭» 하나가 뒤늦게 떨어진다. 맺음이 아니라 흘림이다.
   */
  whoosh(at, 2600, 260, 0.2, 0.03, 0.9, { delay: 0.16, pan: 0.2 })
  tone(at, {
    type: 'sawtooth',
    from: 174.6,
    to: 68,
    gain: 0.24,
    attack: 0.02,
    decay: 1.0,
    fm: { ratio: 1.72, index: 70 },
    vibrato: { rate: 3.1, cents: 70 },
    wobble: { rate: 4.2, depth: 0.28 },
    delay: 0.18,
    pan: -0.3,
  })
  tone(at, {
    type: 'sine',
    from: 130.8,
    to: 40,
    gain: 0.42,
    attack: 0.01,
    decay: 1.1,
    fm: { ratio: 1.41, index: 90 },
    delay: 0.3,
  })
  breath(at, VOWEL.oo, 0.11, 0.25, 0.8, { slide: 0.6, delay: 0.34, pan: 0.3 })
  burst(at, {
    gain: 0.16,
    attack: 0.004,
    decay: 0.16,
    filter: 'lowpass',
    frequency: 300,
    delay: 1.12,
    pan: -0.15,
  })
}

/*
 * 퇴출. **가장 어두운 소리다.** 부딪히는 25ms를 빼면 600Hz 위가 통째로 비어 있어서,
 * 밝은 파편이 0.75초 동안 쏟아지는 발각과 정반대 자리에 선다.
 * 둘 다 큰 소리인데 «고역이 얼마나 오래 사는가»가 달라 절대 안 헷갈린다.
 *
 * 순서가 넷이다. **경첩이 울고(0~0.22초) → 걸쇠와 본체가 함께 쾅(0.46초) →
 * 문틀 안에서 두 번 덜컹(0.55·0.61초) → 36.7Hz가 차오른다(0.72초).**
 *
 * 이 소리는 네 판을 갈아엎고 나온 것이라, **다시 손대기 전에 아래 두 주석을 먼저 읽는다.**
 * 둘 다 «이렇게 하면 문이 아니게 된다»는 기록이고, 값 몇 개만 되돌려도 즉시 재발한다.
 */
export function ousted(at: number): void {
  /*
   * 경첩. 삐걱은 **붙었다 미끄러지길 되풀이하는 미세한 충격의 연속**(stick-slip)이라,
   * 좁은 대역(Q 17)을 통과한 잡음 알갱이를 겹쳐 쌓아 만든다 — 하나는 «삑»이지만
   * 불규칙하게 겹치면 「끼이———익」이 된다. 중심이 k²로 올라가 문이 닫힐수록 조여든다.
   *
   * 오실레이터에 농현을 걸어 내던 판본이 있었는데 그건 «흔들리는 음»이지 마찰이 아니었다.
   * 짧고 작게 둔다(0.22초·0.09) — 길면 인상을 통째로 가져가서 «삐걱거리는 무언가»가 되고,
   * 정작 쾅이 뒤따라오는 부속처럼 들린다.
   */
  const CREAK = 16
  for (let i = 0; i < CREAK; i += 1) {
    const k = i / (CREAK - 1)
    burst(at, {
      gain: 0.09 * (0.35 + Math.random() * 0.9) * (1 - k * 0.3),
      attack: 0.0006,
      decay: 0.05 + Math.random() * 0.07,
      filter: 'bandpass',
      frequency: vary(380 + 540 * k * k, 90),
      q: 17,
      delay: k * 0.22 + Math.random() * 0.014,
      pan: -0.45 + Math.random() * 0.22,
    })
  }

  /* 문짝이 공기를 밀며 다가온다. 무거운 문은 빨리 못 닫히므로 0.24초에 걸쳐 온다. */
  whoosh(at, 620, 170, 0.26, 0.24, 0.06, { delay: 0.16 })

  /*
   * **왜 «둥»이 되는가.** 충돌을 공명기로 만들면 그렇게 된다.
   *
   * 168Hz를 Q 3.4로 0.5초, 92Hz를 Q 5로 0.6초 울리고 112→36Hz 사인을 미끄러뜨린 판본이
   * 있었는데, 그건 각각 탐탐·플로어탐·킥드럼을 만드는 방법 그대로다.
   * **음정이 잡히고 길게 울리면 무엇을 얹어도 북이다.** 문에는 음정이 없다.
   *
   * 그래서 저역은 전부 잡음이고, **Q를 1 아래로 두는 것이 북과 문을 가르는 값**이다.
   * 여기 숫자를 올리면 즉시 다시 «둥»이 된다.
   *
   * ---
   *
   * **왜 «문»으로 안 들리는가.** 빗장을 충돌에서 떼어 놓으면 그렇게 된다.
   *
   * 세 판본이 빗장을 0.3초 뒤에 뒀고, 그래서 아무리 잘 만들어도 «무거운 것이 부딪혔다 →
   * 나중에 딸깍»으로 들렸다. 실제 문은 걸쇠가 문틀 쇠를 때리는 소리와 나무가 부딪히는
   * 소리가 **30ms 안에 겹친다.** 나무 쾅과 쇠 철컥이 한 사건으로 들리는 그 겹침이
   * «문»이라는 정체의 절반이다. 걸쇠가 나무보다 6ms 먼저다 — 실제로 걸쇠 쪽이 먼저 닿는다.
   */
  metal(at, 2400, 0.26, 0.035, 900, { ratio: 3.31, delay: 0.454, pan: 0.38 })
  burst(at, {
    gain: 0.3,
    attack: 0.0004,
    decay: 0.012,
    filter: 'bandpass',
    frequency: 3200,
    q: 1.2,
    delay: 0.454,
    pan: 0.42,
  })

  /*
   * 파열. 차단점이 4000 → 150으로 무너진다. 충돌음은 공명이 아니라 **과도음**이고,
   * 고역이 먼저 죽으며 스펙트럼이 통째로 내려앉는 그 «무너짐»이 귀가 «부딪혔다»로 듣는 것이다.
   */
  burst(at, {
    gain: 1.0,
    attack: 0.0005,
    decay: 0.07,
    filter: 'lowpass',
    frequency: 4000,
    toFrequency: 150,
    delay: 0.46,
  })
  /* 나무가 터지는 파편. 45ms 안에 끝나므로 발각의 «쏟아지는 파편»과 겹치지 않는다. */
  debris(at, 16, 0.14, 0.045, [600, 2400], { delay: 0.464 })

  /*
   * **널판의 여러 모드.** 나무는 대역 하나로 울지 않는다. 큰 널판은 **서로 정수비가 아닌
   * 공명이 여섯 개쯤 동시에** 일어나고, 낮은 것이 오래 남고 높은 것이 먼저 죽는다.
   * 잡음 대역 하나로 대신하면 «퍽»은 나는데 재질이 없어서 나무로 안 들린다.
   *
   * 하나하나는 짧다(0.08~0.34초). 길게 끌면 다시 북이 되므로 «많이, 짧게»가 규칙이다.
   */
  const PANEL = [
    { hz: 62, gain: 0.5, decay: 0.34, ratio: 1.87 },
    { hz: 94, gain: 0.42, decay: 0.26, ratio: 2.31 },
    { hz: 131, gain: 0.34, decay: 0.2, ratio: 2.76 },
    { hz: 178, gain: 0.26, decay: 0.15, ratio: 3.31 },
    { hz: 241, gain: 0.18, decay: 0.11, ratio: 2.31 },
    { hz: 320, gain: 0.12, decay: 0.08, ratio: 1.87 },
  ]
  PANEL.forEach((p, i) => {
    metal(at, p.hz, p.gain, p.decay, p.hz * 1.6, {
      ratio: p.ratio,
      delay: 0.46 + i * 0.0015,
      pan: i % 2 === 0 ? -0.22 : 0.22,
    })
  })

  /* 큰 문의 무게. 잡음이라 음정이 안 생기므로 0.45초까지 끌어도 북이 되지 않는다. */
  burst(at, {
    gain: 0.8,
    attack: 0.001,
    decay: 0.45,
    filter: 'lowpass',
    frequency: 95,
    delay: 0.46,
  })

  /* 빗장이 자리에 박힌다. 충돌에서 42ms — 여전히 «같은 사건» 안이다. */
  metal(at, 1560, 0.17, 0.06, 620, { ratio: 2.31, delay: 0.502, pan: 0.45 })
  metal(at, 880, 0.13, 0.1, 380, { ratio: 3.31, delay: 0.508, pan: 0.3 })

  /*
   * **방이 답한다.** 큰 문이 «크다»고 들리는 것은 충돌 자체가 아니라 그 뒤에 방이
   * 얼마나 오래 대답하느냐다. 이건 공명이 아니라 잡음이라 음정이 생기지 않는다.
   */
  burst(at, {
    gain: 0.24,
    attack: 0.04,
    decay: 1.4,
    filter: 'lowpass',
    frequency: 480,
    delay: 0.48,
  })
  /* 나무 부스러기. 대역을 600 아래로 묶어 «유리»가 되지 않게 한다. */
  debris(at, 18, 0.12, 0.55, [180, 620], { delay: 0.5 })

  /*
   * **덜컹.** 문은 부딪히고 끝나지 않는다. 문틀 안에서 되튀며 자리를 잡고, 그때마다
   * 쇠붙이가 같이 흔들린다. 되튐은 점점 빨라지므로 간격을 등간격으로 두지 않는다.
   */
  const settle = (delay: number, level: number) => {
    burst(at, {
      gain: level,
      attack: 0.001,
      decay: 0.035,
      filter: 'bandpass',
      frequency: 250,
      q: 2.2,
      delay,
      pan: 0.2,
    })
    /* Q를 낮게. 되튐이 «울리면» 그것만으로 다시 북이 된다. */
    burst(at, {
      gain: level * 0.85,
      attack: 0.002,
      decay: 0.1,
      filter: 'bandpass',
      frequency: 105,
      q: 1.2,
      delay,
    })
    metal(at, 1180, level * 0.4, 0.05, 300, { ratio: 3.31, delay: delay + 0.004, pan: 0.4 })
  }
  settle(0.545, 0.22)
  settle(0.61, 0.1)

  burst(at, {
    gain: 0.16,
    attack: 0.03,
    decay: 1.8,
    filter: 'lowpass',
    frequency: 220,
    delay: 0.5,
  })
  /*
   * 봉인. 이 소리에서 유일하게 «음»으로 남는 겹이라 조심해서 쓴다 —
   * 36.7Hz는 음정으로 잡히기보다 압력으로 느껴지는 자리지만, 크면 충돌음까지 끌어당겨
   * 통째로 «둥»으로 들리게 만든다. 그래서 0.34에서 0.2로 내렸다.
   */
  tone(at, {
    type: 'sine',
    from: 36.7,
    gain: 0.2,
    attack: 0.3,
    decay: 2.4,
    fm: { ratio: 2.76, index: 12 },
    wobble: { rate: 1.3, depth: 0.05 },
    delay: 0.72,
  })
}

/*
 * 승리. **유일하게 «닫히는» 소리다.** 열한 개가 전부 해결되지 않은 채 끝나는데
 * 이것만 라단조 3화음이 제자리에 도착해 멎는다. 그 대비가 «끝났다»를 만든다.
 *
 * 0.9초 동안 저역이 차오른 뒤에 종이 떨어진다 — 절정은 큰 소리가 아니라 올라온 뒤에
 * 오는 것이라, 이 스웰을 빼면 아무리 키워도 그냥 시끄러운 종이 된다.
 * 단조라 밝지 않고 화음이라 닫힌다. 이 판에서 이긴다는 건 축제가 아니라
 * 누군가 거짓말한 것을 밝혀냈다는 뜻이고, 방에는 그 사람이 아직 앉아 있다.
 */
export function win(at: number): void {
  tone(at, {
    type: 'sine',
    from: 73.4,
    gain: 0.34,
    attack: 0.9,
    decay: 3.2,
    fm: { ratio: 1.41, index: 42 },
    wobble: { rate: 1.7, depth: 0.05 },
  })
  whoosh(at, 400, 1900, 0.13, 0.85, 0.06)
  bell(at + 0.9, 110, 0.38, 4.0)
  const chord = [
    { hz: 146.8, pan: -0.45 },
    { hz: 174.6, pan: 0.4 },
    { hz: 220.0, pan: -0.25 },
    { hz: 293.7, pan: 0.5 },
  ]
  for (const n of chord) {
    tone(at, {
      type: 'triangle',
      from: n.hz,
      gain: 0.13,
      attack: 0.6,
      decay: 3.4,
      fm: { ratio: 2.01, index: n.hz * 0.32 },
      wobble: { rate: 2.9 + n.hz / 200, depth: 0.02 },
      delay: 1.1,
      pan: n.pan,
    })
  }
  bell(at + 1.6, 220, 0.14, 2.6)
}

/*
 * 패배. **모든 겹이 내려가는 유일한 소리다.** 승리가 도착해서 멎는다면 이것은
 * 어디에도 도착하지 못한다. 그 둘의 대비가 이 판의 마지막 한 수다.
 *
 * 절망은 «슬픈 음»으로 만들어지지 않는다. 셋이 동시에 있어야 한다.
 *
 * **주저앉는다** — 네 음이 떨어지는데 각 음이 제자리를 못 지키고 반음의 절반쯤 처지고,
 * 그 위에서 «어» 신음이 174.6→65Hz로 미끄러진다. 포먼트가 같이 내려가 목이 풀린다.
 *
 * **바닥이 없다** — 110에서 22Hz까지 3.6초에 걸쳐 떨어뜨리고 220→55Hz를 통째로 겹친다.
 * 22Hz는 사실상 들리지 않는 영역이라 소리가 끝나는 게 아니라 «계속 내려간다».
 *
 * **끝나지 않는다** — 다 떨어진 뒤 155.6·164.8·174.6 세 반음이 되레 차오른다.
 * 화음이 아니라 뭉개진 덩어리라 해결되지 않고, 위에서 1864.7 이명이 가늘게 남는다.
 *
 * 잔해는 900 아래로 묶었다 — 발각의 밝은 파편과 겹치면 «깨짐»으로 읽히는데,
 * 여기는 깨지는 게 아니라 «무너지는» 자리다.
 */
export function lose(at: number): void {
  burst(at, { gain: 0.3, attack: 0.004, decay: 0.7, filter: 'lowpass', frequency: 900 })
  debris(at, 20, 0.13, 1.0, [140, 900])
  tone(at, {
    type: 'sine',
    from: 110,
    to: 22,
    gain: 0.62,
    attack: 0.01,
    decay: 3.6,
    fm: { ratio: 1.41, index: 88 },
    wobble: { rate: 1.9, depth: 0.09 },
  })

  const fall = [
    { from: 293.7, to: 285.3, pan: -0.45 },
    { from: 233.1, to: 226.4, pan: 0.4 },
    { from: 196.0, to: 190.3, pan: -0.3 },
    { from: 138.6, to: 134.6, pan: 0.5 },
  ]
  fall.forEach((n, i) => {
    tone(at, {
      type: 'triangle',
      from: n.from,
      to: n.to,
      gain: 0.22,
      attack: 0.03,
      decay: 1.7,
      fm: { ratio: 2.76, index: n.from * 0.5 },
      wobble: { rate: 3.2 + i * 1.1, depth: 0.035 },
      delay: i * 0.19,
      pan: n.pan,
    })
  })

  /* 목이 풀리며 주저앉는다. «절망»을 가장 직접적으로 옮기는 한 겹이다. */
  moan(at, VOWEL.uh, 174.6, 65, 0.14, 0.35, 2.6, { delay: 0.3, pan: -0.15 })

  tone(at, {
    type: 'triangle',
    from: 220,
    to: 55,
    gain: 0.2,
    attack: 0.05,
    decay: 2.8,
    fm: { ratio: 1.41, index: 120 },
    wobble: { rate: 2.4, depth: 0.04 },
    delay: 0.5,
  })

  tone(at, { type: 'triangle', from: 155.6, gain: 0.13, attack: 1.0, decay: 3.0, delay: 0.7, pan: -0.5 })
  tone(at, { type: 'triangle', from: 164.8, gain: 0.11, attack: 1.15, decay: 2.8, delay: 0.7, pan: 0.45 })
  tone(at, { type: 'triangle', from: 174.6, gain: 0.09, attack: 1.3, decay: 2.6, delay: 0.7, pan: 0.05 })

  whoosh(at, 900, 160, 0.15, 0.6, 2.4, { delay: 0.5 })
  breath(at, VOWEL.oo, 0.07, 1.2, 2.2, { slide: 0.6, delay: 1.0, pan: 0.35 })
  burst(at, {
    gain: 0.038,
    attack: 0.8,
    decay: 2.6,
    filter: 'bandpass',
    frequency: 1864.7,
    q: 26,
    delay: 0.8,
    pan: 0.25,
  })
}
