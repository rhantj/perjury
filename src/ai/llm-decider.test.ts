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

function ok(decision: unknown, line: unknown = '대사') {
  return {
    ok: true,
    json: async () => ({ ok: true, kind: 'refute', decision, line, budget: { remaining: 9 } }),
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

    const spoken = await createLlmDecider().chooseClaim(viewOf())

    expect(spoken.value).toEqual({ kind: 'refute', cardId: 's2' })
  })

  it('pass 선언을 읽는다', async () => {
    fetchMock.mockResolvedValue(ok({ kind: 'pass' }))

    expect((await createLlmDecider().chooseClaim(viewOf())).value).toEqual({ kind: 'pass' })
  })

  it('이의제기 없음을 null로 읽는다', async () => {
    fetchMock.mockResolvedValue(ok(null))

    expect((await createLlmDecider().chooseChallengeTarget(viewOf())).value).toBeNull()
  })

  it('제안을 세 칸으로 읽는다', async () => {
    fetchMock.mockResolvedValue(ok({ suspect: 's1', weapon: 'w2', place: 'p3' }))

    expect((await createLlmDecider().chooseSuggestion(viewOf())).value).toEqual({
      suspect: 's1',
      weapon: 'w2',
      place: 'p3',
    })
  })

  it('view만 보내고 seed는 보내지 않는다', async () => {
    fetchMock.mockResolvedValue(ok({ kind: 'pass' }))

    await createLlmDecider().chooseClaim(viewOf())

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(Object.keys(body).sort()).toEqual(['kind', 'names', 'sessionId', 'v', 'view'])
    expect(body.view.seed).toBeUndefined()
  })

  /** 카드 이름표는 시야가 아니라 형제 필드다 — view는 시야 격리 계약이 걸린 자료다. */
  it('카드 표시 이름을 함께 보낸다', async () => {
    fetchMock.mockResolvedValue(ok({ kind: 'pass' }))

    await createLlmDecider(() => null, { w1: '명주 목도리' }).chooseClaim(viewOf())

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body.names).toEqual({ w1: '명주 목도리' })
    expect(body.view.names).toBeUndefined()
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

    expect((await decider.chooseClaim(viewOf())).value).toEqual({ kind: 'pass' })
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

/**
 * 대사는 화면에 그대로 오르는 외부 문자열이다. 여기가 좁히는 유일한 지점이라
 * 이상한 값이 들어와도 **판단까지 폴백으로 넘기지 않는다** — 말 한 줄 때문에 룰 판단을 잃는다.
 */
describe('createLlmDecider — 대사 좁히기', () => {
  const claimOf = () => createLlmDecider().chooseClaim(viewOf())

  it('대사를 그대로 실어 온다', async () => {
    fetchMock.mockResolvedValue(ok({ kind: 'pass' }, '그런 물건은 본 적 없소'))

    expect((await claimOf()).line).toBe('그런 물건은 본 적 없소')
  })

  it('줄바꿈은 한 줄로 눌러 담는다 — 말풍선이 세로로 터지지 않게', async () => {
    fetchMock.mockResolvedValue(ok({ kind: 'pass' }, '없소\n\n  정말이오'))

    expect((await claimOf()).line).toBe('없소 정말이오')
  })

  it('너무 길면 자른다 — 좌석 칸을 넘기면 판이 가려진다', async () => {
    fetchMock.mockResolvedValue(ok({ kind: 'pass' }, '가'.repeat(200)))

    const line = (await claimOf()).line

    expect(line).toHaveLength(61)
    expect(line?.endsWith('…')).toBe(true)
  })

  it('빈 대사와 문자열이 아닌 대사는 없는 것으로 읽는다', async () => {
    fetchMock.mockResolvedValue(ok({ kind: 'pass' }, '   '))
    expect((await claimOf()).line).toBeNull()

    fetchMock.mockResolvedValue(ok({ kind: 'pass' }, 42))
    expect((await claimOf()).line).toBeNull()
  })

  it('대사가 없어도 판단은 살아 있다 — 폴백으로 넘기지 않는다', async () => {
    fetchMock.mockResolvedValue(ok({ kind: 'refute', cardId: 's2' }, null))

    const spoken = await claimOf()

    expect(spoken.value).toEqual({ kind: 'refute', cardId: 's2' })
    expect(spoken.line).toBeNull()
  })
})

describe('createLlmDecider — 밀담', () => {
  it('kind: parley로 ask를 함께 보낸다', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, kind: 'parley', decision: null, line: '못 봤소' }),
    } as unknown as Response)

    await createLlmDecider().speakInParley(viewOf(), '왜 침묵했지')

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body.kind).toBe('parley')
    expect(body.ask).toBe('왜 침묵했지')
  })

  it('대사만 돌려준다', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, kind: 'parley', decision: null, line: '  못  봤소  ' }),
    } as unknown as Response)

    expect((await createLlmDecider().speakInParley(viewOf(), '묻는다'))?.line).toBe('못 봤소')
  })

  it('밀담 응답은 대사보다 넉넉히 120자까지 남긴다', async () => {
    const long = '가'.repeat(200)
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, kind: 'parley', decision: null, line: long }),
    } as unknown as Response)

    const reply = await createLlmDecider().speakInParley(viewOf(), '묻는다')

    expect(reply?.line).toBe(`${'가'.repeat(120)}…`)
  })

  it('실패하면 던진다 — 폴백 래퍼가 받는다', async () => {
    fetchMock.mockRejectedValue(new Error('끊김'))

    await expect(createLlmDecider().speakInParley(viewOf(), '묻는다')).rejects.toBeInstanceOf(
      LlmUnavailableError,
    )
  })
})

describe('createLlmDecider — 능력', () => {
  const BRIEF = { text: '한 명의 손패 1장을 확인한다.', needs: 'player' } as const
  const bodyOf = () => JSON.parse(fetchMock.mock.calls[0]?.[1]?.body ?? '{}')

  it('쓸 수 있으면 능력 개요를 함께 보낸다', async () => {
    fetchMock.mockResolvedValue(ok({ kind: 'pass' }))
    const decider = createLlmDecider(() => BRIEF)

    await decider.chooseClaim(viewOf())

    expect(bodyOf().power).toEqual(BRIEF)
  })

  /** 능력을 걷는 곳은 제안·반증뿐이다. 다른 kind에 실으면 답해도 버려지고 캐시만 흔들린다. */
  it('이의제기·고발·밀담에는 능력을 보내지 않는다', async () => {
    fetchMock.mockResolvedValue(ok(null))
    const decider = createLlmDecider(() => BRIEF)

    await decider.chooseChallengeTarget(viewOf())

    expect(bodyOf().power).toBeUndefined()
  })

  it('이미 썼으면 보내지 않는다', async () => {
    fetchMock.mockResolvedValue(ok({ kind: 'pass' }))
    const decider = createLlmDecider(() => BRIEF)

    await decider.chooseClaim({ ...viewOf(), powerSpent: true })

    expect(bodyOf().power).toBeUndefined()
  })

  it('고른 대상을 능력 의사로 옮긴다', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, decision: { kind: 'pass' }, line: '없소', usePowerOn: 'p3' }),
    } as unknown as Response)
    const decider = createLlmDecider(() => BRIEF)

    expect((await decider.chooseClaim(viewOf())).power).toEqual({ targetId: 'p3' })
  })

  it('"none"이면 안 쓴다', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, decision: { kind: 'pass' }, line: '없소', usePowerOn: 'none' }),
    } as unknown as Response)
    const decider = createLlmDecider(() => BRIEF)

    expect((await decider.chooseClaim(viewOf())).power).toBeNull()
  })
})
