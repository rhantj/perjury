import { suggest } from './round'
import type { GameState } from './types'

/**
 * **테스트 전용 헬퍼.** 앱 코드에서 부르지 않는다 — 여기 있는 것은 룰을 «끄는» 도구다.
 *
 * 반증 의무는 추첨으로 두 좌석만 진다(engine/setup.ts의 REFUTER_COUNT). 그런데 위증
 * 판정·이의제기·능력처럼 그 «뒤에» 오는 룰을 검증하는 테스트는 「p3이 위증한다」처럼
 * 특정 좌석이 선언한다는 배치를 세워 두고 시작한다. 추첨이 그 좌석을 빼면 배치 자체가
 * 성립하지 않아, 검증 대상과 아무 상관 없는 이유로 테스트가 죽는다.
 *
 * 그래서 그런 테스트에서는 추첨을 무력화하고 예전처럼 전원이 선언하게 둔다.
 * **추첨 자체의 검증은 round.test.ts의 「추첨」 블록이 진짜 suggest로 한다.**
 */
export function everyoneResponds(state: GameState): GameState {
  const record = state.rounds[state.rounds.length - 1]
  if (!record) throw new Error('진행 중인 라운드가 없다')
  return {
    ...state,
    rounds: [
      ...state.rounds.slice(0, -1),
      {
        ...record,
        responderIds: state.players.filter((p) => p.id !== record.suggesterId).map((p) => p.id),
      },
    ],
  }
}

/** suggest + 추첨 무력화. 기존 테스트가 suggest 대신 이걸 부르면 예전 배치가 그대로 산다. */
export function suggestAll(...args: Parameters<typeof suggest>): GameState {
  return everyoneResponds(suggest(...args))
}
