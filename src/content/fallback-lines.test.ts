import { describe, expect, it } from 'vitest'
import { parleyLine } from './fallback-lines'

describe('parleyLine — 폴백 밀담 대사', () => {
  it('같은 자리·같은 salt면 같은 말이 나온다', () => {
    expect(parleyLine('s1', 'r3:p2')).toBe(parleyLine('s1', 'r3:p2'))
  })

  /** 8라운드 내내 같은 문장을 반복하면 폴백인 게 그대로 드러난다. */
  it('salt가 다르면 같은 말만 반복하지 않는다', () => {
    const said = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((round) => parleyLine('s1', `r${round}`)))

    expect(said.size).toBeGreaterThan(1)
  })

  it('캐릭터마다 말투가 다르다', () => {
    expect(parleyLine('s1', 'x')).not.toBe(parleyLine('s6', 'x'))
  })

  it('모르는 캐릭터도 화면이 비지 않는다', () => {
    expect(parleyLine('없는-카드', 'x').length).toBeGreaterThan(0)
  })
})
