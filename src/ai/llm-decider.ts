import type { Claim, PlayerId, Suggestion } from '../engine/types'
import type { GameView } from '../engine/view'
import type { Decider, DeciderForRound, FallbackReason, Spoken } from './decider'
import type { PowerBrief, PowerLookup } from './power-brief'
import type { PowerIntent } from '../engine/power'
import { PROXY_URL } from './proxy-url'

/**
 * 프록시를 통해 판단을 받아오는 Decider.
 *
 * 계약은 하나다 — **불확실하면 던진다.** createRoundFallback이 throw를 받아 폴백으로 넘긴다.
 * 절대 규칙 4를 지키는 방식이 "여기서 잘 처리하기"가 아니라 "여기서 포기하기"인 것이다.
 *
 * 이 구현은 **호출 사이에 게임 정보를 들고 있지 않다.** 하나의 인스턴스가 6좌석을 대행하므로
 * 대화 이력을 인스턴스에 두면 한 좌석의 손패가 다른 좌석 판단에 샌다(decider.ts 계약).
 * exhausted는 게임 정보가 아니라 회선 상태라 예외다.
 */

/** 프록시가 돌려주는 code + 프론트에서만 생기는 둘. */
export type ProxyErrorCode =
  | 'invalid_request'
  | 'forbidden_origin'
  | 'rate_limited'
  | 'budget_exhausted'
  | 'not_configured'
  | 'upstream_error'
  | 'upstream_timeout'
  | 'invalid_upstream'
  | 'network'
  | 'malformed'

export class LlmUnavailableError extends Error {
  readonly fallbackReason: FallbackReason

  constructor(readonly code: ProxyErrorCode) {
    super(code)
    this.name = 'LlmUnavailableError'
    // 예산 소진만 그날 안에 낫지 않는다. 나머지는 다음 라운드에 복구될 수 있다.
    this.fallbackReason = code === 'budget_exhausted' ? 'budget' : 'error'
  }
}

/**
 * 프록시(15초)보다 길게 잡아야 어떤 실패인지 code로 알 수 있다(설계 §7.1).
 *
 * 프록시보다 5초 길게 둔다. 이쪽이 먼저 끊으면 상류가 왜 실패했는지가 통째로 사라져
 * 「예산 소진」과 「낙오」를 구분하지 못하고, 예산이 마른 판에서도 매 호출을 다시 던진다.
 */
const REQUEST_TIMEOUT_MS = 20_000

type DecideKind = 'suggest' | 'refute' | 'challenge' | 'accuse' | 'parley'

/**
 * 워커가 돌려준 한 답. Spoken에 **아직 좁히지 않은** 조기 고발 의사를 얹는다.
 *
 * Spoken.accuse는 Suggestion인데 이 시점에는 결정을 아직 안 좁혔다. 좁힌 뒤에야
 * 「그 세 장이 고발이다」를 만들 수 있으므로, 여기서는 «예/아니오»만 들고 나른다.
 */
interface Answered extends Spoken<unknown> {
  readonly accuseNow: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function toSuggestion(value: unknown): Suggestion {
  if (!isRecord(value)) throw new LlmUnavailableError('malformed')
  const suspect = asText(value['suspect'])
  const weapon = asText(value['weapon'])
  const place = asText(value['place'])
  if (!suspect || !weapon || !place) throw new LlmUnavailableError('malformed')
  return { suspect, weapon, place }
}

function toClaim(value: unknown): Claim {
  if (!isRecord(value)) throw new LlmUnavailableError('malformed')
  const kind = asText(value['kind'])
  if (kind === 'pass') return { kind: 'pass' }
  if (kind !== 'refute') throw new LlmUnavailableError('malformed')
  const cardId = asText(value['cardId'])
  if (!cardId) throw new LlmUnavailableError('malformed')
  return { kind: 'refute', cardId }
}

/**
 * 대사를 화면에 올릴 수 있는 모양으로 좁힌다. **버리지 결코 던지지 않는다** —
 * 대사가 이상하다고 판단 전체를 폴백으로 넘기면, 말 한 줄 때문에 룰 판단까지 규칙 기반이 된다.
 *
 * 좁히는 것 둘:
 *   줄바꿈 → 한 줄 말풍선이 세로로 터진다
 *   길이   → 프롬프트가 40자를 «요구»할 뿐 강제하지 않는다. 좌석 칸을 넘기면 판이 가려진다
 */
const LINE_MAX = 60
/** 밀담은 두어 문장이 자연스러운 자리라 좌석 대사보다 넉넉하다(설계 §7). */
const PARLEY_LINE_MAX = 120

function toLine(value: unknown, max: number = LINE_MAX): string | null {
  if (typeof value !== 'string') return null
  const flat = value.replace(/\s+/g, ' ').trim()
  if (flat.length === 0) return null
  return flat.length > max ? `${flat.slice(0, max)}…` : flat
}

function toTarget(value: unknown): PlayerId | null {
  if (value === null) return null
  const target = asText(value)
  if (!target) throw new LlmUnavailableError('malformed')
  return target
}

/**
 * 모델이 고른 «대상»을 능력 의사로 옮긴다.
 *
 * 워커는 이 값을 해석하지 않는다 — player id인지 카드 id인지는 좌석의 직업을 아는
 * 이쪽만 안다. 종류를 워커에 알려주면 그 대응표가 두 군데에 살게 된다(설계 §5.3).
 *
 * 값이 실제로 존재하는 좌석·카드인지는 확인하지 않는다. 엔진이 거절하고 flow가 삼킨다.
 */
function toIntent(power: PowerBrief | null, chosen: string | null): PowerIntent | null {
  if (!power || !chosen || chosen === 'none') return null
  switch (power.needs) {
    case 'player':
      return { targetId: chosen }
    case 'weapon':
      return { cardId: chosen }
    case 'none':
      return {}
  }
}

/**
 * 카드 id → 이 사건에서 쓰는 표시 이름을 «지금» 읽어오는 통로.
 *
 * 값이 아니라 함수인 이유는 **판단자보다 사건이 늦게 정해지기 때문이다.**
 * 판단자는 판을 만들 때 생기고 사건은 그 다음 화면인 브리핑에서 골라지므로,
 * 값으로 굳히면 사건이 정해지기 전의 것으로 고정된다.
 */
export type NameLookup = () => Readonly<Record<string, string>>

export function createLlmDecider(
  powerOf: PowerLookup = () => null,
  /**
   * 이 사건의 카드 표시 이름.
   *
   * 이걸 안 보내면 모델은 엔진 기본 이름으로 말하는데 화면은 사건별 이름으로 그린다 —
   * 같은 카드를 두고 좌석 대사와 그 옆 카드 그림이 서로 다른 이름을 부르게 된다.
   */
  names: NameLookup = () => ({}),
): Decider {
  /**
   * 예산 소진은 라운드 폴백이 아니라 **세션 폴백**이다.
   * 라운드마다 재시도하면 남은 라운드 내내 헛왕복이 쌓인다.
   * 켜진 뒤에는 fetch 없이 즉시 던지므로 비용도 지연도 0이다(설계 §7.2).
   */
  let exhausted = false

  /** 로그 상관관계 전용. 프록시가 신뢰하지 않는 값이다. */
  const sessionId = crypto.randomUUID()

  async function ask(kind: DecideKind, view: GameView, said?: string): Promise<Answered> {
    if (exhausted) throw new LlmUnavailableError('budget_exhausted')

    /*
     * 능력을 물어보는 턴은 **제안·반증뿐이다.** flow가 그 둘에서만 답을 걷기 때문이다
     * (제안자는 suggest를, 나머지는 refute를 정확히 한 번씩 부르므로 이 둘이면 전원이
     * 한 번씩 물어보게 된다). 다른 kind에도 실으면 모델이 답해도 버려지고, 프롬프트만
     * 길어지고, 그 kind의 캐시 프리픽스까지 흔들린다.
     *
     * 이미 썼으면 역시 안 보낸다 — 쓸 수 없는 턴에 설명을 싣는 것도 같은 낭비다.
     */
    const asksPower = kind === 'suggest' || kind === 'refute'
    const power = asksPower && !view.powerSpent ? powerOf(view.viewerId) : null

    let response: Response
    try {
      response = await fetch(`${PROXY_URL}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // said가 undefined면 JSON.stringify가 키를 통째로 지운다 — 다른 kind는 ask를 보내지 않는다.
        // undefined인 키는 JSON.stringify가 통째로 지운다 — ask·power 둘 다 그 성질을 쓴다.
        body: JSON.stringify({
          v: 1,
          kind,
          sessionId,
          view,
          ask: said,
          power: power ?? undefined,
          names: names(),
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch {
      throw new LlmUnavailableError('network')
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      throw new LlmUnavailableError('malformed')
    }
    if (!isRecord(payload)) throw new LlmUnavailableError('malformed')

    if (!response.ok || payload['ok'] !== true) {
      const code = (asText(payload['code']) ?? 'upstream_error') as ProxyErrorCode
      if (code === 'budget_exhausted') exhausted = true
      throw new LlmUnavailableError(code)
    }

    // 대사 상한은 kind마다 다르다. 여기서는 자르지 않고 원문을 넘겨 부르는 쪽이 정하게 한다.
    return {
      value: payload['decision'],
      line: typeof payload['line'] === 'string' ? payload['line'] : null,
      power: toIntent(power, asText(payload['usePowerOn'])),
      /*
       * 밀담에서 화자가 스스로 낸 참·거짓. 모르는 값은 «주장 없음»으로 읽는다 —
       * 여기서 잘못 읽으면 정보상이 없는 거짓말을 잡았다고 통보받는다.
       */
      truthful: payload['truthful'] === true ? true : payload['truthful'] === false ? false : null,
      /*
       * 조기 고발 의사(3-C-2b). **"yes"만 «함»이고 나머지는 전부 «안 함»이다.**
       *
       * 옛 워커는 이 칸을 아예 안 준다. 모르는 값을 「고발함」으로 읽으면 배포 순서가
       * 어긋난 그 순간 AI가 아무렇게나 고발해 판이 끝난다 — 되돌릴 수 없는 쪽으로
       * 틀리지 않게 «안 함»으로 닫는다.
       */
      accuseNow: payload['accuseNow'] === 'yes',
    }
  }

  /** 판단만 좁히고 대사는 좌석 상한으로 자른다. 대사는 룰에 관여하지 않으므로 검증 대상이 아니다. */
  function decide<T>(spoken: Spoken<unknown>, narrow: (value: unknown) => T): Spoken<T> {
    return { value: narrow(spoken.value), line: toLine(spoken.line), power: spoken.power }
  }

  return {
    /*
     * 제안과 조기 고발이 한 답에서 나온다. 고발하겠다면 **방금 지목한 그 세 장**이
     * 곧 고발이다 — 따로 고르게 하면 칸이 셋 더 늘고 그만큼 응답이 흔들린다.
     *
     * 판정은 하지 않는다. 맞고 틀림은 엔진의 accuseEarly가 정한다(작업 규칙 2).
     */
    chooseSuggestion: async (view) => {
      const spoken = await ask('suggest', view)
      const decided = decide(spoken, toSuggestion)
      return { ...decided, accuse: spoken.accuseNow ? decided.value : null }
    },
    chooseClaim: async (view) => decide(await ask('refute', view), toClaim),
    chooseChallengeTarget: async (view) => decide(await ask('challenge', view), toTarget),
    chooseAccusation: async (view) => decide(await ask('accuse', view), toSuggestion),
    // 결정이 없는 유일한 kind다. decision은 null이고 line만 쓴다.
    speakInParley: async (view, said) => {
      const spoken = await ask('parley', view, said)
      const line = toLine(spoken.line, PARLEY_LINE_MAX)
      // 대사가 없으면 밀담이 성립하지 않는다. 자기 신고만 있고 말이 없는 상태는 만들지 않는다.
      return line === null ? null : { line, truthful: spoken.truthful ?? null }
    },
  }
}

/**
 * 판 하나에 **인스턴스 하나**를 쓴다.
 *
 * 라운드마다 새로 만들면 exhausted 플래그가 매 라운드 지워져서
 * 예산이 소진된 뒤에도 라운드마다 헛왕복이 나간다.
 */
export function llmDeciderForRound(powerOf?: PowerLookup, names?: NameLookup): DeciderForRound {
  const decider = createLlmDecider(powerOf, names)
  return () => decider
}
