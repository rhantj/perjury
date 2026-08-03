import { beforeEach, describe, expect, it } from 'vitest'
import { useGame } from './game'
import { createRuleDecider } from '../ai/rule-decider'
import type { Decider, DeciderForRound } from '../ai/decider'
import type { Suggestion } from '../engine/types'

const SUGGESTION: Suggestion = { suspect: 's1', weapon: 'w1', place: 'p1' }

const game = () => useGame.getState()

/** 모든 판단에 지연을 넣은 Decider. 비동기 경로를 눈에 보이게 만든다. */
function slowDeciders(ms: number): (seed: string) => DeciderForRound {
  return (seed) => {
    const base = createRuleDecider(seed)
    const wait = () => new Promise((resolve) => setTimeout(resolve, ms))
    const slow: Decider = {
      chooseSuggestion: async (view) => {
        await wait()
        return base.chooseSuggestion(view)
      },
      chooseClaim: async (view) => {
        await wait()
        return base.chooseClaim(view)
      },
      chooseChallengeTarget: async (view) => {
        await wait()
        return base.chooseChallengeTarget(view)
      },
      chooseAccusation: async (view) => {
        await wait()
        return base.chooseAccusation(view)
      },
    }
    return () => slow
  }
}

describe('useGame', () => {
  beforeEach(() => {
    useGame.getState().reset()
  })

  it('시작하기 전에는 시야를 만들 수 없다', () => {
    expect(() => game().view()).toThrow()
    expect(game().awaitingHuman()).toBe(false)
  })

  it('같은 시드로 시작하면 같은 판이 된다', async () => {
    await game().start('same')
    const first = game().state
    await game().start('same')

    expect(game().state).toEqual(first)
  })

  it('시야는 사람 플레이어 기준으로 만들어진다', async () => {
    await game().start('seat', 2)
    const view = game().view()

    expect(view.viewerId).toBe('p2')
    expect(view.players.find((p) => p.id === 'p2')?.isMe).toBe(true)
  })

  it('시작하면 사람 개입 지점까지 AI가 밀고 간다', async () => {
    await game().start('push', 3)

    expect(game().awaitingHuman()).toBe(true)
    expect(game().view().rounds.length).toBeGreaterThan(0)
  })

  it('룰 위반은 상태를 바꾸지 않고 메시지만 남긴다', async () => {
    await game().start('guard', 3) // 사람 차례가 아니므로 제안 페이즈가 아니다
    const before = game().state

    await game().suggest(SUGGESTION)

    expect(game().state).toBe(before)
    expect(game().error).not.toBeNull()
  })

  it('사람이 제안하면 AI 선언까지 자동으로 진행된다', async () => {
    await game().start('flow', 0)
    expect(game().view().phase).toBe('suggest')

    await game().suggest(SUGGESTION)

    // 제안자가 사람이므로 반증 선언은 AI만 하고, 이의제기 지점에서 멈춘다
    expect(game().view().phase).toBe('challenge')
    expect(game().view().rounds[0]?.declarations).toHaveLength(5)
    expect(game().error).toBeNull()
  })

  it('사람이 이의제기를 넘기면 라운드가 넘어간다', async () => {
    await game().start('pass', 0)
    await game().suggest(SUGGESTION)
    await game().passChallenge()

    expect(game().view().round).toBe(2)
  })

  it('사람이 제안자가 아니면 반증 선언을 사람이 한다', async () => {
    await game().start('declare', 3)
    expect(game().view().phase).toBe('refute')

    await game().declare({ kind: 'pass' })

    expect(game().view().rounds[0]?.declarations).toHaveLength(5)
    expect(game().error).toBeNull()
  })

  it('한 판을 끝까지 굴릴 수 있다', async () => {
    await game().start('finish', 0)

    for (let i = 0; i < 100 && game().view().phase !== 'over'; i += 1) {
      const view = game().view()
      if (view.phase === 'suggest') await game().suggest(SUGGESTION)
      else if (view.phase === 'refute') await game().declare({ kind: 'pass' })
      else if (view.phase === 'challenge') await game().passChallenge()
      else if (view.phase === 'accuse') await game().accuse(SUGGESTION)
      else break
    }

    expect(game().view().phase).toBe('over')
    expect(game().view().outcome).not.toBeNull()
  })

  it('AI가 판단하는 동안 aiThinking이 true이고 조작이 잠긴다', async () => {
    const started = game().start('think', 3, slowDeciders(5))

    expect(game().aiThinking).toBe(true)
    expect(game().awaitingHuman()).toBe(false)

    await started

    expect(game().aiThinking).toBe(false)
    expect(game().awaitingHuman()).toBe(true)
  })

  it('대기 중에 들어온 조작은 무시된다', async () => {
    await game().start('busy', 0, slowDeciders(5))

    const first = game().suggest(SUGGESTION)
    const ignored = game().suggest(SUGGESTION)
    await Promise.all([first, ignored])

    expect(game().error).toBeNull()
    expect(game().view().rounds).toHaveLength(1)
  })

  it('reset 뒤에 도착한 결과는 버려진다', async () => {
    const started = game().start('late', 3, slowDeciders(5))
    game().reset()
    await started

    expect(game().state).toBeNull()
    expect(game().aiThinking).toBe(false)
  })

  it('A 단계에서 fallbackRound는 항상 false다', async () => {
    await game().start('fallback', 0)

    expect(game().fallbackRound).toBe(false)
  })
})
