import { describe, expect, it } from 'vitest'
import { declareAll, isPerjury, mustRefute, suggest } from './round'
import { createGame } from './setup'
import { usePower } from './power'
import type { CardId, Claim, GameState, PlayerId, Suggestion } from './types'

/** 손패를 강제로 지정한 판을 만든다. 룰 검증에 필요한 배치를 직접 세운다. */
function withHands(hands: readonly CardId[][]): GameState {
  const base = createGame({ seed: 'fixture' })
  return {
    ...base,
    solution: { suspect: 's6', weapon: 'w4', place: 'p5' },
    players: base.players.map((p, i) => ({
      ...p,
      characterId: `s${i + 1}`,
      hand: hands[i] ?? [],
    })),
  }
}

const SUGGESTION: Suggestion = { suspect: 's1', weapon: 'w1', place: 'p1' }

function claims(entries: [number, Claim][]): Map<PlayerId, Claim> {
  return new Map(entries.map(([seat, claim]) => [`p${seat}`, claim]))
}

describe('mustRefute — 반증 의무', () => {
  it('제안된 카드를 하나라도 가지면 반증 의무가 있다', () => {
    expect(mustRefute(['w1', 'p3'], SUGGESTION)).toBe(true)
  })

  it('제안된 카드를 하나도 안 가지면 의무가 없다', () => {
    expect(mustRefute(['w2', 'p3'], SUGGESTION)).toBe(false)
  })
})

describe('isPerjury — 위증 판정', () => {
  it('가진 카드로 반증하면 진실이다', () => {
    expect(isPerjury(['w1', 'p3'], SUGGESTION, { kind: 'refute', cardId: 'w1' })).toBe(false)
  })

  it('없는 카드로 반증하면 위증이다', () => {
    expect(isPerjury(['w2', 'p3'], SUGGESTION, { kind: 'refute', cardId: 'w1' })).toBe(true)
  })

  it('가진 게 없을 때의 침묵은 진실이다', () => {
    expect(isPerjury(['w2', 'p3'], SUGGESTION, { kind: 'pass' })).toBe(false)
  })

  it('가진 게 있는데 침묵하면 위증이다', () => {
    expect(isPerjury(['w1', 'p3'], SUGGESTION, { kind: 'pass' })).toBe(true)
  })
})

describe('suggest — 제안', () => {
  it('제안하면 반증 페이즈로 넘어가고 기록이 열린다', () => {
    const game = suggest(createGame({ seed: 'sg' }), 'p0', SUGGESTION)

    expect(game.phase).toBe('refute')
    expect(game.rounds).toHaveLength(1)
    expect(game.rounds[0]?.suggestion).toEqual(SUGGESTION)
    expect(game.rounds[0]?.declarations).toEqual([])
  })

  it('원본 상태를 바꾸지 않는다', () => {
    const before = createGame({ seed: 'sg' })
    suggest(before, 'p0', SUGGESTION)

    expect(before.phase).toBe('suggest')
    expect(before.rounds).toEqual([])
  })

  it('차례가 아닌 사람은 제안할 수 없다', () => {
    expect(() => suggest(createGame({ seed: 'sg' }), 'p2', SUGGESTION)).toThrow()
  })

  it('종류가 틀린 카드로는 제안할 수 없다', () => {
    const bad = { suspect: 'w1', weapon: 'w2', place: 'p1' } as unknown as Suggestion
    expect(() => suggest(createGame({ seed: 'sg' }), 'p0', bad)).toThrow()
  })
})

describe('declareAll — 동시 반증 선언', () => {
  const staged = withHands([
    ['s2', 'p4'], // p0 제안자
    ['w1', 'p3'], // p1 w1 보유 → 의무 있음
    ['p1', 'w2'], // p2 p1 보유 → 의무 있음
    ['s3', 's4'], // p3 없음
    ['w3', 'p2'], // p4 없음
    ['s5', 's1'], // p5 s1 보유 → 의무 있음
  ])

  const opened = suggest(staged, 'p0', SUGGESTION)

  it('제안자를 제외한 5명 전원이 선언한다', () => {
    const game = declareAll(
      opened,
      claims([
        [1, { kind: 'refute', cardId: 'w1' }],
        [2, { kind: 'refute', cardId: 'p1' }],
        [3, { kind: 'pass' }],
        [4, { kind: 'pass' }],
        [5, { kind: 'refute', cardId: 's1' }],
      ]),
    )

    expect(game.rounds[0]?.declarations).toHaveLength(5)
    expect(game.phase).toBe('challenge')
  })

  it('진실한 선언에는 위증 표시가 붙지 않는다', () => {
    const game = declareAll(
      opened,
      claims([
        [1, { kind: 'refute', cardId: 'w1' }],
        [2, { kind: 'refute', cardId: 'p1' }],
        [3, { kind: 'pass' }],
        [4, { kind: 'pass' }],
        [5, { kind: 'refute', cardId: 's1' }],
      ]),
    )

    expect(game.rounds[0]?.declarations.every((d) => !d.isPerjury)).toBe(true)
  })

  it('없는 카드로 반증한 사람만 위증으로 기록된다', () => {
    const game = declareAll(
      opened,
      claims([
        [1, { kind: 'refute', cardId: 'w1' }],
        [2, { kind: 'refute', cardId: 'p1' }],
        [3, { kind: 'refute', cardId: 'p1' }], // p3은 p1을 갖고 있지 않다
        [4, { kind: 'pass' }],
        [5, { kind: 'refute', cardId: 's1' }],
      ]),
    )

    const liars = game.rounds[0]?.declarations.filter((d) => d.isPerjury).map((d) => d.playerId)
    expect(liars).toEqual(['p3'])
  })

  it('가진 게 있는데 침묵한 사람도 위증으로 기록된다', () => {
    const game = declareAll(
      opened,
      claims([
        [1, { kind: 'pass' }], // p1은 w1을 갖고 있다
        [2, { kind: 'refute', cardId: 'p1' }],
        [3, { kind: 'pass' }],
        [4, { kind: 'pass' }],
        [5, { kind: 'refute', cardId: 's1' }],
      ]),
    )

    const liars = game.rounds[0]?.declarations.filter((d) => d.isPerjury).map((d) => d.playerId)
    expect(liars).toEqual(['p1'])
  })

  it('제안에 없는 카드로는 반증할 수 없다', () => {
    expect(() =>
      declareAll(
        opened,
        claims([
          [1, { kind: 'refute', cardId: 'p3' }], // 제안에 없는 카드
          [2, { kind: 'pass' }],
          [3, { kind: 'pass' }],
          [4, { kind: 'pass' }],
          [5, { kind: 'pass' }],
        ]),
      ),
    ).toThrow()
  })

  it('한 명이라도 선언을 빠뜨리면 진행되지 않는다', () => {
    expect(() =>
      declareAll(
        opened,
        claims([
          [1, { kind: 'pass' }],
          [2, { kind: 'pass' }],
          [3, { kind: 'pass' }],
          [4, { kind: 'pass' }],
        ]),
      ),
    ).toThrow()
  })

  it('제안자는 선언하지 않는다', () => {
    expect(() =>
      declareAll(
        opened,
        claims([
          [0, { kind: 'pass' }],
          [1, { kind: 'pass' }],
          [2, { kind: 'pass' }],
          [3, { kind: 'pass' }],
          [4, { kind: 'pass' }],
          [5, { kind: 'pass' }],
        ]),
      ),
    ).toThrow()
  })

  it('반증 페이즈가 아니면 선언할 수 없다', () => {
    expect(() =>
      declareAll(
        staged,
        claims([
          [1, { kind: 'pass' }],
          [2, { kind: 'pass' }],
          [3, { kind: 'pass' }],
          [4, { kind: 'pass' }],
          [5, { kind: 'pass' }],
        ]),
      ),
    ).toThrow()
  })
})

/**
 * 대사는 «그 자리에서 소리내어 한 말»이다. 룰에는 관여하지 않지만 기록에는 남아야 한다 —
 * 반증 선언이 원래 발화 행위이기 때문이다(설계 §1.4.1). LLM만 대사를 만들고
 * 사람과 규칙 기반 판단자는 만들지 않으므로, **없는 것이 정상 상태**다.
 */
describe('대사 기록', () => {
  const staged = withHands([
    ['s2', 'p4'],
    ['w1', 'p3'],
    ['p1', 'w2'],
    ['s3', 's4'],
    ['w3', 'p2'],
    ['s5', 's1'],
  ])

  const allPass = claims([
    [1, { kind: 'pass' }],
    [2, { kind: 'pass' }],
    [3, { kind: 'pass' }],
    [4, { kind: 'pass' }],
    [5, { kind: 'pass' }],
  ])

  it('제안 대사가 라운드 기록에 남는다', () => {
    const game = suggest(staged, 'p0', SUGGESTION, '이 셋을 상 위에 올리겠소')

    expect(game.rounds[0]?.suggestionLine).toBe('이 셋을 상 위에 올리겠소')
  })

  it('제안 대사를 주지 않으면 null이다', () => {
    expect(suggest(staged, 'p0', SUGGESTION).rounds[0]?.suggestionLine).toBeNull()
  })

  it('반증 대사가 선언자별로 남는다', () => {
    const game = declareAll(
      suggest(staged, 'p0', SUGGESTION),
      allPass,
      new Map([['p2', '그 물건이라면 내 방에 있소']]),
    )

    const declarations = game.rounds[0]?.declarations ?? []
    expect(declarations.find((d) => d.playerId === 'p2')?.line).toBe('그 물건이라면 내 방에 있소')
    expect(declarations.find((d) => d.playerId === 'p1')?.line).toBeNull()
  })

  it('대사를 하나도 주지 않으면 전원 null이다', () => {
    const game = declareAll(suggest(staged, 'p0', SUGGESTION), allPass)

    expect((game.rounds[0]?.declarations ?? []).every((d) => d.line === null)).toBe(true)
  })

  it('선언하지 않은 사람의 대사는 버린다 — 기록은 선언을 따라간다', () => {
    const game = declareAll(
      suggest(staged, 'p0', SUGGESTION),
      allPass,
      new Map([['p0', '제안자는 선언하지 않는다']]),
    )

    expect((game.rounds[0]?.declarations ?? []).some((d) => d.playerId === 'p0')).toBe(false)
  })
})

/** p3이 w1을 쥔다 — 침묵하면 위증이 되는 자리다. 거부가 그것을 면제하는지 본다. */
const REFUSE_HANDS: CardId[][] = [['s2'], ['s3'], ['s4'], ['w1'], ['s5'], ['p2']]
const ALL_PASS: [number, Claim][] = [
  [1, { kind: 'pass' }],
  [2, { kind: 'pass' }],
  [3, { kind: 'pass' }],
  [4, { kind: 'pass' }],
  [5, { kind: 'pass' }],
]

describe('refuse — 변호사의 거부', () => {
  const REFUSER: PlayerId = 'p3'

  /** 거부는 능력을 쓴 좌석에만 생긴다. 고를 수 있는 선언이 아니다. */
  function armed(state: GameState): GameState {
    return usePower(state, REFUSER, { kind: 'refuse-demand' })
  }

  it('능력을 쓴 좌석의 선언은 거부로 바뀐다', () => {
    const state = armed(suggest(withHands(REFUSE_HANDS), 'p0', SUGGESTION))
    const after = declareAll(state, claims(ALL_PASS))

    const mine = after.rounds[0]?.declarations.find((d) => d.playerId === REFUSER)
    expect(mine?.claim).toEqual({ kind: 'refuse' })
  })

  /** 거부는 반증 의무 자체를 면제받는다 — 침묵과 달리 위증이 되지 않는다. */
  it('카드를 쥐고 있어도 위증이 아니다', () => {
    const state = armed(suggest(withHands(REFUSE_HANDS), 'p0', SUGGESTION))
    const after = declareAll(state, claims(ALL_PASS))

    const mine = after.rounds[0]?.declarations.find((d) => d.playerId === REFUSER)
    expect(mine?.isPerjury).toBe(false)
  })

  it('한 번 쓰면 다음 라운드에는 거부가 생기지 않는다', () => {
    const state = armed(suggest(withHands(REFUSE_HANDS), 'p0', SUGGESTION))
    const after = declareAll(state, claims(ALL_PASS))

    expect(after.pending).toHaveLength(0)
  })

  it('능력을 쓰지 않은 좌석은 거부가 되지 않는다', () => {
    const state = suggest(withHands(REFUSE_HANDS), 'p0', SUGGESTION)
    const after = declareAll(state, claims(ALL_PASS))

    for (const d of after.rounds[0]?.declarations ?? []) {
      expect(d.claim.kind).not.toBe('refuse')
    }
  })

  /**
   * 바깥 층(화면·AI·워커)이 뚫려 거부가 그냥 들어와도 엔진이 막는다.
   * 이걸 통과시키면 능력 없는 좌석이 위증 판정을 면제받는다.
   */
  it('능력 없이 낸 거부는 거부당한다', () => {
    const state = suggest(withHands(REFUSE_HANDS), 'p0', SUGGESTION)
    const sneaky = claims(ALL_PASS)
    sneaky.set(REFUSER, { kind: 'refuse' })

    expect(() => declareAll(state, sneaky)).toThrow()
  })

  it('능력을 쓴 좌석이 스스로 거부를 내는 것은 통과한다', () => {
    const state = armed(suggest(withHands(REFUSE_HANDS), 'p0', SUGGESTION))
    const own = claims(ALL_PASS)
    own.set(REFUSER, { kind: 'refuse' })

    const mine = declareAll(state, own).rounds[0]?.declarations.find((d) => d.playerId === REFUSER)
    expect(mine?.claim).toEqual({ kind: 'refuse' })
  })

  /** 대사는 그대로 남는다 — 룰이 바뀐 것이지 그가 한 말이 바뀐 것이 아니다. */
  it('그 좌석의 대사는 남는다', () => {
    const state = armed(suggest(withHands(REFUSE_HANDS), 'p0', SUGGESTION))
    const after = declareAll(state, claims(ALL_PASS), new Map([[REFUSER, '답하지 않겠소']]))

    const mine = after.rounds[0]?.declarations.find((d) => d.playerId === REFUSER)
    expect(mine?.line).toBe('답하지 않겠소')
  })
})
