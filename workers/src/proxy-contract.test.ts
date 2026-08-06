/// <reference types="vite/client" />
// 아래에서 프론트 판단자를 그대로 부르는데 그 경로의 proxy-url.ts가 import.meta.env.DEV를
// 쓴다(Vite가 정적 치환하는 자리라 손대지 않는다). 이 참조는 프로그램 전체에 퍼지므로
// 이 파일은 workers/tsconfig.contract.json이라는 «별도 프로그램»에서만 검사한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGame } from '../../src/engine/setup'
import { viewFor } from '../../src/engine/view'
import worker from './index'
import { createLlmDecider } from '../../src/ai/llm-decider'

/**
 * **워커와 프론트 사이의 이음매를 실제로 태우는 테스트다.**
 *
 * 양쪽이 각자 정합적인데 «서로 다른 계약»을 보고 있어도 각자의 테스트는 통과한다.
 * 실제로 그 일이 났다 — 워커는 accuseNow를 불리언으로 보내는데 프론트는 문자열
 * 'yes'와 비교했고, 워커 테스트도 프론트 테스트도 초록이었다. 기능만 죽어 있었다.
 *
 * 그래서 여기서는 대역을 «양쪽 다» 세우지 않는다. 상류(Anthropic)만 대역으로 세우고,
 * 워커가 만든 진짜 응답을 그대로 프론트 파서에 먹인다.
 */

/** budget.ts가 쓰는 것은 get·put 둘뿐이다. */
function fakeKv() {
  const store = new Map<string, string>()
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value)
    },
  } as unknown as KVNamespace
}

function envOf() {
  return {
    BUDGET: fakeKv(),
    ALLOWED_ORIGINS: 'https://example.test',
    LLM_API_KEY: 'test-key',
    LLM_MODEL: 'claude-opus-5',
  }
}

function viewOf() {
  const game = createGame({ seed: 'contract', humanIndex: 0 })
  const first = game.players[0]
  if (!first) throw new Error('플레이어가 없다')
  return viewFor(game, first.id)
}

/** Anthropic 대역. 구조화 출력은 text 블록에 JSON 문자열로 온다. */
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

/**
 * 모델이 이렇게 답했을 때 프론트가 무엇을 받는가.
 *
 * 워커를 진짜로 통과시킨다 — 응답 본문을 손으로 짓지 않는 것이 이 파일의 요점이다.
 */
async function throughProxy(modelAnswer: Record<string, unknown>) {
  fetchMock.mockResolvedValue(upstream(modelAnswer))
  const response = await worker.fetch(
    new Request('https://proxy.test/decide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://example.test' },
      body: JSON.stringify({
        v: 1,
        kind: 'suggest',
        sessionId: '11111111-1111-1111-1111-111111111111',
        view: viewOf(),
        names: {},
      }),
    }),
    envOf() as never,
  )
  const body = await response.text()

  // 이제 프론트가 «바로 그 본문»을 받는다.
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => JSON.parse(body) as unknown,
  } as unknown as Response)
  return createLlmDecider().chooseSuggestion(viewOf())
}

describe('워커 ↔ 프론트 계약 — 조기 고발', () => {
  const TRIPLE = { suspect: 's2', weapon: 'w3', place: 'p2' }

  it('모델이 외치겠다고 하면 프론트까지 고발 의사가 도착한다', async () => {
    const spoken = await throughProxy({ ...TRIPLE, line: '이 셋이오', accuseNow: 'yes' })

    expect(spoken.accuse).toEqual(TRIPLE)
  })

  it('모델이 안 외치면 고발 의사가 없다', async () => {
    const spoken = await throughProxy({ ...TRIPLE, line: '이 셋이오', accuseNow: 'no' })

    expect(spoken.accuse).toBeNull()
  })

  /** 옛 워커·범인 시야처럼 칸 자체가 없는 경우. 되돌릴 수 없는 쪽으로 틀리지 않는다. */
  it('칸이 없으면 고발하지 않는다', async () => {
    const spoken = await throughProxy({ ...TRIPLE, line: '이 셋이오' })

    expect(spoken.accuse).toBeNull()
  })
})
