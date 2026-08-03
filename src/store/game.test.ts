import { beforeEach, describe, expect, it } from 'vitest'
import { useGame } from './game'
import { createRuleDecider, ruleDeciderForRound } from '../ai/rule-decider'
import type { Decider, DeciderForRound, FallbackReason } from '../ai/decider'
import type { Suggestion } from '../engine/types'

const SUGGESTION: Suggestion = { suspect: 's1', weapon: 'w1', place: 'p1' }

const game = () => useGame.getState()

/**
 * 테스트용 Decider 프로브.
 *
 * 지연은 비동기 창을 만들어 대기 상태를 관측 가능하게 하고,
 * 호출 카운터는 대기 가드가 두 번째 진행을 실제로 막았는지 보여준다.
 * 가드가 막지 못하면 같은 라운드의 판단이 두 벌 돌아 횟수가 배가 된다.
 */
function probeDeciders(ms: number) {
  let claims = 0

  const source = (seed: string): DeciderForRound => {
    const base = createRuleDecider(seed)
    const wait = () => new Promise((resolve) => setTimeout(resolve, ms))
    const probe: Decider = {
      chooseSuggestion: async (view) => {
        await wait()
        return base.chooseSuggestion(view)
      },
      chooseClaim: async (view) => {
        claims += 1
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
    return () => probe
  }

  return { source, claims: () => claims }
}

/**
 * 항상 던지는 판단자. 폴백 래퍼가 사유를 실제로 옮기는지 보려는 것이다.
 * fallbackReason은 예외에 붙은 태그로 전달되므로, 태그만 흉내내면 네트워크가 필요 없다.
 */
function failingDeciders(reason: FallbackReason): DeciderForRound {
  const boom = () => {
    const e = new Error('판단 실패') as Error & { fallbackReason: FallbackReason }
    e.fallbackReason = reason
    throw e
  }
  const decider: Decider = {
    chooseSuggestion: async () => boom(),
    chooseClaim: async () => boom(),
    chooseChallengeTarget: async () => boom(),
    chooseAccusation: async () => boom(),
  }
  return () => decider
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
    const started = game().start('think', 3, probeDeciders(5).source)

    expect(game().aiThinking).toBe(true)
    expect(game().awaitingHuman()).toBe(false)

    await started

    expect(game().aiThinking).toBe(false)
    expect(game().awaitingHuman()).toBe(true)
  })

  it('대기 중에 들어온 조작은 무시된다', async () => {
    const probe = probeDeciders(5)
    await game().start('busy', 0, probe.source)
    expect(game().view().phase).toBe('suggest')

    const before = probe.claims()
    const first = game().suggest(SUGGESTION)
    const ignored = game().suggest(SUGGESTION)
    await Promise.all([first, ignored])

    // 제안 한 번이면 제안자를 뺀 사람들이 한 번씩 반증을 고른다.
    // 가드가 없으면 두 번째 apply가 같은 상태에서 또 돌아 이 수가 배가 된다.
    expect(probe.claims() - before).toBe(5)
    expect(game().view().rounds).toHaveLength(1)
  })

  it('reset 뒤에 도착한 결과는 버려진다', async () => {
    const started = game().start('late', 3, probeDeciders(5).source)
    game().reset()
    await started

    expect(game().state).toBeNull()
    expect(game().aiThinking).toBe(false)
  })

  it('판단자가 멀쩡하면 폴백 표시가 서지 않는다', async () => {
    await game().start('fallback', 0, (seed) => ruleDeciderForRound(seed))

    expect(game().fallbackRound).toBe(false)
    expect(game().fallbackReason).toBeNull()
  })

  it('판단자가 실패하면 규칙 기반으로 받아내고 사유를 남긴다', async () => {
    // humanIndex 1이라 사람 차례 전에 AI가 먼저 제안한다 — 여기서 실패가 일어난다.
    await game().start('fallback', 1, () => failingDeciders('error'))

    expect(game().fallbackRound).toBe(true)
    expect(game().fallbackReason).toBe('error')
    // 폴백이 받아냈으므로 판은 살아 있어야 한다.
    expect(game().state).not.toBeNull()
    expect(game().error).toBeNull()
  })

  it('예산 소진은 사유가 budget으로 구분된다', async () => {
    await game().start('fallback', 1, () => failingDeciders('budget'))

    expect(game().fallbackReason).toBe('budget')
  })
})
