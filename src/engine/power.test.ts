import { describe, expect, it } from 'vitest'
import { createGame } from './setup'
import { buildPowerUse, findingsFor, usableIn, usePower } from './power'
import { declareAll, suggest } from './round'
import { skipChallenge } from './challenge'
import { nextRound } from './progress'
import { viewFor } from './view'
import type { Claim, GameState, PlayerId } from './types'

/** 고정 시드. 손패 배분은 시드에서 결정론적으로 나온다. */
function game(): GameState {
  return createGame({ seed: 'power-test' })
}

function idOf(state: GameState, index: number): string {
  const player = state.players[index]
  if (!player) throw new Error(`없는 좌석: ${index}`)
  return player.id
}

describe('usePower — 능력은 한 판에 한 번', () => {
  it('같은 사람이 두 번 쓰면 거부한다', () => {
    const state = game()
    const me = idOf(state, 0)
    const target = idOf(state, 1)

    const after = usePower(state, me, { kind: 'inspect-hand', targetId: target })

    expect(() => usePower(after, me, { kind: 'inspect-hand', targetId: target })).toThrow()
  })

  it('다른 사람은 각자 한 번씩 쓸 수 있다', () => {
    const state = game()
    const first = usePower(state, idOf(state, 0), {
      kind: 'inspect-hand',
      targetId: idOf(state, 1),
    })
    const second = usePower(first, idOf(state, 1), {
      kind: 'inspect-hand',
      targetId: idOf(state, 2),
    })

    expect(second.grants).toHaveLength(2)
  })

  it('자기 자신에게는 쓸 수 없다', () => {
    const state = game()
    const me = idOf(state, 0)

    expect(() => usePower(state, me, { kind: 'inspect-hand', targetId: me })).toThrow()
  })

  it('끝난 판에서는 쓸 수 없다', () => {
    const over: GameState = { ...game(), phase: 'over' }

    expect(() => usePower(over, idOf(over, 0), { kind: 'inspect-hand', targetId: idOf(over, 1) }))
      .toThrow()
  })

  it('원본 상태를 건드리지 않는다', () => {
    const state = game()
    usePower(state, idOf(state, 0), { kind: 'inspect-hand', targetId: idOf(state, 1) })

    expect(state.grants).toHaveLength(0)
    expect(state.powersUsed).toHaveLength(0)
  })
})

describe('usePower — 검시관', () => {
  it('대상이 실제로 가진 카드 1장을 알려준다', () => {
    const state = game()
    const target = state.players[1]
    if (!target) throw new Error('대상 없음')

    const after = usePower(state, idOf(state, 0), {
      kind: 'inspect-hand',
      targetId: target.id,
    })
    const grant = after.grants[0]

    expect(grant?.finding.kind).toBe('hand')
    if (grant?.finding.kind !== 'hand') throw new Error('finding 종류가 다르다')
    expect(target.hand).toContain(grant.finding.cardId)
  })

  it('같은 시드에서는 같은 카드가 나온다', () => {
    const pick = () =>
      usePower(game(), idOf(game(), 0), { kind: 'inspect-hand', targetId: idOf(game(), 1) })
        .grants[0]

    expect(pick()).toEqual(pick())
  })
})

describe('usePower — 약제사', () => {
  it('지정한 수단 카드가 정답인지 알려준다', () => {
    const state = game()
    const after = usePower(state, idOf(state, 0), {
      kind: 'check-weapon',
      cardId: state.solution.weapon,
    })
    const grant = after.grants[0]

    if (grant?.finding.kind !== 'weapon') throw new Error('finding 종류가 다르다')
    expect(grant.finding.isSolution).toBe(true)
  })
})

describe('findingsFor — 알게 된 것은 그 사람만 본다', () => {
  it('남 앞으로 온 것은 보이지 않는다', () => {
    const state = game()
    const me = idOf(state, 0)
    const other = idOf(state, 1)
    const after = usePower(state, other, { kind: 'inspect-hand', targetId: idOf(state, 2) })

    expect(findingsFor(after, other)).toHaveLength(1)
    expect(findingsFor(after, me)).toHaveLength(0)
  })
})

describe('buildPowerUse — 좌석의 능력에 대상을 붙인다', () => {
  it('종류에 맞는 대상이 오면 실행 가능한 형태가 된다', () => {
    expect(buildPowerUse('inspect-hand', { targetId: 'p2' })).toEqual({
      kind: 'inspect-hand',
      targetId: 'p2',
    })
    expect(buildPowerUse('check-weapon', { cardId: 'w1' })).toEqual({
      kind: 'check-weapon',
      cardId: 'w1',
    })
  })

  /** 대상이 빠진 채 발동하면 엔진이 던진다. 여기서 null로 걸러 화면이 조용히 무시하게 한다. */
  it('필요한 대상이 없으면 null이다', () => {
    expect(buildPowerUse('inspect-hand', {})).toBeNull()
    expect(buildPowerUse('check-weapon', {})).toBeNull()
  })

  it('종류가 다른 대상은 받지 않는다', () => {
    expect(buildPowerUse('inspect-hand', { cardId: 'w1' })).toBeNull()
    expect(buildPowerUse('check-weapon', { targetId: 'p2' })).toBeNull()
  })

  it('대상이 필요 없는 능력은 그대로 만들어진다', () => {
    expect(buildPowerUse('shield', {})).toEqual({ kind: 'shield' })
  })
})

/** 제안이 끝나 반증 페이즈에 들어간 판. 순사는 여기서 지목한다. */
function afterSuggest(state: GameState): GameState {
  const suggester = state.players[state.turnIndex]
  if (!suggester) throw new Error('제안자가 없다')
  return suggest(state, suggester.id, { suspect: 's1', weapon: 'w1', place: 'p1' })
}

/** 제안자를 뺀 전원이 침묵한다. 손패를 쥔 사람은 그 자체로 위증이 된다. */
function allPass(state: GameState): Map<PlayerId, Claim> {
  const record = state.rounds[state.rounds.length - 1]
  if (!record) throw new Error('라운드가 없다')
  return new Map(
    state.players
      .filter((p) => p.id !== record.suggesterId)
      .map((p) => [p.id, { kind: 'pass' } as Claim]),
  )
}

describe('verify-claim — 순사', () => {
  it('지목한 순간에는 결과가 없다', () => {
    const state = afterSuggest(game())
    const me = idOf(state, 1)
    const target = idOf(state, 2)

    const armed = usePower(state, me, { kind: 'verify-claim', targetId: target })

    expect(findingsFor(armed, me)).toHaveLength(0)
    expect(armed.pending).toHaveLength(1)
  })

  it('선언이 끝나면 그 선언의 진위를 통보받는다', () => {
    const state = afterSuggest(game())
    const me = idOf(state, 1)
    const target = idOf(state, 2)

    const armed = usePower(state, me, { kind: 'verify-claim', targetId: target })
    const declared = declareAll(armed, allPass(armed))

    const grant = findingsFor(declared, me)[0]
    if (grant?.finding.kind !== 'claim') throw new Error('finding 종류가 다르다')

    const declaration = declared.rounds[0]?.declarations.find((d) => d.playerId === target)
    expect(grant.finding.targetId).toBe(target)
    expect(grant.finding.truthful).toBe(!declaration?.isPerjury)
    expect(declared.pending).toHaveLength(0)
  })

  /** 제안자는 선언하지 않는다. 볼 것이 없으므로 능력은 답 없이 소진된다. */
  it('선언하지 않는 사람을 지목하면 답 없이 끝난다', () => {
    const state = afterSuggest(game())
    const record = state.rounds[0]
    if (!record) throw new Error('라운드가 없다')
    const me = state.players.find((p) => p.id !== record.suggesterId)
    if (!me) throw new Error('좌석이 모자란다')

    const armed = usePower(state, me.id, {
      kind: 'verify-claim',
      targetId: record.suggesterId,
    })
    const declared = declareAll(armed, allPass(armed))

    expect(findingsFor(declared, me.id)).toHaveLength(0)
    expect(declared.pending).toHaveLength(0)
    expect(declared.powersUsed).toContain(me.id)
  })
})

/** 손패를 지정해 위증 여부를 마음대로 만든다. 진위 양쪽을 다 확인하려면 필요하다. */
function withHands(state: GameState, hands: readonly (readonly string[])[]): GameState {
  return { ...state, players: state.players.map((p, i) => ({ ...p, hand: hands[i] ?? [] })) }
}

describe('verify-claim — 진위 양쪽과 때늦은 지목', () => {
  it('제안 카드를 쥐고도 침묵하면 거짓으로 통보된다', () => {
    // 좌석2가 w1을 쥐고 침묵한다 → 반증 의무를 어겼으므로 위증이다.
    const base = withHands(game(), [[], [], ['w1'], [], [], []])
    const state = afterSuggest(base)
    const me = idOf(state, 1)
    const target = idOf(state, 2)

    const armed = usePower(state, me, { kind: 'verify-claim', targetId: target })
    const grant = findingsFor(declareAll(armed, allPass(armed)), me)[0]

    if (grant?.finding.kind !== 'claim') throw new Error('finding 종류가 다르다')
    expect(grant.finding.truthful).toBe(false)
  })

  it('제안 카드가 없어 침묵하면 참으로 통보된다', () => {
    const base = withHands(game(), [[], [], ['w2'], [], [], []])
    const state = afterSuggest(base)
    const me = idOf(state, 1)
    const target = idOf(state, 2)

    const armed = usePower(state, me, { kind: 'verify-claim', targetId: target })
    const grant = findingsFor(declareAll(armed, allPass(armed)), me)[0]

    if (grant?.finding.kind !== 'claim') throw new Error('finding 종류가 다르다')
    expect(grant.finding.truthful).toBe(true)
  })

  /**
   * 선언이 끝난 뒤 지목하면 답을 낼 기회가 이미 지났다.
   * 막지 않으면 pending에 영원히 남아 능력만 조용히 타 없어진다.
   */
  it('선언이 끝난 뒤에는 지목할 수 없다', () => {
    const state = afterSuggest(game())
    const declared = declareAll(state, allPass(state))
    const me = idOf(declared, 1)

    expect(declared.phase).toBe('challenge')
    expect(() => usePower(declared, me, { kind: 'verify-claim', targetId: idOf(declared, 2) })).toThrow()
  })

  it('때를 가리지 않는 능력은 선언 뒤에도 쓸 수 있다', () => {
    const state = afterSuggest(game())
    const declared = declareAll(state, allPass(state))

    expect(usableIn('inspect-hand', declared)).toBe(true)
    expect(usableIn('verify-claim', declared)).toBe(false)
  })

  /** 촬영은 «다음» 라운드를 겨눈다. 마지막 라운드에는 그 다음이 오지 않는다. */
  it('마지막 라운드에는 촬영할 수 없다', () => {
    const last: GameState = { ...game(), round: 8, totalRounds: 8 }

    expect(usableIn('photograph', last)).toBe(false)
    expect(usableIn('photograph', { ...last, round: 7 })).toBe(true)
    expect(() =>
      usePower(last, idOf(last, 1), { kind: 'photograph', targetId: idOf(last, 2) }),
    ).toThrow()
  })
})

describe('photograph — 사진사', () => {
  /** 촬영은 이번 라운드가 아니라 «다음» 라운드를 겨눈다. 찍은 라운드에는 아무 일도 없다. */
  it('찍은 라운드에는 드러나지 않는다', () => {
    const base = withHands(game(), [[], [], ['w1'], [], [], []])
    const state = afterSuggest(base)
    const armed = usePower(state, idOf(state, 1), {
      kind: 'photograph',
      targetId: idOf(state, 2),
    })

    const declared = declareAll(armed, allPass(armed))

    expect(declared.rounds[0]?.exposed).toEqual([])
    expect(declared.pending).toHaveLength(1)
  })

  it('다음 라운드에 위증하면 이의제기 없이 드러난다', () => {
    const base = withHands(game(), [[], [], ['w1'], [], [], []])
    const first = afterSuggest(base)
    const armed = usePower(first, idOf(first, 1), {
      kind: 'photograph',
      targetId: idOf(first, 2),
    })

    const second = afterSuggest(nextRound(skipChallenge(declareAll(armed, allPass(armed)))))
    const done = declareAll(second, allPass(second))

    expect(done.rounds[1]?.exposed).toEqual([idOf(done, 2)])
    expect(done.pending).toHaveLength(0)
  })

  it('다음 라운드에 위증하지 않으면 헛되이 소진된다', () => {
    const base = withHands(game(), [[], [], ['w2'], [], [], []])
    const first = afterSuggest(base)
    const armed = usePower(first, idOf(first, 1), {
      kind: 'photograph',
      targetId: idOf(first, 2),
    })

    const second = afterSuggest(nextRound(skipChallenge(declareAll(armed, allPass(armed)))))
    const done = declareAll(second, allPass(second))

    expect(done.rounds[1]?.exposed).toEqual([])
    expect(done.pending).toHaveLength(0)
  })

  /** 발각은 전체 공개다. 찍은 사람만 아는 것이면 이의제기와 다를 바가 없다. */
  it('발각은 모든 시야에 실린다', () => {
    const base = withHands(game(), [[], [], ['w1'], [], [], []])
    const first = afterSuggest(base)
    const armed = usePower(first, idOf(first, 1), {
      kind: 'photograph',
      targetId: idOf(first, 2),
    })

    const second = afterSuggest(nextRound(skipChallenge(declareAll(armed, allPass(armed)))))
    const done = declareAll(second, allPass(second))

    for (const player of done.players) {
      expect(viewFor(done, player.id).rounds[1]?.exposed).toEqual([idOf(done, 2)])
    }
  })
})
