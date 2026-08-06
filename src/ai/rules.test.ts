import { describe, expect, it } from 'vitest'
import { createGame } from '../engine/setup'
import { viewFor } from '../engine/view'
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
