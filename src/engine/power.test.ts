import { describe, expect, it } from 'vitest'
import { createGame } from './setup'
import { findingsFor, usePower } from './power'
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
