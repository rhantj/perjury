import s1 from '../assets/suspects/s1.webp'
import s2 from '../assets/suspects/s2.webp'
import s3 from '../assets/suspects/s3.webp'
import s4 from '../assets/suspects/s4.webp'
import s5 from '../assets/suspects/s5.webp'
import s6 from '../assets/suspects/s6.webp'
import type { CardId } from '../engine/types'

/**
 * 용의자 조서 초상. 원본(docs/image/suspect/, PNG 6장)은 리포에 넣지 않는다 — role-art.ts와 같은 이유.
 * 순번(0~5)이 곧 카드 id(s1~s6) 순서다 — labels.ts의 SUSPECTS 배열과 같다.
 */
export const SUSPECT_ART: readonly string[] = [s1, s2, s3, s4, s5, s6]

const ORDER: readonly CardId[] = ['s1', 's2', 's3', 's4', 's5', 's6']

/** 손패의 용의자 카드 id(예: 's5')로 초상을 찾는다. 용의자가 아니면 undefined. */
export function suspectArtFor(id: CardId): string | undefined {
  const index = ORDER.indexOf(id)
  return index >= 0 ? SUSPECT_ART[index] : undefined
}
