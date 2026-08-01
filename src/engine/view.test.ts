import { describe, expect, it } from 'vitest'
import { challenge, skipChallenge } from './challenge'
import { accuse, nextRound } from './progress'
import { declareAll, suggest } from './round'
import { createGame } from './setup'
import { viewFor } from './view'
import type { CardId, Claim, GameState, PlayerId, Suggestion } from './types'

const SUGGESTION: Suggestion = { suspect: 's1', weapon: 'w1', place: 'p1' }

const HANDS: CardId[][] = [
  ['s2', 'p4'], // p0 제안자
  ['w1', 'p3'],
  ['p1', 'w2'], // p2 — 증명 가능
  ['s3', 's4'], // p3 — 위증자
  ['w3', 'p2'],
  ['s5', 's1'],
]

/** 정답 s6/w4/p5 → 캐릭터 s6을 맡은 p5가 범인이다. */
function staged(): GameState {
  const base = createGame({ seed: 'view' })
  return {
    ...base,
    solution: { suspect: 's6', weapon: 'w4', place: 'p5' },
    players: base.players.map((p, i) => ({
      ...p,
      characterId: `s${i + 1}`,
      isHuman: i === 0,
      faction: i === 5 ? 'culprit' : 'citizen',
      hand: HANDS[i] ?? [],
    })),
  }
}

/** p3이 거짓 반증한 상태까지 진행시킨다. */
function afterDeclarations(): GameState {
  const claims = new Map<PlayerId, Claim>([
    ['p1', { kind: 'refute', cardId: 'w1' }],
    ['p2', { kind: 'refute', cardId: 'p1' }],
    ['p3', { kind: 'refute', cardId: 'p1' }], // 위증
    ['p4', { kind: 'pass' }],
    ['p5', { kind: 'refute', cardId: 's1' }],
  ])
  return declareAll(suggest(staged(), 'p0', SUGGESTION), claims)
}

describe('viewFor — 손패', () => {
  it('내 손패는 보인다', () => {
    const view = viewFor(staged(), 'p0')

    expect(view.players.find((p) => p.id === 'p0')?.hand).toEqual(['s2', 'p4'])
  })

  it('남의 손패는 보이지 않는다', () => {
    const view = viewFor(staged(), 'p0')

    for (const player of view.players) {
      if (player.id !== 'p0') expect(player.hand).toBeNull()
    }
  })

  it('공개된 카드는 모두에게 보인다', () => {
    const after = challenge(afterDeclarations(), 'p2', 'p3')
    const view = viewFor(after, 'p0')
    const target = view.players.find((p) => p.id === 'p3')

    expect(target?.hand).toBeNull()
    expect(target?.revealed).toHaveLength(1)
  })
})

describe('viewFor — 정답', () => {
  it('시민 시야에는 정답이 없다', () => {
    expect(viewFor(staged(), 'p0').solution).toBeNull()
  })

  it('범인 시야에는 정답이 있다', () => {
    expect(viewFor(staged(), 'p5').solution).toEqual({
      suspect: 's6',
      weapon: 'w4',
      place: 'p5',
    })
  })

  it('진행 중에는 시드를 내보내지 않는다', () => {
    expect(viewFor(staged(), 'p0')).not.toHaveProperty('seed')
  })
})

describe('viewFor — 진영', () => {
  it('내 진영은 보인다', () => {
    expect(viewFor(staged(), 'p5').players.find((p) => p.id === 'p5')?.faction).toBe('culprit')
  })

  it('남의 진영은 보이지 않는다', () => {
    const view = viewFor(staged(), 'p0')

    for (const player of view.players) {
      if (player.id !== 'p0') expect(player.faction).toBeNull()
    }
  })
})

describe('viewFor — 위증 여부', () => {
  it('선언에서 위증 판정이 제거된다', () => {
    const view = viewFor(afterDeclarations(), 'p0')

    for (const declaration of view.rounds[0]?.declarations ?? []) {
      expect(declaration).not.toHaveProperty('isPerjury')
    }
  })

  it('위증자 본인의 시야에도 판정값은 없다', () => {
    const view = viewFor(afterDeclarations(), 'p3')

    for (const declaration of view.rounds[0]?.declarations ?? []) {
      expect(declaration).not.toHaveProperty('isPerjury')
    }
  })

  it('선언 내용 자체는 전부 공개된다', () => {
    const view = viewFor(afterDeclarations(), 'p0')
    const declarations = view.rounds[0]?.declarations ?? []

    expect(declarations).toHaveLength(5)
    expect(declarations.find((d) => d.playerId === 'p3')?.claim).toEqual({
      kind: 'refute',
      cardId: 'p1',
    })
  })

  it('이의제기 결과는 전부 공개된다', () => {
    const after = challenge(afterDeclarations(), 'p2', 'p3')
    const record = viewFor(after, 'p4').rounds[0]?.challenge

    expect(record?.success).toBe(true)
    expect(record?.targetId).toBe('p3')
  })
})

describe('viewFor — 판이 끝난 뒤', () => {
  function finished(accusation: Suggestion): GameState {
    let state = staged()
    for (let i = 0; i < 8; i += 1) {
      const suggesterId = state.players[state.turnIndex]?.id ?? 'p0'
      const opened = suggest(state, suggesterId, {
        suspect: 's6',
        weapon: 'w4',
        place: 'p5',
      })
      const passes = new Map<PlayerId, Claim>(
        state.players
          .filter((p) => p.id !== suggesterId)
          .map((p) => [p.id, { kind: 'pass' } as Claim]),
      )
      state = nextRound(skipChallenge(declareAll(opened, passes)))
    }
    return accuse(state, accusation, 'p0')
  }

  it('정답이 공개된다', () => {
    const view = viewFor(finished({ suspect: 's6', weapon: 'w4', place: 'p5' }), 'p0')

    expect(view.outcome?.solution).toEqual({ suspect: 's6', weapon: 'w4', place: 'p5' })
  })

  it('시민 시야에서 정답을 맞히면 내 승리다', () => {
    const view = viewFor(finished({ suspect: 's6', weapon: 'w4', place: 'p5' }), 'p0')

    expect(view.outcome?.winner).toBe('citizen')
    expect(view.outcome?.viewerWon).toBe(true)
  })

  it('같은 결과라도 범인 시야에서는 패배다', () => {
    const view = viewFor(finished({ suspect: 's6', weapon: 'w4', place: 'p5' }), 'p5')

    expect(view.outcome?.viewerWon).toBe(false)
  })

  it('고발이 틀리면 범인 시야에서 승리다', () => {
    const view = viewFor(finished({ suspect: 's1', weapon: 'w4', place: 'p5' }), 'p5')

    expect(view.outcome?.winner).toBe('culprit')
    expect(view.outcome?.viewerWon).toBe(true)
  })
})

describe('viewFor — 검증', () => {
  it('없는 플레이어의 시야는 만들 수 없다', () => {
    expect(() => viewFor(staged(), 'p9')).toThrow()
  })

  it('기본 진행 정보는 그대로 보인다', () => {
    const view = viewFor(staged(), 'p0')

    expect(view.round).toBe(1)
    expect(view.totalRounds).toBe(8)
    expect(view.phase).toBe('suggest')
    expect(view.viewerId).toBe('p0')
  })
})
