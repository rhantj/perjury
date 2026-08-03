import { describe, expect, it } from 'vitest'
import { createGame } from '../engine/setup'
import type { GameState } from '../engine/types'
import { advanceToHuman, needsHuman, stepAi } from './flow'
import { ruleDeciderForRound } from './rule-decider'

/** 사람이 지정한 진영인 판을 찾는다. 진영은 시드마다 다르다. */
function gameWhereHumanIs(faction: 'citizen' | 'culprit'): GameState {
  for (let i = 0; i < 60; i += 1) {
    const game = createGame({ seed: `flow-${faction}-${i}` })
    if (game.players.find((p) => p.isHuman)?.faction === faction) return game
  }
  throw new Error('해당 진영의 판을 찾지 못했다')
}

/** 테스트에서 판마다 필요한 Decider 팩토리. */
const deciders = (game: GameState) => ruleDeciderForRound(game.seed)

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

  it('내가 제안자가 아니면 반증 선언은 사람이 한다', async () => {
    const initial = createGame({ seed: 'refute', humanIndex: 3 })
    const game = await advanceToHuman(initial, deciders(initial))

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
  it('사람 차례가 아니면 AI가 밀고 간다', async () => {
    const initial = createGame({ seed: 'push', humanIndex: 3 })
    const game = await advanceToHuman(initial, deciders(initial))

    expect(needsHuman(game)).toBe(true)
    expect(game.rounds.length).toBeGreaterThan(0)
  })

  it('이미 사람 차례면 아무것도 하지 않는다', async () => {
    const game = createGame({ seed: 'stay', humanIndex: 0 })

    expect(await advanceToHuman(game, deciders(game))).toBe(game)
  })

  it('같은 시드는 같은 지점에서 멈춘다', async () => {
    const first = createGame({ seed: 'det', humanIndex: 2 })
    const second = createGame({ seed: 'det', humanIndex: 2 })
    const a = await advanceToHuman(first, deciders(first))
    const b = await advanceToHuman(second, deciders(second))

    expect(b).toEqual(a)
  })

  it('사람이 범인이면 최종 고발까지 AI가 진행한다', async () => {
    let game = gameWhereHumanIs('culprit')
    const forRound = deciders(game)

    for (let i = 0; i < 60 && game.phase !== 'over'; i += 1) {
      game = await advanceToHuman(game, forRound)
      if (game.phase === 'over') break
      game = await stepAi(game, forRound(game.round)) // 사람 자리를 규칙 AI로 대신 둔다
    }

    expect(game.phase).toBe('over')
    expect(game.outcome?.accuser.kind).toBe('council')
  })

  it('사람이 시민이면 고발 지점에서 멈춘다', async () => {
    let game = gameWhereHumanIs('citizen')
    const forRound = deciders(game)

    for (let i = 0; i < 60 && game.phase !== 'accuse'; i += 1) {
      game = await advanceToHuman(game, forRound)
      if (game.phase === 'accuse') break
      game = await stepAi(game, forRound(game.round))
    }

    expect(game.phase).toBe('accuse')
    expect(needsHuman(game)).toBe(true)
  })
})
