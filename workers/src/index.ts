/**
 * LLM 프록시 진입점. 라우팅과 CORS만 담당한다.
 *
 * 이 워커가 존재하는 이유는 "fetch를 대신 쏘는 것"이 아니라 **키를 둘 자리**다.
 * 앱은 정적 번들이라 브라우저가 Anthropic을 직접 부르면 키가 번들에 실린다(설계 §1.2).
 */

import { parseDecideRequest } from './schema'

/** 실패 응답의 code. 프론트는 이 값만 보고 폴백 여부를 정한다(설계 §3.3). */
type ErrorCode = 'invalid_request' | 'forbidden_origin' | 'not_found' | 'not_implemented'

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

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...(origin ? corsHeaders(origin) : {}),
    },
  })
}

function fail(code: ErrorCode, message: string, status: number, origin: string | null): Response {
  return json({ ok: false, code, message }, status, origin)
}

export default {
  async fetch(request: Request): Promise<Response> {
    const origin = allowedOrigin(request)
    const { pathname } = new URL(request.url)

    // Content-Type: application/json은 단순 요청이 아니라 프리플라이트가 반드시 온다.
    if (request.method === 'OPTIONS') {
      if (!origin) return new Response(null, { status: 403 })
      return new Response(null, { status: 204, headers: corsHeaders(origin) })
    }

    // 배포 확인용이라 오리진을 따지지 않는다. 키를 쓰지 않으므로 공개돼도 무해하다.
    if (pathname === '/health' && request.method === 'GET') {
      return json({ ok: true }, 200, origin)
    }

    if (pathname === '/decide' && request.method === 'POST') {
      if (!origin) return fail('forbidden_origin', '허용되지 않은 요청 출처다', 403, null)

      const parsed = parseDecideRequest(await request.text())
      if (!parsed.ok) return fail('invalid_request', parsed.message, 400, origin)

      // 예산 캡과 LLM 호출이 붙을 자리다.
      return fail('not_implemented', `${parsed.value.kind} 판단이 아직 붙지 않았다`, 501, origin)
    }

    return fail('not_found', '없는 경로다', 404, origin)
  },
} satisfies ExportedHandler
