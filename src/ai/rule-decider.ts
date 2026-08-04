import { challengeTargetFrom, claimFrom, suggestionFrom, voteFrom } from './rules'
import { silent } from './decider'
import type { Decider, DeciderForRound } from './decider'
import type { GameView } from '../engine/view'

/**
 * 규칙 기반 Decider. 폴백 본체다 — LLM이 죽어도 이것으로 판이 끝난다.
 *
 * seed를 인수로 받아 이 안에 가둔다. Decider 인터페이스는 GameView만 받으므로
 * seed가 밖으로 나갈 통로가 없다. LLM 구현체는 seed를 아예 모른다 —
 * 알면 판을 재계산해 정답을 뽑을 수 있기 때문이다.
 */

/** flow.ts가 쓰던 salt와 글자 그대로 같아야 한다. 다르면 같은 시드가 다른 판이 된다. */
function saltOf(seed: string, kind: string, view: GameView): string {
  return `${seed}:${kind}:${view.round}:${view.viewerId}`
}

/**
 * 대사는 만들지 않는다(silent). 사전생성 대사 풀은 D8 작업이고, 여기서 급조하면
 * 폴백이 «LLM 흉내»를 내면서 실제로는 같은 문장을 반복하게 된다.
 */
export function createRuleDecider(seed: string): Decider {
  return {
    chooseSuggestion: async (view) => silent(suggestionFrom(view, saltOf(seed, 'sg', view))),
    chooseClaim: async (view) => silent(claimFrom(view, saltOf(seed, 'cl', view))),
    chooseChallengeTarget: async (view) => silent(challengeTargetFrom(view)),
    chooseAccusation: async (view) => silent(voteFrom(view, saltOf(seed, 'vote', view))),
  }
}

/** 규칙 기반은 라운드에 따라 달라지지 않으므로 인스턴스 하나를 재사용한다. */
export function ruleDeciderForRound(seed: string): DeciderForRound {
  const decider = createRuleDecider(seed)
  return () => decider
}
