import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGame } from '../engine/setup'
import { viewFor } from '../engine/view'
import { createLlmDecider, llmDeciderForRound, LlmUnavailableError } from './llm-decider'

/** LLM을 부르지 않는다. fetch만 대역으로 세운다. */
function viewOf() {
  const game = createGame({ seed: 'llm-test', humanIndex: 0 })
  const first = game.players[0]
  if (!first) throw new Error('플레이어가 없다')
  return viewFor(game, first.id)
}

function ok(decision: unknown) {
  return {
    ok: true,
    json: async () => ({ ok: true, kind: 'refute', decision, line: '대사', budget: { remaining: 9 } }),
  } as unknown as Response
}

function err(status: number, code: string) {
  return {
    ok: false,
    status,
    json: async () => ({ ok: false, code, message: code }),
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

describe('createLlmDecider', () => {
  it('성공 응답을 엔진 타입으로 돌려준다', async () => {
    fetchMock.mockResolvedValue(ok({ kind: 'refute', cardId: 's2' }))

    const claim = await createLlmDecider().chooseClaim(viewOf())

    expect(claim).toEqual({ kind: 'refute', cardId: 's2' })
  })

  it('pass 선언을 읽는다', async () => {
    fetchMock.mockResolvedValue(ok({ kind: 'pass' }))

    expect(await createLlmDecider().chooseClaim(viewOf())).toEqual({ kind: 'pass' })
  })

  it('이의제기 없음을 null로 읽는다', async () => {
    fetchMock.mockResolvedValue(ok(null))

    expect(await createLlmDecider().chooseChallengeTarget(viewOf())).toBeNull()
  })

  it('제안을 세 칸으로 읽는다', async () => {
    fetchMock.mockResolvedValue(ok({ suspect: 's1', weapon: 'w2', place: 'p3' }))

    expect(await createLlmDecider().chooseSuggestion(viewOf())).toEqual({
      suspect: 's1',
      weapon: 'w2',
      place: 'p3',
    })
  })

  it('view만 보내고 seed는 보내지 않는다', async () => {
    fetchMock.mockResolvedValue(ok({ kind: 'pass' }))

    await createLlmDecider().chooseClaim(viewOf())

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(Object.keys(body).sort()).toEqual(['kind', 'sessionId', 'v', 'view'])
    expect(body.view.seed).toBeUndefined()
  })

  it('네트워크 실패를 던진다', async () => {
    fetchMock.mockRejectedValue(new Error('끊김'))

    await expect(createLlmDecider().chooseClaim(viewOf())).rejects.toBeInstanceOf(LlmUnavailableError)
  })

  it('프록시 오류 code를 그대로 실어 던진다', async () => {
    fetchMock.mockResolvedValue(err(504, 'upstream_timeout'))

    await expect(createLlmDecider().chooseClaim(viewOf())).rejects.toMatchObject({
      code: 'upstream_timeout',
      fallbackReason: 'error',
    })
  })

  it('모양이 다른 응답을 던진다', async () => {
    fetchMock.mockResolvedValue(ok({ kind: 'refute' }))

    await expect(createLlmDecider().chooseClaim(viewOf())).rejects.toMatchObject({ code: 'malformed' })
  })

  it('예산 소진은 fallbackReason이 budget이다', async () => {
    fetchMock.mockResolvedValue(err(503, 'budget_exhausted'))

    await expect(createLlmDecider().chooseClaim(viewOf())).rejects.toMatchObject({
      fallbackReason: 'budget',
    })
  })

  it('예산 소진 이후에는 fetch를 하지 않는다', async () => {
    fetchMock.mockResolvedValue(err(503, 'budget_exhausted'))
    const decider = createLlmDecider()

    await expect(decider.chooseClaim(viewOf())).rejects.toThrow()
    const afterFirst = fetchMock.mock.calls.length
    await expect(decider.chooseClaim(viewOf())).rejects.toThrow()

    expect(fetchMock.mock.calls.length).toBe(afterFirst)
  })

  it('일시 장애는 다음 호출에서 다시 시도한다', async () => {
    fetchMock.mockResolvedValueOnce(err(503, 'upstream_error')).mockResolvedValue(ok({ kind: 'pass' }))
    const decider = createLlmDecider()

    await expect(decider.chooseClaim(viewOf())).rejects.toThrow()

    expect(await decider.chooseClaim(viewOf())).toEqual({ kind: 'pass' })
  })
})

describe('llmDeciderForRound', () => {
  it('라운드가 달라도 같은 인스턴스를 준다 — 예산 소진 표시가 판 전체에 남아야 한다', async () => {
    fetchMock.mockResolvedValue(err(503, 'budget_exhausted'))
    const forRound = llmDeciderForRound()

    await expect(forRound(1).chooseClaim(viewOf())).rejects.toThrow()
    const afterFirst = fetchMock.mock.calls.length
    await expect(forRound(2).chooseClaim(viewOf())).rejects.toThrow()

    expect(fetchMock.mock.calls.length).toBe(afterFirst)
  })
})
