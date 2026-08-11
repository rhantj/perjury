import { describe, expect, it } from 'vitest'
import { PROVEN_LIE, PROVEN_TRUTH, isDiscredited, trustFrom } from './trust'
import type { Grant, PlayerId, Suggestion } from './types'
import type { GameView, RoundView } from './view'

const SUGGESTION: Suggestion = { suspect: 's1', weapon: 'w1', place: 'p1' }
const SEATS: PlayerId[] = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5']

function round(n: number, patch: Partial<RoundView> = {}): RoundView {
  return {
    round: n,
    suggesterId: 'p0',
    suggestion: SUGGESTION,
    suggestionLine: null,
    responderIds: ['p1', 'p2'],
    declarations: [],
    challenge: null,
    exposed: [],
    published: [],
    parleys: [],
    ...patch,
  }
}

function view(patch: Partial<GameView> = {}): GameView {
  return {
    viewerId: 'p0',
    round: 1,
    totalRounds: 24,
    phase: 'suggest',
    turnIndex: 0,
    players: SEATS.map((id) => ({
      id,
      characterId: 's1',
      name: id,
      isHuman: id === 'p0',
      isMe: id === 'p0',
      revealed: [],
      hand: null,
      faction: null,
    })),
    rounds: [],
    findings: [],
    powerSpent: false,
    eliminated: [],
    solution: null,
    outcome: null,
    ...patch,
  }
}

/** 성공한 이의제기 — 대상의 위증이 증명된 자리다. */
function caught(targetId: PlayerId) {
  return {
    challengerId: 'p0',
    targetId,
    cardId: 'p1',
    success: true,
    reveals: [],
    line: null,
  }
}

function scoreOf(v: GameView, id: PlayerId): number {
  return trustFrom(v).get(id)?.score ?? 0
}

describe('trustFrom', () => {
  it('아무 일도 없으면 아무도 기록되지 않는다', () => {
    const table = trustFrom(view({ rounds: [round(1), round(2)] }))
    expect(table.size).toBe(0)
  })

  it('이의제기가 성공하면 대상의 신뢰도가 내려간다', () => {
    const v = view({ rounds: [round(3, { challenge: caught('p3') })] })

    expect(scoreOf(v, 'p3')).toBe(PROVEN_LIE)
    expect(trustFrom(v).get('p3')?.events).toEqual([
      { round: 3, kind: 'perjury-proven', delta: PROVEN_LIE, isPrivate: false },
    ])
  })

  it('이의제기가 실패하면 아무것도 증명되지 않는다', () => {
    /*
     * 고발자가 그 카드를 안 쥐고 있었다는 뜻일 뿐, 대상이 정직했다는 뜻이 아니다.
     * 증명 가능한 카드가 아니었을 뿐 위증이었을 수 있다.
     */
    const v = view({
      rounds: [round(3, { challenge: { ...caught('p3'), success: false } })],
    })

    expect(trustFrom(v).size).toBe(0)
  })

  it('실패한 이의제기는 «고발한 쪽»도 깎지 않는다', () => {
    const v = view({
      rounds: [round(3, { challenge: { ...caught('p3'), success: false } })],
    })

    expect(scoreOf(v, 'p0')).toBe(0)
  })

  it('사진사에게 발각되면 이의제기 없이도 내려간다', () => {
    const v = view({ rounds: [round(2, { exposed: ['p4'] })] })

    expect(scoreOf(v, 'p4')).toBe(PROVEN_LIE)
    expect(trustFrom(v).get('p4')?.events[0]?.kind).toBe('exposed')
  })

  it('신문기자 공개는 거짓이면 깎고 참이면 올린다', () => {
    const v = view({
      rounds: [
        round(2, { published: [{ playerId: 'p1', truthful: false }] }),
        round(5, { published: [{ playerId: 'p2', truthful: true }] }),
      ],
    })

    expect(scoreOf(v, 'p1')).toBe(PROVEN_LIE)
    expect(scoreOf(v, 'p2')).toBe(PROVEN_TRUTH)
  })

  it('순사 통보는 나만 아는 근거로 표시된다', () => {
    const grants: Grant[] = [
      { round: 4, ownerId: 'p0', finding: { kind: 'claim', targetId: 'p5', truthful: false } },
    ]
    const table = trustFrom(view({ findings: grants }))

    expect(table.get('p5')?.score).toBe(PROVEN_LIE)
    expect(table.get('p5')?.events[0]?.isPrivate).toBe(true)
  })

  it('정보상이 잡아낸 밀담 거짓말도 같은 축에 쌓인다', () => {
    const grants: Grant[] = [
      { round: 6, ownerId: 'p0', finding: { kind: 'parley', targetId: 'p2', truthful: false } },
    ]

    expect(scoreOf(view({ findings: grants }), 'p2')).toBe(PROVEN_LIE)
  })

  it('능력으로 «알게 된 카드»는 신뢰도와 무관하다', () => {
    const grants: Grant[] = [
      { round: 4, ownerId: 'p0', finding: { kind: 'hand', targetId: 'p1', cardId: 'w1' } },
      { round: 5, ownerId: 'p0', finding: { kind: 'weapon', cardId: 'w2', isSolution: true } },
    ]

    expect(trustFrom(view({ findings: grants })).size).toBe(0)
  })

  it('여러 근거가 쌓이면 합산되고 라운드 순으로 남는다', () => {
    const v = view({
      rounds: [
        round(2, { published: [{ playerId: 'p3', truthful: true }] }),
        round(7, { challenge: caught('p3') }),
      ],
    })
    const record = trustFrom(v).get('p3')

    expect(record?.score).toBe(PROVEN_TRUTH + PROVEN_LIE)
    expect(record?.events.map((e) => e.round)).toEqual([2, 7])
  })

  it('시야가 다르면 나만 아는 근거만큼 결과가 갈린다', () => {
    const rounds = [round(3, { challenge: caught('p3') })]
    const grants: Grant[] = [
      { round: 4, ownerId: 'p0', finding: { kind: 'claim', targetId: 'p3', truthful: false } },
    ]

    /* viewFor가 findings를 이미 걸러 주므로, 남의 시야에는 그 근거가 애초에 실리지 않는다. */
    expect(scoreOf(view({ rounds, findings: grants }), 'p3')).toBe(PROVEN_LIE * 2)
    expect(scoreOf(view({ viewerId: 'p1', rounds, findings: [] }), 'p3')).toBe(PROVEN_LIE)
  })
})

describe('isDiscredited', () => {
  it('증명된 위증이 한 번이라도 있으면 참이다', () => {
    const table = trustFrom(view({ rounds: [round(3, { challenge: caught('p3') })] }))

    expect(isDiscredited(table.get('p3'))).toBe(true)
  })

  it('참으로 공개된 것만 있으면 거짓이다', () => {
    const table = trustFrom(
      view({ rounds: [round(3, { published: [{ playerId: 'p3', truthful: true }] })] }),
    )

    expect(isDiscredited(table.get('p3'))).toBe(false)
  })

  it('기록이 없는 좌석은 의심하지 않는다', () => {
    expect(isDiscredited(undefined)).toBe(false)
  })

  it('참이 쌓여도 한 번의 위증을 덮지 못한다', () => {
    /*
     * 비대칭이 의도다. 한 번 참이었다고 정직한 사람이 되는 것은 아니지만,
     * 한 번 거짓이면 «거짓말을 할 수 있는 사람»이라는 사실이 확정된다.
     */
    const v = view({
      rounds: [
        round(1, { published: [{ playerId: 'p3', truthful: true }] }),
        round(2, { published: [{ playerId: 'p3', truthful: true }] }),
        round(3, { published: [{ playerId: 'p3', truthful: true }] }),
        round(4, { challenge: caught('p3') }),
      ],
    })

    expect(isDiscredited(trustFrom(v).get('p3'))).toBe(true)
  })
})
