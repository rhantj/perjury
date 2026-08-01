import { beforeEach, describe, expect, it } from 'vitest'
import { useGame } from './game'
import type { Claim, PlayerId, Suggestion } from '../engine/types'

const SUGGESTION: Suggestion = { suspect: 's1', weapon: 'w1', place: 'p1' }

function passAll(suggesterId: PlayerId): Map<PlayerId, Claim> {
  const ids = useGame
    .getState()
    .state!.players.filter((p) => p.id !== suggesterId)
    .map((p) => p.id)
  return new Map(ids.map((id) => [id, { kind: 'pass' } as Claim]))
}

describe('useGame', () => {
  beforeEach(() => {
    useGame.setState({ state: null, error: null })
  })

  it('시작하기 전에는 시야를 만들 수 없다', () => {
    expect(() => useGame.getState().view()).toThrow()
  })

  it('같은 시드로 시작하면 같은 판이 된다', () => {
    useGame.getState().start('same')
    const first = useGame.getState().state
    useGame.getState().start('same')

    expect(useGame.getState().state).toEqual(first)
  })

  it('시야는 사람 플레이어 기준으로 만들어진다', () => {
    useGame.getState().start('seat', 2)
    const view = useGame.getState().view()

    expect(view.viewerId).toBe('p2')
    expect(view.players.find((p) => p.id === 'p2')?.isMe).toBe(true)
  })

  it('룰 위반은 상태를 바꾸지 않고 메시지만 남긴다', () => {
    useGame.getState().start('guard')
    const before = useGame.getState().state

    useGame.getState().suggest('p3', SUGGESTION) // p3은 차례가 아니다

    expect(useGame.getState().state).toBe(before)
    expect(useGame.getState().error).toContain('차례')
  })

  it('정상 전이는 이전 메시지를 지운다', () => {
    useGame.getState().start('clear')
    useGame.getState().suggest('p3', SUGGESTION)
    expect(useGame.getState().error).not.toBeNull()

    useGame.getState().suggest('p0', SUGGESTION)

    expect(useGame.getState().error).toBeNull()
    expect(useGame.getState().view().phase).toBe('refute')
  })

  it('한 라운드를 굴리면 라운드가 올라간다', () => {
    useGame.getState().start('round')
    const game = useGame.getState()

    game.suggest('p0', SUGGESTION)
    game.declareAll(passAll('p0'))
    game.skipChallenge()
    game.nextRound()

    expect(useGame.getState().view().round).toBe(2)
    expect(useGame.getState().view().turnIndex).toBe(1)
  })
})
