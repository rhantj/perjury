import { josa } from './josa'
import type { CardId } from '../engine/types'

/**
 * 사람 플레이어 자신의 반증 대사.
 *
 * 규칙 기반 판단자·다른 참가자와 달리 사람은 LLM을 부르지 않아 declaration.line이
 * 늘 null이다(engine/types.ts 주석) — 그 자리를 그동안 "~를 반증합니다"라는 한 문구로만
 * 채웠는데, 남들은 말투가 다 다른데 내 말만 로봇 같다는 피드백. 용의자 이름 6개는
 * 시나리오와 무관하게 고정이므로(content/scenarios.ts) 성격도 이름에 붙여 둔다 —
 * 시나리오가 바뀌어도 같은 사람은 같은 말투로 남는다.
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

/** characterId가 목록에 없으면(자료 누락 등) 예전 고정 문구로 떨어진다 — 화면이 비지 않게. */
export function myRefuteLine(characterId: CardId, cardName: string): string {
  const make = REFUTE_LINE[characterId]
  return make ? make(cardName) : `${josa(cardName, 'ro')} 반증합니다`
}

export function myPassLine(characterId: CardId): string {
  return PASS_LINE[characterId] ?? '없습니다'
}
