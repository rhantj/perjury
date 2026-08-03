import mansion from '../assets/scenarios/mansion.webp'
import informer from '../assets/scenarios/informer.webp'
import opium from '../assets/scenarios/opium.webp'
import theater from '../assets/scenarios/theater.webp'

/**
 * 사건 선택(1막) 카드를 훑을 때 배경으로 까는 사진. 사건이 한눈에 읽히는 한 장을 골랐다
 * — mansion=쓰러진 의자와 서재(살인 현장), informer=잉크가 피처럼 쏟아진 인쇄소,
 * opium=아편대 놓인 방, theater=먼지 앉은 분장실. 카드 자체가 아니라 «이 사건의 공기»를
 * 보여주는 자리라 손패 사진(place-art.ts)과는 다른 표다.
 */
export const SCENARIO_ART: Record<string, string> = {
  mansion,
  informer,
  opium,
  theater,
}
