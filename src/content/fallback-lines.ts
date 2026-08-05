import { josa } from './josa'
import { createRng, pickOne } from '../engine/rng'
import type { CardId } from '../engine/types'

/**
 * 캐릭터별 고정 대사.
 *
 * declaration.line·suggestionLine·challenge.line은 LLM이 쓴다. 사람은 LLM을 안 불러
 * 늘 null이고(engine/types.ts 주석), 프록시가 죽어 규칙 기반 폴백으로 떨어졌을 때도
 * null이다(ai/rule-decider.ts는 silent를 돌려준다).
 * 두 경우 다 같은 자리가 비므로 여기 한 곳에서 채운다. 용의자 이름 6개는 시나리오와
 * 무관하게 고정이므로(content/scenarios.ts) 성격도 이름에 붙여 둔다 — 시나리오가
 * 바뀌어도 같은 사람은 같은 말투로 남는다.
 *
 * **밀담 대사(PARLEY_LINE)만 예외로 판단자가 직접 쓴다.** 화면이 채울 수 있는 다른 자리와
 * 달리, 밀담은 답이 돌아오지 않으면 대화 자체가 성립하지 않기 때문이다.
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

/**
 * 폴백 밀담 답변.
 *
 * **전부 «답을 피하는 말»이다.** 규칙 기반 판단자는 질문을 읽지 못하므로, 무엇을 물어도
 * 어긋나지 않아야 한다. 「서재에 없었소」처럼 내용이 있는 말을 넣으면 묻지도 않은 것에
 * 답하게 되고, 그 말이 관측 기록에 남아 다음 라운드 추리를 오염시킨다.
 *
 * 캐릭터당 여러 줄을 두는 이유는 한 판이 8라운드이기 때문이다. 한 줄만 두면 같은 문장이
 * 여덟 번 나와 폴백이라는 것이 그대로 드러난다.
 */
const PARLEY_LINE: Record<string, readonly string[]> = {
  s1: [
    '그건 여기서 할 얘기가 아니오.',
    '내가 답할 처지가 아니지 않소.',
    '…묻는 뜻은 알겠소. 허나 지금은 아니오.',
    '나중에 봅시다. 지금은 눈이 많소.',
    '그 얘긴 덮어둡시다.',
  ],
  s2: [
    '지금은 말씀드리기 어렵습니다.',
    '제가 답할 자리가 아닌 듯합니다.',
    '조금 더 지켜보고 말씀드리겠습니다.',
    '무슨 뜻인지는 알겠습니다만, 여기서는 곤란합니다.',
    '죄송합니다. 그 이야긴 접어두시지요.',
  ],
  s3: [
    '…저는, 잘 모르겠습니다.',
    '…그런 건 제게 묻지 말아 주십시오.',
    '…제가 뭘 안다고요. 정말입니다.',
    '…무섭습니다. 그만 물어보십시오.',
    '…저는 아무것도 못 봤습니다.',
  ],
  s4: [
    '알아서 뭐 하게.',
    '내가 왜 그걸 말해줘야 하지.',
    '됐고, 다른 사람한테 물어봐.',
    '그런 건 묻는 게 아니야.',
    '흥, 말 많군.',
  ],
  s5: [
    '그, 그런 건 저도 모릅니다.',
    '자, 잠깐만요. 저한테 왜 그러십니까.',
    '저, 저는 아무 상관 없습니다.',
    '무, 무슨 말씀이신지…',
    '그, 그만하십시오. 부탁입니다.',
  ],
  s6: [
    '말할 이유가 없다.',
    '묻지 마라.',
    '그건 네가 알 바 아니다.',
    '대답하지 않겠다.',
    '여기까지다.',
  ],
}

/** 자료가 없는 캐릭터도 화면이 비지 않게. 말투가 없으므로 가장 짧게 간다. */
const DEFAULT_PARLEY: readonly string[] = ['…']

/**
 * 폴백 밀담 답변 한 줄. salt에서 결정론적으로 나오므로 같은 판을 다시 돌리면 같은 말이 나온다.
 * salt는 부르는 쪽이 라운드·상대를 섞어 만든다 — 그래야 라운드마다 다른 말이 나온다.
 */
export function parleyLine(characterId: CardId, salt: string): string {
  const pool = PARLEY_LINE[characterId] ?? DEFAULT_PARLEY
  return pickOne(pool, createRng(salt))
}
