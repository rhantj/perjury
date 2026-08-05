import { describe, expect, it } from 'vitest'
import { skipChallenge } from './challenge'
import { PARLEY_LIMIT, canParley, parley, parleysUsedIn, skipParley } from './parley'
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

/** 밀담을 이미 times번 마친 판을 만든다. 지난 라운드 기록을 앞에 깔고 현재 라운드를 뒤에 둔다. */
function withPastParleys(state: GameState, times: number): GameState {
  const current = state.rounds[state.rounds.length - 1]
  if (!current) throw new Error('라운드가 없다')
  const past = Array.from({ length: times }, (_, i) => ({
    ...current,
    round: i + 1,
    parley: { targetId: 'p3', askLine: '지난 라운드', replyLine: '지난 라운드' },
  }))
  return { ...state, rounds: [...past, { ...current, round: times + 1 }] }
}

describe('parley — 판당 횟수 제한 (decisions/009)', () => {
  it(`판당 ${PARLEY_LIMIT}회까지 쓸 수 있다`, () => {
    const state = withPastParleys(atWhisper(), PARLEY_LIMIT - 1)

    expect(() => parley(state, otherId(state), '마지막', '마지막')).not.toThrow()
  })

  it(`${PARLEY_LIMIT + 1}번째는 거절한다`, () => {
    const state = withPastParleys(atWhisper(), PARLEY_LIMIT)

    expect(() => parley(state, otherId(state), '한 번 더', '한 번 더')).toThrow(/판당/)
  })

  it('건너뛴 라운드는 횟수를 쓰지 않는다', () => {
    const state = atWhisper()

    const next = skipParley(state)

    expect(parleysUsedIn(next.rounds)).toBe(0)
  })

  it('쓴 횟수는 기록에서 센다 — 상태로 들지 않는다', () => {
    const state = withPastParleys(atWhisper(), 2)

    expect(parleysUsedIn(state.rounds)).toBe(2)
  })

  it('canParley는 한도를 다 쓰면 false다', () => {
    expect(canParley(withPastParleys(atWhisper(), PARLEY_LIMIT - 1))).toBe(true)
    expect(canParley(withPastParleys(atWhisper(), PARLEY_LIMIT))).toBe(false)
  })

  /*
   * 한도가 밀담 페이즈를 막으면 판이 그 자리에 선다. 나가는 문은 반드시 열려 있어야 한다 —
   * 이의제기 때 같은 종류의 사고를 배포본에서 겪었다(ai/flow.ts 주석 참고).
   */
  it('한도를 다 써도 skipParley로 라운드는 넘어간다', () => {
    const state = withPastParleys(atWhisper(), PARLEY_LIMIT)

    const next = skipParley(state)

    expect(next.phase).toBe('suggest')
    expect(next.round).toBe(state.round + 1)
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
