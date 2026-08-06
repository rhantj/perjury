import { describe, expect, it } from 'vitest'
import { declareAll, isPerjury, mustRefute, suggest } from './round'
import { createGame, REFUTER_COUNT } from './setup'
import { suggestAll } from './testing'
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

describe('추첨 — 반증 의무를 지는 좌석', () => {
  const opened = (state: GameState) => suggest(state, 'p0', SUGGESTION)
  const drawnIn = (state: GameState) => opened(state).rounds[0]?.responderIds ?? []
  const empty = () => withHands([[], [], [], [], [], []])
  const passes = (ids: readonly PlayerId[]) =>
    new Map<PlayerId, Claim>(ids.map((id) => [id, { kind: 'pass' }]))

  it('제안자를 뺀 다섯 중 REFUTER_COUNT명만 뽑힌다', () => {
    const ids = drawnIn(empty())
    expect(ids).toHaveLength(REFUTER_COUNT)
    expect(ids).not.toContain('p0')
  })

  it('같은 시드·같은 라운드면 같은 사람이 뽑힌다 — 룰 엔진은 결정론이다', () => {
    expect(drawnIn(empty())).toEqual(drawnIn(empty()))
  })

  it('뽑힌 사람의 선언만 기록된다', () => {
    const state = opened(empty())
    const ids = state.rounds[0]?.responderIds ?? []
    const after = declareAll(state, passes(ids))
    expect(after.rounds[0]?.declarations.map((d) => d.playerId)).toEqual([...ids])
  })

  it('뽑히지 않은 사람은 제안된 카드를 쥐고 있어도 위증이 아니다 — 선언할 자리가 없었다', () => {
    // 여섯 명 모두 제안된 카드를 쥐게 둔다. 전원 선언이었다면 뽑히지 않은 쪽도 위증이 됐다.
    const state = opened(withHands([['s1'], ['w1'], ['w1'], ['w1'], ['w1'], ['w1']]))
    const ids = state.rounds[0]?.responderIds ?? []
    const after = declareAll(state, passes(ids))
    const spoke = new Set(after.rounds[0]?.declarations.map((d) => d.playerId))
    for (const id of ['p1', 'p2', 'p3', 'p4', 'p5']) {
      if (!ids.includes(id)) expect(spoke.has(id)).toBe(false)
    }
  })

  it('뽑힌 사람의 선언이 빠지면 던진다', () => {
    const state = opened(empty())
    const ids = state.rounds[0]?.responderIds ?? []
    expect(() => declareAll(state, passes(ids.slice(1)))).toThrow()
  })
})

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

  const opened = suggestAll(staged, 'p0', SUGGESTION)

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

  /*
   * 예전에는 던졌다. 지금은 «선언할 자리가 아닌» 좌석의 선언을 버린다 —
   * 추첨에서 빠진 좌석과 제안자를 같은 규칙으로 다루기 때문이다(round.ts의 responders 주석).
   * 지켜야 하는 것은 「제안자의 말이 기록에 남지 않는다」이지 「던진다」가 아니다.
   */
  it('제안자의 선언은 기록되지 않는다', () => {
    const game = declareAll(
      opened,
      claims([
        [0, { kind: 'pass' }],
        [1, { kind: 'pass' }],
        [2, { kind: 'pass' }],
        [3, { kind: 'pass' }],
        [4, { kind: 'pass' }],
        [5, { kind: 'pass' }],
      ]),
    )

    expect(game.rounds[0]?.declarations.some((d) => d.playerId === 'p0')).toBe(false)
    expect(game.rounds[0]?.declarations).toHaveLength(5)
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
    const game = suggestAll(staged, 'p0', SUGGESTION, '이 셋을 상 위에 올리겠소')

    expect(game.rounds[0]?.suggestionLine).toBe('이 셋을 상 위에 올리겠소')
  })

  it('제안 대사를 주지 않으면 null이다', () => {
    expect(suggestAll(staged, 'p0', SUGGESTION).rounds[0]?.suggestionLine).toBeNull()
  })

  it('반증 대사가 선언자별로 남는다', () => {
    const game = declareAll(
      suggestAll(staged, 'p0', SUGGESTION),
      allPass,
      new Map([['p2', '그 물건이라면 내 방에 있소']]),
    )

    const declarations = game.rounds[0]?.declarations ?? []
    expect(declarations.find((d) => d.playerId === 'p2')?.line).toBe('그 물건이라면 내 방에 있소')
    expect(declarations.find((d) => d.playerId === 'p1')?.line).toBeNull()
  })

  it('대사를 하나도 주지 않으면 전원 null이다', () => {
    const game = declareAll(suggestAll(staged, 'p0', SUGGESTION), allPass)

    expect((game.rounds[0]?.declarations ?? []).every((d) => d.line === null)).toBe(true)
  })

  it('선언하지 않은 사람의 대사는 버린다 — 기록은 선언을 따라간다', () => {
    const game = declareAll(
      suggestAll(staged, 'p0', SUGGESTION),
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
    const state = armed(suggestAll(withHands(REFUSE_HANDS), 'p0', SUGGESTION))
    const after = declareAll(state, claims(ALL_PASS))

    const mine = after.rounds[0]?.declarations.find((d) => d.playerId === REFUSER)
    expect(mine?.claim).toEqual({ kind: 'refuse' })
  })

  /** 거부는 반증 의무 자체를 면제받는다 — 침묵과 달리 위증이 되지 않는다. */
  it('카드를 쥐고 있어도 위증이 아니다', () => {
    const state = armed(suggestAll(withHands(REFUSE_HANDS), 'p0', SUGGESTION))
    const after = declareAll(state, claims(ALL_PASS))

    const mine = after.rounds[0]?.declarations.find((d) => d.playerId === REFUSER)
    expect(mine?.isPerjury).toBe(false)
  })

  it('한 번 쓰면 다음 라운드에는 거부가 생기지 않는다', () => {
    const state = armed(suggestAll(withHands(REFUSE_HANDS), 'p0', SUGGESTION))
    const after = declareAll(state, claims(ALL_PASS))

    expect(after.pending).toHaveLength(0)
  })

  it('능력을 쓰지 않은 좌석은 거부가 되지 않는다', () => {
    const state = suggestAll(withHands(REFUSE_HANDS), 'p0', SUGGESTION)
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
    const state = suggestAll(withHands(REFUSE_HANDS), 'p0', SUGGESTION)
    const sneaky = claims(ALL_PASS)
    sneaky.set(REFUSER, { kind: 'refuse' })

    expect(() => declareAll(state, sneaky)).toThrow()
  })

  it('능력을 쓴 좌석이 스스로 거부를 내는 것은 통과한다', () => {
    const state = armed(suggestAll(withHands(REFUSE_HANDS), 'p0', SUGGESTION))
    const own = claims(ALL_PASS)
    own.set(REFUSER, { kind: 'refuse' })

    const mine = declareAll(state, own).rounds[0]?.declarations.find((d) => d.playerId === REFUSER)
    expect(mine?.claim).toEqual({ kind: 'refuse' })
  })

  /** 대사는 그대로 남는다 — 룰이 바뀐 것이지 그가 한 말이 바뀐 것이 아니다. */
  it('그 좌석의 대사는 남는다', () => {
    const state = armed(suggestAll(withHands(REFUSE_HANDS), 'p0', SUGGESTION))
    const after = declareAll(state, claims(ALL_PASS), new Map([[REFUSER, '답하지 않겠소']]))

    const mine = after.rounds[0]?.declarations.find((d) => d.playerId === REFUSER)
    expect(mine?.line).toBe('답하지 않겠소')
  })
})

describe('frame — 협잡꾼의 조작', () => {
  const TRICKSTER: PlayerId = 'p1'
  const VICTIM: PlayerId = 'p2'

  /** p2가 w1을 쥐고 그것으로 정직하게 반증한다. 조작이 없으면 참이다. */
  const FRAME_HANDS: CardId[][] = [['s2'], ['s3'], ['w1'], ['s1'], ['p1'], ['s5']]

  /** 조작을 거친 뒤 피해자의 기록에 남은 카드. 시드만 갈아끼워 비교하려고 뽑아 썼다. */
  function framedCard(from: GameState): CardId {
    const withCards: GameState = {
      ...from,
      solution: { suspect: 's6', weapon: 'w4', place: 'p5' },
      players: from.players.map((p, i) => ({
        ...p,
        characterId: `s${i + 1}`,
        hand: FRAME_HANDS[i] ?? [],
      })),
    }
    const base = suggestAll(withCards, 'p0', SUGGESTION)
    const state = usePower(base, TRICKSTER, { kind: 'frame', targetId: VICTIM })
    const claim = declareAll(state, honest()).rounds[0]?.declarations.find(
      (d) => d.playerId === VICTIM,
    )?.claim
    if (claim?.kind !== 'refute') throw new Error('반증이 아니다')
    return claim.cardId
  }

  function honest(): Map<PlayerId, Claim> {
    const map = claims(ALL_PASS)
    map.set(VICTIM, { kind: 'refute', cardId: 'w1' })
    return map
  }

  it('조작이 없으면 낸 카드 그대로 참이다', () => {
    const state = suggestAll(withHands(FRAME_HANDS), 'p0', SUGGESTION)
    const mine = declareAll(state, honest()).rounds[0]?.declarations.find(
      (d) => d.playerId === VICTIM,
    )

    expect(mine?.claim).toEqual({ kind: 'refute', cardId: 'w1' })
    expect(mine?.isPerjury).toBe(false)
  })

  it('조작당하면 내지 않은 카드로 선언한 것이 된다', () => {
    const base = suggestAll(withHands(FRAME_HANDS), 'p0', SUGGESTION)
    const state = usePower(base, TRICKSTER, { kind: 'frame', targetId: VICTIM })
    const mine = declareAll(state, honest()).rounds[0]?.declarations.find(
      (d) => d.playerId === VICTIM,
    )

    if (mine?.claim.kind !== 'refute') throw new Error('선언 종류가 다르다')
    expect(mine.claim.cardId).not.toBe('w1')
    // 바뀐 카드도 제안된 3장 안에서 골라야 기록이 룰과 어긋나지 않는다.
    expect(['s1', 'w1', 'p1']).toContain(mine.claim.cardId)
  })

  /** 쥐지 않은 카드로 선언한 것이 되므로 그 카드를 쥔 제3자가 잡을 수 있다. */
  it('조작당한 선언은 위증으로 판정된다', () => {
    const base = suggestAll(withHands(FRAME_HANDS), 'p0', SUGGESTION)
    const state = usePower(base, TRICKSTER, { kind: 'frame', targetId: VICTIM })
    const mine = declareAll(state, honest()).rounds[0]?.declarations.find(
      (d) => d.playerId === VICTIM,
    )

    expect(mine?.isPerjury).toBe(true)
  })

  /** 말은 그대로인데 기록만 달라진 것이 이 능력의 무서움이다. */
  it('대사는 바꾸지 않는다', () => {
    const base = suggestAll(withHands(FRAME_HANDS), 'p0', SUGGESTION)
    const state = usePower(base, TRICKSTER, { kind: 'frame', targetId: VICTIM })
    const lines = new Map([[VICTIM, '아편팅크는 내 손에 있소']])
    const mine = declareAll(state, honest(), lines).rounds[0]?.declarations.find(
      (d) => d.playerId === VICTIM,
    )

    expect(mine?.line).toBe('아편팅크는 내 손에 있소')
  })

  it('침묵은 조작할 것이 없다', () => {
    const base = suggestAll(withHands(FRAME_HANDS), 'p0', SUGGESTION)
    const state = usePower(base, TRICKSTER, { kind: 'frame', targetId: VICTIM })
    const after = declareAll(state, claims(ALL_PASS))

    expect(after.rounds[0]?.declarations.find((d) => d.playerId === VICTIM)?.claim.kind).toBe('pass')
    expect(after.pending).toHaveLength(0)
  })

  it('한 번 쓰면 거둔다', () => {
    const base = suggestAll(withHands(FRAME_HANDS), 'p0', SUGGESTION)
    const state = usePower(base, TRICKSTER, { kind: 'frame', targetId: VICTIM })

    expect(declareAll(state, honest()).pending).toHaveLength(0)
  })

  /** 순수성 회귀 방지. 같은 판을 두 번 돌리면 바뀐 카드까지 같아야 한다. */
  it('같은 시드에서는 같은 카드로 바뀐다', () => {
    const run = () => framedCard(createGame({ seed: 'fixture' }))

    expect(run()).toBe(run())
  })

  /** 시드가 다르면 판도 다르다. 바뀐 카드가 시드에서 나온다는 것이 여기서 드러난다. */
  it('시드가 다르면 다른 카드가 나올 수 있다', () => {
    const picks = new Set(
      ['fixture', 'frame-a', 'frame-b', 'frame-c', 'frame-d', 'frame-e'].map((seed) =>
        framedCard(createGame({ seed })),
      ),
    )

    expect(picks.size).toBeGreaterThan(1)
  })

  /** 조작 대상만 바뀐다. 나머지 좌석의 선언은 그대로여야 한다. */
  it('지목하지 않은 좌석은 손대지 않는다', () => {
    const base = suggestAll(withHands(FRAME_HANDS), 'p0', SUGGESTION)
    const state = usePower(base, TRICKSTER, { kind: 'frame', targetId: VICTIM })
    const given = honest()
    given.set('p4', { kind: 'refute', cardId: 'p1' })

    const mine = declareAll(state, given).rounds[0]?.declarations.find((d) => d.playerId === 'p4')
    expect(mine?.claim).toEqual({ kind: 'refute', cardId: 'p1' })
  })
})
