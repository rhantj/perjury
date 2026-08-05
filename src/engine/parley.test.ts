import { describe, expect, it } from 'vitest'
import { skipChallenge } from './challenge'
import { parley, skipParley } from './parley'
import { declareAll, suggest } from './round'
import { createGame } from './setup'
import { usePower } from './power'
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

/** 사람도 첫 상대도 아닌 세 번째 좌석. 두 번째 회선의 상대다. */
function thirdId(state: GameState): PlayerId {
  const first = otherId(state)
  const other = state.players.find((p) => !p.isHuman && p.id !== first)
  if (!other) throw new Error('상대가 모자란다')
  return other.id
}

describe('parley — 밀담을 남기고 라운드를 넘긴다', () => {
  it('오간 말이 그 라운드 기록에 붙는다', () => {
    const state = atWhisper()

    const next = parley(state, otherId(state), '왜 침묵했지', '아무것도 못 봤소')

    expect(next.rounds[0]?.parleys).toEqual([
      {
        targetId: otherId(state),
        askLine: '왜 침묵했지',
        replyLine: '아무것도 못 봤소',
      },
    ])
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
      rounds: [
        { ...record, parleys: [{ targetId: otherId(base), askLine: '먼저', replyLine: '먼저' }] },
      ],
    }

    expect(() => parley(already, otherId(base), '또', '또')).toThrow(/다 썼다/)
  })
})

describe('skipParley — 밀담 없이 넘긴다', () => {
  it('기록을 남기지 않고 다음 라운드를 연다', () => {
    const state = atWhisper()

    const next = skipParley(state)

    expect(next.rounds[0]?.parleys).toEqual([])
    expect(next.round).toBe(2)
  })

  it('밀담 페이즈가 아니면 던진다', () => {
    expect(() => skipParley(fresh())).toThrow(/밀담 페이즈가 아니다/)
  })
})

describe('parleyAllowance — 전화교환수의 회선', () => {
  /** 사람이 전화교환수면 라운드당 두 번 건다. 기본은 한 번이다. */
  function twoLines(): GameState {
    return { ...atWhisper(), parleyAllowance: 2 }
  }

  it('기본 허용은 한 건이고 첫 밀담에 라운드가 넘어간다', () => {
    const state = atWhisper()

    const next = parley(state, otherId(state), '왜 침묵했지', '못 봤소')

    expect(state.parleyAllowance).toBe(1)
    expect(next.phase).toBe('suggest')
    expect(next.round).toBe(state.round + 1)
  })

  it('허용이 두 건이면 첫 밀담은 라운드를 넘기지 않는다', () => {
    const state = twoLines()

    const next = parley(state, otherId(state), '왜 침묵했지', '못 봤소')

    expect(next.phase).toBe('whisper')
    expect(next.round).toBe(state.round)
    expect(next.rounds[next.rounds.length - 1]?.parleys).toHaveLength(1)
  })

  it('허용을 다 쓰면 라운드가 넘어간다', () => {
    const state = twoLines()
    const first = parley(state, otherId(state), '하나', '답1')

    const second = parley(first, thirdId(first), '둘', '답2')

    expect(second.phase).toBe('suggest')
    expect(second.round).toBe(state.round + 1)
    expect(second.rounds[0]?.parleys).toHaveLength(2)
  })

  it('허용을 넘겨 걸면 거부한다', () => {
    const state = atWhisper()
    const after = parley(state, otherId(state), '하나', '답1')

    expect(() => parley({ ...after, phase: 'whisper' }, thirdId(after), '둘', '답2')).toThrow()
  })

  /** 같은 사람과 두 번 거는 것은 회선을 늘린 뜻이 아니다. */
  it('같은 상대와 두 번은 걸 수 없다', () => {
    const state = twoLines()
    const first = parley(state, otherId(state), '하나', '답1')

    expect(() => parley(first, otherId(first), '둘', '답2')).toThrow()
  })

  it('건너뛰면 남은 허용과 상관없이 라운드가 넘어간다', () => {
    const state = twoLines()
    const first = parley(state, otherId(state), '하나', '답1')

    expect(skipParley(first).round).toBe(state.round + 1)
  })
})

describe('detect-lie — 정보상', () => {
  /** 능력의 주인은 언제나 사람이다 — 정보상은 사람 좌석에만 배정된다(content/roles.ts). */
  function armed(): GameState {
    const state = atWhisper()
    return usePower(state, humanId(state), { kind: 'detect-lie' })
  }

  it('상대가 거짓을 신고하면 거짓으로 통보받는다', () => {
    const state = armed()
    const target = otherId(state)

    const after = parley(state, target, '왜 침묵했지', '못 봤소', false)
    const grant = after.grants[0]

    if (grant?.finding.kind !== 'parley') throw new Error('finding 종류가 다르다')
    expect(grant.finding.targetId).toBe(target)
    expect(grant.finding.truthful).toBe(false)
    expect(grant.ownerId).toBe(humanId(state))
  })

  it('사실을 신고하면 사실로 통보받는다', () => {
    const after = parley(armed(), otherId(armed()), '묻는다', '답한다', true)
    const grant = after.grants[0]

    if (grant?.finding.kind !== 'parley') throw new Error('finding 종류가 다르다')
    expect(grant.finding.truthful).toBe(true)
  })

  /** 얼버무린 말에는 판정할 것이 없다. 능력을 태우지 않고 다음 밀담을 기다린다. */
  it('신고가 없으면 능력이 그대로 남는다', () => {
    const state = armed()

    const after = parley(state, otherId(state), '묻는다', '글쎄올시다', null)

    expect(after.grants).toHaveLength(0)
    expect(after.pending).toHaveLength(1)
  })

  it('한 번 판정하면 소진된다', () => {
    const state = armed()

    const after = parley(state, otherId(state), '묻는다', '답한다', false)

    expect(after.pending).toHaveLength(0)
  })

  it('능력을 안 썼으면 신고가 와도 아무 일도 없다', () => {
    const state = atWhisper()

    const after = parley(state, otherId(state), '묻는다', '답한다', false)

    expect(after.grants).toHaveLength(0)
  })

  /** 신고는 기록에 남기지 않는다. 남기면 능력 없이도 시야에서 그대로 읽힌다. */
  it('밀담 기록에는 진위가 남지 않는다', () => {
    const state = armed()

    const after = parley(state, otherId(state), '묻는다', '답한다', false)

    expect(Object.keys(after.rounds[0]?.parleys[0] ?? {}).sort()).toEqual([
      'askLine',
      'replyLine',
      'targetId',
    ])
  })
})
