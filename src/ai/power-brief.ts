import { needsOf } from '../engine/power'
import type { PowerNeeds } from '../engine/power'
import type { Role } from '../content/roles'
import type { PlayerId } from '../engine/types'

/**
 * 좌석이 쓸 수 있는 능력을 «워커가 이해할 수 있는 만큼»으로 줄인 것.
 *
 * 직업 이름도 능력 종류도 넣지 않는다. 워커는 프롬프트에 붙일 문구 하나와
 * «무엇을 고르게 할 것인가»만 알면 되고, 그 이상을 알면 룰이 두 군데로 갈린다(설계 §5.3).
 *
 * 이 값은 **그 좌석 자신의 정보**다. 손패·진영과 같은 자리라 전지적 정보 금지에 걸리지 않는다.
 */
export interface PowerBrief {
  /** 사람이 읽는 능력 문구. 프롬프트에 그대로 들어간다. */
  readonly text: string
  /** 무엇을 골라야 하는가. 'none'은 대상 없이 발동하는 능력이다. */
  readonly needs: PowerNeeds
}

/** 좌석 → 능력 개요. 쓸 능력이 없으면 null이다. */
export type PowerLookup = (viewerId: PlayerId) => PowerBrief | null

/** 배정표에서 조회 함수를 만든다. 배정표는 판을 만든 쪽(store)이 이미 갖고 있다. */
export function powerLookup(roles: Readonly<Record<PlayerId, Role>>): PowerLookup {
  return (viewerId) => {
    const role = roles[viewerId]
    if (!role || role.effect === null) return null
    return { text: role.power, needs: needsOf(role.effect) }
  }
}
