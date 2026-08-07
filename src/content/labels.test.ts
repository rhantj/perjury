import { describe, expect, it } from 'vitest'
import { namesAnyCard } from './labels'
import { SCENARIOS } from './scenarios'

/**
 * 자하동 저택 판. 이 사건에서 w2의 표시 이름은 «명주 목도리»지만
 * 엔진 기본 이름은 «넥타이»다 — 아래 테스트들이 이 어긋남 위에 서 있다.
 */
const mansion = SCENARIOS[0]
if (!mansion) throw new Error('시나리오 데이터가 비어 있다')

/**
 * 비공개 반증의 마지막 구멍을 막는 검사다(설계 1-B). 엔진은 카드를 이미 가리지만
 * LLM이 쓴 대사는 자유 텍스트라 그 안에서 새어 나온다 — 걸리면 대사를 통째로 버린다.
 *
 * 그래서 **못 잡는 것이 새는 것**이고, 넘겨 잡는 것은 대사 한 줄을 잃을 뿐이다.
 * 아래 테스트가 한쪽으로 기울어 있는 이유다.
 */
describe('namesAnyCard — 대사가 카드 이름을 대고 있는가', () => {
  it('사건별 표시 이름을 대면 걸린다', () => {
    expect(namesAnyCard(mansion, '명주 목도리는 제게 있습니다')).toBe(true)
    expect(namesAnyCard(mansion, '마차고에는 아무도 없었소')).toBe(true)
  })

  /**
   * **이 테스트가 이 함수의 존재 이유다.** 모델에는 표시 이름만 넘기는데도
   * 기본 이름을 부르는 응답이 섞여 들어온다. 표시 이름만 보면 그쪽으로 샌다.
   */
  it('엔진 기본 이름을 대도 걸린다 — 이 판에 그런 이름은 없는데도', () => {
    expect(namesAnyCard(mansion, '넥타이는 내 손에 있소')).toBe(true)
    expect(namesAnyCard(mansion, '지하주차장이라니, 헛짚었구려')).toBe(true)
  })

  /** 용의자 6명은 사건과 무관하게 고정이다(docs/decisions/002). */
  it('용의자 이름도 카드다', () => {
    expect(namesAnyCard(mansion, '강도윤이 그 자리에 있었소')).toBe(true)
  })

  it('카드 이름이 없는 대사는 통과시킨다', () => {
    expect(namesAnyCard(mansion, '셋 중 하나가 제게 있습니다.')).toBe(false)
    expect(namesAnyCard(mansion, '내겐 그런 패가 없구려.')).toBe(false)
    expect(namesAnyCard(mansion, '')).toBe(false)
  })

  /**
   * 이름이 다른 말에 파묻혀 있어도 잡는다. 부분 일치라 「서재」가 「서재에서」에도 걸린다 —
   * 넘겨 잡는 쪽이 안전하므로 좁히지 않는다.
   */
  it('말 속에 파묻힌 이름도 잡는다', () => {
    expect(namesAnyCard(mansion, '그날 밤 서재에서 본 것을 말하겠소')).toBe(true)
  })

  /**
   * **잡지 못하는 것.** 다른 사건의 표시 이름은 이 판의 카드가 아니라 걸리지 않는다.
   * 판마다 이름표가 갈리므로 그 판에서 부를 이유가 없는 말이고, 잡으려면 네 사건의
   * 이름을 전부 봐야 해서 오히려 멀쩡한 대사를 버린다.
   */
  it('다른 사건의 이름은 이 판의 카드가 아니다', () => {
    expect(namesAnyCard(mansion, '조명줄이라면 내게 없소')).toBe(false)
  })
})
