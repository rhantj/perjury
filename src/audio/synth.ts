/**
 * 효과음을 그때그때 합성한다. 음원 파일이 하나도 없어도 소리가 나게 하는 쪽이다.
 *
 * **왜 파일이 아니라 합성인가.** 1920년대 신문실·법정의 질감을 가진 음원을 라이선스까지
 * 맞춰 열두 개 모으는 일은 마감 안에 끝나지 않고, 모아도 번들이 수 MB 불어난다.
 * 오실레이터 몇 개와 잡음 한 덩이로 «도장·종·파열»의 윤곽은 잡힌다.
 * 나중에 진짜 음원이 생기면 audio.ts가 파일 쪽을 먼저 집으므로 이 파일은 그대로 둬도 된다.
 *
 * 소리를 고를 때 지킨 것: **큰 사건일수록 낮고 길게.** 화면 연출이 이미 크기를 말하므로
 * 소리까지 같이 커지면 판이 시끄러워진다. 발각·퇴출만 저역을 길게 끌고 나머지는 짧게 끊는다.
 *
 * 레시피의 gain은 «가장 큰 소리를 1로 봤을 때»의 비율이다. 전체 음량은 engine의
 * 효과음 버스가 한 번에 잡으므로 여기서 음량을 다시 곱하지 않는다.
 */

import { burst, now, tone } from './engine'

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
  /* 도장. 저역이 «쿵» 내려앉고 그 위에 종이 눌리는 마찰이 짧게 얹힌다. */
  suggest: (at) => {
    tone(at, { type: 'triangle', from: 190, to: 70, gain: 0.5, attack: 0.004, decay: 0.16 })
    burst(at, { gain: 0.26, attack: 0.002, decay: 0.05, filter: 'bandpass', frequency: 1700, q: 1.1 })
  },

  /* 카드를 탁 놓는다. 건조하게 — 여기서 여운이 남으면 반증이 매번 사건처럼 들린다. */
  refute: (at) => {
    burst(at, { gain: 0.32, attack: 0.003, decay: 0.09, filter: 'highpass', frequency: 1200 })
    tone(at, { type: 'sine', from: 150, to: 90, gain: 0.3, attack: 0.004, decay: 0.1 })
  },

  /*
   * 위증. 잠잠하게 둔다 — 이건 아직 아무도 모르는 한 수라, 터뜨리면 판에서 가장 큰
   * 사건처럼 읽힌다. 어긋난 두 음을 겹쳐 «뭔가 틀어졌다»만 남긴다.
   */
  perjury: (at) => {
    tone(at, { type: 'triangle', from: 88, gain: 0.18, attack: 0.05, decay: 0.9 })
    tone(at, { type: 'triangle', from: 91.5, gain: 0.18, attack: 0.05, decay: 0.9 })
    tone(at, { type: 'sine', from: 44, gain: 0.34, attack: 0.03, decay: 1.0 })
  },

  /* 지목. 위로 치솟는다 — 결과가 아직 안 나온 «질문»이라 열린 채로 끝나야 한다. */
  challenge: (at) => {
    tone(at, { type: 'sawtooth', from: 330, to: 990, gain: 0.14, attack: 0.01, decay: 0.34 })
    tone(at, { type: 'square', from: 660, to: 1980, gain: 0.05, attack: 0.01, decay: 0.3 })
    burst(at, { gain: 0.18, attack: 0.005, decay: 0.25, filter: 'highpass', frequency: 2600 })
  },

  /* 발각. 판을 통틀어 가장 큰 소리다. 파열 위에 저역이 무너지고 금속 배음이 남는다. */
  caught: (at) => {
    burst(at, { gain: 0.5, attack: 0.002, decay: 0.32, filter: 'bandpass', frequency: 3200, q: 0.7 })
    tone(at, { type: 'triangle', from: 160, to: 48, gain: 0.55, attack: 0.004, decay: 0.55 })
    tone(at, { type: 'square', from: 1244, gain: 0.06, attack: 0.004, decay: 0.7, delay: 0.03 })
    tone(at, { type: 'square', from: 1661, gain: 0.04, attack: 0.004, decay: 0.6, delay: 0.05 })
  },

  /* 오판. 미끄러져 내린다 — 틀렸다는 말을 «김빠짐»으로 옮긴 것이다. */
  wrongCall: (at) => {
    tone(at, { type: 'triangle', from: 392, to: 370, gain: 0.22, attack: 0.02, decay: 0.26 })
    tone(at, {
      type: 'triangle',
      from: 311,
      to: 233,
      gain: 0.26,
      attack: 0.02,
      decay: 0.5,
      delay: 0.16,
    })
    tone(at, { type: 'sine', from: 116, gain: 0.2, attack: 0.03, decay: 0.6, delay: 0.16 })
  },

  /*
   * 신문 개시. 낮은 종 하나. 배음을 손으로 쌓는 이유는 오실레이터 한 개로는 «삐» 소리라
   * 종으로 안 들리기 때문이다 — 위로 갈수록 작고 빨리 죽어야 쇠붙이로 읽힌다.
   */
  round: (at) => {
    const partials = [
      { hz: 146.8, gain: 0.34, decay: 2.4 },
      { hz: 293.7, gain: 0.16, decay: 1.8 },
      { hz: 440.0, gain: 0.09, decay: 1.3 },
      { hz: 587.3, gain: 0.05, decay: 0.9 },
    ]
    for (const p of partials) {
      tone(at, { type: 'sine', from: p.hz, gain: p.gain, attack: 0.006, decay: p.decay })
    }
    burst(at, { gain: 0.12, attack: 0.002, decay: 0.11, filter: 'bandpass', frequency: 4200, q: 0.8 })
  },

  /* 내 차례. 올라가는 두 음 — 판에서 유일하게 «권한이 넘어왔다»는 뜻이라 밝은 쪽이다. */
  myTurn: (at) => {
    tone(at, { type: 'sine', from: 587.3, gain: 0.24, attack: 0.012, decay: 0.42 })
    tone(at, { type: 'sine', from: 880, gain: 0.2, attack: 0.012, decay: 0.62, delay: 0.13 })
    tone(at, { type: 'sine', from: 1174.7, gain: 0.06, attack: 0.012, decay: 0.5, delay: 0.13 })
  },

  /*
   * 추첨. 좁은 대역 잡음을 일곱 번 때린다. 점점 작아지고 점점 높아지게 두면
   * 통이 «돌다가 멎는» 것으로 들린다.
   */
  draw: (at) => {
    for (let i = 0; i < 7; i += 1) {
      burst(at, {
        gain: 0.22 - i * 0.02,
        attack: 0.002,
        decay: 0.04,
        filter: 'bandpass',
        frequency: 1100 + i * 140,
        q: 2.2,
        delay: i * 0.062,
      })
    }
  },

  /* 퇴출. 문이 닫힌다. 꼬리를 길게 남기는 소리는 이것과 발각 둘뿐이다. */
  ousted: (at) => {
    tone(at, { type: 'sine', from: 96, to: 38, gain: 0.6, attack: 0.008, decay: 0.75 })
    burst(at, { gain: 0.28, attack: 0.004, decay: 0.2, filter: 'lowpass', frequency: 700 })
    burst(at, { gain: 0.1, attack: 0.01, decay: 0.5, filter: 'lowpass', frequency: 280, delay: 0.08 })
  },

  /* 승리. 올라가는 화음이지만 팡파르로 가지 않는다 — 이 판의 결말은 축제가 아니다. */
  win: (at) => {
    const notes = [261.6, 329.6, 392.0, 523.3]
    notes.forEach((hz, i) => {
      tone(at, { type: 'triangle', from: hz, gain: 0.2, attack: 0.02, decay: 1.5, delay: i * 0.11 })
    })
    tone(at, { type: 'sine', from: 130.8, gain: 0.28, attack: 0.03, decay: 2.0 })
  },

  /* 패배. 같은 화음을 뒤집어 내려간다. 마지막 저역이 가장 오래 남는다. */
  lose: (at) => {
    const notes = [349.2, 293.7, 233.1, 174.6]
    notes.forEach((hz, i) => {
      tone(at, { type: 'triangle', from: hz, gain: 0.2, attack: 0.03, decay: 1.3, delay: i * 0.15 })
    })
    tone(at, { type: 'sine', from: 87.3, gain: 0.3, attack: 0.05, decay: 2.2, delay: 0.2 })
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
