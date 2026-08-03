import { beforeEach, describe, expect, it } from 'vitest'
import { capFrom, chargeCall, dayKey, peekRemaining, secondsUntilMidnight } from './budget'

/** KV 대역. 쓰기 횟수를 세어 무료 티어 예산 계산을 검증할 수 있게 한다. */
function fakeKv() {
  const store = new Map<string, string>()
  let writes = 0
  const kv = {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      writes += 1
      store.set(key, value)
    },
  }
  return { kv: kv as unknown as KVNamespace, store, writes: () => writes }
}

const NOON = new Date('2026-08-12T12:00:00.000Z')

describe('dayKey', () => {
  it('UTC 날짜를 키로 쓴다', () => {
    expect(dayKey(NOON)).toBe('2026-08-12')
  })
})

describe('secondsUntilMidnight', () => {
  it('다음 자정까지 남은 초를 센다', () => {
    expect(secondsUntilMidnight(NOON)).toBe(12 * 60 * 60)
  })

  it('자정 직전에도 0을 돌려주지 않는다', () => {
    expect(secondsUntilMidnight(new Date('2026-08-12T23:59:59.900Z'))).toBeGreaterThan(0)
  })
})

describe('capFrom', () => {
  it('문자열을 정수로 읽는다', () => {
    expect(capFrom('250', 400)).toBe(250)
  })

  it('값이 없거나 이상하면 기본값으로 떨어진다', () => {
    expect(capFrom(undefined, 400)).toBe(400)
    expect(capFrom('', 400)).toBe(400)
    expect(capFrom('0', 400)).toBe(400)
    expect(capFrom('없는값', 400)).toBe(400)
  })
})

describe('chargeCall', () => {
  let fake: ReturnType<typeof fakeKv>

  beforeEach(() => {
    fake = fakeKv()
  })

  it('첫 호출을 허용하고 남은 예산을 돌려준다', async () => {
    const verdict = await chargeCall(fake.kv, '1.1.1.1', NOON, 250, 120)

    expect(verdict.allowed).toBe(true)
    if (!verdict.allowed) return
    expect(verdict.remaining).toBe(249)
  })

  it('요청 하나가 쓰기를 정확히 2회 쓴다', async () => {
    await chargeCall(fake.kv, '1.1.1.1', NOON, 250, 120)

    expect(fake.writes()).toBe(2)
  })

  it('일일 캡에 도달하면 거부한다', async () => {
    await chargeCall(fake.kv, '1.1.1.1', NOON, 2, 120)
    await chargeCall(fake.kv, '2.2.2.2', NOON, 2, 120)
    const verdict = await chargeCall(fake.kv, '3.3.3.3', NOON, 2, 120)

    expect(verdict.allowed).toBe(false)
    if (verdict.allowed) return
    expect(verdict.reason).toBe('budget')
  })

  it('거부된 요청은 쓰기를 쓰지 않는다', async () => {
    await chargeCall(fake.kv, '1.1.1.1', NOON, 1, 120)
    const before = fake.writes()

    await chargeCall(fake.kv, '2.2.2.2', NOON, 1, 120)

    expect(fake.writes()).toBe(before)
  })

  it('IP 상한은 그 IP만 막는다', async () => {
    await chargeCall(fake.kv, '1.1.1.1', NOON, 250, 1)

    const blocked = await chargeCall(fake.kv, '1.1.1.1', NOON, 250, 1)
    const other = await chargeCall(fake.kv, '2.2.2.2', NOON, 250, 1)

    expect(blocked.allowed).toBe(false)
    if (!blocked.allowed) expect(blocked.reason).toBe('rate')
    expect(other.allowed).toBe(true)
  })

  it('거부 시 다음 자정까지의 초를 함께 준다', async () => {
    await chargeCall(fake.kv, '1.1.1.1', NOON, 1, 120)
    const verdict = await chargeCall(fake.kv, '1.1.1.1', NOON, 1, 120)

    expect(verdict.allowed).toBe(false)
    if (verdict.allowed) return
    expect(verdict.retryAfterSeconds).toBe(12 * 60 * 60)
  })

  it('날짜가 바뀌면 카운터가 새로 시작한다', async () => {
    await chargeCall(fake.kv, '1.1.1.1', NOON, 1, 120)

    const nextDay = await chargeCall(fake.kv, '1.1.1.1', new Date('2026-08-13T12:00:00.000Z'), 1, 120)

    expect(nextDay.allowed).toBe(true)
  })
})

describe('peekRemaining', () => {
  it('쓰기 없이 남은 예산만 읽는다', async () => {
    const fake = fakeKv()
    await chargeCall(fake.kv, '1.1.1.1', NOON, 250, 120)
    const before = fake.writes()

    const remaining = await peekRemaining(fake.kv, NOON, 250)

    expect(remaining).toBe(249)
    expect(fake.writes()).toBe(before)
  })
})
