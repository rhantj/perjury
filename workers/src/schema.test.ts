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
          declarations: [{ playerId: 'p1', claim: { kind: 'refute', cardId: 's2' } }],
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
