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
 * 원본 PNG(1792×2400, 장당 6~7MB)는 리포에 넣지 않는다 — 화면에서 최대 448px로 그리는 그림을
 * 그대로 실어 나를 이유가 없다. 여기 있는 것은 폭 760px WebP 사본(10장 합쳐 767KB)이다.
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

/**
 * 각 그림의 실제 픽셀 크기. <img>의 width·height 속성에 그대로 넣어 로딩 전에도
 * 브라우저가 높이를 알게 한다 — 없으면 그림이 도착하는 순간 카드가 튄다.
 *
 * reporter만 비율이 다르다(760×882, 나머지는 760×1018). 그래서 열 장 공통으로 한 값을
 * 박을 수 없고, 카드 높이도 CSS가 아니라 그림이 정하게 둔다(.duty__card에 aspect-ratio 없음).
 */
export const ROLE_ART_SIZE: Record<string, { readonly w: number; readonly h: number }> = {
  coroner: { w: 760, h: 1018 },
  constable: { w: 760, h: 1018 },
  reporter: { w: 760, h: 882 },
  lawyer: { w: 760, h: 1018 },
  broker: { w: 760, h: 1018 },
  operator: { w: 760, h: 1018 },
  apothecary: { w: 760, h: 1018 },
  photographer: { w: 760, h: 1018 },
  trickster: { w: 760, h: 1018 },
  spy: { w: 760, h: 1018 },
}
