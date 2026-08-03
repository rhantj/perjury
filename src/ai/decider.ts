import type { Claim, PlayerId, Suggestion } from '../engine/types'
import type { GameView } from '../engine/view'

/**
 * 에이전트가 무엇을 할지 고르는 것. 룰은 모른다 — 고른 행동은 엔진이 다시 검증한다.
 *
 * 입력이 GameView 하나로 고정된 것이 이 인터페이스의 핵심이다.
 * viewFor()가 seed·정답·남의 손패·isPerjury를 이미 뺐으므로,
 * 구현체가 무엇이든 전지적 정보를 받을 통로가 없다.
 */
export interface Decider {
  chooseSuggestion(view: GameView): Promise<Suggestion>
  chooseClaim(view: GameView): Promise<Claim>
  chooseChallengeTarget(view: GameView): Promise<PlayerId | null>
  /** 최종 고발. 자료형은 제안과 같지만 판을 끝내는 행위라 이름을 나눈다. */
  chooseAccusation(view: GameView): Promise<Suggestion>
}

/**
 * 라운드 하나에 쓸 Decider를 만든다.
 *
 * 계약: **같은 라운드 번호에는 같은 인스턴스를 돌려줘야 한다.**
 * createRoundFallback이 "이 라운드는 이미 넘어졌다"를 인스턴스 안에 들고 있기 때문이다.
 * 이 계약을 지키는 방법이 perRound다.
 */
export type DeciderForRound = (round: number) => Decider

/**
 * 한 라운드짜리 폴백 래퍼.
 *
 * preferred가 한 번이라도 실패하면 남은 호출은 전부 fallback으로 간다.
 * 인스턴스 수명이 한 라운드이므로 다음 라운드에는 새 인스턴스가 만들어지고
 * preferred를 다시 시도한다 — 별도 복구 로직이 없는 이유다.
 *
 * 가변 플래그를 쓴다. 이것은 게임 상태가 아니라 어댑터의 수명 표시라 불변 규칙 밖이다.
 */
export function createRoundFallback(
  preferred: Decider,
  fallback: Decider,
  onFallback?: () => void,
): Decider {
  let fallen = false

  async function run<T>(pick: (decider: Decider) => Promise<T>): Promise<T> {
    if (fallen) return pick(fallback)
    try {
      return await pick(preferred)
    } catch {
      if (!fallen) {
        fallen = true
        onFallback?.()
      }
      return pick(fallback)
    }
  }

  return {
    chooseSuggestion: (view) => run((d) => d.chooseSuggestion(view)),
    chooseClaim: (view) => run((d) => d.chooseClaim(view)),
    chooseChallengeTarget: (view) => run((d) => d.chooseChallengeTarget(view)),
    chooseAccusation: (view) => run((d) => d.chooseAccusation(view)),
  }
}

/**
 * DeciderForRound의 계약(같은 라운드 = 같은 인스턴스)을 지키게 감싼다.
 *
 * 이게 없으면 한 라운드 안에서 인스턴스가 여러 번 만들어져
 * createRoundFallback의 "넘어졌다" 표시가 중간에 지워진다.
 */
export function perRound(make: DeciderForRound): DeciderForRound {
  let cachedRound: number | null = null
  let cached: Decider | null = null

  return (round) => {
    if (cachedRound !== round || !cached) {
      const made = make(round)
      cachedRound = round
      cached = made
    }
    return cached
  }
}
