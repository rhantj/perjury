import apothecary from '../assets/roles/apothecary.webp'
import broker from '../assets/roles/broker.webp'
import constable from '../assets/roles/constable.webp'
import coroner from '../assets/roles/coroner.webp'
import lawyer from '../assets/roles/lawyer.webp'
import operator from '../assets/roles/operator.webp'
import photographer from '../assets/roles/photographer.webp'
import reporter from '../assets/roles/reporter.webp'
import spy from '../assets/roles/spy.webp'
import trickster from '../assets/roles/trickster.webp'

/**
 * 직업 카드 일러스트. 키는 Role.id다.
 *
 * 원본(docs/image/, 15MB PNG 2장)은 리포에 넣지 않는다 — 화면에서 170px로 그리는 그림을
 * 1792×2400으로 실어 나를 이유가 없다. 여기 있는 것은 340px WebP 사본(10장 합쳐 244KB)이다.
 *
 * 정적 import라 Vite가 빌드 시 해시 URL로 바꾸고 base '/perjury/'도 알아서 붙는다.
 * 경로 문자열로 들고 있으면 GitHub Pages에서 전부 404가 난다.
 */
export const ROLE_ART: Record<string, string> = {
  coroner,
  constable,
  reporter,
  lawyer,
  broker,
  operator,
  apothecary,
  photographer,
  trickster,
  spy,
}
