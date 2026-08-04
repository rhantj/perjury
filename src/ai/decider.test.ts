import { describe, expect, it, vi } from 'vitest'
import { createRoundFallback, perRound, silent } from './decider'
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
      return silent(suggestion)
    },
    chooseClaim: async () => {
      guard()
      return silent<Claim>({ kind: 'pass' })
    },
    chooseChallengeTarget: async () => {
      guard()
      return silent(null)
    },
    chooseAccusation: async () => {
      guard()
      return silent(suggestion)
    },
    speakInParley: async () => {
      guard()
      return null
    },
  }
}

describe('createRoundFallback — 호출 단위 폴백 + 라운드 차단기', () => {
  it('preferred가 정상이면 fallback은 불리지 않는다', async () => {
    const fallback = stub(FALLBACK)
    const spy = vi.spyOn(fallback, 'chooseSuggestion')
    const decider = createRoundFallback(stub(PREFERRED), fallback)

    expect((await decider.chooseSuggestion(VIEW)).value).toEqual(PREFERRED)
    expect(spy).not.toHaveBeenCalled()
  })

  it('preferred가 던지면 그 호출이 fallback 결과를 낸다', async () => {
    const decider = createRoundFallback(stub(PREFERRED, true), stub(FALLBACK))

    expect((await decider.chooseSuggestion(VIEW)).value).toEqual(FALLBACK)
  })

  /**
   * 낙오 하나로 라운드를 접지 않는 것이 이 래퍼의 존재 이유다(결정 006).
   * 접어 버리면 호출당 3.6%인 실패율이 라운드 40%로 증폭된다.
   */
  it('한 번 실패해도 다음 호출은 preferred를 다시 시도한다', async () => {
    const preferred = stub(PREFERRED)
    let firstCall = true
    vi.spyOn(preferred, 'chooseSuggestion').mockImplementation(async () => {
      if (firstCall) {
        firstCall = false
        throw new Error('낙오')
      }
      return silent(PREFERRED)
    })
    const decider = createRoundFallback(preferred, stub(FALLBACK))

    expect((await decider.chooseSuggestion(VIEW)).value).toEqual(FALLBACK)
    expect((await decider.chooseSuggestion(VIEW)).value).toEqual(PREFERRED)
  })

  it('두 번 실패하면 라운드를 접고 이후 호출은 preferred를 시도하지 않는다', async () => {
    const preferred = stub(PREFERRED, true)
    const spy = vi.spyOn(preferred, 'chooseAccusation')
    const decider = createRoundFallback(preferred, stub(FALLBACK))

    await decider.chooseSuggestion(VIEW)
    await decider.chooseClaim(VIEW)

    expect((await decider.chooseAccusation(VIEW)).value).toEqual(FALLBACK)
    expect(spy).not.toHaveBeenCalled()
  })

  /** 배너가 뜨면 밀담 패널이 닫힌다. 낙오 하나로 멀쩡한 밀담을 막으면 안 된다. */
  it('실패가 한 번뿐이면 onFallback을 부르지 않는다', async () => {
    const onFallback = vi.fn()
    const preferred = stub(PREFERRED)
    vi.spyOn(preferred, 'chooseSuggestion').mockRejectedValueOnce(new Error('낙오'))
    const decider = createRoundFallback(preferred, stub(FALLBACK), onFallback)

    await decider.chooseSuggestion(VIEW)

    expect(onFallback).not.toHaveBeenCalled()
  })

  it('onFallback은 라운드를 접는 순간 한 번만 불린다', async () => {
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

    expect((await fresh.chooseSuggestion(VIEW)).value).toEqual(PREFERRED)
  })

  it('동시에 들어온 여러 호출에서도 onFallback은 정확히 한 번만 불린다', async () => {
    const onFallback = vi.fn()
    const decider = createRoundFallback(stub(PREFERRED, true), stub(FALLBACK), onFallback)

    await Promise.all([
      decider.chooseSuggestion(VIEW),
      decider.chooseClaim(VIEW),
      decider.chooseChallengeTarget(VIEW),
      decider.chooseAccusation(VIEW),
    ])

    expect(onFallback).toHaveBeenCalledTimes(1)
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

  it('make가 던져도 캐시는 오염되지 않는다', () => {
    let callCount = 0
    const forRound = perRound((round) => {
      callCount++
      if (round === 2) throw new Error('라운드 2에서 실패')
      return stub(PREFERRED)
    })

    const first = forRound(1)
    expect(callCount).toBe(1)

    try {
      forRound(2)
    } catch {
      // 예외가 올라오는 것이 맞다
    }
    expect(callCount).toBe(2)

    // 다시 라운드 2를 부르면 make를 다시 시도한다 (round 1의 인스턴스가 새어 나오지 않음)
    try {
      forRound(2)
    } catch {
      // 예외가 올라오는 것이 맞다
    }
    expect(callCount).toBe(3)
    expect(forRound(1)).toBe(first)
  })
})

describe('createRoundFallback — 밀담', () => {
  it('preferred가 던지면 fallback의 침묵(null)이 나온다', async () => {
    const boom: Decider = {
      ...stub(PREFERRED),
      speakInParley: () => Promise.reject(new Error('밀담 실패')),
    }
    const decider = createRoundFallback(boom, stub(FALLBACK))

    expect(await decider.speakInParley(VIEW, '묻는다')).toBeNull()
  })

  it('preferred가 정상이면 그 대사가 그대로 나온다', async () => {
    const talking: Decider = {
      ...stub(PREFERRED),
      speakInParley: () => Promise.resolve('그 밤엔 아무것도 못 봤소'),
    }
    const decider = createRoundFallback(talking, stub(FALLBACK))

    expect(await decider.speakInParley(VIEW, '묻는다')).toBe('그 밤엔 아무것도 못 봤소')
  })
})
