import { describe, expect, it } from 'vitest'
import { challenge, skipChallenge } from './challenge'
import { accuse, accuseByCouncil, accuseEarly, nextRound } from './progress'
import { declareAll } from './round'
import { suggestAll as suggest } from './testing'
import { DEFAULT_ROUNDS, createGame } from './setup'
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
    for (let i = 0; i < DEFAULT_ROUNDS; i += 1) state = nextRound(playRound(state))

    expect(state.phase).toBe('accuse')
    expect(state.round).toBe(DEFAULT_ROUNDS)
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
  for (let i = 0; i < DEFAULT_ROUNDS; i += 1) state = nextRound(playRound(state))
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
  it('LLM 없이 전 라운드를 돌고 승패가 난다', () => {
    let state = fresh('fullgame')
    for (let i = 0; i < DEFAULT_ROUNDS; i += 1) state = nextRound(playRound(state))
    const final = accuse(state, state.solution, 'p1')

    expect(final.rounds).toHaveLength(DEFAULT_ROUNDS)
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

/** 좌석 번호로 id를 얻는다. fresh()는 p0이 범인이고 p1~p5가 시민이다. */
function seat(state: GameState, index: number): PlayerId {
  const player = state.players[index]
  if (!player) throw new Error(`없는 좌석: ${index}`)
  return player.id
}

describe('accuseEarly — 조기 고발', () => {
  const RIGHT: Suggestion = { suspect: 's1', weapon: 'w1', place: 'p1' }
  const WRONG: Suggestion = { suspect: 's2', weapon: 'w1', place: 'p1' }

  it('시민이 3요소를 맞히면 그 자리에서 시민이 이긴다', () => {
    const after = accuseEarly(fresh(), seat(fresh(), 1), RIGHT)

    expect(after.phase).toBe('over')
    expect(after.outcome?.winner).toBe('citizen')
    expect(after.outcome?.correct).toBe(true)
  })

  /** 부분 정답은 없다. 두 개만 맞히는 것은 범인의 위장이 통했다는 뜻이다. */
  it('셋 중 하나라도 틀리면 오답이다', () => {
    const state = fresh()
    const after = accuseEarly(state, seat(state, 1), WRONG)

    expect(after.outcome).toBeNull()
    expect(after.eliminated).toEqual([seat(state, 1)])
  })

  it('오답이어도 판은 계속된다 — 페이즈와 라운드가 그대로다', () => {
    const state = fresh()
    const after = accuseEarly(state, seat(state, 2), WRONG)

    expect(after.phase).toBe(state.phase)
    expect(after.round).toBe(state.round)
  })

  /*
   * 클루 원본 그대로다. 탈락자 손패를 까면 남은 사람들이 2장을 한꺼번에 알게 되어
   * 판이 즉시 끝난다. 탈락자는 「말 없는 카드 보관함」으로 남는다.
   */
  it('탈락해도 손패는 공개되지 않는다', () => {
    const state = fresh()
    const after = accuseEarly(state, seat(state, 2), WRONG)

    expect(after.players[2]?.revealed).toEqual([])
    expect(after.players[2]?.hand).toEqual(state.players[2]?.hand)
  })

  it('탈락자는 다시 고발할 수 없다', () => {
    const state = fresh()
    const fallen = accuseEarly(state, seat(state, 2), WRONG)

    expect(() => accuseEarly(fallen, seat(state, 2), RIGHT)).toThrow()
  })

  /*
   * 이 한 줄이 「범인은 정답을 아니까 그냥 외치면 이긴다」는 구멍을 닫는다.
   * 그래서 범인은 절대 외치지 않는다.
   */
  it('범인이 외치면 자백으로 쳐서 시민이 이긴다', () => {
    const state = fresh()
    const after = accuseEarly(state, seat(state, 0), WRONG)

    expect(after.phase).toBe('over')
    expect(after.outcome?.winner).toBe('citizen')
  })

  it('시민이 전부 오답으로 쓰러지면 범인이 이긴다', () => {
    const state = fresh()
    const worn: GameState = {
      ...state,
      eliminated: [seat(state, 1), seat(state, 2), seat(state, 3), seat(state, 4)],
    }
    const after = accuseEarly(worn, seat(state, 5), WRONG)

    expect(after.phase).toBe('over')
    expect(after.outcome?.winner).toBe('culprit')
  })

  /*
   * 최종 고발 페이즈에서도 받으면 같은 오답이 부르는 함수에 따라 「판 종료」와 「나만 탈락」으로
   * 갈린다. 룰이 화면 배선에 따라 정해지면 안 된다.
   */
  it('최종 고발 페이즈에서는 쓸 수 없다', () => {
    const late: GameState = { ...fresh(), phase: 'accuse' }

    expect(() => accuseEarly(late, seat(late, 1), RIGHT)).toThrow()
  })

  it('끝난 판에서는 외칠 수 없다', () => {
    const over: GameState = { ...fresh(), phase: 'over' }

    expect(() => accuseEarly(over, seat(over, 1), RIGHT)).toThrow()
  })

  it('원본 상태를 바꾸지 않는다', () => {
    const state = fresh()
    accuseEarly(state, seat(state, 1), WRONG)

    expect(state.eliminated).toEqual([])
    expect(state.outcome).toBeNull()
  })
})

describe('탈락자와 제안 차례', () => {
  const WRONG: Suggestion = { suspect: 's2', weapon: 'w1', place: 'p1' }

  it('탈락한 사람은 제안 차례를 건너뛴다', () => {
    const state = fresh()
    const fallen: GameState = { ...state, eliminated: [seat(state, 1)] }

    expect(nextRound(playRound(fallen)).turnIndex).toBe(2)
  })

  /*
   * 자기 차례에 외쳤다가 틀리면 그 자리에서 제안권을 잃는다. 넘기지 않으면
   * turnIndex가 탈락자를 가리킨 채 제안 페이즈에 갇혀 판이 멈춘다.
   */
  it('자기 차례에 쓰러지면 곧바로 다음 사람에게 넘어간다', () => {
    const state: GameState = { ...fresh(), turnIndex: 1 }
    const after = accuseEarly(state, seat(state, 1), WRONG)

    expect(after.phase).toBe('suggest')
    expect(after.turnIndex).toBe(2)
    expect(after.round).toBe(state.round)
  })

  it('남의 차례에 쓰러지면 차례는 그대로다', () => {
    const state: GameState = { ...fresh(), turnIndex: 1 }
    const after = accuseEarly(state, seat(state, 3), WRONG)

    expect(after.turnIndex).toBe(1)
  })
})

describe('탈락자와 최종 고발', () => {
  it('탈락자는 최종 고발도 할 수 없다', () => {
    const state = ready()
    const fallen: GameState = { ...state, eliminated: ['p1'] }

    expect(() => accuse(fallen, { suspect: 's1', weapon: 'w1', place: 'p1' }, 'p1')).toThrow()
  })

  it('탈락한 AI 시민은 합의 투표에서 빠진다', () => {
    const state = ready('council', 0)
    const fallen: GameState = { ...state, eliminated: ['p5'] }
    const votes: Vote[] = ['p1', 'p2', 'p3', 'p4'].map((playerId) => ({
      playerId,
      accusation: { suspect: 's1', weapon: 'w1', place: 'p1' },
      line: null,
    }))

    expect(accuseByCouncil(fallen, votes).outcome?.correct).toBe(true)
  })
})
