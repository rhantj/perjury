import { describe, expect, it } from 'vitest'
import { suggest } from '../engine/round'
import { createGame } from '../engine/setup'
import { viewFor } from '../engine/view'
import { claimFrom, suggestionFrom, voteFrom } from './rules'
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

    expect(await createRuleDecider(SEED).chooseSuggestion(view)).toEqual(expected)
  })

  it('반증 선언이 claimFrom과 일치한다', async () => {
    // claimFrom은 진행 중인 제안이 없으면 던진다. 제안을 하나 넣고 시작한다.
    const game = createGame({ seed: SEED, humanIndex: 0 })
    const suggester = game.players[game.turnIndex]
    if (!suggester) throw new Error('제안자가 없다')
    const started = suggest(game, suggester.id, { suspect: 's1', weapon: 'w1', place: 'p1' })
    const view = viewFor(started, firstPlayerId(2))
    const expected = claimFrom(view, `${SEED}:cl:${started.round}:p2`)

    expect(await createRuleDecider(SEED).chooseClaim(view)).toEqual(expected)
  })

  it('최종 고발이 voteFrom과 일치한다', async () => {
    const game = createGame({ seed: SEED, humanIndex: 0 })
    const view = viewFor(game, firstPlayerId(3))
    const expected = voteFrom(view, `${SEED}:vote:${game.round}:p3`)

    expect(await createRuleDecider(SEED).chooseAccusation(view)).toEqual(expected)
  })

  it('시드가 다르면 제안도 달라진다', async () => {
    const game = createGame({ seed: SEED, humanIndex: 0 })
    const view = viewFor(game, firstPlayerId(1))

    const a = await createRuleDecider('seed-a').chooseSuggestion(view)
    const b = await createRuleDecider('seed-b').chooseSuggestion(view)

    expect(a).not.toEqual(b)
  })
})

describe('ruleDeciderForRound', () => {
  it('라운드가 달라도 같은 인스턴스를 준다 — 규칙 기반은 라운드에 의존하지 않는다', () => {
    const forRound = ruleDeciderForRound(SEED)

    expect(forRound(1)).toBe(forRound(5))
  })
})
