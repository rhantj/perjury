import { cardName } from '../engine/cards'
import type { CardId } from '../engine/types'
import type { Scenario } from './scenarios'

/**
 * 카드 «표시 이름». 엔진은 건드리지 않는다 — 카드 id도 장수도 그대로고, 화면에 쓰는 글자만 바꾼다.
 *
 * 이름을 엔진에서 갈아끼우지 않는 이유는 시나리오가 룰이 아니기 때문이다.
 * 엔진이 시나리오를 알면 «제안·반증·승패»가 콘텐츠에 묶여 테스트가 시나리오마다 갈라진다.
 *
 * 용의자 6명은 시나리오와 무관하게 고정이다(docs/decisions/002). 바뀌는 것은 수단 4·장소 5뿐이라
 * 폴백 대사 풀을 한 벌로 유지할 수 있다.
 */

const MEANS: readonly CardId[] = ['w1', 'w2', 'w3', 'w4']
const PLACES: readonly CardId[] = ['p1', 'p2', 'p3', 'p4', 'p5']
const SUSPECTS: readonly CardId[] = ['s1', 's2', 's3', 's4', 's5', 's6']

export function cardLabel(scenario: Scenario, id: CardId): string {
  const means = MEANS.indexOf(id)
  if (means >= 0) return scenario.means[means] ?? cardName(id)

  const place = PLACES.indexOf(id)
  if (place >= 0) return scenario.places[place] ?? cardName(id)

  return cardName(id)
}

/**
 * 용의자의 직함. 이름은 고정이고 직함만 사건을 따라간다 —
 * 같은 «강도윤»이 저택에서는 장남이고 극장에서는 주연이다.
 */
export function suspectTitle(scenario: Scenario, characterId: CardId): string | null {
  const index = SUSPECTS.indexOf(characterId)
  if (index < 0) return null
  return scenario.titles[index]?.ko ?? null
}
