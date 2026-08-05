import { describe, expect, it } from 'vitest'
import { challenge, skipChallenge } from './challenge'
import { declareAll, suggest } from './round'
import { usePower } from './power'
import { createGame } from './setup'
import type { CardId, Claim, GameState, PlayerId, Suggestion } from './types'

const SUGGESTION: Suggestion = { suspect: 's1', weapon: 'w1', place: 'p1' }

/**
 * p3이 p1로 거짓 반증한다. p1은 p2가 쥐고 있으므로 p2는 증명할 수 있다.
 * p4는 p1이 없어서 이의제기해도 실패한다.
 */
const HANDS: CardId[][] = [
  ['s2', 'p4'], // p0 제안자
  ['w1', 'p3'], // p1
  ['p1', 'w2'], // p2 — 증명 가능
  ['s3', 's4'], // p3 — 위증자
  ['w3', 'p2'], // p4 — 증명 불가
  ['s5', 's1'], // p5
]

function staged(): GameState {
  const base = createGame({ seed: 'fixture' })
  const withHands: GameState = {
    ...base,
    solution: { suspect: 's6', weapon: 'w4', place: 'p5' },
    players: base.players.map((p, i) => ({
      ...p,
      characterId: `s${i + 1}`,
      hand: HANDS[i] ?? [],
    })),
  }

  const claims = new Map<PlayerId, Claim>([
    ['p1', { kind: 'refute', cardId: 'w1' }],
    ['p2', { kind: 'refute', cardId: 'p1' }],
    ['p3', { kind: 'refute', cardId: 'p1' }], // 위증
    ['p4', { kind: 'pass' }],
    ['p5', { kind: 'refute', cardId: 's1' }],
  ])

  return declareAll(suggest(withHands, 'p0', SUGGESTION), claims)
}

function revealedOf(state: GameState, id: PlayerId): readonly CardId[] {
  return state.players.find((p) => p.id === id)?.revealed ?? []
}

describe('challenge — 성공', () => {
  it('근거 카드를 쥐고 있으면 성공한다', () => {
    const after = challenge(staged(), 'p2', 'p3')

    expect(after.rounds[0]?.challenge?.success).toBe(true)
  })

  it('위증자의 손패 1장이 공개된다', () => {
    const after = challenge(staged(), 'p2', 'p3')
    const revealed = revealedOf(after, 'p3')

    expect(revealed).toHaveLength(1)
    expect(HANDS[3]).toContain(revealed[0])
  })

  it('고발자도 근거 카드를 공개한다', () => {
    const after = challenge(staged(), 'p2', 'p3')

    expect(revealedOf(after, 'p2')).toEqual(['p1'])
  })
})

describe('challenge — 실패', () => {
  it('근거 카드가 없으면 실패한다', () => {
    const after = challenge(staged(), 'p4', 'p3')

    expect(after.rounds[0]?.challenge?.success).toBe(false)
  })

  it('고발자의 손패 1장이 공개된다', () => {
    const after = challenge(staged(), 'p4', 'p3')
    const revealed = revealedOf(after, 'p4')

    expect(revealed).toHaveLength(1)
    expect(HANDS[4]).toContain(revealed[0])
  })

  it('실패하면 대상은 아무것도 잃지 않는다', () => {
    const after = challenge(staged(), 'p4', 'p3')

    expect(revealedOf(after, 'p3')).toEqual([])
  })
})

describe('challenge — 재현성', () => {
  it('같은 상황이면 항상 같은 카드가 공개된다', () => {
    const a = challenge(staged(), 'p2', 'p3')
    const b = challenge(staged(), 'p2', 'p3')

    expect(revealedOf(b, 'p3')).toEqual(revealedOf(a, 'p3'))
  })

  it('고발자가 다르면 공개되는 카드도 달라질 수 있다', () => {
    const from2 = challenge(staged(), 'p2', 'p3').rounds[0]?.challenge
    const from5 = challenge(staged(), 'p5', 'p3').rounds[0]?.challenge

    expect(from2?.challengerId).toBe('p2')
    expect(from5?.challengerId).toBe('p5')
  })
})

describe('challenge — 룰 검증', () => {
  it('침묵 선언에는 이의제기할 수 없다', () => {
    expect(() => challenge(staged(), 'p2', 'p4')).toThrow()
  })

  it('자기 자신에게는 이의제기할 수 없다', () => {
    expect(() => challenge(staged(), 'p3', 'p3')).toThrow()
  })

  it('선언하지 않은 제안자는 이의제기 대상이 아니다', () => {
    expect(() => challenge(staged(), 'p2', 'p0')).toThrow()
  })

  it('이의제기 페이즈가 아니면 할 수 없다', () => {
    const before = suggest(createGame({ seed: 'x' }), 'p0', SUGGESTION)
    expect(() => challenge(before, 'p2', 'p3')).toThrow()
  })
})

describe('challenge — 상태 전이', () => {
  it('이의제기 후 밀담 페이즈로 넘어간다', () => {
    expect(challenge(staged(), 'p2', 'p3').phase).toBe('whisper')
  })

  it('건너뛰어도 밀담 페이즈로 넘어간다', () => {
    const after = skipChallenge(staged())

    expect(after.phase).toBe('whisper')
    expect(after.rounds[0]?.challenge).toBeNull()
  })

  it('원본 상태를 바꾸지 않는다', () => {
    const before = staged()
    challenge(before, 'p2', 'p3')

    expect(before.phase).toBe('challenge')
    expect(revealedOf(before, 'p3')).toEqual([])
  })

  it('이의제기 기록이 남는다', () => {
    const record = challenge(staged(), 'p2', 'p3').rounds[0]?.challenge

    expect(record?.challengerId).toBe('p2')
    expect(record?.targetId).toBe('p3')
    expect(record?.cardId).toBe('p1')
    expect(record?.reveals).toHaveLength(2)
  })
})

describe('이의제기 대사', () => {
  it('이의제기 대사가 기록에 남는다', () => {
    const record = challenge(staged(), 'p2', 'p3', '거짓말이오').rounds[0]?.challenge

    expect(record?.line).toBe('거짓말이오')
  })

  it('대사를 주지 않으면 null이다', () => {
    expect(challenge(staged(), 'p2', 'p3').rounds[0]?.challenge?.line).toBeNull()
  })
})

describe('shield — 밀정', () => {
  /** p2가 p1을 쥐고 있으니 평소라면 p3의 위증이 잡힌다. */
  it('보호가 없으면 위증이 잡힌다', () => {
    const after = challenge(staged(), 'p2', 'p3')

    expect(after.rounds[0]?.challenge?.success).toBe(true)
  })

  it('보호가 걸려 있으면 카드가 잡혀도 실패한다', () => {
    const shielded = usePower(staged(), 'p3', { kind: 'shield' })
    const after = challenge(shielded, 'p2', 'p3')

    expect(after.rounds[0]?.challenge?.success).toBe(false)
  })

  /** 실패한 이의제기의 벌칙은 고발자가 받는다. 옳게 잡고도 손해를 보는 것이 이 능력이다. */
  it('막힌 이의제기의 벌칙은 고발자에게 간다', () => {
    const shielded = usePower(staged(), 'p3', { kind: 'shield' })
    const after = challenge(shielded, 'p2', 'p3')

    expect(revealedOf(after, 'p2')).toHaveLength(1)
    expect(revealedOf(after, 'p3')).toHaveLength(0)
  })

  it('한 번 막으면 소진된다', () => {
    const shielded = usePower(staged(), 'p3', { kind: 'shield' })
    const after = challenge(shielded, 'p2', 'p3')

    expect(after.pending).toHaveLength(0)
  })

  /** 어차피 실패할 이의제기까지 막아주면 보호가 헛되이 사라진다. */
  it('잡히지 않았으면 보호가 남는다', () => {
    const shielded = usePower(staged(), 'p3', { kind: 'shield' })
    const after = challenge(shielded, 'p4', 'p3')

    expect(after.rounds[0]?.challenge?.success).toBe(false)
    expect(after.pending).toHaveLength(1)
  })

  it('남의 보호는 나를 지켜주지 않는다', () => {
    const shielded = usePower(staged(), 'p5', { kind: 'shield' })
    const after = challenge(shielded, 'p2', 'p3')

    expect(after.rounds[0]?.challenge?.success).toBe(true)
    expect(after.pending).toHaveLength(1)
  })
})
