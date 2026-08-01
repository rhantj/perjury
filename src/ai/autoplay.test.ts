import { describe, expect, it } from 'vitest'
import { createGame } from '../engine/setup'
import { autoPlay } from './autoplay'

describe('autoPlay — LLM 없이 완주', () => {
  it('판이 끝까지 굴러가고 승패가 난다', () => {
    const final = autoPlay(createGame({ seed: 'auto-1' }))

    expect(final.phase).toBe('over')
    expect(final.outcome).not.toBeNull()
    expect(['citizen', 'culprit']).toContain(final.outcome?.winner)
  })

  it('8라운드가 전부 기록된다', () => {
    const final = autoPlay(createGame({ seed: 'auto-2' }))

    expect(final.rounds).toHaveLength(8)
    for (const round of final.rounds) {
      expect(round.declarations).toHaveLength(5)
    }
  })

  it('같은 시드는 같은 결과를 낸다', () => {
    const a = autoPlay(createGame({ seed: 'auto-3' }))
    const b = autoPlay(createGame({ seed: 'auto-3' }))

    expect(b).toEqual(a)
  })

  it('사람이 범인인 판도 완주한다', () => {
    // 범인 자리는 시드마다 다르므로, 사람이 범인이 되는 판을 찾아 돌린다
    let culpritGame = null
    for (let i = 0; i < 40 && !culpritGame; i += 1) {
      const game = createGame({ seed: `human-culprit-${i}` })
      if (game.players.find((p) => p.isHuman)?.faction === 'culprit') culpritGame = game
    }
    expect(culpritGame).not.toBeNull()

    const final = autoPlay(culpritGame!)

    expect(final.phase).toBe('over')
    expect(final.outcome?.accuser.kind).toBe('council')
  })

  it('사람이 시민인 판은 플레이어가 고발한다', () => {
    let citizenGame = null
    for (let i = 0; i < 40 && !citizenGame; i += 1) {
      const game = createGame({ seed: `human-citizen-${i}` })
      if (game.players.find((p) => p.isHuman)?.faction === 'citizen') citizenGame = game
    }

    const final = autoPlay(citizenGame!)

    expect(final.outcome?.accuser.kind).toBe('player')
  })

  it('여러 시드를 돌려도 예외 없이 끝난다', () => {
    const results = Array.from({ length: 60 }, (_, i) =>
      autoPlay(createGame({ seed: `sweep-${i}` })),
    )

    expect(results.every((r) => r.phase === 'over')).toBe(true)
  })

  it('위증과 이의제기가 실제로 발생한다', () => {
    const games = Array.from({ length: 60 }, (_, i) =>
      autoPlay(createGame({ seed: `event-${i}` })),
    )

    const perjuries = games.flatMap((g) =>
      g.rounds.flatMap((r) => r.declarations.filter((d) => d.isPerjury)),
    )
    const challenges = games.flatMap((g) => g.rounds.filter((r) => r.challenge))

    expect(perjuries.length).toBeGreaterThan(0)
    expect(challenges.length).toBeGreaterThan(0)
  })
})
