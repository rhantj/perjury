import { createRng, pickOne } from './rng'
import type { CardId, Suggestion, Vote } from './types'

/**
 * 최다 득표 카드. 동률이면 시드로 가른다.
 *
 * 후보를 정렬한 뒤에 고르는 이유는 투표가 들어온 순서에 결과가 흔들리지 않게 하기 위해서다.
 * Map은 삽입 순서를 유지하므로, 정렬하지 않으면 같은 표에도 순서에 따라 답이 달라진다.
 */
function plurality(cards: readonly CardId[], rng: () => number): CardId {
  const counts = new Map<CardId, number>()
  for (const card of cards) counts.set(card, (counts.get(card) ?? 0) + 1)

  let top = 0
  for (const n of counts.values()) if (n > top) top = n

  const tied = [...counts.entries()]
    .filter(([, n]) => n === top)
    .map(([id]) => id)
    .sort()

  return tied.length === 1 ? (tied[0] as CardId) : pickOne(tied, rng)
}

/**
 * AI 시민들의 표를 하나의 고발로 모은다.
 *
 * 조합 단위가 아니라 칸별로 센다. 조합 단위로 세면 5명이 대부분 1표씩 나뉘어 결정이 안 난다.
 * 칸을 따로 세면 아무도 내지 않은 조합이 나올 수 있는데, 집단 추리는 원래 그렇게 된다.
 * 범인 입장에서는 세 칸 중 하나만 오염시켜도 이긴다는 뜻이기도 하다.
 */
export function tally(votes: readonly Vote[], seed: string): Suggestion {
  if (votes.length === 0) throw new Error('투표가 없다')

  const rng = createRng(`${seed}:tally`)
  return {
    suspect: plurality(
      votes.map((v) => v.accusation.suspect),
      rng,
    ),
    weapon: plurality(
      votes.map((v) => v.accusation.weapon),
      rng,
    ),
    place: plurality(
      votes.map((v) => v.accusation.place),
      rng,
    ),
  }
}
