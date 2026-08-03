import mansionMarble from '../assets/weapons/mansion/marble.webp'
import mansionMuffler from '../assets/weapons/mansion/muffler.webp'
import mansionGlass from '../assets/weapons/mansion/glass.webp'
import mansionStairs from '../assets/weapons/mansion/stairs.webp'
import informerPaper from '../assets/weapons/informer/paper.webp'
import informerSecret from '../assets/weapons/informer/secret.webp'
import informerCode from '../assets/weapons/informer/code.webp'
import informerPhoto from '../assets/weapons/informer/photo.webp'
import opiumPipe from '../assets/weapons/opium/pipe.webp'
import opiumSyringe from '../assets/weapons/opium/syringe.webp'
import opiumBottle from '../assets/weapons/opium/bottle.webp'
import opiumString from '../assets/weapons/opium/string.webp'
import theaterPowder from '../assets/weapons/theater/powder.webp'
import theaterCable from '../assets/weapons/theater/cable.webp'
import theaterKnife from '../assets/weapons/theater/knife.webp'
import theaterGlass from '../assets/weapons/theater/glass.webp'
import type { CardId } from '../engine/types'
import type { Scenario } from './scenarios'

const ORDER: readonly CardId[] = ['w1', 'w2', 'w3', 'w4']

/**
 * 수단 카드 사진. place-art.ts와 같은 구조 — 빈 칸은 undefined로 두면 HandCard가
 * 기존 조판만 보여준다. 새 사진이 오면(docs/image/object/<사건>/) webp로 변환해
 * src/assets/weapons/<사건>/에 넣고 이 표에 한 줄만 추가하면 된다.
 */
const WEAPON_ART: Record<string, readonly (string | undefined)[]> = {
  mansion: [mansionMarble, mansionMuffler, mansionGlass, mansionStairs],
  informer: [informerPaper, informerSecret, informerCode, informerPhoto],
  opium: [opiumPipe, opiumSyringe, opiumBottle, opiumString],
  theater: [theaterPowder, theaterCable, theaterKnife, theaterGlass],
}

export function weaponArtFor(scenario: Scenario, id: CardId): string | undefined {
  const index = ORDER.indexOf(id)
  if (index < 0) return undefined
  return WEAPON_ART[scenario.id]?.[index]
}
