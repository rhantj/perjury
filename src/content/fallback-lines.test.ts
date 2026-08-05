import { describe, expect, it } from 'vitest'
import { parleyLine } from './fallback-lines'

describe('parleyLine — 폴백 밀담 대사', () => {
  it('같은 자리·같은 salt면 같은 말이 나온다', () => {
    expect(parleyLine('s1', 'r3:p2')).toBe(parleyLine('s1', 'r3:p2'))
  })

  /**
   * 한 판이 8라운드다. 캐릭터마다 쓸 말이 몇 개 안 되면 같은 문장이 반복되고
   * 폴백이라는 게 그대로 드러난다. 대사를 손댈 때 이 하한이 무너지지 않게 잡아 둔다.
   */
  it('캐릭터마다 서로 다른 말이 4개 이상 나온다', () => {
    const salts = Array.from({ length: 20 }, (_, i) => `r${i}`)

    for (const characterId of ['s1', 's2', 's3', 's4', 's5', 's6']) {
      const said = new Set(salts.map((salt) => parleyLine(characterId, salt)))

      expect(said.size, `${characterId}의 대사가 모자라다`).toBeGreaterThanOrEqual(4)
    }
  })

  it('캐릭터마다 말투가 다르다', () => {
    expect(parleyLine('s1', 'x')).not.toBe(parleyLine('s6', 'x'))
  })

  it('모르는 캐릭터도 화면이 비지 않는다', () => {
    expect(parleyLine('없는-카드', 'x').length).toBeGreaterThan(0)
  })
})
