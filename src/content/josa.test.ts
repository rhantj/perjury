import { describe, expect, it } from 'vitest'
import { josa } from './josa'

describe('josa — 받침에 따라 갈리는 조사', () => {
  it('받침이 없으면 로·를·가·는', () => {
    expect(josa('서재', 'ro')).toBe('서재로')
    expect(josa('서재', 'eul')).toBe('서재를')
    expect(josa('서재', 'i')).toBe('서재가')
    expect(josa('서재', 'eun')).toBe('서재는')
  })

  it('받침이 있으면 으로·을·이·은', () => {
    expect(josa('문태석', 'ro')).toBe('문태석으로')
    expect(josa('옥상', 'eul')).toBe('옥상을')
    expect(josa('백나경', 'i')).toBe('백나경이')
    expect(josa('옥상', 'eun')).toBe('옥상은')
  })

  /** 「크」는 ㅋ으로 시작할 뿐 받침이 없다. 글자 모양만 보고 판단하면 틀리는 예다. */
  it('아편팅크는 받침이 없다', () => {
    expect(josa('아편팅크', 'ro')).toBe('아편팅크로')
  })

  /** 로/으로만 ㄹ받침을 받침 없는 것처럼 다룬다. 나머지 조사는 그렇지 않다. */
  it('ㄹ받침은 로를 쓰지만 을·이·은은 받침 규칙을 그대로 따른다', () => {
    expect(josa('응접실', 'ro')).toBe('응접실로')
    expect(josa('응접실', 'eul')).toBe('응접실을')
    expect(josa('응접실', 'i')).toBe('응접실이')
    expect(josa('응접실', 'eun')).toBe('응접실은')
  })

  /**
   * 좌석 이름이 «참가1»처럼 숫자로 끝난다. 숫자는 읽는 소리의 받침을 따른다 —
   * 1은 «일»이라 ㄹ받침, 2는 «이»라 받침이 없다. 글자만 보면 둘 다 받침이 없어 보인다.
   */
  it('숫자로 끝나면 읽는 소리의 받침을 따른다', () => {
    expect(josa('참가1', 'i')).toBe('참가1이')
    expect(josa('참가2', 'i')).toBe('참가2가')
    expect(josa('참가3', 'i')).toBe('참가3이')
    expect(josa('참가4', 'i')).toBe('참가4가')
    expect(josa('참가5', 'i')).toBe('참가5가')
    expect(josa('참가1', 'ro')).toBe('참가1로')
    expect(josa('참가6', 'ro')).toBe('참가6으로')
  })

  /**
   * 와/과. 밀담 기록의 «참가3과 따로 이야기했다»가 이걸 쓴다 —
   * 3은 «삼»이라 ㅁ받침이므로 «참가3와»가 아니다.
   */
  it('와/과를 받침에 맞춘다', () => {
    expect(josa('참가3', 'wa')).toBe('참가3과')
    expect(josa('참가2', 'wa')).toBe('참가2와')
    expect(josa('강도윤', 'wa')).toBe('강도윤과')
    expect(josa('백나경', 'wa')).toBe('백나경과')
    expect(josa('서지혜', 'wa')).toBe('서지혜와')
  })

  /** 판단할 근거가 없는 글자다. 받침 없는 쪽으로 떨어뜨린다 — 틀려도 덜 어색하다. */
  it('한글도 숫자도 아니면 받침 없는 쪽으로 본다', () => {
    expect(josa('Kim', 'i')).toBe('Kim가')
    expect(josa('', 'i')).toBe('가')
  })
})
