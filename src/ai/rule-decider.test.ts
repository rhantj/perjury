import { describe, expect, it } from 'vitest'
import { suggest } from '../engine/round'
import { createGame } from '../engine/setup'
import { viewFor } from '../engine/view'
import type { GameView, RoundView } from '../engine/view'
import type { Suggestion } from '../engine/types'
import { accusationFrom, claimFrom, suggestionFrom, voteFrom } from './rules'
import { createRuleDecider, ruleDeciderForRound } from './rule-decider'

const SEED = 'rule-decider'

function firstPlayerId(index: number): string {
  return `p${index}`
}

describe('createRuleDecider — rules.ts와 같은 결과', () => {
  it('제안이 suggestionFrom과 일치한다', async () => {
    const game = createGame({ seed: SEED, humanIndex: 0 })
    const view = viewFor(game, firstPlayerId(1))
    const expected = suggestionFrom(view, `${SEED}:sg:${game.round}:p1`)

    expect((await createRuleDecider(SEED).chooseSuggestion(view)).value).toEqual(expected)
  })

  it('반증 선언이 claimFrom과 일치한다', async () => {
    // claimFrom은 진행 중인 제안이 없으면 던진다. 제안을 하나 넣고 시작한다.
    const game = createGame({ seed: SEED, humanIndex: 0 })
    const suggester = game.players[game.turnIndex]
    if (!suggester) throw new Error('제안자가 없다')
    const started = suggest(game, suggester.id, { suspect: 's1', weapon: 'w1', place: 'p1' })
    const view = viewFor(started, firstPlayerId(2))
    const expected = claimFrom(view, `${SEED}:cl:${started.round}:p2`)

    expect((await createRuleDecider(SEED).chooseClaim(view)).value).toEqual(expected)
  })

  it('최종 고발이 voteFrom과 일치한다', async () => {
    const game = createGame({ seed: SEED, humanIndex: 0 })
    const view = viewFor(game, firstPlayerId(3))
    const expected = voteFrom(view, `${SEED}:vote:${game.round}:p3`)

    expect((await createRuleDecider(SEED).chooseAccusation(view)).value).toEqual(expected)
  })

  it('시드가 제안에 실제로 반영된다', async () => {
    const game = createGame({ seed: SEED, humanIndex: 0 })
    const view = viewFor(game, firstPlayerId(1))

    // 후보가 5×3×5로 좁아 특정 두 시드가 우연히 같은 조합을 내는 일이 있다.
    // 두 개만 비교하면 그 우연에 테스트가 걸린다. 여러 시드를 훑어 판단한다.
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        createRuleDecider(`seed-${i}`).chooseSuggestion(view),
      ),
    )
    const distinct = new Set(
      results.map((r) => `${r.value.suspect}/${r.value.weapon}/${r.value.place}`),
    )

    expect(distinct.size).toBeGreaterThan(1)
  })
})

describe('ruleDeciderForRound', () => {
  it('라운드가 달라도 같은 인스턴스를 준다 — 규칙 기반은 라운드에 의존하지 않는다', () => {
    const forRound = ruleDeciderForRound(SEED)

    expect(forRound(1)).toBe(forRound(5))
  })
})

/*
 * 정보상은 밀담 상대의 참·거짓을 가려내는 능력인데, 폴백이 truthful을 늘 null로 주면
 * 엔진이 판정을 건너뛴다(engine/parley.ts). 프록시가 죽어 있는 동안은 모든 밀담이
 * 폴백이므로, 그 상태에서 이 능력은 판 내내 아무것도 얻지 못한다.
 * 완주 테스트로는 안 잡힌다 — 판은 그대로 끝까지 굴러가기 때문이다.
 */
describe('speakInParley — 폴백도 판정할 수 있는 말을 한다', () => {
  /*
   * salt는 «판단자 시드 : 라운드 : 시야 주인»이라 판 시드를 흔들어도 값이 그대로다.
   * 흔들 것은 판단자 시드다 — 판마다 다른 좌석·다른 라운드가 여기에 해당한다.
   */
  const views = Array.from({ length: 12 }, (_, i) =>
    viewFor(createGame({ seed: `parley-${i}`, humanIndex: 0 }), firstPlayerId(1)),
  )
  const sayAll = () =>
    Promise.all(
      views.map((view, i) => createRuleDecider(`${SEED}-${i}`).speakInParley(view, '패를 보자')),
    )

  /* speakInParley는 «말하지 않음»으로 null을 줄 수 있다. 폴백은 그 갈래를 쓰지 않는다. */
  const spoken = async () => {
    const said = await sayAll()
    const lines = said.filter((s): s is NonNullable<typeof s> => s !== null)
    expect(lines).toHaveLength(views.length)
    return lines
  }

  it('truthful이 늘 null이지 않다', async () => {
    const said = await spoken()

    expect(said.every((s) => s.truthful === null)).toBe(false)
  })

  it('참과 거짓이 모두 나온다', async () => {
    const kinds = new Set((await spoken()).map((s) => s.truthful))

    expect(kinds.has(true)).toBe(true)
    expect(kinds.has(false)).toBe(true)
  })

  it('같은 시야면 같은 말과 같은 판정이 나온다', async () => {
    const view = views[0]
    if (!view) throw new Error('시야가 없다')
    const once = await createRuleDecider(SEED).speakInParley(view, '패를 보자')
    const twice = await createRuleDecider(SEED).speakInParley(view, '패를 보자')

    expect(once).toEqual(twice)
  })
})

describe('accusationFrom — 규칙 기반 조기 고발 판단', () => {
  /**
   * 「전원이 없다」를 침묵 선언으로 세운다.
   *
   * 라운드 하나에 여섯 좌석 전부의 pass를 담는다. 실제 판은 추첨으로 둘만 선언하지만,
   * 여기서 보는 것은 **침묵이 쌓였을 때 결론이 맞는가**이지 추첨이 아니다.
   * 추첨 자체는 engine/round.test.ts의 「추첨」 블록이 본다.
   */
  function allPassedOn(view: GameView, suggestion: Suggestion): GameView {
    const round: RoundView = {
      round: 1,
      suggesterId: view.players[0]?.id ?? 'p0',
      suggestion,
      suggestionLine: null,
      responderIds: view.players.map((p) => p.id),
      declarations: view.players.map((p) => ({
        playerId: p.id,
        claim: { kind: 'pass' as const },
        line: null,
      })),
      challenge: null,
      exposed: [],
      published: [],
      parleys: [],
    }
    return { ...view, rounds: [...view.rounds, round] }
  }

  /** 손패를 비운 시야. 손에 든 카드는 「내가 없다」에서 빠지므로 배치를 흐린다. */
  function emptyHanded(): GameView {
    const view = viewFor(createGame({ seed: 'accuse-rule', humanIndex: 0 }), 'p1')
    return { ...view, players: view.players.map((p) => ({ ...p, hand: p.isMe ? [] : null })) }
  }

  const ANSWER: Suggestion = { suspect: 's3', weapon: 'w2', place: 'p4' }

  it('판이 막 시작하면 확신이 없어 고발하지 않는다', () => {
    expect(accusationFrom(emptyHanded())).toBeNull()
  })

  /*
   * 전원이 세 칸 모두에 대해 침묵했다 = 아무도 그 셋을 안 갖고 있다.
   * 남는 자리는 봉투뿐이므로 그것이 답이다.
   */
  it('세 칸 모두 전원이 없다고 드러나면 그 조합을 낸다', () => {
    expect(accusationFrom(allPassedOn(emptyHanded(), ANSWER))).toEqual(ANSWER)
  })

  /** 한 칸이라도 「전원이 없다」에 못 닿으면 외치지 않는다. 틀리면 탈락이라 부분 확신은 부족하다. */
  it('한 칸이라도 확정되지 않으면 고발하지 않는다', () => {
    const view = emptyHanded()
    const first = view.players[0]
    if (!first) throw new Error('자리가 없다')
    const passed = allPassedOn(view, ANSWER)
    const last = passed.rounds[passed.rounds.length - 1]
    if (!last) throw new Error('라운드가 없다')
    // 한 좌석이 반증했다고 바꾼다 — 셋 중 하나를 쥐었다는 뜻이라 아무것도 확정되지 않는다.
    const declarations = last.declarations.map((d) =>
      d.playerId === first.id ? { ...d, claim: { kind: 'refute' as const, cardId: null } } : d,
    )
    const bent: GameView = {
      ...passed,
      rounds: [...passed.rounds.slice(0, -1), { ...last, declarations }],
    }

    expect(accusationFrom(bent)).toBeNull()
  })

  /** 내 손패에 있는 카드는 내가 갖고 있으므로 정답일 수 없다 — 그 칸은 확정되지 않는다. */
  it('내가 쥔 카드는 정답으로 짚지 않는다', () => {
    const base = emptyHanded()
    const mine: GameView = {
      ...base,
      players: base.players.map((p) => (p.isMe ? { ...p, hand: [ANSWER.weapon] } : p)),
    }

    expect(accusationFrom(allPassedOn(mine, ANSWER))).toBeNull()
  })
})
