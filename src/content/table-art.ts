import mansionTable from '../assets/tables/mansion.webp'
import informerTable from '../assets/tables/informer.webp'
import opiumTable from '../assets/tables/opium.webp'
import theaterTable from '../assets/tables/theater.webp'
import type { Scenario } from './scenarios'

/**
 * 원탁 배경 사진. 좌석 카드 뒤에 깔아 «진짜 의자·상」이 있는 방으로 보이게 한다.
 * 없는 사건은 undefined로 두면 Table.tsx가 기존 추상 타원 그대로를 보여준다 —
 * 네 사건이 다 찼으므로 지금은 그 경로로 빠지지 않는다.
 *
 * 넉 장 다 1200x670이다. game.css의 .seats--photo::before가 cover로 깔고
 * 위아래로만 bleed를 주므로 좌우가 잘리는 것을 전제로 «가운데에 상 하나» 구도를
 * 맞춰 뒀다. 다른 비율 사진으로 갈아끼우면 상이 화면 밖으로 밀려난다.
 */
const TABLE_ART: Partial<Record<string, string>> = {
  mansion: mansionTable,
  informer: informerTable,
  opium: opiumTable,
  theater: theaterTable,
}

export function tableArtFor(scenario: Scenario): string | undefined {
  return TABLE_ART[scenario.id]
}
