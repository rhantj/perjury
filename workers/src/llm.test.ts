import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGame } from '../../src/engine/setup'
import { viewFor } from '../../src/engine/view'
import { decide } from './llm'
import type { LlmConfig } from './llm'

/** 실제 LLM을 부르지 않는다. fetch만 대역으로 세운다. */
function viewOf() {
  const game = createGame({ seed: 'anthropic-test', humanIndex: 0 })
  const first = game.players[0]
  if (!first) throw new Error('플레이어가 없다')
  return viewFor(game, first.id)
}

const config: LlmConfig = {
  baseUrl: 'https://api.anthropic.com/v1',
  model: 'claude-opus-5',
  apiKey: 'test-key',
  maxTokens: 2500,
  timeoutMs: 1000,
}

/** Anthropic 응답 모양. content는 배열이고 사고 블록이 앞에 올 수 있다. */
function reply(blocks: unknown[], extra: Record<string, unknown> = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      stop_reason: 'end_turn',
      content: blocks,
      usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 80 },
      ...extra,
    }),
  } as unknown as Response
}

function jsonBlock(value: unknown) {
  return { type: 'text', text: JSON.stringify(value) }
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function sentBody(): Record<string, unknown> {
  return JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
}

describe('decide — 요청 모양', () => {
  it('Messages 엔드포인트를 Anthropic 헤더로 부른다', async () => {
    fetchMock.mockResolvedValue(reply([jsonBlock({ kind: 'pass', cardId: 'none', line: '없소' })]))

    await decide(config, 'refute', viewOf())

    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect(init.headers['x-api-key']).toBe('test-key')
    expect(init.headers['anthropic-version']).toBe('2023-06-01')
    // Bearer는 OpenAI 형식이다. 남아 있으면 401이 난다.
    expect(init.headers['Authorization']).toBeUndefined()
  })

  it('system을 별도 필드로 올리고 messages에는 user만 남긴다', async () => {
    fetchMock.mockResolvedValue(reply([jsonBlock({ kind: 'pass', cardId: 'none', line: '없소' })]))

    await decide(config, 'refute', viewOf())

    const body = sentBody()
    const messages = body['messages'] as { role: string }[]
    expect(messages.every((m) => m.role === 'user')).toBe(true)
    expect(messages).toHaveLength(1)
    expect(body['system']).toHaveLength(2)
  })

  it('system 블록마다 캐시 지점을 찍는다 — 룰은 여섯 좌석이 공유한다', async () => {
    fetchMock.mockResolvedValue(reply([jsonBlock({ kind: 'pass', cardId: 'none', line: '없소' })]))

    await decide(config, 'refute', viewOf())

    const system = sentBody()['system'] as { cache_control?: unknown }[]
    expect(system.every((block) => block.cache_control)).toBe(true)
  })

  it('output_config로 스키마를 강제한다', async () => {
    fetchMock.mockResolvedValue(reply([jsonBlock({ kind: 'pass', cardId: 'none', line: '없소' })]))

    await decide(config, 'refute', viewOf())

    const output = sentBody()['output_config'] as { format?: { type?: string; schema?: unknown } }
    expect(output.format?.type).toBe('json_schema')
    expect(output.format?.schema).toMatchObject({ type: 'object' })
  })
})

describe('decide — 응답 읽기', () => {
  it('반증 선언을 엔진 타입으로 읽는다', async () => {
    fetchMock.mockResolvedValue(reply([jsonBlock({ kind: 'refute', cardId: 's2', line: '내게 있소' })]))

    const result = await decide(config, 'refute', viewOf())

    expect(result).toMatchObject({
      ok: true,
      decision: { kind: 'refute', decision: { kind: 'refute', cardId: 's2' } },
      line: '내게 있소',
    })
  })

  it('사고 블록이 앞에 와도 text 블록을 찾아 읽는다', async () => {
    fetchMock.mockResolvedValue(
      reply([
        { type: 'thinking', thinking: '손패를 살핀다' },
        jsonBlock({ kind: 'pass', cardId: 'none', line: '없소' }),
      ]),
    )

    const result = await decide(config, 'refute', viewOf())

    expect(result).toMatchObject({ ok: true, decision: { decision: { kind: 'pass' } } })
  })

  it('캐시 적중량까지 읽는다 — 캐싱이 실제로 도는지 보는 유일한 창이다', async () => {
    fetchMock.mockResolvedValue(reply([jsonBlock({ kind: 'pass', cardId: 'none', line: '없소' })]))

    const result = await decide(config, 'refute', viewOf())

    expect(result).toMatchObject({
      ok: true,
      usage: { promptTokens: 100, completionTokens: 20, cachedTokens: 80 },
    })
  })

  it('상한에 걸려 잘리면 내용을 읽기 전에 실패로 본다', async () => {
    fetchMock.mockResolvedValue(reply([], { stop_reason: 'max_tokens' }))

    expect(await decide(config, 'refute', viewOf())).toMatchObject({
      ok: false,
      code: 'invalid_upstream',
    })
  })

  it('text 블록이 없으면 실패로 본다', async () => {
    fetchMock.mockResolvedValue(reply([{ type: 'thinking', thinking: '음' }]))

    expect(await decide(config, 'refute', viewOf())).toMatchObject({
      ok: false,
      code: 'invalid_upstream',
    })
  })

  it('타임아웃을 다른 실패와 구분한다', async () => {
    const timeout = new Error('시간 초과')
    timeout.name = 'TimeoutError'
    fetchMock.mockRejectedValue(timeout)

    expect(await decide(config, 'refute', viewOf())).toMatchObject({ ok: false, code: 'upstream_timeout' })
  })

  it('상류 오류 본문을 밖으로 내보내지 않는다', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'invalid x-api-key sk-ant-secret' } }),
    } as unknown as Response)

    const result = await decide(config, 'refute', viewOf())

    expect(result).toMatchObject({ ok: false, code: 'upstream_error' })
    if (!result.ok) expect(result.detail).not.toContain('sk-ant')
  })
})

describe('decide — 조기 고발 의사를 프론트로 넘긴다 (3-C-2b)', () => {
  const TRIPLE = { suspect: 's2', weapon: 'w3', place: 'p2', line: '이 셋이오' }

  it('"yes"를 그대로 싣는다', async () => {
    fetchMock.mockResolvedValue(reply([jsonBlock({ ...TRIPLE, accuseNow: 'yes' })]))

    const result = await decide(config, 'suggest', viewOf())

    expect(result.ok && result.accuseNow).toBe(true)
  })

  it('"no"면 거짓으로 싣는다', async () => {
    fetchMock.mockResolvedValue(reply([jsonBlock({ ...TRIPLE, accuseNow: 'no' })]))

    const result = await decide(config, 'suggest', viewOf())

    expect(result.ok && result.accuseNow).toBe(false)
  })

  /*
   * 범인 시야와 최종 고발에는 이 칸이 아예 안 열린다(prompt.ts). 모델이 그래도 얹어 보내거나
   * 아예 빠뜨릴 수 있으므로, 「yes가 아니면 안 함」으로 닫는다 — 되돌릴 수 없는 쪽이다.
   */
  it('칸이 없으면 안 하는 것으로 읽는다', async () => {
    fetchMock.mockResolvedValue(reply([jsonBlock(TRIPLE)]))

    const result = await decide(config, 'suggest', viewOf())

    expect(result.ok && result.accuseNow).toBe(false)
  })
})
