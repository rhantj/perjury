import { describe, expect, it } from 'vitest'
import { tally } from './vote'
import type { Suggestion, Vote } from './types'

function votes(entries: [string, Suggestion][]): Vote[] {
  return entries.map(([playerId, accusation]) => ({ playerId, accusation, line: null }))
}

describe('tally — 칸별 다수결', () => {
  it('각 칸에서 최다 득표 카드를 뽑는다', () => {
    const result = tally(
      votes([
        ['p1', { suspect: 's1', weapon: 'w1', place: 'p1' }],
        ['p2', { suspect: 's1', weapon: 'w2', place: 'p1' }],
        ['p3', { suspect: 's2', weapon: 'w1', place: 'p1' }],
      ]),
      'seed',
    )

    expect(result).toEqual({ suspect: 's1', weapon: 'w1', place: 'p1' })
  })

  it('칸을 따로 세므로 아무도 내지 않은 조합이 나올 수 있다', () => {
    const result = tally(
      votes([
        ['p1', { suspect: 's1', weapon: 'w2', place: 'p2' }],
        ['p2', { suspect: 's2', weapon: 'w1', place: 'p2' }],
        ['p3', { suspect: 's1', weapon: 'w1', place: 'p3' }],
      ]),
      'seed',
    )

    expect(result).toEqual({ suspect: 's1', weapon: 'w1', place: 'p2' })
  })

  it('투표 순서가 바뀌어도 결과가 같다', () => {
    const list = votes([
      ['p1', { suspect: 's1', weapon: 'w1', place: 'p1' }],
      ['p2', { suspect: 's2', weapon: 'w2', place: 'p2' }],
      ['p3', { suspect: 's1', weapon: 'w2', place: 'p3' }],
    ])

    expect(tally([...list].reverse(), 'seed')).toEqual(tally(list, 'seed'))
  })

  it('동률은 시드로 갈리고 항상 같은 답이 나온다', () => {
    const list = votes([
      ['p1', { suspect: 's1', weapon: 'w1', place: 'p1' }],
      ['p2', { suspect: 's2', weapon: 'w2', place: 'p2' }],
    ])

    const first = tally(list, 'tie')
    expect(tally(list, 'tie')).toEqual(first)
    expect(['s1', 's2']).toContain(first.suspect)
  })

  it('시드가 다르면 동률이 다르게 갈릴 수 있다', () => {
    const list = votes([
      ['p1', { suspect: 's1', weapon: 'w1', place: 'p1' }],
      ['p2', { suspect: 's2', weapon: 'w2', place: 'p2' }],
    ])

    const picked = new Set(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((s) => tally(list, s).suspect),
    )

    expect(picked.size).toBe(2)
  })

  it('투표가 없으면 집계할 수 없다', () => {
    expect(() => tally([], 'seed')).toThrow()
  })
})
