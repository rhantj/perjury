import mansionBookshelves from '../assets/places/mansion/bookshelves.webp'
import mansionRoom from '../assets/places/mansion/room.webp'
import mansionRooftop from '../assets/places/mansion/rooftop.webp'
import mansionCarriage from '../assets/places/mansion/carriage.webp'
import mansionCorridor from '../assets/places/mansion/corridor.webp'
import informerPrint from '../assets/places/informer/print.webp'
import informerBackRoom from '../assets/places/informer/back_room.webp'
import informerUnderground from '../assets/places/informer/underground.webp'
import informerStreet from '../assets/places/informer/street.webp'
import informerWell from '../assets/places/informer/well.webp'
import opiumRoom from '../assets/places/opium/room.webp'
import opiumKitchen from '../assets/places/opium/kitchen.webp'
import opiumBackdoor from '../assets/places/opium/backdoor.webp'
import opiumAttic from '../assets/places/opium/attic.webp'
import opiumWell from '../assets/places/opium/well.webp'
import theaterDressingRoom from '../assets/places/theater/dressing_room.webp'
import theaterBackstage from '../assets/places/theater/backstage.webp'
import theaterAudience from '../assets/places/theater/audience.webp'
import theaterPractice from '../assets/places/theater/practice.webp'
import theaterTicket from '../assets/places/theater/ticket.webp'
import type { CardId } from '../engine/types'
import type { Scenario } from './scenarios'

const ORDER: readonly CardId[] = ['p1', 'p2', 'p3', 'p4', 'p5']

/**
 * 장소 카드 배경. 사진이 사건별로 한 장씩 도착하는 대로 채운다 — 빈 칸은 undefined로 두면
 * HandCard가 기존 조판만 보여준다. 새 사진이 오면(docs/image/place/<사건>/) webp로 변환해
 * src/assets/places/<사건>/에 넣고 이 표에 한 줄만 추가하면 된다.
 */
const PLACE_ART: Record<string, readonly (string | undefined)[]> = {
  mansion: [mansionBookshelves, mansionRoom, mansionRooftop, mansionCarriage, mansionCorridor],
  informer: [informerPrint, informerBackRoom, informerUnderground, informerStreet, informerWell],
  opium: [opiumRoom, opiumKitchen, opiumBackdoor, opiumAttic, opiumWell],
  theater: [theaterDressingRoom, theaterBackstage, theaterAudience, theaterPractice, theaterTicket],
}

export function placeArtFor(scenario: Scenario, id: CardId): string | undefined {
  const index = ORDER.indexOf(id)
  if (index < 0) return undefined
  return PLACE_ART[scenario.id]?.[index]
}
