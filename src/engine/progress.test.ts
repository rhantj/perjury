import { describe, expect, it } from 'vitest'
import { challenge, skipChallenge } from './challenge'
import { accuse, accuseByCouncil, nextRound } from './progress'
import { declareAll, suggest } from './round'
import { createGame } from './setup'
import type { CardId, Claim, GameState, PlayerId, Suggestion, Vote } from './types'

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

/**
 * 정답을 s1/w1/p1로 고정한 판. 캐릭터 s1을 맡은 p0이 범인이 된다.
 * 아무도 제안 카드를 갖지 않게 두어 침묵이 위증이 되지 않도록 한다.
 */
function fresh(seed = 'progress', humanSeat = 1): GameState {
  const base = createGame({ seed })
  return {
    ...base,
    solution: { suspect: 's1', weapon: 'w1', place: 'p1' },
    players: base.players.map((p, i) => ({
      ...p,
      characterId: `s${i + 1}`,
      isHuman: i === humanSeat,
      faction: i === 0 ? 'culprit' : 'citizen',
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

function ready(seed = 'accuse', humanSeat = 1): GameState {
  let state = fresh(seed, humanSeat)
  for (let i = 0; i < 8; i += 1) state = nextRound(playRound(state))
  return state
}

describe('accuse — 플레이어 고발 (시민 진영)', () => {
  it('3요소를 모두 맞히면 시민이 이긴다', () => {
    const after = accuse(ready(), { suspect: 's1', weapon: 'w1', place: 'p1' }, 'p1')

    expect(after.phase).toBe('over')
    expect(after.outcome?.correct).toBe(true)
    expect(after.outcome?.winner).toBe('citizen')
  })

  it('하나라도 틀리면 범인이 이긴다', () => {
    const after = accuse(ready(), { suspect: 's1', weapon: 'w1', place: 'p2' }, 'p1')

    expect(after.outcome?.correct).toBe(false)
    expect(after.outcome?.winner).toBe('culprit')
  })

  it('부분 정답은 없다', () => {
    const after = accuse(ready(), { suspect: 's2', weapon: 'w2', place: 'p2' }, 'p1')

    expect(after.outcome?.correct).toBe(false)
  })

  it('고발 내용과 주체가 기록된다', () => {
    const guess: Suggestion = { suspect: 's3', weapon: 'w1', place: 'p1' }
    const after = accuse(ready(), guess, 'p1')

    expect(after.outcome?.accusation).toEqual(guess)
    expect(after.outcome?.accuser).toEqual({ kind: 'player', playerId: 'p1' })
  })

  it('범인 진영은 고발할 수 없다', () => {
    expect(() =>
      accuse(ready('accuse', 0), { suspect: 's1', weapon: 'w1', place: 'p1' }, 'p0'),
    ).toThrow()
  })

  it('종류가 틀린 카드로는 고발할 수 없다', () => {
    const bad = { suspect: 'w1', weapon: 'w2', place: 'p1' } as unknown as Suggestion

    expect(() => accuse(ready(), bad, 'p1')).toThrow()
  })

  it('고발 페이즈가 아니면 고발할 수 없다', () => {
    expect(() => accuse(fresh(), { suspect: 's1', weapon: 'w1', place: 'p1' }, 'p1')).toThrow()
  })

  it('판이 끝나면 더 진행할 수 없다', () => {
    const over = accuse(ready(), { suspect: 's1', weapon: 'w1', place: 'p1' }, 'p1')

    expect(() => accuse(over, { suspect: 's1', weapon: 'w1', place: 'p1' }, 'p1')).toThrow()
  })
})

describe('accuseByCouncil — AI 합의 고발 (플레이어가 범인일 때)', () => {
  /** humanSeat 0 = 범인이 사람. 나머지 5명이 AI 시민이다. */
  const CULPRIT_PLAYER = () => ready('council', 0)

  const allVote = (accusation: Suggestion): Vote[] =>
    ['p1', 'p2', 'p3', 'p4', 'p5'].map((playerId) => ({ playerId, accusation, line: null }))

  it('AI 시민 전원의 표를 모아 고발한다', () => {
    const after = accuseByCouncil(
      CULPRIT_PLAYER(),
      allVote({ suspect: 's1', weapon: 'w1', place: 'p1' }),
    )

    expect(after.phase).toBe('over')
    expect(after.outcome?.correct).toBe(true)
    expect(after.outcome?.accuser.kind).toBe('council')
  })

  it('AI가 틀리면 범인 진영이 이긴다 — 플레이어의 승리다', () => {
    const state = CULPRIT_PLAYER()
    const after = accuseByCouncil(state, allVote({ suspect: 's2', weapon: 'w1', place: 'p1' }))
    const human = after.players.find((p) => p.isHuman)

    expect(after.outcome?.winner).toBe('culprit')
    expect(human?.faction).toBe('culprit') // 진영이 같으므로 플레이어 승
  })

  it('표가 갈리면 칸별 다수결로 모은다', () => {
    const after = accuseByCouncil(CULPRIT_PLAYER(), [
      { playerId: 'p1', accusation: { suspect: 's1', weapon: 'w2', place: 'p1' }, line: null },
      { playerId: 'p2', accusation: { suspect: 's1', weapon: 'w1', place: 'p2' }, line: null },
      { playerId: 'p3', accusation: { suspect: 's2', weapon: 'w1', place: 'p1' }, line: null },
      { playerId: 'p4', accusation: { suspect: 's1', weapon: 'w1', place: 'p1' }, line: null },
      { playerId: 'p5', accusation: { suspect: 's3', weapon: 'w3', place: 'p1' }, line: null },
    ])

    expect(after.outcome?.accusation).toEqual({ suspect: 's1', weapon: 'w1', place: 'p1' })
  })

  it('투표한 표가 기록에 남는다', () => {
    const after = accuseByCouncil(
      CULPRIT_PLAYER(),
      allVote({ suspect: 's1', weapon: 'w1', place: 'p1' }),
    )
    const accuser = after.outcome?.accuser

    expect(accuser?.kind === 'council' && accuser.votes).toHaveLength(5)
  })

  it('한 명이라도 빠지면 고발되지 않는다', () => {
    const partial = allVote({ suspect: 's1', weapon: 'w1', place: 'p1' }).slice(0, 4)

    expect(() => accuseByCouncil(CULPRIT_PLAYER(), partial)).toThrow()
  })

  it('사람은 합의 투표에 낄 수 없다', () => {
    const withHuman = [
      ...allVote({ suspect: 's1', weapon: 'w1', place: 'p1' }).slice(0, 4),
      { playerId: 'p0', accusation: { suspect: 's1', weapon: 'w1', place: 'p1' }, line: null },
    ]

    expect(() => accuseByCouncil(CULPRIT_PLAYER(), withHuman)).toThrow()
  })

  it('중복 투표는 거부된다', () => {
    const dup = [
      ...allVote({ suspect: 's1', weapon: 'w1', place: 'p1' }).slice(0, 4),
      { playerId: 'p1', accusation: { suspect: 's1', weapon: 'w1', place: 'p1' }, line: null },
    ]

    expect(() => accuseByCouncil(CULPRIT_PLAYER(), dup)).toThrow()
  })
})

describe('한 판 완주', () => {
  it('LLM 없이 8라운드를 돌고 승패가 난다', () => {
    let state = fresh('fullgame')
    for (let i = 0; i < 8; i += 1) state = nextRound(playRound(state))
    const final = accuse(state, state.solution, 'p1')

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
