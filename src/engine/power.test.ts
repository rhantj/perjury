import { describe, expect, it } from 'vitest'
import { createGame } from './setup'
import { buildPowerUse, findingsFor, usePower } from './power'
import type { GameState } from './types'

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
