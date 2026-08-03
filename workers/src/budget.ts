/**
 * 호출 카운터. 일일 총 예산과 IP별 상한을 센다.
 *
 * **이건 과금 정확도가 아니라 폭주 가드레일이다.**
 * KV는 최종적 일관성이라 동시 요청이 서로의 증가를 덮어써 몇 회 샌다.
 * 그래서 캡을 실제 감당치보다 낮게 잡고, 몇 회 새는 것은 설계상 허용한다(설계 §6.3).
 *
 * 무료 티어 쓰기 1,000회/일 ÷ 요청당 쓰기 2회 = **일일 캡의 물리적 상한이 400**이다.
 * 캡을 넘긴 요청은 쓰기 없이 즉시 끊으므로, 초과 트래픽이 쓰기 할당량을 먹지 않는다.
 */

export type BudgetVerdict =
  | { readonly allowed: true; readonly remaining: number }
  | { readonly allowed: false; readonly reason: 'budget' | 'rate'; readonly retryAfterSeconds: number }

/** UTC 기준 날짜 문자열. 카운터 키와 만료의 단위다. */
export function dayKey(now: Date): string {
  const iso = now.toISOString()
  const day = iso.slice(0, 10)
  return day
}

/** 다음 자정(UTC)까지 남은 초. KV TTL과 Retry-After에 함께 쓴다. */
export function secondsUntilMidnight(now: Date): number {
  const midnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    0,
    0,
    0,
  )
  return Math.max(1, Math.ceil((midnight - now.getTime()) / 1000))
}

async function readCount(kv: KVNamespace, key: string): Promise<number> {
  const raw = await kv.get(key)
  if (raw === null) return 0
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

/**
 * 한 호출을 예산에 기록하고 허용 여부를 돌려준다.
 *
 * **읽기를 먼저 하고, 넘으면 쓰지 않는다.** KV 무료 티어에서 읽기는 100,000회/일로 넉넉하지만
 * 쓰기는 1,000회/일뿐이라, 거부할 요청에까지 쓰기를 쓰면 어뷰저가 할당량을 태울 수 있다.
 */
export async function chargeCall(
  kv: KVNamespace,
  ip: string,
  now: Date,
  dailyCap: number,
  ipCap: number,
): Promise<BudgetVerdict> {
  const day = dayKey(now)
  const ttl = secondsUntilMidnight(now)
  const budgetKey = `budget:${day}`
  const ipKey = `rl:${day}:${ip}`

  const [used, usedByIp] = await Promise.all([readCount(kv, budgetKey), readCount(kv, ipKey)])

  if (used >= dailyCap) return { allowed: false, reason: 'budget', retryAfterSeconds: ttl }
  if (usedByIp >= ipCap) return { allowed: false, reason: 'rate', retryAfterSeconds: ttl }

  await Promise.all([
    kv.put(budgetKey, String(used + 1), { expirationTtl: ttl }),
    kv.put(ipKey, String(usedByIp + 1), { expirationTtl: ttl }),
  ])

  return { allowed: true, remaining: Math.max(0, dailyCap - (used + 1)) }
}

/** 쓰기 없이 남은 예산만 본다. /health가 쓴다. */
export async function peekRemaining(kv: KVNamespace, now: Date, dailyCap: number): Promise<number> {
  const used = await readCount(kv, `budget:${dayKey(now)}`)
  return Math.max(0, dailyCap - used)
}

/** 환경변수는 문자열로 온다. 값이 이상하면 안전한 쪽(기본값)으로 떨어진다. */
export function capFrom(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}
