import { describe, expect, it } from 'vitest'
import { suggest } from '../engine/round'
import { createGame } from '../engine/setup'
import { viewFor } from '../engine/view'
import type { GameView } from '../engine/view'
import { CARDS } from '../engine/cards'
import type { CardId, Suggestion } from '../engine/types'
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
   * 한 좌석의 공개 카드를 조작해 소거를 원하는 만큼 진행시킨다.
   *
   * revealed를 쓰는 이유는 그것이 **전원 공개**라 시야 주인이 누구든 같은 결론에
   * 닿기 때문이다. 손패로 세우면 그 좌석에서만 성립해 테스트가 배치에 얽힌다.
   */
  function withRevealed(view: GameView, revealed: readonly CardId[]): GameView {
    const first = view.players[0]
    if (!first) throw new Error('자리가 없다')
    return { ...view, players: [{ ...first, revealed }, ...view.players.slice(1)] }
  }

  /** kind별로 keep 한 장만 남기고 전부 공개된 카드로 만든다. */
  function allButOne(keep: Suggestion): CardId[] {
    const kept = [keep.suspect, keep.weapon, keep.place]
    return CARDS.map((c) => c.id).filter((id) => !kept.includes(id))
  }

  function freshView(): GameView {
    return viewFor(createGame({ seed: 'accuse-rule', humanIndex: 0 }), 'p1')
  }

  it('판이 막 시작하면 확신이 없어 고발하지 않는다', () => {
    expect(accusationFrom(freshView())).toBeNull()
  })

  it('세 칸이 모두 한 장으로 좁혀지면 그 조합을 낸다', () => {
    const answer: Suggestion = { suspect: 's3', weapon: 'w2', place: 'p4' }
    const view = withRevealed(freshView(), allButOne(answer))

    expect(accusationFrom(view)).toEqual(answer)
  })

  /** 한 칸이라도 둘 이상 남으면 외치지 않는다. 틀리면 탈락이라 「그럴듯하다」로는 부족하다. */
  it('한 칸이라도 후보가 둘이면 고발하지 않는다', () => {
    const answer: Suggestion = { suspect: 's3', weapon: 'w2', place: 'p4' }
    // 흉기 한 장을 후보로 되살린다 — w2와 w3 둘이 남는다.
    const revealed = allButOne(answer).filter((id) => id !== 'w3')
    const view = withRevealed(freshView(), revealed)

    expect(accusationFrom(view)).toBeNull()
  })

  /**
   * 소거가 모순으로 전부 지워지면 candidates가 전체로 되돌린다. 그때 「한 장」이 되어
   * 엉뚱한 고발이 나가면 안 된다 — 되돌린 목록은 길이가 1이 아니므로 null이어야 한다.
   */
  it('모든 카드가 지워진 모순 상태에서는 고발하지 않는다', () => {
    const view = withRevealed(freshView(), CARDS.map((c) => c.id))

    expect(accusationFrom(view)).toBeNull()
  })
})
