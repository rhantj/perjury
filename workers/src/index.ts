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
  /** 쉼표로 구분한 CORS 허용 오리진. 비면 배포용 기본값만 쓴다. */
  readonly ALLOWED_ORIGINS?: string
  /** Anthropic Messages API 베이스. 비우면 기본값을 쓴다. */
  readonly LLM_BASE_URL?: string
  readonly LLM_MODEL?: string
  readonly LLM_MAX_TOKENS?: string
  /** 시크릿. `wrangler secret put LLM_API_KEY`로만 넣는다 — 이게 워커가 존재하는 이유다. */
  readonly LLM_API_KEY?: string
}

/** 무료 티어 쓰기 1,000회/일 ÷ 요청당 2회. 환경변수가 비었을 때의 안전한 상한이다. */
const DEFAULT_DAILY_CAP = 250
const DEFAULT_IP_CAP = 120
/** thinking을 껐다(llm.ts) — 구조화 출력 하나 + 대사 한 줄이면 넉넉하다. */
const DEFAULT_MAX_TOKENS = 700
const DEFAULT_BASE_URL = 'https://api.anthropic.com/v1'
/** 기본 모델은 프로젝트 규칙에 고정돼 있다. 바꾸려면 LLM_MODEL로 덮는다. */
const DEFAULT_MODEL = 'claude-opus-5'
/**
 * 프론트(20초)보다 짧게 잡아야 어떤 실패인지 code로 알 수 있다(설계 §7.1).
 *
 * 15초는 «기다려 주는 시간»이 아니라 «끊는 시간»이다. 실측(2026-08-05, 배포본 23건)에서
 * 정상 응답은 4~7초였고, 넘긴 것은 25초를 다 쓰고 죽은 낙오 한 건뿐이었다 —
 * 그 사이에 끝나는 응답이 없다. 상한을 여기 두면 폴백이 10초 빨리 온다(결정 010).
 */
const UPSTREAM_TIMEOUT_MS = 15_000

/**
 * CORS 허용 오리진의 기본값. 배포본에는 이것만 남는다 —
 * 개발용 localhost는 `--var ALLOWED_ORIGINS:...`로 로컬에서만 얹는다.
 *
 * **이것은 접근 제어가 아니다.** curl은 Origin 헤더를 마음대로 넣는다.
 * 실제 방어선은 스키마 검증·레이트리밋·예산 캡이고, 여기서 막는 것은
 * "다른 웹사이트가 우리 프록시를 쓰는 것"뿐이다.
 */
const DEFAULT_ORIGINS: readonly string[] = ['https://rhantj.github.io']

function allowedOrigins(env: Env): readonly string[] {
  const configured = env.ALLOWED_ORIGINS?.split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
  return configured && configured.length > 0 ? configured : DEFAULT_ORIGINS
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    /*
     * 이게 없으면 브라우저가 X-Upstream-Tokens를 통째로 감춘다 — 워커가 붙여 보내도
     * 프론트에서는 null로만 읽힌다. 캐시 적중을 볼 수 있는 창이 이 헤더 하나뿐이라,
     * 노출하지 않으면 배포본에서 프리픽스 캐싱이 도는지 확인할 방법이 없다.
     * 토큰 수는 비밀이 아니다.
     */
    'Access-Control-Expose-Headers': 'X-Upstream-Tokens',
    // 없으면 CDN이 한 오리진에 준 응답을 다른 오리진에도 준다.
    Vary: 'Origin',
  }
}

/** 허용 목록에 있으면 그 오리진을, 아니면 null. null이면 CORS 헤더를 붙이지 않는다. */
function allowedOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get('Origin')
  if (!origin) return null
  return allowedOrigins(env).includes(origin) ? origin : null
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
    const origin = allowedOrigin(request, env)
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
       * 키가 없으면 조용히 성공하지 않고 503으로 끊는다.
       * 프론트가 폴백으로 넘어가므로 게임은 계속 돈다 — 잘못 배포해도 판이 죽지 않게 하려는 것이다.
       * 주소·모델은 기본값이 있지만 키는 없다. 시크릿을 안 넣은 배포가 여기서 걸린다.
       */
      if (!env.LLM_API_KEY) {
        return fail('not_configured', 'LLM 설정이 없다', 503, origin)
      }

      const config: LlmConfig = {
        baseUrl: env.LLM_BASE_URL ?? DEFAULT_BASE_URL,
        model: env.LLM_MODEL ?? DEFAULT_MODEL,
        apiKey: env.LLM_API_KEY,
        maxTokens: capFrom(env.LLM_MAX_TOKENS, DEFAULT_MAX_TOKENS),
        timeoutMs: UPSTREAM_TIMEOUT_MS,
      }

      const result = await decide(
        config,
        parsed.value.kind,
        parsed.value.view,
        parsed.value.ask,
        parsed.value.power,
        parsed.value.names,
      )
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
          usePowerOn: result.usePowerOn,
          truthful: result.truthful,
          budget: { remaining: verdict.remaining },
        },
        200,
        origin,
        {
          // 입력/출력/캐시적중. D5 비용 실측 때 캐싱이 도는지 보는 창이다.
          'X-Upstream-Tokens': `${result.usage.promptTokens}/${result.usage.completionTokens}/${result.usage.cachedTokens}`,
        },
      )
    }

    return fail('not_found', '없는 경로다', 404, origin)
  },
} satisfies ExportedHandler<Env>
