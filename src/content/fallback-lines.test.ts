import { describe, expect, it } from 'vitest'
import {
  caughtLine,
  clearedLine,
  parleyLine,
  passLine,
  refuteLine,
  suggestLine,
  wrongCallLine,
} from './fallback-lines'

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

describe('이의제기 판정 반응', () => {
  /*
   * 이 셋이 비면 판이 뒤집힌 순간에 아무도 반응하지 않는다 — 위증이 들통난 사람이
   * 방금 한 거짓말을 계속 말하고 있는 화면이 된다. 여섯 명 전원에게 있어야 한다.
   */
  const CHARACTERS = ['s1', 's2', 's3', 's4', 's5', 's6']

  it('여섯 캐릭터 모두 발각·결백·오판 대사를 갖는다', () => {
    for (const id of CHARACTERS) {
      expect(caughtLine(id).length).toBeGreaterThan(0)
      expect(clearedLine(id).length).toBeGreaterThan(0)
      expect(wrongCallLine(id, '참가3').length).toBeGreaterThan(0)
    }
  })

  it('같은 판정이라도 서 있는 자리가 다르면 다른 말을 한다', () => {
    // 들킨 쪽과 누명을 벗은 쪽이 같은 문장을 말하면 판정을 읽을 수 없다.
    for (const id of CHARACTERS) {
      expect(caughtLine(id)).not.toBe(clearedLine(id))
    }
  })

  it('인물마다 다른 말투다 — 전원이 같은 문장이면 폴백이 티 난다', () => {
    expect(new Set(CHARACTERS.map(caughtLine)).size).toBe(CHARACTERS.length)
    expect(new Set(CHARACTERS.map(clearedLine)).size).toBe(CHARACTERS.length)
  })

  it('오판 대사는 지목했던 상대를 부른다', () => {
    for (const id of CHARACTERS) {
      expect(wrongCallLine(id, '참가4')).toContain('참가4')
    }
  })

  it('모르는 characterId여도 빈 문자열을 내지 않는다', () => {
    expect(caughtLine('zzz').length).toBeGreaterThan(0)
    expect(clearedLine('zzz').length).toBeGreaterThan(0)
    expect(wrongCallLine('zzz', '참가1')).toContain('참가1')
  })
})

/**
 * 라운드마다 되풀이되는 세 자리. 반증은 라운드당 5회씩 나가므로 한 판에 40번 가까이 뜬다.
 * 캐릭터당 한 줄만 두면 폴백이라는 것이 대사만 봐도 드러난다 — 밀담과 같은 하한을 건다.
 */
describe('되풀이되는 대사 — 반증·넘김·제안', () => {
  const CHARACTERS = ['s1', 's2', 's3', 's4', 's5', 's6']
  const SALTS = Array.from({ length: 20 }, (_, i) => `r${i}`)

  it('반증은 캐릭터마다 서로 다른 말이 3개 이상 나온다', () => {
    for (const id of CHARACTERS) {
      const said = new Set(SALTS.map((salt) => refuteLine(id, '대리석 문진', salt)))

      expect(said.size, `${id}의 반증 대사가 모자라다`).toBeGreaterThanOrEqual(3)
    }
  })

  it('넘김은 캐릭터마다 서로 다른 말이 3개 이상 나온다', () => {
    for (const id of CHARACTERS) {
      const said = new Set(SALTS.map((salt) => passLine(id, salt)))

      expect(said.size, `${id}의 넘김 대사가 모자라다`).toBeGreaterThanOrEqual(3)
    }
  })

  it('제안은 캐릭터마다 서로 다른 말이 3개 이상 나온다', () => {
    for (const id of CHARACTERS) {
      const said = new Set(SALTS.map((salt) => suggestLine(id, salt)))

      expect(said.size, `${id}의 제안 대사가 모자라다`).toBeGreaterThanOrEqual(3)
    }
  })

  /** 리렌더마다 말이 바뀌면 좌석이 딸꾹질한다. 같은 자리는 언제 그려도 같은 말이어야 한다. */
  it('같은 salt면 같은 말이 나온다', () => {
    expect(refuteLine('s1', '아편팅크', 'r2:p3')).toBe(refuteLine('s1', '아편팅크', 'r2:p3'))
    expect(passLine('s4', 'r2:p3')).toBe(passLine('s4', 'r2:p3'))
    expect(suggestLine('s6', 'r2')).toBe(suggestLine('s6', 'r2'))
  })

  /** 반증은 «무엇을» 쥐고 있는지가 정보다. 어느 줄이 나와도 카드 이름이 빠지면 안 된다. */
  it('반증은 어떤 줄이 나와도 카드 이름을 말한다', () => {
    for (const id of CHARACTERS) {
      for (const salt of SALTS) {
        expect(refuteLine(id, '명주 목도리', salt)).toContain('명주 목도리')
      }
    }
  })

  it('캐릭터마다 말투가 다르다', () => {
    expect(passLine('s1', 'x')).not.toBe(passLine('s6', 'x'))
  })

  it('모르는 캐릭터도 화면이 비지 않는다', () => {
    expect(refuteLine('없는-카드', '계단', 'x').length).toBeGreaterThan(0)
    expect(passLine('없는-카드', 'x').length).toBeGreaterThan(0)
    expect(suggestLine('없는-카드', 'x').length).toBeGreaterThan(0)
  })
})
