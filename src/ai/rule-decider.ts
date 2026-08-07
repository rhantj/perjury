import { accusationFrom, challengeTargetFrom, claimFrom, suggestionFrom, voteFrom } from './rules'
import { silent } from './decider'
import { parleyLine } from '../content/fallback-lines'
import { cardName, cardsOfKind } from '../engine/cards'
import { createRng, pickOne } from '../engine/rng'
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
 * 폴백이 밀담에서 거짓을 말할 확률.
 *
 * 0이면 정보상이 언제 써도 «참»만 보므로 능력이 판정이 아니라 통과 의례가 된다.
 * 너무 높이면 밀담으로 얻는 말을 아무도 믿지 않게 되어 교환 자체가 죽는다.
 * 근거를 재서 정한 값은 아니다 — 규칙 기반으로 판을 돌려 측정해야 한다(룰 개편 부록 B).
 */
const LIE_RATE = 0.3

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
    /*
     * 제안에 조기 고발 의사를 얹는다. 세 칸이 다 좁혀졌을 때만 값이 붙는다(accusationFrom).
     *
     * **폴백에도 이 판단이 있어야 한다.** 없으면 프록시가 죽은 판은 아무도 조기 고발을
     * 못 해 언제나 상한까지 가고, 범인이 가만히 있어도 이긴다(절대규칙 4 · §2-6).
     */
    chooseSuggestion: async (view) => ({
      ...silent(suggestionFrom(view, saltOf(seed, 'sg', view))),
      accuse: accusationFrom(view),
    }),
    chooseClaim: async (view) => silent(claimFrom(view, saltOf(seed, 'cl', view))),
    chooseChallengeTarget: async (view) => silent(challengeTargetFrom(view)),
    chooseAccusation: async (view) => silent(voteFrom(view, saltOf(seed, 'vote', view))),
    /*
     * 사전생성 대사 풀에서 답한다. 질문을 읽지 못하므로 무엇을 물어도 어긋나지 않는
     * «답을 피하는 말»만 들어 있다 — 프록시가 죽어도 밀담이 닫히지 않는 것이 요점이다(절대규칙 4).
     */
    /*
     * 피하는 말 뒤에 «판정할 수 있는 주장» 한 문장을 붙인다.
     *
     * 예전에는 truthful이 항상 null이었다. 답을 피하는 말에는 참·거짓을 물을 대상이
     * 없으니 그 자체로는 옳은 값이었는데, 결과가 두 가지였다 —
     * 정보상 능력이 폴백에서 **영영 아무것도 얻지 못하고**, 판당 6회뿐인 밀담이
     * 프록시가 죽은 동안 정보를 0으로 낸다. 아껴 쓰는 자원이 값을 못 하게 된다.
     *
     * 그래서 주장을 만들되 **용의자 카드로만** 한다. 용의자 6명은 사건과 무관하게
     * 고정이므로(decisions/002) 시나리오 이름표 없이도 화면과 같은 이름을 부를 수 있다.
     * 수단·장소로 하면 여기서 부르는 이름과 상 위 카드 이름이 갈린다.
     */
    speakInParley: async (view) => {
      const salt = saltOf(seed, 'pl', view)
      const rng = createRng(salt)
      const hand = view.players.find((p) => p.isMe)?.hand ?? []
      const about = pickOne(cardsOfKind('suspect'), rng).id
      const holds = hand.includes(about)
      /* 늘 사실만 말하면 정보상이 «참»만 보게 되어 능력이 판정이 아니라 통과 의례가 된다. */
      const lies = rng() < LIE_RATE
      const says = lies ? !holds : holds
      return {
        line: `${parleyLine(characterOf(view), salt)} ${cardName(about)} 패는 내게 ${says ? '있소' : '없소'}.`,
        truthful: !lies,
      }
    },
  }
}

/** 규칙 기반은 라운드에 따라 달라지지 않으므로 인스턴스 하나를 재사용한다. */
export function ruleDeciderForRound(seed: string): DeciderForRound {
  const decider = createRuleDecider(seed)
  return () => decider
}
