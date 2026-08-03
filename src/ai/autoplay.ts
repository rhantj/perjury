import type { GameState } from '../engine/types'
import { stepAi } from './flow'
import { ruleDeciderForRound } from './rule-decider'

/**
 * 규칙 기반 에이전트만으로 판을 끝까지 굴린다. LLM 호출은 0회다.
 * 사람 자리도 AI가 대신 둔다.
 *
 * 두 가지 용도가 있다.
 *   1. D3 안전선 검증 — LLM 없이 완주되는가
 *   2. D8 밸런싱 — 같은 조건으로 수천 판을 돌려 승률을 본다
 *
 * Decider를 인수로 받지 않는다. 이 함수의 존재 이유가 "규칙 기반만으로 완주"이므로
 * 다른 Decider를 꽂을 수 있게 열어두면 용도가 흐려진다.
 *
 * 화면에서 쓰는 advanceToHuman과 같은 stepAi를 공유한다.
 * 로직이 두 벌이면 한쪽만 고치는 사고가 난다.
 */
export async function autoPlay(initial: GameState): Promise<GameState> {
  const deciderForRound = ruleDeciderForRound(initial.seed)
  let state = initial

  // 8라운드 × 4페이즈 + 고발이면 충분하다. 넘으면 전이에 구멍이 있다는 뜻이다.
  for (let step = 0; step < 200 && state.phase !== 'over'; step += 1) {
    state = await stepAi(state, deciderForRound(state.round))
  }

  if (state.phase !== 'over') throw new Error('판이 끝나지 않았다 — 전이에 구멍이 있다')
  return state
}
