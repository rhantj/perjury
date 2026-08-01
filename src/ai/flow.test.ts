import { describe, expect, it } from 'vitest'
import { createGame } from '../engine/setup'
import type { GameState } from '../engine/types'
import { advanceToHuman, needsHuman, stepAi } from './flow'

/** 사람이 지정한 진영인 판을 찾는다. 진영은 시드마다 다르다. */
function gameWhereHumanIs(faction: 'citizen' | 'culprit'): GameState {
  for (let i = 0; i < 60; i += 1) {
    const game = createGame({ seed: `flow-${faction}-${i}` })
    if (game.players.find((p) => p.isHuman)?.faction === faction) return game
  }
  throw new Error('해당 진영의 판을 찾지 못했다')
}

describe('needsHuman — 개입 지점', () => {
  it('내 차례의 제안은 사람이 한다', () => {
    const game = createGame({ seed: 'turn', humanIndex: 0 })

    expect(game.turnIndex).toBe(0)
    expect(needsHuman(game)).toBe(true)
  })

  it('남의 차례 제안은 AI가 한다', () => {
    const game = createGame({ seed: 'turn', humanIndex: 3 })

    expect(needsHuman(game)).toBe(false)
  })

  it('내가 제안자가 아니면 반증 선언은 사람이 한다', () => {
    const game = advanceToHuman(createGame({ seed: 'refute', humanIndex: 3 }))

    expect(game.phase).toBe('refute')
    expect(needsHuman(game)).toBe(true)
  })

  it('밀담 페이즈는 사람 개입 없이 넘어간다', () => {
    const game = createGame({ seed: 'w', humanIndex: 0 })

    expect(needsHuman({ ...game, phase: 'whisper' })).toBe(false)
  })

  it('판이 끝나면 개입 지점이 없다', () => {
    const game = createGame({ seed: 'o', humanIndex: 0 })

    expect(needsHuman({ ...game, phase: 'over' })).toBe(false)
  })
})

describe('advanceToHuman — AI 자동 진행', () => {
  it('사람 차례가 아니면 AI가 밀고 간다', () => {
    const game = advanceToHuman(createGame({ seed: 'push', humanIndex: 3 }))

    expect(needsHuman(game)).toBe(true)
    expect(game.rounds.length).toBeGreaterThan(0)
  })

  it('이미 사람 차례면 아무것도 하지 않는다', () => {
    const game = createGame({ seed: 'stay', humanIndex: 0 })

    expect(advanceToHuman(game)).toBe(game)
  })

  it('같은 시드는 같은 지점에서 멈춘다', () => {
    const a = advanceToHuman(createGame({ seed: 'det', humanIndex: 2 }))
    const b = advanceToHuman(createGame({ seed: 'det', humanIndex: 2 }))

    expect(b).toEqual(a)
  })

  it('사람이 범인이면 최종 고발까지 AI가 진행한다', () => {
    let game = gameWhereHumanIs('culprit')

    for (let i = 0; i < 60 && game.phase !== 'over'; i += 1) {
      game = advanceToHuman(game)
      if (game.phase === 'over') break
      game = stepAi(game) // 사람 자리를 규칙 AI로 대신 둔다
    }

    expect(game.phase).toBe('over')
    expect(game.outcome?.accuser.kind).toBe('council')
  })

  it('사람이 시민이면 고발 지점에서 멈춘다', () => {
    let game = gameWhereHumanIs('citizen')

    for (let i = 0; i < 60 && game.phase !== 'accuse'; i += 1) {
      game = advanceToHuman(game)
      if (game.phase === 'accuse') break
      game = stepAi(game)
    }

    expect(game.phase).toBe('accuse')
    expect(needsHuman(game)).toBe(true)
  })
})
