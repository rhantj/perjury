import { describe, expect, it } from 'vitest'
import { LIMITS, parseDecideRequest } from './schema'

/** 통과해야 하는 최소 요청. 각 테스트는 여기서 한 군데만 망가뜨린다. */
function validBody(patch: (body: Record<string, unknown>) => void = () => {}): string {
  const players = Array.from({ length: 6 }, (_, i) => ({
    id: `p${i}`,
    characterId: `s${i + 1}`,
    name: `이름${i}`,
    isHuman: i === 0,
    isMe: i === 1,
    revealed: [],
    hand: i === 1 ? ['s2', 'w3', 'p1'] : null,
    faction: i === 1 ? 'citizen' : null,
  }))

  const body: Record<string, unknown> = {
    v: 1,
    kind: 'refute',
    sessionId: 'abc123',
    view: {
      viewerId: 'p1',
      round: 2,
      totalRounds: 8,
      phase: 'refute',
      turnIndex: 0,
      players,
      rounds: [
        {
          round: 1,
          suggesterId: 'p0',
          suggestion: { suspect: 's2', weapon: 'w1', place: 'p4' },
          suggestionLine: null,
          declarations: [{ playerId: 'p1', claim: { kind: 'refute', cardId: 's2' }, line: null }],
          challenge: null,
        },
      ],
      solution: null,
      outcome: null,
    },
  }

  patch(body)
  return JSON.stringify(body)
}

function view(body: Record<string, unknown>): Record<string, unknown> {
  return body['view'] as Record<string, unknown>
}

describe('parseDecideRequest', () => {
  it('정상 요청을 통과시킨다', () => {
    const result = parseDecideRequest(validBody())

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.kind).toBe('refute')
    expect(result.value.view.players).toHaveLength(6)
  })

  it('seed를 끼워 넣으면 거부한다', () => {
    const result = parseDecideRequest(validBody((b) => (view(b)['seed'] = 'leak')))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain('seed')
  })

  it('남의 손패를 채워 보내도 필드 자체는 통과하지만 모르는 키는 막는다', () => {
    const result = parseDecideRequest(
      validBody((b) => {
        const players = view(b)['players'] as Record<string, unknown>[]
        const first = players[0]
        if (first) first['isPerjury'] = true
      }),
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain('isPerjury')
  })

  it('본문이 상한을 넘으면 거부한다', () => {
    const result = parseDecideRequest('x'.repeat(LIMITS.bodyBytes + 1))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain('바이트')
  })

  it('JSON이 아니면 거부한다', () => {
    const result = parseDecideRequest('{ 이건 JSON이 아니다')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toBe('JSON이 아니다')
  })

  it('모르는 계약 버전을 거부한다', () => {
    const result = parseDecideRequest(validBody((b) => (b['v'] = 2)))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain('계약 버전')
  })

  it('모르는 kind를 거부한다', () => {
    const result = parseDecideRequest(validBody((b) => (b['kind'] = 'parley')))

    expect(result.ok).toBe(false)
  })

  it('플레이어가 6명이 아니면 거부한다', () => {
    const result = parseDecideRequest(
      validBody((b) => {
        const players = view(b)['players'] as unknown[]
        view(b)['players'] = players.slice(0, 5)
      }),
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain('6명')
  })

  it('상한을 넘는 문자열을 거부한다', () => {
    const result = parseDecideRequest(validBody((b) => (b['sessionId'] = 'a'.repeat(LIMITS.stringLength + 1))))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain('넘는다')
  })

  it('라운드 수 상한을 넘으면 거부한다', () => {
    const result = parseDecideRequest(
      validBody((b) => {
        const rounds = view(b)['rounds'] as unknown[]
        const one = rounds[0]
        view(b)['rounds'] = Array.from({ length: LIMITS.rounds + 1 }, () => one)
      }),
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain(`${LIMITS.rounds}개`)
  })

  it('끝난 판(outcome이 있는 상태)에는 결정을 요청할 수 없다', () => {
    const result = parseDecideRequest(validBody((b) => (view(b)['outcome'] = { winner: 'citizen' })))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain('outcome')
  })

  it('범인 진영의 solution은 통과시킨다', () => {
    const result = parseDecideRequest(
      validBody((b) => (view(b)['solution'] = { suspect: 's1', weapon: 'w2', place: 'p3' })),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.view.solution?.suspect).toBe('s1')
  })

  it('pass 선언에 cardId를 붙이면 거부한다', () => {
    const result = parseDecideRequest(
      validBody((b) => {
        const rounds = view(b)['rounds'] as Record<string, unknown>[]
        const first = rounds[0]
        if (first) first['declarations'] = [{ playerId: 'p1', claim: { kind: 'pass', cardId: 's2' } }]
      }),
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain('cardId')
  })
})

/**
 * 대사는 시야를 타고 와서 프롬프트로 되돌아간다 — 인젝션 표면이다.
 * 그래서 «받되 짧게»가 규칙이다. 아예 안 받으면 프론트의 정상 요청이 통째로 거부된다.
 */
describe('parseDecideRequest — 대사', () => {
  it('제안·반증 대사를 받는다', () => {
    const result = parseDecideRequest(
      validBody((b) => {
        const rounds = view(b)['rounds'] as Record<string, unknown>[]
        const first = rounds[0]
        if (!first) throw new Error('라운드가 없다')
        first['suggestionLine'] = '이 셋을 상 위에 올리겠소'
        const declarations = first['declarations'] as Record<string, unknown>[]
        const one = declarations[0]
        if (!one) throw new Error('선언이 없다')
        one['line'] = '그 물건이라면 내 방에 있소'
      }),
    )

    expect(result.ok).toBe(true)
  })

  it('이의제기 대사를 받는다', () => {
    const result = parseDecideRequest(
      validBody((b) => {
        const rounds = view(b)['rounds'] as Record<string, unknown>[]
        const first = rounds[0]
        if (!first) throw new Error('라운드가 없다')
        first['challenge'] = {
          challengerId: 'p2',
          targetId: 'p1',
          cardId: 's2',
          success: true,
          reveals: [],
          line: '거짓말이오',
        }
      }),
    )

    expect(result.ok).toBe(true)
  })

  it('긴 대사는 거부한다 — 프롬프트로 되돌아가는 문자열이다', () => {
    const result = parseDecideRequest(
      validBody((b) => {
        const rounds = view(b)['rounds'] as Record<string, unknown>[]
        const first = rounds[0]
        if (!first) throw new Error('라운드가 없다')
        first['suggestionLine'] = '가'.repeat(LIMITS.lineLength + 1)
      }),
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('거부해야 한다')
    expect(result.message).toContain(`${LIMITS.lineLength}자`)
  })
})

/** 밀담 요청 테스트용 시야 조각의 모양. validBody()의 view와 같은 모양이다. */
interface TestRound {
  round: number
  suggesterId: string
  suggestion: { suspect: string; weapon: string; place: string }
  suggestionLine: string | null
  declarations: { playerId: string; claim: { kind: string; cardId?: string }; line: string | null }[]
  challenge: null
  parley: null
}

interface TestView {
  viewerId: string
  round: number
  totalRounds: number
  phase: string
  turnIndex: number
  players: unknown[]
  rounds: TestRound[]
  solution: null
  outcome: null
}

/**
 * 밀담 요청 테스트에서 쓰는 최소 시야. `validBody()`가 만드는 view와 같은 모양이지만,
 * `kind: 'refute'` 요청 안에 박혀 있지 않은 시야 자체가 필요할 때 이걸 쓴다.
 */
function validView(): TestView {
  const players = Array.from({ length: 6 }, (_, i) => ({
    id: `p${i}`,
    characterId: `s${i + 1}`,
    name: `이름${i}`,
    isHuman: i === 0,
    isMe: i === 1,
    revealed: [],
    hand: i === 1 ? ['s2', 'w3', 'p1'] : null,
    faction: i === 1 ? 'citizen' : null,
  }))

  return {
    viewerId: 'p1',
    round: 2,
    totalRounds: 8,
    phase: 'refute',
    turnIndex: 0,
    players,
    rounds: [
      {
        round: 1,
        suggesterId: 'p0',
        suggestion: { suspect: 's2', weapon: 'w1', place: 'p4' },
        suggestionLine: null,
        declarations: [{ playerId: 'p1', claim: { kind: 'refute', cardId: 's2' }, line: null }],
        challenge: null,
        parley: null,
      },
    ],
    solution: null,
    outcome: null,
  }
}

describe('parseDecideRequest — 밀담', () => {
  it('kind parley와 ask를 받는다', () => {
    const parsed = parseDecideRequest(
      JSON.stringify({ v: 1, kind: 'parley', sessionId: 's', ask: '왜 침묵했지', view: validView() }),
    )

    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.value.kind).toBe('parley')
      expect(parsed.value.ask).toBe('왜 침묵했지')
    }
  })

  it('ask가 200자를 넘으면 거부한다', () => {
    const parsed = parseDecideRequest(
      JSON.stringify({
        v: 1,
        kind: 'parley',
        sessionId: 's',
        ask: '가'.repeat(201),
        view: validView(),
      }),
    )

    expect(parsed.ok).toBe(false)
  })

  it('parley인데 ask가 없으면 거부한다', () => {
    const parsed = parseDecideRequest(
      JSON.stringify({ v: 1, kind: 'parley', sessionId: 's', view: validView() }),
    )

    expect(parsed.ok).toBe(false)
  })

  it('밀담이 아닌 kind에 ask를 실으면 거부한다', () => {
    const parsed = parseDecideRequest(
      JSON.stringify({ v: 1, kind: 'refute', sessionId: 's', ask: '몰래', view: validView() }),
    )

    expect(parsed.ok).toBe(false)
  })

  it('라운드 기록의 밀담을 통과시킨다', () => {
    const view = validView()
    const round = view.rounds[0]
    if (!round) throw new Error('테스트 시야에 라운드가 없다')
    const withParley = {
      ...view,
      rounds: [{ ...round, parley: { targetId: 'p1', askLine: '묻는다', replyLine: '답한다' } }],
    }

    const parsed = parseDecideRequest(
      JSON.stringify({ v: 1, kind: 'refute', sessionId: 's', view: withParley }),
    )

    expect(parsed.ok).toBe(true)
  })

  it('밀담 기록에 모르는 필드가 있으면 거부한다', () => {
    const view = validView()
    const round = view.rounds[0]
    if (!round) throw new Error('테스트 시야에 라운드가 없다')
    const forged = {
      ...view,
      rounds: [
        {
          ...round,
          parley: { targetId: 'p1', askLine: 'a', replyLine: 'b', hand: ['s1'] },
        },
      ],
    }

    const parsed = parseDecideRequest(
      JSON.stringify({ v: 1, kind: 'refute', sessionId: 's', view: forged }),
    )

    expect(parsed.ok).toBe(false)
  })
})
