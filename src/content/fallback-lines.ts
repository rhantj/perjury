import { josa } from './josa'
import type { CardId } from '../engine/types'

/**
 * 캐릭터별 고정 대사.
 *
 * declaration.line·suggestionLine·challenge.line은 LLM이 쓴다. 사람은 LLM을 안 불러
 * 늘 null이고(engine/types.ts 주석), 프록시가 죽어 규칙 기반 폴백으로 떨어졌을 때도
 * null이다(ai/rule-decider.ts — 사전생성 대사 풀은 D8 작업이라 여태 침묵 처리였다).
 * 두 경우 다 같은 자리가 비므로 여기 한 곳에서 채운다. 용의자 이름 6개는 시나리오와
 * 무관하게 고정이므로(content/scenarios.ts) 성격도 이름에 붙여 둔다 — 시나리오가
 * 바뀌어도 같은 사람은 같은 말투로 남는다.
 */
const REFUTE_LINE: Record<string, (card: string) => string> = {
  s1: (card) => `${josa(card, 'eul')} 내가 갖고 있소.`,
  s2: (card) => `${josa(card, 'eun')} 제게 있습니다.`,
  s3: (card) => `…${josa(card, 'eun')} 제가 쥐고 있습니다.`,
  s4: (card) => `${josa(card, 'eun')} 나한테 있지, 왜.`,
  s5: (card) => `제, 제가 ${josa(card, 'eul')} 갖고 있습니다.`,
  s6: (card) => `${josa(card, 'eul')} 내가 쥐고 있다.`,
}

const PASS_LINE: Record<string, string> = {
  s1: '나한테는 없소.',
  s2: '제겐 해당하는 것이 없습니다.',
  s3: '저는… 아무것도 없습니다.',
  s4: '글쎄, 나한테는 없던데.',
  s5: '저는 없습니다. 정말입니다.',
  s6: '내겐 그런 거 없다.',
}

const SUGGEST_LINE: Record<string, string> = {
  s1: '내가 한번 짚어보겠소.',
  s2: '제가 짚어보겠습니다.',
  s3: '…제가 말씀드려 보겠습니다.',
  s4: '내가 짚어보지.',
  s5: '제, 제가 말해보겠습니다.',
  s6: '내가 짚는다.',
}

const CHALLENGE_LINE: Record<string, (target: string) => string> = {
  s1: (target) => `${target}, 거짓을 고했소.`,
  s2: (target) => `${target}님, 방금 거짓을 말씀하셨습니다.`,
  s3: (target) => `…${target}, 그 말은 거짓입니다.`,
  s4: (target) => `${target}, 거짓말이지, 그거.`,
  s5: (target) => `${target}, 거, 거짓말이시죠.`,
  s6: (target) => `${target}, 거짓이다.`,
}

/** characterId가 목록에 없으면(자료 누락 등) 예전 고정 문구로 떨어진다 — 화면이 비지 않게. */
export function refuteLine(characterId: CardId, cardName: string): string {
  const make = REFUTE_LINE[characterId]
  return make ? make(cardName) : `${josa(cardName, 'ro')} 반증합니다`
}

export function passLine(characterId: CardId): string {
  return PASS_LINE[characterId] ?? '없습니다'
}

export function suggestLine(characterId: CardId): string {
  return SUGGEST_LINE[characterId] ?? '제안한다'
}

export function challengeLine(characterId: CardId, target: string): string {
  const make = CHALLENGE_LINE[characterId]
  return make ? make(target) : `${target}, 거짓이다`
}
