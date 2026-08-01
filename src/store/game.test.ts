import { beforeEach, describe, expect, it } from 'vitest'
import { useGame } from './game'
import type { Suggestion } from '../engine/types'

const SUGGESTION: Suggestion = { suspect: 's1', weapon: 'w1', place: 'p1' }

const game = () => useGame.getState()

describe('useGame', () => {
  beforeEach(() => {
    useGame.setState({ state: null, error: null })
  })

  it('시작하기 전에는 시야를 만들 수 없다', () => {
    expect(() => game().view()).toThrow()
    expect(game().awaitingHuman()).toBe(false)
  })

  it('같은 시드로 시작하면 같은 판이 된다', () => {
    game().start('same')
    const first = game().state
    game().start('same')

    expect(game().state).toEqual(first)
  })

  it('시야는 사람 플레이어 기준으로 만들어진다', () => {
    game().start('seat', 2)
    const view = game().view()

    expect(view.viewerId).toBe('p2')
    expect(view.players.find((p) => p.id === 'p2')?.isMe).toBe(true)
  })

  it('시작하면 사람 개입 지점까지 AI가 밀고 간다', () => {
    game().start('push', 3)

    expect(game().awaitingHuman()).toBe(true)
    expect(game().view().rounds.length).toBeGreaterThan(0)
  })

  it('룰 위반은 상태를 바꾸지 않고 메시지만 남긴다', () => {
    game().start('guard', 3) // 사람 차례가 아니므로 제안 페이즈가 아니다
    const before = game().state

    game().suggest(SUGGESTION)

    expect(game().state).toBe(before)
    expect(game().error).not.toBeNull()
  })

  it('사람이 제안하면 AI 선언까지 자동으로 진행된다', () => {
    game().start('flow', 0)
    expect(game().view().phase).toBe('suggest')

    game().suggest(SUGGESTION)

    // 제안자가 사람이므로 반증 선언은 AI만 하고, 이의제기 지점에서 멈춘다
    expect(game().view().phase).toBe('challenge')
    expect(game().view().rounds[0]?.declarations).toHaveLength(5)
    expect(game().error).toBeNull()
  })

  it('사람이 이의제기를 넘기면 라운드가 넘어간다', () => {
    game().start('pass', 0)
    game().suggest(SUGGESTION)
    game().passChallenge()

    expect(game().view().round).toBe(2)
  })

  it('사람이 제안자가 아니면 반증 선언을 사람이 한다', () => {
    game().start('declare', 3)
    expect(game().view().phase).toBe('refute')

    game().declare({ kind: 'pass' })

    expect(game().view().rounds[0]?.declarations).toHaveLength(5)
    expect(game().error).toBeNull()
  })

  it('한 판을 끝까지 굴릴 수 있다', () => {
    game().start('finish', 0)

    for (let i = 0; i < 100 && game().view().phase !== 'over'; i += 1) {
      const view = game().view()
      if (view.phase === 'suggest') game().suggest(SUGGESTION)
      else if (view.phase === 'refute') game().declare({ kind: 'pass' })
      else if (view.phase === 'challenge') game().passChallenge()
      else if (view.phase === 'accuse') game().accuse(SUGGESTION)
      else break
    }

    expect(game().view().phase).toBe('over')
    expect(game().view().outcome).not.toBeNull()
  })
})
