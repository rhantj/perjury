/**
 * 시드 기반 난수. Math.random()을 쓰지 않는 이유는 재현성이다.
 * 시드 하나가 판 전체를 결정하므로 버그가 난 판을 그대로 다시 만들 수 있고,
 * 밸런싱 시뮬레이션도 같은 조건으로 반복할 수 있다.
 *
 * 암호용이 아니다. 게임 셔플에 필요한 품질만 만족하면 된다.
 */

/** FNV-1a — 시드 문자열을 32비트 정수로 접는다. */
function hashSeed(seed: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** mulberry32. 호출할 때마다 [0, 1) 난수를 낸다. */
export function createRng(seed: string): () => number {
  let a = hashSeed(seed)
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fisher-Yates. 원본 배열을 바꾸지 않는다. */
export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = out[i] as T
    out[i] = out[j] as T
    out[j] = tmp
  }
  return out
}

/** 배열에서 하나를 고른다. 빈 배열은 프로그래밍 오류다. */
export function pickOne<T>(items: readonly T[], rng: () => number): T {
  if (items.length === 0) throw new Error('빈 배열에서 고를 수 없다')
  return items[Math.floor(rng() * items.length)] as T
}
