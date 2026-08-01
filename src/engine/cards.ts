import type { Card, CardId, CardKind } from './types'

/**
 * 카드 15장 = 범인 6 / 흉기 4 / 장소 5.
 *
 * 개수는 룰이다 — 추리표가 한 화면에 들어가는 상한이라 바꾸지 않는다.
 * 이름은 임시다 — 세계관 확정(D7) 때 교체한다.
 */
export const CARDS: readonly Card[] = [
  { id: 's1', kind: 'suspect', name: '강도윤' },
  { id: 's2', kind: 'suspect', name: '서지혜' },
  { id: 's3', kind: 'suspect', name: '문태석' },
  { id: 's4', kind: 'suspect', name: '백나경' },
  { id: 's5', kind: 'suspect', name: '오현우' },
  { id: 's6', kind: 'suspect', name: '임세라' },

  { id: 'w1', kind: 'weapon', name: '대리석 문진' },
  { id: 'w2', kind: 'weapon', name: '넥타이' },
  { id: 'w3', kind: 'weapon', name: '수면제' },
  { id: 'w4', kind: 'weapon', name: '계단' },

  { id: 'p1', kind: 'place', name: '서재' },
  { id: 'p2', kind: 'place', name: '응접실' },
  { id: 'p3', kind: 'place', name: '옥상' },
  { id: 'p4', kind: 'place', name: '지하주차장' },
  { id: 'p5', kind: 'place', name: '별관 복도' },
]

const BY_ID: ReadonlyMap<CardId, Card> = new Map(CARDS.map((c) => [c.id, c]))

export function cardsOfKind(kind: CardKind): readonly Card[] {
  return CARDS.filter((c) => c.kind === kind)
}

export function cardName(id: CardId): string {
  const card = BY_ID.get(id)
  if (!card) throw new Error(`알 수 없는 카드: ${id}`)
  return card.name
}

export function cardKind(id: CardId): CardKind {
  const card = BY_ID.get(id)
  if (!card) throw new Error(`알 수 없는 카드: ${id}`)
  return card.kind
}
