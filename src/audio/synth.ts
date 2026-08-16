/**
 * 효과음 열두 종의 조립도. 재료는 voices.ts가, 재료의 재료는 engine.ts가 만든다.
 * 음원 파일이 하나도 없어도 소리가 나게 하는 쪽이고, 진짜 음원이 생기면 audio.ts가
 * 파일 쪽을 먼저 집으므로 이 파일은 그대로 둬도 된다.
 *
 * ---
 *
 * **소리는 «풍부해서» 알아듣는 게 아니라 «달라서» 알아듣는다.**
 *
 * 앞선 판본은 열두 개 전부에 잔해·웅성거림·쇳소리·FM을 똑같이 넣었다. 하나씩 들으면
 * 두꺼운데 이어서 들으면 구별이 안 됐다 — 풍부함을 균일하게 뿌리면 개성이 지워진다.
 *
 * 그래서 규칙을 뒤집었다.
 *
 * > **자주 나는 소리는 단순하게, 드물게 나는 소리는 풍부하게.**
 * > 그리고 각 소리는 **길이·음역·밀도·방향** 중 최소 두 축에서 나머지 전부와 달라야 한다.
 *
 * 아래가 그 배치다. 새 소리를 넣거나 고칠 때 이 표의 빈칸을 먼저 확인한다 —
 * 이미 찬 칸에 하나 더 넣으면 둘 다 흐려진다.
 *
 * | 소리     | 길이  | 음역        | 이것만 갖는 것            |
 * |----------|-------|-------------|---------------------------|
 * | refute   | 0.2s  | 1.5k~6k     | 저역이 아예 없다          |
 * | suggest  | 0.25s | 60~300      | 가장 짧고 무딘 단발       |
 * | myTurn   | 0.4s  | 300~900     | 반복 리듬(탁·탁)          |
 * | draw     | 0.5s  | 1.5k~4.5k   | 알갱이 무리 → 한 장 착지  |
 * | challenge| 0.6s  | 400→2k 상승 | 유일하게 올라간다         |
 * | wrongCall| 0.7s  | 80~250      | 진폭 변조 버즈            |
 * | perjury  | 2.5s  | 서브 + 숨   | 타격이 아예 없다          |
 * | ousted   | 2.5s  | 30~600      | 가장 어둡다(고역 없음)    |
 * | caught   | 3s    | 200~9k      | 밝은 파편 + 방청석 반응   |
 * | round    | 4s    | 종 110      | 종 + 개정 전 웅성거림     |
 * | win      | 5s    | 종 + 단3화음| 유일하게 닫힌다           |
 * | lose     | 5s    | 전부 하강   | 신음 + 저역 잔해          |
 *
 * 재료를 아끼는 것도 규칙이다. **웅성거림은 round와 caught에만**(방청석이 반응할 만한
 * 자리는 그 둘뿐이다), **밝은 파편은 caught에만**, **쇳소리는 쇠가 있는 자리에만** 쓴다.
 *
 * gain은 «가장 큰 소리를 1로 봤을 때»의 비율이다. 전체 음량과 잔향은 engine의
 * 효과음 버스가 한 번에 잡으므로 여기서 다시 곱하지 않는다.
 */

import { burst, now, tone } from './engine'
import { bell, breath, debris, metal, moan, murmur, ring, vary, whoosh, VOWEL } from './voices'

export type SfxName =
  /** 제안 접수 — 도장 */
  | 'suggest'
  /** 반증 제출 — 카드가 놓인다 */
  | 'refute'
  /** 내가 거짓 반증을 낸다 — 아직 아무도 모르는 한 수 */
  | 'perjury'
  /** 위증 의심 지목 */
  | 'challenge'
  /** 위증 발각 */
  | 'caught'
  /** 의심이 틀렸다 */
  | 'wrongCall'
  /** 제N회 신문 개시 */
  | 'round'
  /** 당신의 차례다 */
  | 'myTurn'
  /** 반증 추첨 */
  | 'draw'
  /** 고발 실패로 판에서 빠진다 */
  | 'ousted'
  | 'win'
  | 'lose'

type Recipe = (at: number) => void

const RECIPES: Record<SfxName, Recipe> = {
  /*
   * 도장. **가장 짧고 무딘 단발.** 0.25초 안에 끝나고 꼬리를 남기지 않는다.
   *
   * 앞 판본은 여기에 스침·잔해·쇳소리를 얹어 0.6초짜리 «사건»으로 만들었는데,
   * 제안은 한 판에 수십 번 나온다. 자주 나는 소리에 사건을 담으면 판 전체가 시끄러워지고,
   * 무엇보다 «큰 소리»들과 구별이 안 된다. 잉크판 «착»과 책상 «쿵» 둘만 남겼다.
   */
  suggest: (at) => {
    burst(at, { gain: 0.2, attack: 0.001, decay: 0.014, filter: 'highpass', frequency: 3400 })
    tone(at, {
      type: 'triangle',
      from: vary(165, 30),
      to: 48,
      gain: 0.58,
      attack: 0.002,
      decay: 0.16,
      fm: { ratio: 1.72, index: 230 },
    })
    /* 책상이 잠깐 우는 자리. Q를 높여 짧게 끊으면 나무가 되고, 길게 끌면 북이 된다. */
    burst(at, {
      gain: 0.24,
      attack: 0.002,
      decay: 0.07,
      filter: 'bandpass',
      frequency: 176,
      q: 7,
      pan: 0.15,
    })
  },

  /*
   * 카드. **저역이 아예 없는 유일한 소리다.** 이 판에서 «가벼운 것»은 이것뿐이라,
   * 1.5kHz 아래를 통째로 비우면 다른 열한 개와 절대 겹치지 않는다.
   *
   * 위에서 아래로 미끄러지는 마찰(카드가 손에서 빠짐)과 마른 «착»(천에 닿음) 둘.
   * 0.2초에 끝난다 — 반증도 자주 나오는 소리다.
   */
  refute: (at) => {
    whoosh(at, 5200, 1800, 0.24, 0.035, 0.03, { pan: -0.25 })
    burst(at, {
      gain: 0.3,
      attack: 0.003,
      decay: 0.05,
      filter: 'highpass',
      frequency: 2200,
      delay: 0.04,
      pan: 0.2,
    })
    /* 부스러기 넷. 여기서 더 늘리면 추첨(종이 뭉치)과 헷갈린다. */
    debris(at, 4, 0.07, 0.07, [2600, 6500], { delay: 0.045 })
  },

  /*
   * 위증. **타격이 아예 없는 유일한 소리다.** 열한 개가 전부 «치는» 소리로 시작하는데
   * 이것만 아무 데서도 시작하지 않고 스며들었다가 빠진다 — 모든 겹의 어택이 0.3초 이상이다.
   *
   * 아직 아무도 모르는 한 수라서 사건이 되면 안 되고, 그렇다고 조용하기만 하면 «없는 것»이 된다.
   * 그래서 «누가 있다»로 민다. 닫힌 «우» 숨이 아래로 풀리고, 바닥이 26Hz까지 내려앉고,
   * 87·90.2가 맞물리지 않고, 맨 위에서 반음 쌍이 좌우로 갈라져 배어 나온다.
   */
  perjury: (at) => {
    whoosh(at, 4400, 700, 0.13, 0.5, 0.9)
    breath(at, VOWEL.oo, 0.18, 0.55, 1.7, { slide: 0.68, delay: 0.1, pan: -0.2 })
    tone(at, {
      type: 'sine',
      from: 62,
      to: 26,
      gain: 0.44,
      attack: 0.4,
      decay: 1.8,
      fm: { ratio: 1.41, index: 40 },
      wobble: { rate: 3.1, depth: 0.06 },
      delay: 0.25,
    })
    tone(at, {
      type: 'triangle',
      from: 87.0,
      gain: 0.17,
      attack: 0.35,
      decay: 1.5,
      fm: { ratio: 2.76, index: 26 },
      pan: -0.3,
    })
    tone(at, {
      type: 'triangle',
      from: 90.2,
      gain: 0.17,
      attack: 0.4,
      decay: 1.5,
      fm: { ratio: 2.76, index: 30 },
      pan: 0.3,
    })
    tone(at, {
      type: 'sine',
      from: 1244.5,
      gain: 0.05,
      attack: 0.45,
      decay: 2.0,
      wobble: { rate: 4.7, depth: 0.02 },
      delay: 0.3,
      pan: -0.6,
    })
    tone(at, {
      type: 'sine',
      from: 1318.5,
      gain: 0.042,
      attack: 0.5,
      decay: 1.8,
      wobble: { rate: 5.9, depth: 0.018 },
      delay: 0.3,
      pan: 0.6,
    })
  },

  /*
   * 지목. **올라가는 유일한 소리다.** 나머지 열한 개가 전부 제자리이거나 내려가므로,
   * 상승 하나만으로 «질문이 던져졌다»가 즉시 읽힌다.
   *
   * 0.18초 동안 400에서 2000까지 쓸어 올린 뒤 그 끝에서 딱 멈춘다. 트라이톤 두 겹이
   * 어긋난 채 좌우로 갈라져 올라가는데, 도착점이 협화음이 아니라서 해결되지 않는다.
   * 놀라 들이키는 «아» 숨을 한 겹 얹었다. 0.6초에 끝난다 — 여운을 남기면 «결과»로 읽힌다.
   */
  challenge: (at) => {
    whoosh(at, 400, 2000, 0.26, 0.18, 0.035)
    burst(at, {
      gain: 0.26,
      attack: 0.002,
      decay: 0.08,
      filter: 'bandpass',
      frequency: 2400,
      q: 3,
      delay: 0.18,
    })
    breath(at, VOWEL.ah, 0.13, 0.02, 0.3, { slide: 1.22, delay: 0.18, pan: 0.3 })
    tone(at, {
      type: 'triangle',
      from: 233.1,
      to: 329.6,
      gain: 0.22,
      attack: 0.006,
      decay: 0.34,
      fm: { ratio: 2.76, index: 180 },
      delay: 0.18,
      pan: -0.35,
    })
    tone(at, {
      type: 'triangle',
      from: 234.2,
      to: 331.0,
      gain: 0.17,
      attack: 0.006,
      decay: 0.32,
      fm: { ratio: 2.76, index: 210 },
      delay: 0.18,
      pan: 0.4,
    })
    ring(at, 1661.2, 0.07, 0.34, { delay: 0.19, pan: -0.5 })
  },

  /*
   * 발각. **전 대역을 쓰는 유일한 소리이고, 밝은 파편과 방청석 반응도 여기에만 있다.**
   * 200Hz부터 9kHz까지 한꺼번에 터지므로 다른 무엇과도 헷갈릴 수 없다.
   *
   * 두 번 온다. 1단(0초)은 유리·쇠가 깨지는 파열, 그 사이 잡음이 위로 쓸려 올라간 뒤
   * 2단(0.36초)에서 바닥이 24Hz까지 꺼지고 «어» 신음이 한 옥타브 주저앉는다.
   * 발각의 무게는 들킨 순간이 아니라 그 다음에 온다. 방청석은 2단 뒤에 반응한다 —
   * 사람은 사건이 끝나고 나서야 소리를 낸다.
   */
  caught: (at) => {
    burst(at, { gain: 0.44, attack: 0.002, decay: 0.32, filter: 'bandpass', frequency: 3000, q: 0.5 })
    tone(at, {
      type: 'triangle',
      from: 150,
      to: 42,
      gain: 0.48,
      attack: 0.004,
      decay: 0.6,
      fm: { ratio: 1.72, index: 300 },
    })
    metal(at, 1174.7, 0.18, 0.34, 1800, { ratio: 3.31, pan: 0.3, wobble: 0.4 })
    metal(at, 1760, 0.12, 0.26, 2400, { ratio: 2.76, delay: 0.02, pan: -0.35 })
    debris(at, 24, 0.16, 0.6, [1600, 9000])

    whoosh(at, 700, 3000, 0.22, 0.28, 0.03, { delay: 0.05 })

    tone(at, {
      type: 'sine',
      from: 80,
      to: 24,
      gain: 0.6,
      attack: 0.006,
      decay: 1.7,
      fm: { ratio: 1.41, index: 55 },
      wobble: { rate: 2.7, depth: 0.08 },
      delay: 0.36,
    })
    moan(at, VOWEL.uh, 196, 98, 0.12, 0.12, 1.3, { delay: 0.36, pan: -0.25 })
    metal(at, 466.2, 0.13, 1.1, 660, { delay: 0.36, pan: -0.3, wobble: 0.45 })
    ring(at, 698.5, 0.06, 0.85, { delay: 0.4, pan: 0.5 })
    murmur(at, 22, 0.06, 1.5, { delay: 0.62 })
    burst(at, {
      gain: 0.13,
      attack: 0.02,
      decay: 1.3,
      filter: 'lowpass',
      frequency: 320,
      delay: 0.4,
    })
  },

  /*
   * 오판. **이 판에서 유일한 «버즈»다.** 27Hz로 진폭을 흔들면 소리가 지직거리는데,
   * 그게 세상 모든 «틀렸습니다» 신호의 정체다. 다만 게임쇼 부저처럼 밝게 두면 우스워지므로
   * 98·103.8Hz까지 끌어내리고 아래로 미끄러뜨렸다 — 낮은 버즈는 조롱이 아니라 «경고»가 된다.
   *
   * 잘못 지목했다는 건 민망한 게 아니라 이제 내가 노출됐다는 뜻이라, 끝에 저역이 한 번 꺼진다.
   * 0.7초. 웅성거림은 넣지 않았다 — 그건 발각의 것이다.
   */
  wrongCall: (at) => {
    burst(at, { gain: 0.22, attack: 0.002, decay: 0.09, filter: 'lowpass', frequency: 600 })
    tone(at, {
      type: 'sawtooth',
      from: 98,
      to: 82,
      gain: 0.26,
      attack: 0.008,
      decay: 0.42,
      wobble: { rate: 27, depth: 0.24 },
      pan: -0.2,
    })
    tone(at, {
      type: 'sawtooth',
      from: 103.8,
      to: 87,
      gain: 0.22,
      attack: 0.008,
      decay: 0.4,
      wobble: { rate: 31, depth: 0.2 },
      pan: 0.25,
    })
    tone(at, {
      type: 'sine',
      from: 130.8,
      to: 44,
      gain: 0.4,
      attack: 0.01,
      decay: 0.85,
      fm: { ratio: 1.41, index: 90 },
      delay: 0.3,
    })
    breath(at, VOWEL.oo, 0.08, 0.2, 0.6, { slide: 0.66, delay: 0.32, pan: 0.3 })
  },

  /*
   * 신문 개시. **종이 있는 자리는 여기와 승리뿐이고, 개정 전 웅성거림은 여기에만 있다.**
   *
   * 사람들이 자리를 잡는 동안(웅성거림 18) 방이 숨을 들이키고, 0.5초 끝에서 종이 떨어지고,
   * 그 순간 방이 조용해진다. 예고 없이 치면 알림음이고, 차오른 뒤에 치면 개시가 된다.
   * 종은 146.8이 아니라 110이다 — 한 음만 낮춰도 «알리는 종»이 «부르는 종»이 된다.
   */
  round: (at) => {
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
  },

  /*
   * 내 차례. **반복 리듬을 가진 유일한 소리다.** 나무를 «탁·탁» 두 번 두드린다 —
   * 누군가 당신 앞자리를 두드려 부르는 소리이고, 두 번이라는 것만으로 나머지 열한 개와 갈린다.
   *
   * 예전에는 587→880→1175 상승 아르페지오였다. 이 판에서 차례가 온다는 건 좋은 소식이 아니다.
   * 두 번째 두드림이 첫 번째보다 낮아서(220 → 174.6) 부르는 쪽이 재촉하지 않는다.
   * 0.4초. 저역 한 겹만 조용히 깔아 «가볍지 않게» 만든다.
   */
  myTurn: (at) => {
    const knock = (delay: number, hz: number, gain: number, pan: number) => {
      burst(at, {
        gain: gain * 0.5,
        attack: 0.001,
        decay: 0.02,
        filter: 'bandpass',
        frequency: 1900,
        q: 2.5,
        delay,
        pan,
      })
      tone(at, {
        type: 'triangle',
        from: hz,
        to: hz * 0.72,
        gain,
        attack: 0.002,
        decay: 0.13,
        fm: { ratio: 2.41, index: hz * 0.9 },
        delay,
        pan,
      })
    }
    knock(0, 220, 0.34, -0.15)
    knock(0.19, 174.6, 0.28, 0.15)
    tone(at, {
      type: 'sine',
      from: 87.3,
      gain: 0.16,
      attack: 0.02,
      decay: 0.55,
      fm: { ratio: 1.41, index: 18 },
      delay: 0.19,
    })
  },

  /*
   * 추첨. **알갱이 무리로 시작해 단 한 번의 착지로 끝나는 유일한 소리다.**
   *
   * 종이 넘김에는 음높이의 방향이 없으므로 22개를 1.5k~4.5k 안에서 시간·좌우로 흩뿌린다.
   * 매번 다르게 뿌려져 두 번 들어도 같지 않다. 대역을 반증(2.6k~6.5k)보다 낮게 잡아
   * «장 수가 많다»가 «한 장»과 구별되게 했다. 0.5초, 마지막 «탁»이 뽑힌 한 장이다.
   */
  draw: (at) => {
    debris(at, 22, 0.16, 0.3, [1500, 4500], {})
    burst(at, {
      gain: 0.26,
      attack: 0.003,
      decay: 0.09,
      filter: 'lowpass',
      frequency: 850,
      delay: 0.33,
    })
    tone(at, {
      type: 'triangle',
      from: 128,
      to: 76,
      gain: 0.24,
      attack: 0.003,
      decay: 0.12,
      fm: { ratio: 1.72, index: 110 },
      delay: 0.33,
    })
  },

  /*
   * 퇴출. **가장 어두운 소리다.** 걸쇠 «딸깍» 하나를 빼면 600Hz 위가 통째로 비어 있어서,
   * 밝은 파편이 쏟아지는 발각과 정반대 자리에 선다. 둘 다 큰 소리인데 절대 안 헷갈린다.
   *
   * 걸쇠가 먼저 걸리고 그다음에 문이 닫히는 순서다 — 뒤집으면 폭발이 된다.
   * 닫힌 뒤가 더 중요하다. 문틀에서 나무 부스러기가 떨어지고, 그 아래에서 36.7Hz가
   * 2초 동안 차오른다. 닫힌 게 아니라 «봉인된» 것으로 들려야 한다.
   */
  ousted: (at) => {
    burst(at, { gain: 0.16, attack: 0.001, decay: 0.018, filter: 'highpass', frequency: 3200 })
    tone(at, {
      type: 'sine',
      from: 96,
      to: 28,
      gain: 0.62,
      attack: 0.008,
      decay: 1.3,
      fm: { ratio: 1.41, index: 74 },
      wobble: { rate: 2.1, depth: 0.07 },
      delay: 0.03,
    })
    whoosh(at, 1400, 260, 0.28, 0.006, 0.3, { delay: 0.03 })
    burst(at, {
      gain: 0.26,
      attack: 0.004,
      decay: 0.26,
      filter: 'lowpass',
      frequency: 520,
      delay: 0.03,
    })
    /* 나무 부스러기. 대역을 600 아래로 묶어 «유리»가 되지 않게 한다. */
    debris(at, 14, 0.09, 0.75, [180, 620], { delay: 0.06 })
    metal(at, 116.5, 0.1, 1.0, 160, { delay: 0.05, pan: -0.4, wobble: 0.5 })
    burst(at, {
      gain: 0.13,
      attack: 0.03,
      decay: 1.6,
      filter: 'lowpass',
      frequency: 220,
      delay: 0.14,
    })
    tone(at, {
      type: 'sine',
      from: 36.7,
      gain: 0.26,
      attack: 0.3,
      decay: 2.2,
      fm: { ratio: 2.76, index: 12 },
      wobble: { rate: 1.3, depth: 0.05 },
      delay: 0.32,
    })
  },

  /*
   * 승리. **유일하게 «닫히는» 소리다.** 열한 개가 전부 해결되지 않은 채 끝나는데
   * 이것만 라단조 3화음이 제자리에 도착해 멎는다. 그 대비가 «끝났다»를 만든다.
   *
   * 0.9초 동안 저역이 차오른 뒤에 종이 떨어진다 — 절정은 큰 소리가 아니라 올라온 뒤에
   * 오는 것이라, 이 스웰을 빼면 아무리 키워도 그냥 시끄러운 종이 된다.
   * 단조라 밝지 않고 화음이라 닫힌다. 이 판에서 이긴다는 건 축제가 아니라
   * 누군가 거짓말한 것을 밝혀냈다는 뜻이고, 방에는 그 사람이 아직 앉아 있다.
   */
  win: (at) => {
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
  },

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
  lose: (at) => {
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
  },
}

/**
 * 효과음 한 방.
 *
 * 지금 시각보다 아주 조금 뒤로 예약한다 — 정확히 «지금»으로 잡으면 예약이 이미 지나간
 * 시각이 돼 첫 램프가 통째로 잘리고, 소리가 «틱» 하고 끊겨 들린다.
 */
export function playSynthSfx(name: SfxName): void {
  RECIPES[name](now() + 0.01)
}
