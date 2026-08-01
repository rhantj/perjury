import { describe, expect, it } from 'vitest'
import { challenge, skipChallenge } from './challenge'
import { accuse, nextRound } from './progress'
import { declareAll, suggest } from './round'
import { createGame } from './setup'
import type { CardId, Claim, GameState, PlayerId, Suggestion } from './types'

const SUGGESTION: Suggestion = { suspect: 's1', weapon: 'w1', place: 'p1' }

const PASS_ALL = (suggesterId: PlayerId, players: readonly { id: PlayerId }[]) =>
  new Map<PlayerId, Claim>(
    players.filter((p) => p.id !== suggesterId).map((p) => [p.id, { kind: 'pass' } as Claim]),
  )

/** 한 라운드를 아무 일 없이 통과시킨다. */
function playRound(state: GameState): GameState {
  const suggesterId = state.players[state.turnIndex]?.id ?? 'p0'
  const opened = suggest(state, suggesterId, SUGGESTION)
  return skipChallenge(declareAll(opened, PASS_ALL(suggesterId, state.players)))
}

function fresh(seed = 'progress'): GameState {
  const base = createGame({ seed })
  // 아무도 제안 카드를 갖지 않게 두어 침묵이 위증이 되지 않도록 한다.
  return {
    ...base,
    solution: { suspect: 's1', weapon: 'w1', place: 'p1' },
    players: base.players.map((p, i) => ({
      ...p,
      characterId: `s${i + 1}`,
      hand: [['s2', 's3'], ['s4', 's5'], ['s6', 'w2'], ['w3', 'w4'], ['p2', 'p3'], ['p4', 'p5']][
        i
      ] as CardId[],
    })),
  }
}

describe('nextRound — 라운드 진행', () => {
  it('밀담이 끝나면 다음 라운드 제안 페이즈로 간다', () => {
    const after = nextRound(playRound(fresh()))

    expect(after.round).toBe(2)
    expect(after.phase).toBe('suggest')
  })

  it('제안 순서가 한 자리씩 돈다', () => {
    const after = nextRound(playRound(fresh()))

    expect(after.turnIndex).toBe(1)
  })

  it('여섯 바퀴를 돌면 처음 자리로 돌아온다', () => {
    let state = fresh()
    for (let i = 0; i < 6; i += 1) state = nextRound(playRound(state))

    expect(state.turnIndex).toBe(0)
    expect(state.round).toBe(7)
  })

  it('마지막 라운드가 끝나면 최종 고발 페이즈가 된다', () => {
    let state = fresh()
    for (let i = 0; i < 8; i += 1) state = nextRound(playRound(state))

    expect(state.phase).toBe('accuse')
    expect(state.round).toBe(8)
  })

  it('밀담 페이즈가 아니면 넘어갈 수 없다', () => {
    expect(() => nextRound(fresh())).toThrow()
  })

  it('원본 상태를 바꾸지 않는다', () => {
    const before = playRound(fresh())
    nextRound(before)

    expect(before.round).toBe(1)
    expect(before.phase).toBe('whisper')
  })
})

describe('accuse — 최종 고발', () => {
  function ready(seed = 'accuse'): GameState {
    let state = fresh(seed)
    for (let i = 0; i < 8; i += 1) state = nextRound(playRound(state))
    return state
  }

  it('3요소를 모두 맞히면 시민이 이긴다', () => {
    const after = accuse(ready(), { suspect: 's1', weapon: 'w1', place: 'p1' })

    expect(after.phase).toBe('over')
    expect(after.outcome?.correct).toBe(true)
    expect(after.outcome?.winner).toBe('citizen')
  })

  it('하나라도 틀리면 범인이 이긴다', () => {
    const after = accuse(ready(), { suspect: 's1', weapon: 'w1', place: 'p2' })

    expect(after.outcome?.correct).toBe(false)
    expect(after.outcome?.winner).toBe('culprit')
  })

  it('부분 정답은 없다', () => {
    const after = accuse(ready(), { suspect: 's2', weapon: 'w2', place: 'p2' })

    expect(after.outcome?.correct).toBe(false)
  })

  it('고발 내용이 기록된다', () => {
    const guess: Suggestion = { suspect: 's3', weapon: 'w1', place: 'p1' }
    const after = accuse(ready(), guess)

    expect(after.outcome?.accusation).toEqual(guess)
  })

  it('종류가 틀린 카드로는 고발할 수 없다', () => {
    const bad = { suspect: 'w1', weapon: 'w2', place: 'p1' } as unknown as Suggestion

    expect(() => accuse(ready(), bad)).toThrow()
  })

  it('고발 페이즈가 아니면 고발할 수 없다', () => {
    expect(() => accuse(fresh(), { suspect: 's1', weapon: 'w1', place: 'p1' })).toThrow()
  })

  it('판이 끝나면 더 진행할 수 없다', () => {
    const over = accuse(ready(), { suspect: 's1', weapon: 'w1', place: 'p1' })

    expect(() => accuse(over, { suspect: 's1', weapon: 'w1', place: 'p1' })).toThrow()
  })
})

describe('한 판 완주', () => {
  it('LLM 없이 8라운드를 돌고 승패가 난다', () => {
    let state = fresh('fullgame')
    for (let i = 0; i < 8; i += 1) state = nextRound(playRound(state))
    const final = accuse(state, state.solution)

    expect(final.rounds).toHaveLength(8)
    expect(final.phase).toBe('over')
    expect(final.outcome?.winner).toBe('citizen')
  })

  it('이의제기가 섞여도 완주한다', () => {
    const base = createGame({ seed: 'mixed' })
    const staged: GameState = {
      ...base,
      solution: { suspect: 's6', weapon: 'w4', place: 'p5' },
      players: base.players.map((p, i) => ({
        ...p,
        characterId: `s${i + 1}`,
        hand: [
          ['s2', 'p4'],
          ['w1', 'p3'],
          ['p1', 'w2'],
          ['s3', 's4'],
          ['w3', 'p2'],
          ['s5', 's1'],
        ][i] as CardId[],
      })),
    }

    const claims = new Map<PlayerId, Claim>([
      ['p1', { kind: 'refute', cardId: 'w1' }],
      ['p2', { kind: 'refute', cardId: 'p1' }],
      ['p3', { kind: 'refute', cardId: 'p1' }],
      ['p4', { kind: 'pass' }],
      ['p5', { kind: 'refute', cardId: 's1' }],
    ])

    const afterChallenge = challenge(
      declareAll(suggest(staged, 'p0', SUGGESTION), claims),
      'p2',
      'p3',
    )
    const second = nextRound(afterChallenge)

    expect(second.round).toBe(2)
    expect(second.players.find((p) => p.id === 'p3')?.revealed).toHaveLength(1)
  })
})
