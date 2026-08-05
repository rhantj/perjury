import { challengeTargetFrom, claimFrom, suggestionFrom, voteFrom } from './rules'
import { silent } from './decider'
import { parleyLine } from '../content/fallback-lines'
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

/** 이 시야의 주인이 연기하는 용의자. 대사 말투가 여기 붙는다. */
function characterOf(view: GameView): string {
  return view.players.find((p) => p.isMe)?.characterId ?? ''
}

/**
 * 판단 대사는 만들지 않는다(silent). 반증·제안·이의제기의 빈 자리는 화면이
 * content/fallback-lines.ts에서 캐릭터별로 채우므로, 여기서 또 만들면 두 곳이 갈린다.
 *
 * **밀담만 예외다.** 밀담 답변은 화면이 채울 수 없다 — 판단자가 돌려주지 않으면
 * 「상대가 입을 열지 않는다」로 끝나 밀담 자체가 성립하지 않기 때문이다.
 */
export function createRuleDecider(seed: string): Decider {
  return {
    chooseSuggestion: async (view) => silent(suggestionFrom(view, saltOf(seed, 'sg', view))),
    chooseClaim: async (view) => silent(claimFrom(view, saltOf(seed, 'cl', view))),
    chooseChallengeTarget: async (view) => silent(challengeTargetFrom(view)),
    chooseAccusation: async (view) => silent(voteFrom(view, saltOf(seed, 'vote', view))),
    /*
     * 사전생성 대사 풀에서 답한다. 질문을 읽지 못하므로 무엇을 물어도 어긋나지 않는
     * «답을 피하는 말»만 들어 있다 — 프록시가 죽어도 밀담이 닫히지 않는 것이 요점이다(절대규칙 4).
     */
    speakInParley: async (view) => parleyLine(characterOf(view), saltOf(seed, 'pl', view)),
  }
}

/** 규칙 기반은 라운드에 따라 달라지지 않으므로 인스턴스 하나를 재사용한다. */
export function ruleDeciderForRound(seed: string): DeciderForRound {
  const decider = createRuleDecider(seed)
  return () => decider
}
