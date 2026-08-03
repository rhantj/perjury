import type { Claim, PlayerId, Suggestion } from '../../src/engine/types'
import type { GameView } from '../../src/engine/view'
import { buildMessages, schemaFor } from './prompt'
import type { ChatMessage } from './prompt'
import type { DecideKind } from './schema'

/**
 * LLM 호출. **OpenAI 호환 chat completions 형식**에 맞춘다.
 *
 * 이 형식을 고른 이유는 로컬 올라마와 HF 라우터가 **같은 모양**이기 때문이다.
 * 개발은 로컬에서 하고 배포는 원격으로 하면서 코드를 안 바꾸려는 것이다.
 * Anthropic은 /v1/messages로 모양이 달라서, 그쪽으로 가면 이 파일에 어댑터가 하나 는다.
 *
 * **재시도하지 않는다.** 폴백이 있으므로 한 라운드가 규칙 기반으로 떨어지는 대가가
 * 재시도 대기보다 싸다(설계 §5.4).
 */

export interface LlmConfig {
  readonly baseUrl: string
  readonly model: string
  /** 로컬 올라마는 키가 필요 없다. */
  readonly apiKey?: string | undefined
  /** thinking + 응답 합산 상한이다. 사고하는 모델은 응답 전에 이걸 다 쓸 수 있다. */
  readonly maxTokens: number
  readonly timeoutMs: number
}

export type UpstreamCode = 'upstream_error' | 'upstream_timeout' | 'invalid_upstream'

export type Decision =
  | { readonly kind: 'suggest' | 'accuse'; readonly decision: Suggestion }
  | { readonly kind: 'refute'; readonly decision: Claim }
  | { readonly kind: 'challenge'; readonly decision: PlayerId | null }

export type LlmResult =
  | { readonly ok: true; readonly decision: Decision; readonly line: string; readonly usage: Usage }
  | { readonly ok: false; readonly code: UpstreamCode; readonly detail: string }

export interface Usage {
  readonly promptTokens: number
  readonly completionTokens: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function textField(obj: Record<string, unknown>, key: string): string | null {
  const value = obj[key]
  return typeof value === 'string' && value.length > 0 ? value : null
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
  }
}

async function post(config: LlmConfig, body: unknown): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`

  return fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(config.timeoutMs),
  })
}

export async function decide(config: LlmConfig, kind: DecideKind, view: GameView): Promise<LlmResult> {
  const messages: ChatMessage[] = buildMessages(kind, view)

  let response: Response
  try {
    response = await post(config, {
      model: config.model,
      messages,
      max_tokens: config.maxTokens,
      response_format: {
        type: 'json_schema',
        json_schema: { name: `perjury_${kind}`, strict: true, schema: schemaFor(kind, view) },
      },
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

  const choices = payload['choices']
  const first = Array.isArray(choices) ? choices[0] : undefined
  if (!isRecord(first)) return { ok: false, code: 'invalid_upstream', detail: '상류 응답에 선택지가 없다' }

  /**
   * **응답을 읽기 전에 종료 사유부터 본다.** max_tokens로 잘리면 content가 비거나 불완전한데,
   * 사고하는 모델은 응답 한 글자 내기 전에 상한을 다 쓸 수 있다.
   */
  const finish = first['finish_reason']
  if (finish === 'length') {
    return { ok: false, code: 'invalid_upstream', detail: '상한에 걸려 잘렸다' }
  }

  const message = first['message']
  if (!isRecord(message)) return { ok: false, code: 'invalid_upstream', detail: '상류 응답에 메시지가 없다' }
  const content = textField(message, 'content')
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
  const usage: Usage = {
    promptTokens: isRecord(usageRaw) && typeof usageRaw['prompt_tokens'] === 'number' ? usageRaw['prompt_tokens'] : 0,
    completionTokens:
      isRecord(usageRaw) && typeof usageRaw['completion_tokens'] === 'number' ? usageRaw['completion_tokens'] : 0,
  }

  return { ok: true, decision, line: textField(parsed, 'line') ?? '', usage }
}
