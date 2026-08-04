import type { Claim, PlayerId, Suggestion } from '../engine/types'
import type { GameView } from '../engine/view'
import type { Decider, DeciderForRound, FallbackReason, Spoken } from './decider'
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

/** 프록시(25초)보다 길게 잡아야 어떤 실패인지 code로 알 수 있다(설계 §7.1). */
const REQUEST_TIMEOUT_MS = 30_000

type DecideKind = 'suggest' | 'refute' | 'challenge' | 'accuse'

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

function toLine(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const flat = value.replace(/\s+/g, ' ').trim()
  if (flat.length === 0) return null
  return flat.length > LINE_MAX ? `${flat.slice(0, LINE_MAX)}…` : flat
}

function toTarget(value: unknown): PlayerId | null {
  if (value === null) return null
  const target = asText(value)
  if (!target) throw new LlmUnavailableError('malformed')
  return target
}

export function createLlmDecider(): Decider {
  /**
   * 예산 소진은 라운드 폴백이 아니라 **세션 폴백**이다.
   * 라운드마다 재시도하면 남은 라운드 내내 헛왕복이 쌓인다.
   * 켜진 뒤에는 fetch 없이 즉시 던지므로 비용도 지연도 0이다(설계 §7.2).
   */
  let exhausted = false

  /** 로그 상관관계 전용. 프록시가 신뢰하지 않는 값이다. */
  const sessionId = crypto.randomUUID()

  async function ask(kind: DecideKind, view: GameView): Promise<Spoken<unknown>> {
    if (exhausted) throw new LlmUnavailableError('budget_exhausted')

    let response: Response
    try {
      response = await fetch(`${PROXY_URL}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ v: 1, kind, sessionId, view }),
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

    return { value: payload['decision'], line: toLine(payload['line']) }
  }

  /** 판단만 좁히고 대사는 그대로 통과시킨다. 대사는 룰에 관여하지 않으므로 검증 대상이 아니다. */
  function decide<T>(spoken: Spoken<unknown>, narrow: (value: unknown) => T): Spoken<T> {
    return { value: narrow(spoken.value), line: spoken.line }
  }

  return {
    chooseSuggestion: async (view) => decide(await ask('suggest', view), toSuggestion),
    chooseClaim: async (view) => decide(await ask('refute', view), toClaim),
    chooseChallengeTarget: async (view) => decide(await ask('challenge', view), toTarget),
    chooseAccusation: async (view) => decide(await ask('accuse', view), toSuggestion),
  }
}

/**
 * 판 하나에 **인스턴스 하나**를 쓴다.
 *
 * 라운드마다 새로 만들면 exhausted 플래그가 매 라운드 지워져서
 * 예산이 소진된 뒤에도 라운드마다 헛왕복이 나간다.
 */
export function llmDeciderForRound(): DeciderForRound {
  const decider = createLlmDecider()
  return () => decider
}
