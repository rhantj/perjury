import { describe, expect, it, vi } from 'vitest'
import { createRoundFallback, perRound } from './decider'
import type { Decider } from './decider'
import type { Claim, Suggestion } from '../engine/types'
import type { GameView } from '../engine/view'

/** 인터페이스 동작만 보는 테스트라 시야 내용은 필요 없다. */
const VIEW = {} as GameView
const PREFERRED: Suggestion = { suspect: 's1', weapon: 'w1', place: 'p1' }
const FALLBACK: Suggestion = { suspect: 's2', weapon: 'w2', place: 'p2' }

function stub(suggestion: Suggestion, fails = false): Decider {
  const guard = () => {
    if (fails) throw new Error('실패')
  }
  return {
    chooseSuggestion: async () => {
      guard()
      return suggestion
    },
    chooseClaim: async (): Promise<Claim> => {
      guard()
      return { kind: 'pass' }
    },
    chooseChallengeTarget: async () => {
      guard()
      return null
    },
    chooseAccusation: async () => {
      guard()
      return suggestion
    },
  }
}

describe('createRoundFallback — 라운드 단위 폴백', () => {
  it('preferred가 정상이면 fallback은 불리지 않는다', async () => {
    const fallback = stub(FALLBACK)
    const spy = vi.spyOn(fallback, 'chooseSuggestion')
    const decider = createRoundFallback(stub(PREFERRED), fallback)

    expect(await decider.chooseSuggestion(VIEW)).toEqual(PREFERRED)
    expect(spy).not.toHaveBeenCalled()
  })

  it('preferred가 던지면 그 호출이 fallback 결과를 낸다', async () => {
    const decider = createRoundFallback(stub(PREFERRED, true), stub(FALLBACK))

    expect(await decider.chooseSuggestion(VIEW)).toEqual(FALLBACK)
  })

  it('한 번 넘어지면 이후 호출은 preferred를 시도하지 않는다', async () => {
    const preferred = stub(PREFERRED, true)
    const spy = vi.spyOn(preferred, 'chooseClaim')
    const decider = createRoundFallback(preferred, stub(FALLBACK))

    await decider.chooseSuggestion(VIEW)
    expect(await decider.chooseClaim(VIEW)).toEqual({ kind: 'pass' })
    expect(spy).not.toHaveBeenCalled()
  })

  it('onFallback은 넘어진 순간 한 번만 불린다', async () => {
    const onFallback = vi.fn()
    const decider = createRoundFallback(stub(PREFERRED, true), stub(FALLBACK), onFallback)

    await decider.chooseSuggestion(VIEW)
    await decider.chooseClaim(VIEW)
    await decider.chooseAccusation(VIEW)

    expect(onFallback).toHaveBeenCalledTimes(1)
  })

  it('새 인스턴스는 preferred를 다시 시도한다', async () => {
    const fallen = createRoundFallback(stub(PREFERRED, true), stub(FALLBACK))
    await fallen.chooseSuggestion(VIEW)

    const fresh = createRoundFallback(stub(PREFERRED), stub(FALLBACK))

    expect(await fresh.chooseSuggestion(VIEW)).toEqual(PREFERRED)
  })
})

describe('perRound — 라운드마다 인스턴스 하나', () => {
  it('같은 라운드에는 같은 인스턴스를 준다', () => {
    const forRound = perRound(() => stub(PREFERRED))

    expect(forRound(1)).toBe(forRound(1))
  })

  it('라운드가 바뀌면 새로 만든다', () => {
    const forRound = perRound(() => stub(PREFERRED))

    expect(forRound(2)).not.toBe(forRound(1))
  })

  it('라운드가 돌아오면 그때도 새로 만든다', () => {
    const forRound = perRound(() => stub(PREFERRED))
    const first = forRound(1)
    forRound(2)

    expect(forRound(1)).not.toBe(first)
  })
})
