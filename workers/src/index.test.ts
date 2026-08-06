import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGame } from '../../src/engine/setup'
import { viewFor } from '../../src/engine/view'
import worker from './index'

/**
 * **응답 계약을 묶는 테스트다.** 워커가 프론트에 무엇을 돌려주는지가 여기서 정해진다.
 *
 * llm.ts가 값을 만들어도 이 파일이 응답 객체에 안 실으면 프론트는 영영 못 본다.
 * 실제로 조기 고발(3-C-2b)이 그렇게 죽어 있었다 — 상류 파싱은 됐는데 이 한 줄이 없었다.
 * 필드를 늘릴 때 여기까지 왔는지 확인하는 자리다.
 */

/** budget.ts가 쓰는 것은 get·put 둘뿐이다. 그만큼만 세운다. */
function fakeKv() {
  const store = new Map<string, string>()
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value)
    },
  } as unknown as KVNamespace
}

const env = {
  BUDGET: fakeKv(),
  ALLOWED_ORIGINS: 'https://example.test',
  LLM_API_KEY: 'test-key',
  LLM_MODEL: 'claude-opus-5',
}

function viewOf() {
  const game = createGame({ seed: 'index-test', humanIndex: 0 })
  const first = game.players[0]
  if (!first) throw new Error('플레이어가 없다')
  return viewFor(game, first.id)
}

function decideRequest(): Request {
  return new Request('https://proxy.test/decide', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://example.test' },
    body: JSON.stringify({
      v: 1,
      kind: 'suggest',
      sessionId: '11111111-1111-1111-1111-111111111111',
      view: viewOf(),
      names: {},
    }),
  })
}

/** Anthropic 응답 대역. 구조화 출력은 text 블록에 JSON 문자열로 온다. */
function upstream(decision: Record<string, unknown>) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: JSON.stringify(decision) }],
      usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0 },
    }),
  } as unknown as Response
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('/decide 응답 계약', () => {
  const TRIPLE = { suspect: 's2', weapon: 'w3', place: 'p2', line: '이 셋이오' }

  it('조기 고발 의사를 응답에 싣는다', async () => {
    fetchMock.mockResolvedValue(upstream({ ...TRIPLE, accuseNow: 'yes' }))

    const response = await worker.fetch(decideRequest(), env as never)
    const body = (await response.json()) as Record<string, unknown>

    expect(response.status).toBe(200)
    expect(body['accuseNow']).toBe(true)
  })

  it('고발하지 않겠다는 답도 그대로 싣는다', async () => {
    fetchMock.mockResolvedValue(upstream({ ...TRIPLE, accuseNow: 'no' }))

    const body = (await (await worker.fetch(decideRequest(), env as never)).json()) as Record<
      string,
      unknown
    >

    expect(body['accuseNow']).toBe(false)
  })

  /** 칸이 없으면 «안 함»이다. 되돌릴 수 없는 쪽으로 틀리지 않게 닫는다. */
  it('칸이 없으면 안 하는 것으로 싣는다', async () => {
    fetchMock.mockResolvedValue(upstream(TRIPLE))

    const body = (await (await worker.fetch(decideRequest(), env as never)).json()) as Record<
      string,
      unknown
    >

    expect(body['accuseNow']).toBe(false)
  })
})
