import { describe, expect, it } from 'vitest'
import { createGame } from './setup'
import { buildPowerUse, findingsFor, usableIn, usePower } from './power'
import { declareAll, suggest as suggestDrawn } from './round'
import { suggestAll as suggest } from './testing'
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

  /*
   * 제안자는 선언하지 않는다. 이때 능력을 거두면 판당 1회짜리가 답 없이 증발한다 —
   * 추첨제에서는 지목한 상대가 안 뽑힐 확률이 3/5라 이 증발이 흔해진다.
   * 그래서 겨눈 라운드가 지나도 대상이 말할 때까지 기다린다.
   */
  it('지목한 사람이 선언하지 않으면 답을 기다린다', () => {
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
    expect(declared.pending).toHaveLength(1)
    // 기다리는 동안에도 능력은 쓴 것이다. 여기가 풀리면 대기 중에 재발동할 수 있게 된다.
    expect(declared.powersUsed).toContain(me.id)
  })

  it('대상이 말하는 라운드가 오면 그때 통보받는다', () => {
    // 좌석0이 1라운드 제안자다. 지목해 두면 자기 차례가 지난 2라운드에 선언하게 된다.
    const first = afterSuggest(game())
    const me = idOf(first, 1)
    const target = idOf(first, 0)

    const armed = usePower(first, me, { kind: 'verify-claim', targetId: target })
    const waiting = declareAll(armed, allPass(armed))
    const second = afterSuggest(nextRound(skipChallenge(waiting)))
    const done = declareAll(second, allPass(second))

    const grant = findingsFor(done, me)[0]
    if (grant?.finding.kind !== 'claim') throw new Error('finding 종류가 다르다')
    expect(grant.finding.targetId).toBe(target)
    expect(done.pending).toHaveLength(0)
  })

  /** 「언제 알았나」는 지목한 라운드가 아니라 답이 나온 라운드다. 프롬프트가 이 값을 읽는다. */
  it('알게 된 라운드는 답이 나온 라운드로 남는다', () => {
    const first = afterSuggest(game())
    const me = idOf(first, 1)

    const armed = usePower(first, me, { kind: 'verify-claim', targetId: idOf(first, 0) })
    const second = afterSuggest(nextRound(skipChallenge(declareAll(armed, allPass(armed)))))
    const done = declareAll(second, allPass(second))

    expect(findingsFor(done, me)[0]?.round).toBe(2)
  })
})

/** 손패를 지정해 위증 여부를 마음대로 만든다. 진위 양쪽을 다 확인하려면 필요하다. */
function withHands(state: GameState, hands: readonly (readonly string[])[]): GameState {
  return { ...state, players: state.players.map((p, i) => ({ ...p, hand: hands[i] ?? [] })) }
}

/*
 * 이 대기가 만들어진 진짜 이유다. 추첨은 다섯 중 둘만 뽑으므로 지목한 상대가 빠질 확률이
 * 3/5다. 그 라운드에 거두면 판당 1회짜리 능력이 답 없이 증발한다.
 *
 * 위 테스트들과 달리 «진짜» suggest를 쓴다 — 추첨을 끄면 검증할 상황 자체가 생기지 않는다.
 */
describe('verify-claim — 추첨에서 빠진 좌석', () => {
  it('뽑히지 않은 사람을 지목하면 답을 기다린다', () => {
    const base = game()
    const suggester = base.players[base.turnIndex]
    if (!suggester) throw new Error('제안자가 없다')
    const state = suggestDrawn(base, suggester.id, { suspect: 's1', weapon: 'w1', place: 'p1' })
    const record = state.rounds[0]
    if (!record) throw new Error('라운드가 없다')

    const missed = state.players.find(
      (p) => p.id !== record.suggesterId && !record.responderIds.includes(p.id),
    )
    const owner = state.players.find((p) => p.id !== record.suggesterId && p.id !== missed?.id)
    if (!missed || !owner) throw new Error('좌석이 모자란다')

    const armed = usePower(state, owner.id, { kind: 'verify-claim', targetId: missed.id })
    const drawnPass = new Map<PlayerId, Claim>(
      record.responderIds.map((id) => [id, { kind: 'pass' } as Claim]),
    )
    const declared = declareAll(armed, drawnPass)

    expect(findingsFor(declared, owner.id)).toHaveLength(0)
    expect(declared.pending).toHaveLength(1)
  })
})

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

  /*
   * 선언을 다 듣고 지목하면 「참인지 알려달라」가 아니라 「거짓말한 놈을 짚어달라」가 된다.
   * 대기가 생긴 뒤로는 늦게 지목해도 다음 라운드에 회수되므로, 이 가드는 밸런스로만 남는다.
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

  /*
   * 찍힌 사람이 다음 라운드의 제안자면 선언할 기회가 없다. 그 한 라운드로 필름을
   * 태워버리면 촬영이 억지력이 아니라 복권이 된다 — 말할 때까지 들고 있는다.
   */
  it('찍힌 사람이 말하지 않은 라운드는 넘기고 기다린다', () => {
    // 좌석1은 2라운드 제안자다. 그 라운드에는 선언하지 않고, w1을 쥔 채 3라운드에 침묵한다.
    const base = withHands(game(), [[], ['w1'], [], [], [], []])
    const first = afterSuggest(base)
    const armed = usePower(first, idOf(first, 2), {
      kind: 'photograph',
      targetId: idOf(first, 1),
    })

    const second = afterSuggest(nextRound(skipChallenge(declareAll(armed, allPass(armed)))))
    const skipped = declareAll(second, allPass(second))
    expect(skipped.rounds[1]?.exposed).toEqual([])
    expect(skipped.pending).toHaveLength(1)

    const third = afterSuggest(nextRound(skipChallenge(skipped)))
    const done = declareAll(third, allPass(third))

    expect(done.rounds[2]?.exposed).toEqual([idOf(done, 1)])
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

/** 한 라운드를 끝까지 돌린다. 신문기자는 지나간 라운드만 공개할 수 있다. */
function playRound(state: GameState, claims?: Map<PlayerId, Claim>): GameState {
  const started = afterSuggest(state)
  return nextRound(skipChallenge(declareAll(started, claims ?? allPass(started))))
}

describe('publish — 신문기자', () => {
  /** 반증 선언 자체는 이미 공개다. 감춰져 있던 것은 그것이 참이었나뿐이다. */
  it('지난 반증의 진위를 라운드 기록에 남긴다', () => {
    const base = withHands(game(), [[], [], ['w1'], [], [], []])
    const played = playRound(base)
    const second = afterSuggest(played)

    const after = usePower(second, idOf(second, 1), {
      kind: 'publish',
      targetId: idOf(second, 2),
    })

    expect(after.rounds[0]?.published).toEqual([{ playerId: idOf(after, 2), truthful: false }])
  })

  it('참이었으면 참으로 남는다', () => {
    const base = withHands(game(), [[], [], ['w2'], [], [], []])
    const second = afterSuggest(playRound(base))

    const after = usePower(second, idOf(second, 1), {
      kind: 'publish',
      targetId: idOf(second, 2),
    })

    expect(after.rounds[0]?.published).toEqual([{ playerId: idOf(after, 2), truthful: true }])
  })

  it('공개된 것은 모든 시야에 실린다', () => {
    const base = withHands(game(), [[], [], ['w1'], [], [], []])
    const second = afterSuggest(playRound(base))
    const after = usePower(second, idOf(second, 1), {
      kind: 'publish',
      targetId: idOf(second, 2),
    })

    for (const player of after.players) {
      expect(viewFor(after, player.id).rounds[0]?.published).toHaveLength(1)
    }
  })

  /** 아직 아무도 말하지 않은 첫 라운드에는 공개할 지난 반증이 없다. */
  it('첫 라운드에는 쓸 수 없다', () => {
    const first = afterSuggest(game())

    expect(usableIn('publish', first)).toBe(false)
    expect(() =>
      usePower(first, idOf(first, 1), { kind: 'publish', targetId: idOf(first, 2) }),
    ).toThrow()
  })

  /**
   * 지목한 사람이 지난 라운드에 아무 말도 하지 않았으면 공개할 것이 없다.
   * 이때 능력을 소진시키면 안 된다 — 화면이 미리 막지 못하는 선택이기 때문이다.
   */
  it('공개할 것이 없으면 능력이 소진되지 않는다', () => {
    const second = afterSuggest(playRound(game()))
    const record = second.rounds[0]
    if (!record) throw new Error('라운드가 없다')

    expect(() =>
      usePower(second, idOf(second, 1), { kind: 'publish', targetId: record.suggesterId }),
    ).toThrow()
  })
})

describe('탈락자는 능력을 쓰지 않는다', () => {
  it('탈락한 사람은 능력을 발동할 수 없다', () => {
    const state = game()
    const me = idOf(state, 0)
    const fallen: GameState = { ...state, eliminated: [me] }

    expect(() => usePower(fallen, me, { kind: 'inspect-hand', targetId: idOf(state, 1) })).toThrow()
  })

  /** 탈락자도 반증은 계속하므로 지목 «대상»으로는 유효하다. 손패도 여전히 비밀이다. */
  it('탈락자를 지목하는 것은 막지 않는다', () => {
    const state = game()
    const fallen: GameState = { ...state, eliminated: [idOf(state, 1)] }

    expect(
      usePower(fallen, idOf(state, 0), { kind: 'inspect-hand', targetId: idOf(state, 1) }).grants,
    ).toHaveLength(1)
  })
})
