import mansionTable from '../assets/tables/mansion.webp'
import type { Scenario } from './scenarios'

/**
 * 원탁 배경 사진. 좌석 카드 뒤에 깔아 «진짜 의자·상」이 있는 방으로 보이게 한다.
 * 사진이 사건별로 도착하는 대로 채운다 — 없는 사건은 undefined로 두면
 * Table.tsx가 기존 추상 타원 그대로를 보여준다.
 */
const TABLE_ART: Partial<Record<string, string>> = {
  mansion: mansionTable,
}

export function tableArtFor(scenario: Scenario): string | undefined {
  return TABLE_ART[scenario.id]
}
