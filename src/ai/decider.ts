import type { PowerIntent } from '../engine/power'
import type { Claim, PlayerId, Suggestion } from '../engine/types'
import type { GameView } from '../engine/view'

/**
 * 판단과 «그때 한 말»을 함께 나르는 봉투.
 *
 * 대사를 따로 얻는 메서드를 두지 않는 이유 — Decider는 호출 사이에 상태를 들고 있을 수 없다
 * (아래 계약). 「방금 뭐라고 말했나」를 나중에 물으면 그게 바로 인스턴스에 남는 상태다.
 * 판단과 대사는 같은 호출에서 같이 나와야 한다.
 */
export interface Spoken<T> {
  readonly value: T
  /** 없으면 null. 규칙 기반 판단자와 사람에겐 대사가 없다. */
  readonly line: string | null
  /**
   * 이 판단과 함께 직업 능력을 쓰겠다는 의사. 없으면 안 쓴다.
   *
   * **종류가 없는 것이 핵심이다.** 종류까지 실으면 LLM이 남의 능력을 쓸 수 있다.
   * 종류는 flow가 좌석의 직업에서 뽑아 붙인다(결정 007).
   *
   * 판단 호출에 얹는 이유는 호출 수 때문이다. 능력 전용 메서드를 두면 라운드당 12번이
   * 18번이 되고, 호출당 3.6%인 실패율(결정 006)에 노출되는 면이 1.5배가 된다.
   * 제안자는 chooseSuggestion을, 나머지는 chooseClaim을 정확히 한 번씩 부르므로
   * 이 둘을 합치면 매 라운드 전원이 정확히 한 번 물어보게 된다.
   */
  readonly power?: PowerIntent | null
  /**
   * 밀담에서 화자가 스스로 낸 참·거짓. 밀담이 아닌 kind에서는 언제나 null이다.
   * 정보상만 이 값을 쓴다 — 엔진이 텍스트를 판정할 수 없어 말한 쪽이 신고하는 구조다.
   */
  readonly truthful?: boolean | null
}

/** 대사 없는 판단. 규칙 기반 구현이 쓴다. */
export function silent<T>(value: T): Spoken<T> {
  return { value, line: null }
}

/**
 * 에이전트가 무엇을 할지 고르는 것. 룰은 모른다 — 고른 행동은 엔진이 다시 검증한다.
 *
 * 입력이 GameView 하나로 고정된 것이 이 인터페이스의 핵심이다.
 * viewFor()가 seed·정답·남의 손패·isPerjury를 이미 뺐으므로,
 * 구현체가 무엇이든 전지적 정보를 받을 통로가 없다.
 *
 * 계약: **하나의 인스턴스가 여러 좌석을 대행한다.** flow.ts는 반증·이의제기 페이즈에서
 * 같은 Decider 인스턴스에 6개 좌석의 서로 다른 GameView를 차례로 먹인다. 따라서
 * 구현체는 호출 사이에 상태를 들고 있으면 안 된다 — 대화 이력이나 캐시를 인스턴스에
 * 두면 한 좌석의 손패가 다른 좌석의 판단에 새어 든다. 입력이 GameView 하나인 것은
 * *입력* 격리를 보장할 뿐 *인스턴스* 격리를 보장하지 않는다.
 */
export interface Decider {
  chooseSuggestion(view: GameView): Promise<Spoken<Suggestion>>
  chooseClaim(view: GameView): Promise<Spoken<Claim>>
  chooseChallengeTarget(view: GameView): Promise<Spoken<PlayerId | null>>
  /** 최종 고발. 자료형은 제안과 같지만 판을 끝내는 행위라 이름을 나눈다. */
  chooseAccusation(view: GameView): Promise<Spoken<Suggestion>>
  /**
   * 밀담 응답. **대사만 돌려준다** — 고를 것이 없으므로 Spoken 봉투를 쓰지 않는다.
   *
   * **GameView 외의 인자를 받는 유일한 메서드다.** 위 원칙의 목적은 전지적 정보가 새는
   * 통로를 막는 것인데, ask는 플레이어가 방금 자기 입으로 한 말이라 그 목적을 해치지 않는다.
   * 아직 엔진에 들어가지 않았으므로 view에 실을 수도 없다.
   *
   * 할 말이 없으면 null이다. 규칙 기반 구현은 언제나 null을 돌려준다.
   */
  speakInParley(view: GameView, ask: string): Promise<ParleyReply | null>
}

/**
 * 밀담 한 마디. **말한 쪽이 자기 거짓말 여부를 함께 낸다.**
 *
 * 정보상이 이 값을 쓴다. 엔진이 텍스트를 판정하는 것이 아니라 화자의 자기 신고를 옮기는 것이라
 * 룰 엔진 순수성과 부딪히지 않는다 — 밀담은 원래 룰이 읽지 않는 자리다(types.ts).
 */
export interface ParleyReply {
  readonly line: string
  /** 판정할 것이 없었으면 null이다. 규칙 기반 구현은 언제나 null이다. */
  readonly truthful: boolean | null
}

/**
 * 라운드 하나에 쓸 Decider를 만든다.
 *
 * 계약: **같은 라운드 번호에는 같은 인스턴스를 돌려줘야 한다.**
 * createRoundFallback이 "이 라운드에서 몇 번 실패했나"를 인스턴스 안에 들고 있기 때문이다.
 * 이 계약을 지키는 방법이 perRound다.
 */
export type DeciderForRound = (round: number) => Decider

/**
 * 왜 폴백으로 떨어졌는가. 화면 안내 문구를 고르는 데만 쓴다.
 *
 * budget과 error를 나누는 이유는 **복구 가능성이 다르기** 때문이다.
 * error는 다음 라운드에 나을 수 있지만 budget은 그날 안에 낫지 않는다.
 */
export type FallbackReason = 'budget' | 'error'

/** 폴백 사유를 실어 나르는 예외. 네트워크 계층이 태그를 붙이고 여기서 읽는다. */
interface Reasoned {
  readonly fallbackReason: FallbackReason
}

function reasonOf(e: unknown): FallbackReason {
  if (typeof e === 'object' && e !== null && 'fallbackReason' in e) {
    const tagged = (e as Reasoned).fallbackReason
    if (tagged === 'budget' || tagged === 'error') return tagged
  }
  return 'error'
}

/**
 * 라운드에 차단기가 달린 폴백 래퍼.
 *
 * **실패한 호출만 fallback으로 간다.** 한 라운드는 12번 호출하므로, 첫 실패로 라운드를
 * 통째로 접으면 호출당 3.6%인 실패율이 라운드 40%로 증폭된다(결정 006).
 * 실측에서 실패는 전부 «병렬 5건 중 하나만 늦은 낙오»였다 — 회선이 죽은 것이 아니다.
 *
 * 다만 회선이 정말 죽었을 때 남은 페이즈까지 상한만큼(15초) 매달리면 안 되므로,
 * **두 번째 실패에서 라운드를 접는다.** 병렬 배치는 실패해도 한꺼번에 실패하고
 * 낙오는 배치당 하나만 나오므로, 이 둘이 잘 갈린다.
 *
 * 인스턴스 수명이 한 라운드이므로 다음 라운드에는 새 인스턴스가 만들어지고
 * preferred를 다시 시도한다 — 별도 복구 로직이 없는 이유다.
 *
 * 가변 플래그를 쓴다. 이것은 게임 상태가 아니라 어댑터의 수명 표시라 불변 규칙 밖이다.
 */
/** 라운드를 접는 실패 횟수. 1로 되돌리면 원래의 「첫 실패에 라운드 전체」다. */
const ROUND_GIVE_UP = 2

export function createRoundFallback(
  preferred: Decider,
  fallback: Decider,
  onFallback?: (reason: FallbackReason) => void,
): Decider {
  let failures = 0
  let fallen = false

  async function run<T>(pick: (decider: Decider) => Promise<T>): Promise<T> {
    if (fallen) return pick(fallback)
    try {
      return await pick(preferred)
    } catch (e) {
      failures += 1
      /*
       * 배너는 «접혔을 때»만 띄운다. 낙오 하나에 켜면 fallbackRound의 뜻이
       * 「이 라운드는 규칙 기반이다」에서 흐려지고, 그 값을 보고 문을 닫는
       * 밀담 패널이 멀쩡한 라운드에 막힌다.
       */
      if (!fallen && failures >= ROUND_GIVE_UP) {
        fallen = true
        onFallback?.(reasonOf(e))
      }
      return pick(fallback)
    }
  }

  return {
    chooseSuggestion: (view) => run((d) => d.chooseSuggestion(view)),
    chooseClaim: (view) => run((d) => d.chooseClaim(view)),
    chooseChallengeTarget: (view) => run((d) => d.chooseChallengeTarget(view)),
    chooseAccusation: (view) => run((d) => d.chooseAccusation(view)),
    speakInParley: (view, ask) => run((d) => d.speakInParley(view, ask)),
  }
}

/**
 * DeciderForRound의 계약(같은 라운드 = 같은 인스턴스)을 지키게 감싼다.
 *
 * 이게 없으면 한 라운드 안에서 인스턴스가 여러 번 만들어져
 * createRoundFallback의 실패 횟수가 중간에 지워지고, 차단기가 영영 안 내려간다.
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
