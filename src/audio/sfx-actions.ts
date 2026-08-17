/**
 * 행동의 소리 여섯. 누군가 «무엇을 했다»에 붙는다 — 제안·반증·위증·지목·차례·추첨.
 *
 * 결과의 소리(개시·발각·오판·퇴출·승패)는 sfx-outcomes.ts에 있다. 둘로 나눈 이유는
 * 파일이 800줄을 넘어서이기도 하지만, **두 무리가 설계 원칙이 서로 반대이기 때문**이다.
 * 여기 있는 것들은 한 판에 수십 번 나므로 «단순하고 짧다»가 규칙이고,
 * 저쪽은 몇 번 안 나므로 «풍부하고 길다»가 규칙이다.
 *
 * 열두 종이 서로 어떻게 갈리는지는 synth.ts 첫머리의 배치표에 있다.
 * **소리를 고치기 전에 그 표를 먼저 본다.**
 */

import { burst, tone } from './engine'
import { breath, debris, ring, vary, whoosh, VOWEL } from './voices'

/*
 * 도장. **저역으로 눌러 찍는 단발.** 0.5초.
 *
 * 웅장하게 만들되 «사건»으로는 만들지 않았다. 제안은 한 판에 수십 번 나오므로
 * 파편·웅성거림 같은 뒷일을 붙이면 판 전체가 시끄러워지고 큰 소리들과 구별이 안 된다.
 * 대신 **무게만 키웠다** — 55Hz 서브, 88Hz 탁자 공명, 그리고 방이 한 번 우는 짧은 꼬리.
 * 겹은 늘었지만 전부 300Hz 아래라 다른 열한 개와 음역에서 갈린다.
 *
 * ⚠️ 반복 피로가 걸리는 자리다. 실제 한 판을 돌려 «수십 번 들었을 때»로 다시 판단할 것.
 */
export function suggest(at: number): void {
  burst(at, { gain: 0.26, attack: 0.001, decay: 0.014, filter: 'highpass', frequency: 3400 })
  tone(at, {
    type: 'triangle',
    from: vary(165, 30),
    to: 44,
    gain: 0.72,
    attack: 0.002,
    decay: 0.26,
    fm: { ratio: 1.72, index: 280 },
  })
  /* 책상이 잠깐 우는 자리. Q를 높여 짧게 끊으면 나무가 되고, 길게 끌면 북이 된다. */
  burst(at, {
    gain: 0.3,
    attack: 0.002,
    decay: 0.12,
    filter: 'bandpass',
    frequency: 176,
    q: 7,
    pan: 0.15,
  })
  /* 낮은 쪽 공명 한 겹. 176 하나만 울리면 «판자»이고, 옥타브 아래가 같이 울면 «탁자»가 된다. */
  burst(at, {
    gain: 0.24,
    attack: 0.003,
    decay: 0.2,
    filter: 'bandpass',
    frequency: 88,
    q: 5,
    pan: -0.18,
  })
  /*
   * 웅장함은 «큰 소리»가 아니라 **들리지 않는 저역과 뒤에 남는 방**에서 온다.
   * 55Hz는 음정으로는 거의 안 잡히고 «눌리는 무게»로 들리는 자리다.
   */
  tone(at, {
    type: 'sine',
    from: 55,
    to: 34,
    gain: 0.5,
    attack: 0.006,
    decay: 0.42,
    fm: { ratio: 1.41, index: 26 },
    delay: 0.008,
  })
  /* 나무 부스러기 다섯과 방이 한 번 우는 꼬리. 여기까지가 «찍혔다»의 뒤처리다. */
  debris(at, 5, 0.07, 0.1, [220, 760], { delay: 0.012 })
  burst(at, {
    gain: 0.1,
    attack: 0.015,
    decay: 0.38,
    filter: 'lowpass',
    frequency: 340,
    delay: 0.03,
  })
}

/*
 * 카드. **저역이 아예 없는 유일한 소리다.** 이 판에서 «가벼운 것»은 이것뿐이라,
 * 2.5kHz 아래를 통째로 비우면 다른 열한 개와 절대 겹치지 않는다.
 *
 * 한 장을 놓는 게 아니라 **한 벌을 부채꼴로 펼친다**(촤라락). 0.35초.
 */
export function refute(at: number): void {
  /*
   * 열두 장이 부채꼴로 «촤라락». 여기서 중요한 건 장수가 아니라 **방향**이다 —
   * 시간에 흩뿌리기만 하면 그건 추첨(종이 뭉치가 섞임)이고, 왼쪽에서 오른쪽으로
   * 팬이 한 번에 훑고 지나가면 그제야 «펼쳐진 것»이 된다. 추첨과 갈리는 축이 이것이다.
   *
   * 간격이 점점 좁아진다(0.026 → 0.014). 손이 카드를 밀 때 뒤로 갈수록 빨라져서,
   * 등간격으로 놓으면 «카드»가 아니라 «타자기»가 된다.
   */
  const FAN = 12
  for (let i = 0; i < FAN; i += 1) {
    const k = i / (FAN - 1)
    const step = 0.026 - 0.012 * k
    const delay = i === 0 ? 0 : 0.026 * i - 0.006 * i * k
    burst(at, {
      gain: 0.2 * (0.7 + Math.random() * 0.5),
      attack: 0.001,
      decay: 0.02 + Math.random() * 0.014,
      filter: 'bandpass',
      frequency: vary(2900 + 3200 * k, 120),
      q: 1.6,
      delay,
      /* 왼쪽 끝에서 오른쪽 끝까지. 이 한 줄이 «촤라락»의 전부다. */
      pan: -0.62 + 1.24 * k,
    })
    if (i === FAN - 1) {
      /* 마지막 장이 손을 떠나며 스치는 소리. step은 여기서만 쓰인다. */
      whoosh(at, 6400, 2400, 0.16, 0.02, step + 0.03, { delay, pan: 0.5 })
    }
  }
  /* 다 펼친 뒤 한 벌이 «착» 하고 자리를 잡는다. 이게 없으면 소리가 끝나지 않고 흩어진다. */
  burst(at, {
    gain: 0.28,
    attack: 0.002,
    decay: 0.06,
    filter: 'highpass',
    frequency: 2000,
    delay: 0.27,
    pan: 0.15,
  })
  debris(at, 5, 0.07, 0.06, [3000, 7000], { delay: 0.275 })
}

/*
 * 위증. **타격이 아예 없는 유일한 소리다.** 열한 개가 전부 «치는» 소리로 시작하는데
 * 이것만 아무 데서도 시작하지 않고 스며들었다가 빠진다 — 모든 겹의 어택이 0.3초 이상이다.
 *
 * 아직 아무도 모르는 한 수라서 사건이 되면 안 되고, 그렇다고 조용하기만 하면 «없는 것»이 된다.
 * 그래서 «누가 있다»로 민다. 닫힌 «우» 숨이 아래로 풀리고, 바닥이 26Hz까지 내려앉고,
 * 87·90.2가 맞물리지 않고, 맨 위에서 반음 쌍이 좌우로 갈라져 배어 나온다.
 */
export function perjury(at: number): void {
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
}

/*
 * 지목. **올라가는 유일한 소리다.** 나머지 열한 개가 전부 제자리이거나 내려가므로,
 * 상승 하나만으로 «질문이 던져졌다»가 즉시 읽힌다.
 *
 * 0.18초 동안 400에서 2000까지 쓸어 올린 뒤 그 끝에서 딱 멈춘다. 트라이톤 두 겹이
 * 어긋난 채 좌우로 갈라져 올라가는데, 도착점이 협화음이 아니라서 해결되지 않는다.
 * 놀라 들이키는 «아» 숨을 한 겹 얹었다. 0.6초에 끝난다 — 여운을 남기면 «결과»로 읽힌다.
 */
export function challenge(at: number): void {
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
}

/*
 * 내 차례. **반복 리듬을 가진 유일한 소리이고, 타격 뒤에 지속음이 남는 것도 이것뿐이다.**
 * 나무를 «탁·탁·탁» 세 번 두드린다 — 누군가 당신 앞자리를 두드려 부르는 소리다.
 *
 * 두드릴수록 낮아져서(220 → 196 → 174.6) 부르는 쪽이 재촉하지 않는다. 이 판에서
 * 차례가 온다는 건 좋은 소식이 아니라, 상승 아르페지오로 알리면 뜻이 어긋난다.
 * 1.1초. 마지막 두드림 자리에 낮은 음이 켜져 그대로 남는다.
 */
export function myTurn(at: number): void {
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
  /*
   * **세 번 두드리고, 그 자리가 나를 향해 좁혀진다.** 티가 안 났던 이유는 두 번이
   * 짧아서가 아니라 **어디서 나는 소리인지가 없어서**였다 — 좌우로 갈라진 두 번은
   * «누가 두드렸다»이지 «나를 불렀다»가 아니다.
   *
   * 그래서 팬을 바깥에서 정가운데로 모으고(−0.5 → 0.42 → 0), 마지막을 가장 크게 둔다.
   * 소리가 나를 향해 다가와 눈앞에서 멎는다. 이 수렴이 이 소리만 갖는 축이다.
   */
  knock(0, 220, 0.34, -0.5)
  knock(0.17, 196, 0.32, 0.42)
  knock(0.35, 174.6, 0.52, 0)
  /*
   * 두드림이 멎은 자리에 낮은 음이 «켜진다». 열두 개 중 타격 뒤에 지속음이 남는 것은
   * 이것뿐이라, 이 한 겹이 «시선이 나에게 와 있다»를 만든다. 재촉하지 않으려고 화음은 안 쓴다.
   */
  tone(at, {
    type: 'triangle',
    from: 146.8,
    gain: 0.2,
    attack: 0.05,
    decay: 0.72,
    fm: { ratio: 2.01, index: 44 },
    vibrato: { rate: 4.4, cents: 12 },
    delay: 0.37,
  })
  tone(at, {
    type: 'sine',
    from: 87.3,
    gain: 0.22,
    attack: 0.02,
    decay: 0.7,
    fm: { ratio: 1.41, index: 18 },
    delay: 0.35,
  })
}

/*
 * 추첨. **주기를 가진 유일한 소리다.** 통이 다섯 바퀴 돌다 느려져 멎고, 한 장이 떨어진다.
 *
 * 대역을 반증(2.9k~6.1k)보다 낮게 잡아 «장 수가 많다»가 «한 벌»과 구별되게 했다.
 * 반증도 좌우로 움직이지만 그쪽은 한 번 훑고 끝나고, 이쪽은 바퀴마다 되풀이한다 —
 * 훑기와 돌기를 가르는 것이 그 반복이다. 1.8초.
 */
export function draw(at: number): void {
  /*
   * **통이 다섯 바퀴 돈다.** 흩뿌리기만 해서는 «종이가 많다»일 뿐 «돌고 있다»가 아니다.
   * 회전은 세 가지가 같이 있어야 읽힌다.
   *
   * **주기** — 한 바퀴 0.24초. 그 안에서 알갱이가 몰렸다 흩어지길 되풀이한다.
   * **좌우 왕복** — 팬이 바퀴마다 왼쪽에서 오른쪽으로 훑는다. 안이 도는 것은 이게 만든다.
   * **느려짐** — 바퀴마다 주기가 길어지고 작아진다. 등속으로 돌면 «기계»이고,
   *   느려지다 멎어야 «손으로 돌린 통»이 된다.
   */
  const TURNS = 5
  const PER_TURN = 7
  let cursor = 0
  for (let turn = 0; turn < TURNS; turn += 1) {
    const slow = 1 + turn * 0.22
    const level = 0.19 * (1 - turn * 0.13)
    for (let i = 0; i < PER_TURN; i += 1) {
      const k = i / PER_TURN
      burst(at, {
        gain: level * (0.5 + Math.random() * 0.7),
        attack: 0.001,
        decay: 0.016 + Math.random() * 0.02,
        filter: 'bandpass',
        frequency: vary(1500 + 2600 * Math.random(), 60),
        q: 2.4,
        delay: cursor + k * 0.24 * slow,
        pan: -0.7 + 1.4 * k,
      })
    }
    /* 바퀴마다 통 벽이 한 번 울린다. 이게 «안에 든 것»과 «통»을 갈라 준다. */
    burst(at, {
      gain: 0.16 * (1 - turn * 0.14),
      attack: 0.002,
      decay: 0.1,
      filter: 'bandpass',
      frequency: 210,
      q: 4,
      delay: cursor + 0.02,
      pan: turn % 2 === 0 ? -0.3 : 0.3,
    })
    cursor += 0.24 * slow
  }
  /* 다 돌고 나서 한 장이 떨어진다. 착지는 회전이 완전히 멎은 뒤여야 «뽑혔다»가 된다. */
  burst(at, {
    gain: 0.3,
    attack: 0.003,
    decay: 0.09,
    filter: 'lowpass',
    frequency: 850,
    delay: cursor + 0.12,
  })
  tone(at, {
    type: 'triangle',
    from: 128,
    to: 76,
    gain: 0.28,
    attack: 0.003,
    decay: 0.14,
    fm: { ratio: 1.72, index: 110 },
    delay: cursor + 0.12,
  })
}
