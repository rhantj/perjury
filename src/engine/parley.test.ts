import { describe, expect, it } from 'vitest'
import { skipChallenge } from './challenge'
import { parley, skipParley } from './parley'
import { declareAll, suggest } from './round'
import { createGame } from './setup'
import type { CardId, Claim, GameState, PlayerId, Suggestion } from './types'

const SUGGESTION: Suggestion = { suspect: 's1', weapon: 'w1', place: 'p1' }

/** 아무도 제안 카드를 갖지 않게 손패를 고친다 — 침묵이 위증이 되면 관심 없는 곳에서 판이 갈린다. */
function fresh(): GameState {
  const base = createGame({ seed: 'parley', humanIndex: 0 })
  const hands: CardId[][] = [
    ['s2', 's3'],
    ['s4', 's5'],
    ['s6', 'w2'],
    ['w3', 'w4'],
    ['p2', 'p3'],
    ['p4', 'p5'],
  ]
  return {
    ...base,
    solution: { suspect: 's1', weapon: 'w1', place: 'p1' },
    players: base.players.map((p, i) => ({
      ...p,
      isHuman: i === 0,
      hand: hands[i] ?? [],
    })),
  }
}

/** 한 라운드를 아무 일 없이 굴려 밀담 페이즈에 세운다. */
function atWhisper(state: GameState = fresh()): GameState {
  const suggesterId = state.players[state.turnIndex]?.id
  if (!suggesterId) throw new Error('제안자가 없다')
  const opened = suggest(state, suggesterId, SUGGESTION)
  const claims = new Map<PlayerId, Claim>(
    state.players.filter((p) => p.id !== suggesterId).map((p) => [p.id, { kind: 'pass' }]),
  )
  return skipChallenge(declareAll(opened, claims))
}

function humanId(state: GameState): PlayerId {
  const human = state.players.find((p) => p.isHuman)
  if (!human) throw new Error('사람 자리가 없다')
  return human.id
}

function otherId(state: GameState): PlayerId {
  const other = state.players.find((p) => !p.isHuman)
  if (!other) throw new Error('상대가 없다')
  return other.id
}

describe('parley — 밀담을 남기고 라운드를 넘긴다', () => {
  it('오간 말이 그 라운드 기록에 붙는다', () => {
    const state = atWhisper()

    const next = parley(state, otherId(state), '왜 침묵했지', '아무것도 못 봤소')

    expect(next.rounds[0]?.parley).toEqual({
      targetId: otherId(state),
      askLine: '왜 침묵했지',
      replyLine: '아무것도 못 봤소',
    })
  })

  it('다음 라운드를 연다', () => {
    const state = atWhisper()

    const next = parley(state, otherId(state), '묻는다', '답한다')

    expect(next.phase).toBe('suggest')
    expect(next.round).toBe(2)
  })

  it('마지막 라운드의 밀담은 최종 고발로 이어진다', () => {
    const base = atWhisper()
    const last: GameState = { ...base, round: base.totalRounds }

    const next = parley(last, otherId(last), '마지막으로 묻는다', '마지막으로 답한다')

    expect(next.phase).toBe('accuse')
  })

  it('밀담 페이즈가 아니면 던진다', () => {
    const state = fresh()

    expect(() => parley(state, otherId(state), '묻는다', '답한다')).toThrow(/밀담 페이즈가 아니다/)
  })

  it('자기 자신과는 밀담할 수 없다', () => {
    const state = atWhisper()

    expect(() => parley(state, humanId(state), '혼잣말', '혼잣말')).toThrow(/자기 자신/)
  })

  it('없는 상대는 거부한다', () => {
    const state = atWhisper()

    expect(() => parley(state, 'nobody', '묻는다', '답한다')).toThrow(/없는 플레이어/)
  })

  it('이미 밀담한 라운드에는 다시 못 한다', () => {
    const base = atWhisper()
    const record = base.rounds[0]
    if (!record) throw new Error('라운드 기록이 없다')
    const already: GameState = {
      ...base,
      rounds: [{ ...record, parley: { targetId: otherId(base), askLine: '먼저', replyLine: '먼저' } }],
    }

    expect(() => parley(already, otherId(base), '또', '또')).toThrow(/이미 밀담했다/)
  })
})

describe('skipParley — 밀담 없이 넘긴다', () => {
  it('기록을 남기지 않고 다음 라운드를 연다', () => {
    const state = atWhisper()

    const next = skipParley(state)

    expect(next.rounds[0]?.parley).toBeNull()
    expect(next.round).toBe(2)
  })

  it('밀담 페이즈가 아니면 던진다', () => {
    expect(() => skipParley(fresh())).toThrow(/밀담 페이즈가 아니다/)
  })
})
