import type { Claim, PlayerId, Suggestion } from '../../src/engine/types'
import type { GameView } from '../../src/engine/view'
import type { PowerBrief } from '../../src/ai/power-brief'
import { buildMessages, schemaFor } from './prompt'
import type { ChatMessage } from './prompt'
import type { DecideKind } from './schema'

/**
 * LLM 호출. **Anthropic Messages API**에 맞춘다.
 *
 * OpenAI 호환 형식에서 옮겨 왔다. 세 가지가 다르다.
 *   - system이 messages 안이 아니라 **최상위 필드**다. 그래서 캐시 지점을 직접 찍을 수 있다.
 *   - 구조화 출력은 response_format이 아니라 output_config다.
 *     **강제 tool_choice를 쓰지 않는 이유가 여기 있다** — 그쪽은 확장 사고와 병용하면 400이 난다.
 *   - 잘림 신호가 finish_reason이 아니라 stop_reason이고, content는 블록 배열이다.
 *
 * **재시도하지 않는다.** 폴백이 있으므로 한 라운드가 규칙 기반으로 떨어지는 대가가
 * 재시도 대기보다 싸다(설계 §5.4).
 */

export interface LlmConfig {
  readonly baseUrl: string
  readonly model: string
  /** Anthropic은 키 없이 부를 수 없다. 없으면 index.ts가 먼저 503으로 끊는다. */
  readonly apiKey: string
  /** thinking + 응답 합산 상한이다. 사고하는 모델은 응답 전에 이걸 다 쓸 수 있다. */
  readonly maxTokens: number
  readonly timeoutMs: number
}

export type UpstreamCode = 'upstream_error' | 'upstream_timeout' | 'invalid_upstream'

export type Decision =
  | { readonly kind: 'suggest' | 'accuse'; readonly decision: Suggestion }
  | { readonly kind: 'refute'; readonly decision: Claim }
  | { readonly kind: 'challenge'; readonly decision: PlayerId | null }
  /** 밀담은 고를 것이 없다. line만 쓴다. */
  | { readonly kind: 'parley'; readonly decision: null }

export type LlmResult =
  | {
      readonly ok: true
      readonly decision: Decision
      readonly line: string
      /**
       * 능력을 쓰겠다는 답. 안 쓰면 null이다.
       *
       * **워커는 이 값을 해석하지 않는다.** 「player id인가 카드 id인가」는 좌석의 직업을
       * 아는 프론트가 정한다 — 여기서 갈래를 두면 룰이 두 군데로 나뉜다(설계 §5.3).
       */
      readonly usePowerOn: string | null
      readonly usage: Usage
    }
  | { readonly ok: false; readonly code: UpstreamCode; readonly detail: string }

export interface Usage {
  readonly promptTokens: number
  readonly completionTokens: number
  /** 캐시에서 읽은 입력 토큰. 프리픽스 캐싱이 실제로 도는지 보는 유일한 창이다. */
  readonly cachedTokens: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function textField(obj: Record<string, unknown>, key: string): string | null {
  const value = obj[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

function numberField(obj: Record<string, unknown>, key: string): number {
  const value = obj[key]
  return typeof value === 'number' ? value : 0
}

/** 모델이 낸 JSON을 엔진 타입으로 옮긴다. 룰 검증은 하지 않는다 — 엔진의 일이다. */
function toDecision(kind: DecideKind, parsed: Record<string, unknown>): Decision | null {
  switch (kind) {
    case 'suggest':
    case 'accuse': {
      const suspect = textField(parsed, 'suspect')
      const weapon = textField(parsed, 'weapon')
      const place = textField(parsed, 'place')
      if (!suspect || !weapon || !place) return null
      return { kind, decision: { suspect, weapon, place } }
    }
    case 'refute': {
      const declared = textField(parsed, 'kind')
      if (declared === 'pass') return { kind, decision: { kind: 'pass' } }
      if (declared !== 'refute') return null
      const cardId = textField(parsed, 'cardId')
      // 스키마상 cardId는 필수이므로 'none'을 낸 refute는 넘김으로 읽는다.
      if (!cardId || cardId === 'none') return { kind, decision: { kind: 'pass' } }
      return { kind, decision: { kind: 'refute', cardId } }
    }
    case 'challenge': {
      const targetId = textField(parsed, 'targetId')
      return { kind, decision: !targetId || targetId === 'none' ? null : targetId }
    }
    case 'parley':
      return { kind, decision: null }
  }
}

interface SystemBlock {
  readonly type: 'text'
  readonly text: string
  readonly cache_control: { readonly type: 'ephemeral' }
}

/**
 * prompt.ts가 쌓아 둔 순서를 Anthropic의 그릇에 옮긴다.
 *
 * **블록마다 캐시 지점을 찍는다.** 룰 블록까지의 프리픽스는 여섯 좌석이 전부 공유하고,
 * 신분 블록까지의 프리픽스는 그 좌석이 판 내내 재사용한다. 한 군데만 찍으면 앞쪽 공유분을 못 건진다.
 */
function toRequestShape(messages: readonly ChatMessage[]): {
  system: SystemBlock[]
  user: string
} {
  const system = messages
    .filter((message) => message.role === 'system')
    .map((message): SystemBlock => ({
      type: 'text',
      text: message.content,
      cache_control: { type: 'ephemeral' },
    }))

  const user = messages
    .filter((message) => message.role === 'user')
    .map((message) => message.content)
    .join('\n\n')

  return { system, user }
}

/** content 블록 배열에서 본문 텍스트를 찾는다. 사고 블록이 앞에 올 수 있다. */
function firstText(content: unknown): string | null {
  if (!Array.isArray(content)) return null
  for (const block of content) {
    if (isRecord(block) && block['type'] === 'text') {
      const text = textField(block, 'text')
      if (text) return text
    }
  }
  return null
}

export async function decide(
  config: LlmConfig,
  kind: DecideKind,
  view: GameView,
  ask: string | null = null,
  power: PowerBrief | null = null,
  /** 카드 이름이 사건마다 다르다. 없으면 엔진 기본 이름으로 나간다 — prompt.ts labeller 참고. */
  scenarioId: string | null = null,
): Promise<LlmResult> {
  const { system, user } = toRequestShape(buildMessages(kind, view, ask, power, scenarioId))

  let response: Response
  try {
    response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: config.maxTokens,
        /*
         * 이 네 종류 판단은 정해진 후보 중 하나를 고르는 좁은 결정이라 확장 사고가
         * 필요 없다 — 켜 두면 답을 내기 전에 사고 토큰부터 쓰느라 5~10초 안에 안 끝난다.
         * 성격 차이는 어차피 temperature가 아니라 프롬프트로 낸다(CLAUDE.md LLM 사용 절).
         */
        thinking: { type: 'disabled' },
        system,
        messages: [{ role: 'user', content: user }],
        output_config: { format: { type: 'json_schema', schema: schemaFor(kind, view, power) } },
      }),
      signal: AbortSignal.timeout(config.timeoutMs),
    })
  } catch (e) {
    const timedOut = e instanceof Error && e.name === 'TimeoutError'
    return {
      ok: false,
      code: timedOut ? 'upstream_timeout' : 'upstream_error',
      detail: timedOut ? '응답이 제한 시간을 넘겼다' : '상류에 닿지 못했다',
    }
  }

  // 상류 오류 본문은 조직·키 식별자가 섞일 수 있어 그대로 내보내지 않는다(설계 §3.3).
  if (!response.ok) return { ok: false, code: 'upstream_error', detail: `상류 응답 ${response.status}` }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    return { ok: false, code: 'invalid_upstream', detail: '상류 응답이 JSON이 아니다' }
  }
  if (!isRecord(payload)) return { ok: false, code: 'invalid_upstream', detail: '상류 응답 모양이 다르다' }

  /**
   * **내용을 읽기 전에 종료 사유부터 본다.** 상한에 걸리면 JSON이 중간에서 끊기는데,
   * 사고하는 모델은 응답 한 글자 내기 전에 상한을 다 쓸 수 있다.
   */
  if (payload['stop_reason'] === 'max_tokens') {
    return { ok: false, code: 'invalid_upstream', detail: '상한에 걸려 잘렸다' }
  }

  const content = firstText(payload['content'])
  if (!content) return { ok: false, code: 'invalid_upstream', detail: '상류 응답이 비었다' }

  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return { ok: false, code: 'invalid_upstream', detail: '구조화 출력이 JSON이 아니다' }
  }
  if (!isRecord(parsed)) return { ok: false, code: 'invalid_upstream', detail: '구조화 출력 모양이 다르다' }

  const decision = toDecision(kind, parsed)
  if (!decision) return { ok: false, code: 'invalid_upstream', detail: '결정을 읽을 수 없다' }

  const usageRaw = payload['usage']
  const usage: Usage = isRecord(usageRaw)
    ? {
        promptTokens: numberField(usageRaw, 'input_tokens'),
        completionTokens: numberField(usageRaw, 'output_tokens'),
        cachedTokens: numberField(usageRaw, 'cache_read_input_tokens'),
      }
    : { promptTokens: 0, completionTokens: 0, cachedTokens: 0 }

  /* "none"은 «안 쓴다»다. 스키마가 필수로 열려 있어도 이 값으로 빠져나갈 수 있다. */
  const chosen = textField(parsed, 'usePowerOn')
  return {
    ok: true,
    decision,
    line: textField(parsed, 'line') ?? '',
    usePowerOn: !chosen || chosen === 'none' ? null : chosen,
    usage,
  }
}
