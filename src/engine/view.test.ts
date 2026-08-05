import { describe, expect, it } from 'vitest'
import { challenge, skipChallenge } from './challenge'
import { parley } from './parley'
import { accuse, nextRound } from './progress'
import { declareAll, suggest } from './round'
import { createGame } from './setup'
import { usePower } from './power'
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

/**
 * 대사는 소리내어 한 말이라 전원이 들었다. 그래서 시야에 실린다.
 * 반면 isPerjury는 그 말이 «참인지»라서 계속 시야 밖이다 — 둘을 헷갈리면 이의제기가 무의미해진다.
 */
describe('viewFor — 대사', () => {
  function spoken(): GameState {
    const claims = new Map<PlayerId, Claim>([
      ['p1', { kind: 'refute', cardId: 'w1' }],
      ['p2', { kind: 'pass' }],
      ['p3', { kind: 'refute', cardId: 'p1' }], // 위증
      ['p4', { kind: 'pass' }],
      ['p5', { kind: 'pass' }],
    ])
    return declareAll(
      suggest(staged(), 'p0', SUGGESTION, '이 셋을 상 위에 올리겠소'),
      claims,
      new Map([['p3', '그 물건이라면 내 방에 있소']]),
    )
  }

  it('제안 대사가 시야에 실린다', () => {
    expect(viewFor(spoken(), 'p1').rounds[0]?.suggestionLine).toBe('이 셋을 상 위에 올리겠소')
  })

  it('남의 반증 대사도 보인다 — 모두가 들은 말이다', () => {
    const declarations = viewFor(spoken(), 'p1').rounds[0]?.declarations ?? []

    expect(declarations.find((d) => d.playerId === 'p3')?.line).toBe('그 물건이라면 내 방에 있소')
    expect(declarations.find((d) => d.playerId === 'p2')?.line).toBeNull()
  })

  it('대사가 실려도 위증 여부는 여전히 새지 않는다', () => {
    for (const declaration of viewFor(spoken(), 'p1').rounds[0]?.declarations ?? []) {
      expect(declaration).not.toHaveProperty('isPerjury')
    }
  })
})

describe('viewFor — 밀담은 낀 두 사람에게만 보인다', () => {
  /** 사람(p0)이 상대 하나와 밀담한 직후의 «그 라운드» 기록을 만든다. */
  function afterParley() {
    const base = createGame({ seed: 'parley-view', humanIndex: 0 })
    const hands: CardId[][] = [
      ['s2', 's3'],
      ['s4', 's5'],
      ['s6', 'w2'],
      ['w3', 'w4'],
      ['p2', 'p3'],
      ['p4', 'p5'],
    ]
    const state: GameState = {
      ...base,
      solution: { suspect: 's1', weapon: 'w1', place: 'p1' },
      players: base.players.map((p, i) => ({ ...p, isHuman: i === 0, hand: hands[i] ?? [] })),
    }
    const suggesterId = state.players[state.turnIndex]?.id
    if (!suggesterId) throw new Error('제안자가 없다')
    const claims = new Map<PlayerId, Claim>(
      state.players.filter((p) => p.id !== suggesterId).map((p) => [p.id, { kind: 'pass' }]),
    )
    const whisper = skipChallenge(
      declareAll(suggest(state, suggesterId, { suspect: 's1', weapon: 'w1', place: 'p1' }), claims),
    )

    const human = whisper.players[0]
    const target = whisper.players[1]
    const bystander = whisper.players[2]
    if (!human || !target || !bystander) throw new Error('자리가 모자란다')

    return {
      state: parley(whisper, target.id, '왜 침묵했지', '아무것도 못 봤소'),
      humanId: human.id,
      targetId: target.id,
      bystanderId: bystander.id,
    }
  }

  it('사람에게는 자기가 건 밀담이 보인다', () => {
    const { state, humanId } = afterParley()

    expect(viewFor(state, humanId).rounds[0]?.parleys[0]?.replyLine).toBe('아무것도 못 봤소')
  })

  it('상대에게는 보인다 — 이것이 다음 라운드 프롬프트로 되돌아간다', () => {
    const { state, targetId } = afterParley()

    expect(viewFor(state, targetId).rounds[0]?.parleys[0]?.askLine).toBe('왜 침묵했지')
  })

  it('제3자에게는 밀담이 있었다는 사실조차 보이지 않는다', () => {
    const { state, bystanderId } = afterParley()

    expect(viewFor(state, bystanderId).rounds[0]?.parleys).toEqual([])
  })
})

describe('viewFor — 능력으로 확인한 것', () => {
  it('내 앞으로 온 것만 시야에 실린다', () => {
    const base = staged()
    const after = usePower(base, 'p0', { kind: 'inspect-hand', targetId: 'p2' })

    expect(viewFor(after, 'p0').findings).toHaveLength(1)
    expect(viewFor(after, 'p1').findings).toHaveLength(0)
  })

  it('능력을 쓰기 전에는 비어 있다', () => {
    expect(viewFor(staged(), 'p0').findings).toEqual([])
  })

  /** 확인한 것은 «사실»이다. 남의 손패가 그대로 나가는 셈이라 대상이 맞는지 못을 박는다. */
  it('확인한 카드는 대상이 실제로 쥔 것이다', () => {
    const base = staged()
    const after = usePower(base, 'p0', { kind: 'inspect-hand', targetId: 'p2' })
    const found = viewFor(after, 'p0').findings[0]?.finding

    if (found?.kind !== 'hand') throw new Error('finding 종류가 다르다')
    expect(HANDS[2]).toContain(found.cardId)
  })
})

describe('viewFor — 전화교환수의 엿듣기', () => {
  /** 사람이 아니고 밀담 상대도 아닌 좌석이 엿듣는다. 그 벽을 넘는 능력은 이것뿐이다. */
  function eavesdropped() {
    const base = createGame({ seed: 'eaves', humanIndex: 0 })
    const human = base.players.find((p) => p.isHuman)
    const others = base.players.filter((p) => !p.isHuman)
    const target = others[0]
    const listener = others[1]
    if (!human || !target || !listener) throw new Error('자리가 모자란다')

    const whisper: GameState = {
      ...base,
      phase: 'whisper',
      rounds: [
        {
          round: 1,
          suggesterId: human.id,
          suggestion: { suspect: 's1', weapon: 'w1', place: 'p1' },
          suggestionLine: null,
          declarations: [],
          challenge: null,
          exposed: [],
          published: [],
          parleys: [{ targetId: target.id, askLine: '왜 침묵했지', replyLine: '못 봤소' }],
        },
      ],
    }
    const bystander = others[2]
    if (!bystander) throw new Error('제3자가 없다')
    return { whisper, listenerId: listener.id, bystanderId: bystander.id }
  }

  it('능력이 없으면 남의 밀담은 보이지 않는다', () => {
    const { whisper, listenerId } = eavesdropped()

    expect(viewFor(whisper, listenerId).rounds[0]?.parleys).toEqual([])
  })

  it('엿듣는 좌석에는 자기가 끼지 않은 밀담도 실린다', () => {
    const { whisper, listenerId } = eavesdropped()
    const listening = usePower(whisper, listenerId, { kind: 'eavesdrop' })

    expect(listening.rounds[0]?.parleys).toHaveLength(1)
    expect(viewFor(listening, listenerId).rounds[0]?.parleys[0]?.replyLine).toBe('못 봤소')
  })

  /** 엿듣기는 자기 시야만 넓힌다. 남의 시야는 그대로여야 한다. */
  it('엿들어도 다른 좌석의 시야는 그대로다', () => {
    const { whisper, listenerId, bystanderId } = eavesdropped()
    const listening = usePower(whisper, listenerId, { kind: 'eavesdrop' })

    expect(viewFor(listening, bystanderId).rounds[0]?.parleys).toEqual([])
  })
})
