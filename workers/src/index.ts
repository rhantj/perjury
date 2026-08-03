/**
 * LLM 프록시 진입점. 라우팅과 CORS만 담당한다.
 *
 * 이 워커가 존재하는 이유는 "fetch를 대신 쏘는 것"이 아니라 **키를 둘 자리**다.
 * 앱은 정적 번들이라 브라우저가 Anthropic을 직접 부르면 키가 번들에 실린다(설계 §1.2).
 */

import { capFrom, chargeCall, peekRemaining } from './budget'
import { decide } from './llm'
import type { LlmConfig } from './llm'
import { parseDecideRequest } from './schema'

/** 실패 응답의 code. 프론트는 이 값만 보고 폴백 여부를 정한다(설계 §3.3). */
type ErrorCode =
  | 'invalid_request'
  | 'forbidden_origin'
  | 'rate_limited'
  | 'budget_exhausted'
  | 'not_found'
  | 'upstream_error'
  | 'upstream_timeout'
  | 'invalid_upstream'
  | 'not_configured'

interface Env {
  readonly BUDGET: KVNamespace
  readonly DAILY_CALL_CAP?: string
  readonly IP_DAILY_CALL_CAP?: string
  /** OpenAI 호환 엔드포인트. 로컬 올라마는 http://127.0.0.1:11434/v1 */
  readonly LLM_BASE_URL?: string
  readonly LLM_MODEL?: string
  readonly LLM_MAX_TOKENS?: string
  /** 시크릿. 로컬 올라마는 없어도 된다. */
  readonly LLM_API_KEY?: string
}

/** 무료 티어 쓰기 1,000회/일 ÷ 요청당 2회. 환경변수가 비었을 때의 안전한 상한이다. */
const DEFAULT_DAILY_CAP = 250
const DEFAULT_IP_CAP = 120
/** thinking을 쓰는 모델은 응답 전에 상한을 다 쓸 수 있다. 넉넉히 잡는다. */
const DEFAULT_MAX_TOKENS = 2500
/** 프론트(30초)보다 짧게 잡아야 어떤 실패인지 code로 알 수 있다(설계 §7.1). */
const UPSTREAM_TIMEOUT_MS = 25_000

/**
 * CORS 허용 오리진. `*`를 쓰지 않고 일치하는 값을 그대로 에코한다(설계 §6.1).
 *
 * **이것은 접근 제어가 아니다.** curl은 Origin 헤더를 마음대로 넣는다.
 * 실제 방어선은 스키마 검증·레이트리밋·예산 캡이고, 여기서 막는 것은
 * "다른 웹사이트가 우리 프록시를 쓰는 것"뿐이다.
 */
const ALLOWED_ORIGINS: readonly string[] = [
  'https://rhantj.github.io',
  'http://localhost:5173',
]

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    // 없으면 CDN이 한 오리진에 준 응답을 다른 오리진에도 준다.
    Vary: 'Origin',
  }
}

/** 허용 목록에 있으면 그 오리진을, 아니면 null. null이면 CORS 헤더를 붙이지 않는다. */
function allowedOrigin(request: Request): string | null {
  const origin = request.headers.get('Origin')
  if (!origin) return null
  return ALLOWED_ORIGINS.includes(origin) ? origin : null
}

function json(
  body: unknown,
  status: number,
  origin: string | null,
  extra: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...(origin ? corsHeaders(origin) : {}),
      ...extra,
    },
  })
}

function fail(
  code: ErrorCode,
  message: string,
  status: number,
  origin: string | null,
  extra: Record<string, string> = {},
): Response {
  return json({ ok: false, code, message }, status, origin, extra)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = allowedOrigin(request)
    const { pathname } = new URL(request.url)
    const dailyCap = capFrom(env.DAILY_CALL_CAP, DEFAULT_DAILY_CAP)

    // Content-Type: application/json은 단순 요청이 아니라 프리플라이트가 반드시 온다.
    if (request.method === 'OPTIONS') {
      if (!origin) return new Response(null, { status: 403 })
      return new Response(null, { status: 204, headers: corsHeaders(origin) })
    }

    // 배포 확인용이라 오리진을 따지지 않는다. 키를 쓰지 않으므로 공개돼도 무해하다.
    if (pathname === '/health' && request.method === 'GET') {
      const remaining = await peekRemaining(env.BUDGET, new Date(), dailyCap)
      return json({ ok: true, budget: { remaining } }, 200, origin)
    }

    if (pathname === '/decide' && request.method === 'POST') {
      if (!origin) return fail('forbidden_origin', '허용되지 않은 요청 출처다', 403, null)

      const parsed = parseDecideRequest(await request.text())
      if (!parsed.ok) return fail('invalid_request', parsed.message, 400, origin)

      /**
       * X-Forwarded-For는 위조 가능하다. CF-Connecting-IP는 Cloudflare가 붙이므로 클라이언트가 못 건드린다.
       * 로컬 dev에는 이 헤더가 없어 'local'로 묶인다.
       */
      const ip = request.headers.get('CF-Connecting-IP') ?? 'local'
      const verdict = await chargeCall(
        env.BUDGET,
        ip,
        new Date(),
        dailyCap,
        capFrom(env.IP_DAILY_CALL_CAP, DEFAULT_IP_CAP),
      )

      if (!verdict.allowed) {
        const budgetGone = verdict.reason === 'budget'
        return fail(
          budgetGone ? 'budget_exhausted' : 'rate_limited',
          budgetGone ? '오늘 LLM 예산을 다 썼다' : '요청이 너무 잦다',
          budgetGone ? 503 : 429,
          origin,
          { 'Retry-After': String(verdict.retryAfterSeconds) },
        )
      }

      /**
       * 설정이 없으면 조용히 성공하지 않고 503으로 끊는다.
       * 프론트가 폴백으로 넘어가므로 게임은 계속 돈다 — 잘못 배포해도 판이 죽지 않게 하려는 것이다.
       */
      if (!env.LLM_BASE_URL || !env.LLM_MODEL) {
        return fail('not_configured', 'LLM 설정이 없다', 503, origin)
      }

      const config: LlmConfig = {
        baseUrl: env.LLM_BASE_URL,
        model: env.LLM_MODEL,
        apiKey: env.LLM_API_KEY,
        maxTokens: capFrom(env.LLM_MAX_TOKENS, DEFAULT_MAX_TOKENS),
        timeoutMs: UPSTREAM_TIMEOUT_MS,
      }

      const result = await decide(config, parsed.value.kind, parsed.value.view)
      if (!result.ok) {
        const status = result.code === 'upstream_timeout' ? 504 : result.code === 'invalid_upstream' ? 502 : 503
        return fail(result.code, result.detail, status, origin)
      }

      return json(
        {
          ok: true,
          kind: parsed.value.kind,
          decision: result.decision.decision,
          line: result.line,
          budget: { remaining: verdict.remaining },
        },
        200,
        origin,
        { 'X-Upstream-Tokens': `${result.usage.promptTokens}/${result.usage.completionTokens}` },
      )
    }

    return fail('not_found', '없는 경로다', 404, origin)
  },
} satisfies ExportedHandler<Env>
