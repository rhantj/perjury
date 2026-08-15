import { describe, expect, it } from 'vitest'
import { cardsOfKind } from '../engine/cards'
import { createGame } from '../engine/setup'
import { viewFor } from '../engine/view'
import type { CardId, Suggestion } from '../engine/types'
import type { GameView, RoundView } from '../engine/view'
import { suggestionFrom } from './rules'

/*
 * 덫 제안. 비공개 반증(룰 개편 1-B)에서 위증을 잡는 유일한 길이라 조용히 사라지면 안 된다.
 *
 * 이 동작이 없으면 판이 «굴러가긴 하는데 아무도 안 잡히는» 상태가 된다 —
 * 완주 테스트는 그래도 통과하므로 회귀가 눈에 띄지 않는다. 그래서 여기서 직접 붙든다.
 */
describe('suggestionFrom — 덫 제안', () => {
  const view = viewFor(createGame({ seed: 'trap' }), 'p0')
  const hand = view.players.find((p) => p.isMe)?.hand ?? []
  const many = Array.from({ length: 40 }, (_, i) => suggestionFrom(view, `salt-${i}`))
  const baited = many.filter((s) => [s.suspect, s.weapon, s.place].some((c) => hand.includes(c)))

  it('내 손패 카드를 미끼로 섞어 제안하는 경우가 있다', () => {
    expect(hand.length).toBeGreaterThan(0)
    expect(baited.length).toBeGreaterThan(0)
  })

  /* 늘 덫이면 소거가 진행되지 않는다. 미끼 칸은 이미 답이 아닌 걸 아는 카드다. */
  it('그래도 대부분은 모르는 카드로 제안한다', () => {
    expect(baited.length).toBeLessThan(many.length)
  })

  it('같은 salt는 같은 제안을 낸다', () => {
    expect(suggestionFrom(view, 'same')).toEqual(suggestionFrom(view, 'same'))
  })
})

/*
 * 신뢰도가 소거 계산을 되돌린다.
 *
 * 이게 없으면 위증이 그 회차에서 소비되고 끝난다 — 거짓 반증으로 지워진 후보는 잡힌 뒤에도
 * 계속 지워진 채로 남는다. 「쟤는 이미 걸렸다」가 판단에 남아야 심리전이 성립한다.
 */
describe('suggestionFrom — 걸린 좌석의 반증은 소거에서 빠진다', () => {
  const base = viewFor(createGame({ seed: 'ledger' }), 'p0')
  const myHand = base.players.find((p) => p.isMe)?.hand ?? []

  /** p1이 거짓 반증에 쓸 카드. 내 손패면 어차피 소거되므로 밖에서 고른다. */
  const bait: CardId =
    cardsOfKind('weapon')
      .map((c) => c.id)
      .find((id) => !myHand.includes(id)) ?? 'w1'

  /* 내가 제안자여야 반증 카드가 보인다(비공개 반증, view.ts의 claimFor). */
  const suggestion: Suggestion = { suspect: 's1', weapon: bait, place: 'p1' }

  const claimed: RoundView = {
    round: 1,
    suggesterId: 'p0',
    suggestion,
    suggestionLine: null,
    responderIds: ['p1', 'p2'],
    declarations: [{ playerId: 'p1', claim: { kind: 'refute', cardId: bait }, line: null }],
    challenge: null,
    exposed: [],
    published: [],
    parleys: [],
  }

  /** 사진사가 p1의 위증을 잡은 회차. 이의제기와 달리 전원이 본다. */
  const caught: RoundView = { ...claimed, round: 5, declarations: [], exposed: ['p1'] }

  const proposalsOf = (v: GameView) =>
    Array.from({ length: 40 }, (_, i) => suggestionFrom(v, `salt-${i}`))

  it('안 걸렸으면 그 카드는 후보에서 사라진다', () => {
    const proposals = proposalsOf({ ...base, rounds: [claimed] })

    expect(proposals.some((s) => s.weapon === bait)).toBe(false)
  })

  it('걸리고 나면 그 카드가 후보로 되살아난다', () => {
    const proposals = proposalsOf({ ...base, rounds: [claimed, caught] })

    expect(proposals.some((s) => s.weapon === bait)).toBe(true)
  })

  it('소급된다 — 걸리기 «전»에 한 반증까지 무효가 된다', () => {
    /*
     * 위 두 테스트가 이미 이것을 보인다(반증은 1회차, 발각은 5회차다).
     * 그래도 따로 세워 둔다 — 「걸린 뒤부터」로 좁히는 구현도 테스트를 통과할 수 있는데,
     * 그러면 판 초반의 거짓말이 영구히 남아 위증의 대가가 절반이 된다.
     */
    const early = proposalsOf({ ...base, rounds: [claimed, caught] })
    const late = proposalsOf({ ...base, rounds: [caught, { ...claimed, round: 9 }] })

    expect(early.some((s) => s.weapon === bait)).toBe(true)
    expect(late.some((s) => s.weapon === bait)).toBe(true)
  })

  it('걸리지 않은 좌석의 반증은 그대로 믿는다', () => {
    const byOther: RoundView = {
      ...claimed,
      declarations: [{ playerId: 'p2', claim: { kind: 'refute', cardId: bait }, line: null }],
    }
    const proposals = proposalsOf({ ...base, rounds: [byOther, caught] })

    expect(proposals.some((s) => s.weapon === bait)).toBe(false)
  })
})
