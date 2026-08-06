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
/**
 * 반증·넘김·제안은 **라운드마다 되풀이된다.** 반증만 해도 라운드당 5회씩 나가
 * 한 판에 40번 가까이 뜬다. 캐릭터당 한 줄만 두면 폴백이라는 것이 대사만 봐도 드러나므로
 * 밀담과 같은 방식으로 여러 줄을 두고 salt에서 골라 쓴다(pick).
 *
 * **반증은 어느 줄이든 카드 이름을 말해야 한다.** 그 이름이 판의 정보이고,
 * 빠지면 「무언가 갖고 있다」는 빈 말이 된다.
 */
const REFUTE_LINE: Record<string, readonly ((card: string) => string)[]> = {
  s1: [
    (card) => `${josa(card, 'eul')} 내가 갖고 있소.`,
    (card) => `그 ${josa(card, 'eun')} 내 손에 있소.`,
    (card) => `${josa(card, 'eun')} 여기 있소. 헛짚었소.`,
    (card) => `공교롭게도 ${josa(card, 'i')} 내게 있구려.`,
  ],
  s2: [
    (card) => `${josa(card, 'eun')} 제게 있습니다.`,
    (card) => `그 ${josa(card, 'eun')} 제가 갖고 있습니다.`,
    (card) => `죄송합니다만, ${josa(card, 'eun')} 제 손에 있습니다.`,
    (card) => `${josa(card, 'i')} 제게 있으니 그 셋은 아닙니다.`,
  ],
  s3: [
    (card) => `…${josa(card, 'eun')} 제가 쥐고 있습니다.`,
    (card) => `저, 저한테… ${josa(card, 'i')} 있습니다.`,
    (card) => `…${josa(card, 'eul')} 보여드리겠습니다.`,
    (card) => `…${josa(card, 'eun')} 제 것입니다. 죄송합니다.`,
  ],
  s4: [
    (card) => `${josa(card, 'eun')} 나한테 있지, 왜.`,
    (card) => `${josa(card, 'i')} 내 손에 있는데 어쩌겠나.`,
    (card) => `헛다리 짚었군. ${josa(card, 'eun')} 내 거야.`,
    (card) => `${josa(card, 'eul')} 내놓으라고? 여기 있네.`,
  ],
  s5: [
    (card) => `제, 제가 ${josa(card, 'eul')} 갖고 있습니다.`,
    (card) => `그, ${josa(card, 'eun')} 제 손에… 있습니다.`,
    (card) => `아, ${josa(card, 'i')} 저한테 있습니다. 정말입니다.`,
    (card) => `죄, 죄송합니다. ${josa(card, 'eun')} 제 겁니다.`,
  ],
  s6: [
    (card) => `${josa(card, 'eul')} 내가 쥐고 있다.`,
    (card) => `${josa(card, 'eun')} 내 것이다.`,
    (card) => `틀렸다. ${josa(card, 'i')} 여기 있다.`,
    (card) => `${josa(card, 'eul')} 내놓겠다. 그뿐이다.`,
  ],
}

const PASS_LINE: Record<string, readonly string[]> = {
  s1: [
    '나한테는 없소.',
    '내 손에는 그런 것이 없소.',
    '셋 다 내 것이 아니오.',
    '보태 줄 것이 없구려.',
  ],
  s2: [
    '제겐 해당하는 것이 없습니다.',
    '제 손에는 없습니다.',
    '셋 중 어느 것도 제 것이 아닙니다.',
    '도움이 못 되어 죄송합니다.',
  ],
  s3: [
    '저는… 아무것도 없습니다.',
    '…제겐 없습니다.',
    '…하나도 제 것이 아닙니다.',
    '…보여드릴 것이 없습니다.',
  ],
  s4: [
    '글쎄, 나한테는 없던데.',
    '없어. 다음.',
    '내 알 바 아니지. 없으니까.',
    '셋 다 아니야.',
  ],
  s5: [
    '저는 없습니다. 정말입니다.',
    '어, 없습니다. 하나도요.',
    '제, 제겐 없습니다.',
    '아, 아무것도 못 냅니다.',
  ],
  s6: ['내겐 그런 거 없다.', '없다.', '셋 다 아니다.', '낼 것이 없다.'],
}

const SUGGEST_LINE: Record<string, readonly string[]> = {
  s1: [
    '내가 한번 짚어보겠소.',
    '이번엔 내가 물어보겠소.',
    '이렇게 보는데, 어떻소.',
    '한 번 걸어보겠소.',
  ],
  s2: [
    '제가 짚어보겠습니다.',
    '이번에는 제가 여쭙겠습니다.',
    '이렇게 보고 있습니다만.',
    '제 차례군요. 말씀드리겠습니다.',
  ],
  s3: [
    '…제가 말씀드려 보겠습니다.',
    '…제 차례, 맞지요.',
    '…이렇게, 짚어보겠습니다.',
    '…틀리면 죄송합니다.',
  ],
  s4: ['내가 짚어보지.', '자, 이번엔 내 차례군.', '이걸로 하지.', '어디 한번 보자고.'],
  s5: [
    '제, 제가 말해보겠습니다.',
    '어, 제 차롄가요. 그럼…',
    '이, 이렇게 짚어보겠습니다.',
    '트, 틀릴지도 모르지만요.',
  ],
  s6: ['내가 짚는다.', '이걸로 한다.', '내 차례다.', '묻겠다.'],
}

const CHALLENGE_LINE: Record<string, (target: string) => string> = {
  s1: (target) => `${target}, 거짓을 고했소.`,
  s2: (target) => `${target}님, 방금 거짓을 말씀하셨습니다.`,
  s3: (target) => `…${target}, 그 말은 거짓입니다.`,
  s4: (target) => `${target}, 거짓말이지, 그거.`,
  s5: (target) => `${target}, 거, 거짓말이시죠.`,
  s6: (target) => `${target}, 거짓이다.`,
}

/*
 * 여기부터는 이의제기의 «결과»에 대한 반응이다.
 *
 * 이의제기는 한 사건이 아니라 두 박자다 — 지목이 있고, 그다음 판정이 있다.
 * 지금까지는 앞 박자(CHALLENGE_LINE)만 있어서 판정이 난 뒤에도 좌석에는 그 전 발언이
 * 그대로 남았다. 위증이 들통난 사람이 방금 한 거짓말을 계속 말하고 있고, 헛짚은 사람은
 * 여전히 「거짓을 고했소」라고 우기는 화면이 된다 — 판이 뒤집힌 순간에 아무도 반응하지 않는다.
 *
 * 세 갈래로 나눈다. 같은 판정이라도 서 있는 자리가 다르면 할 말이 다르기 때문이다.
 *   CAUGHT   지목당했고 실제로 위증이었다 — 들킨 쪽
 *   CLEARED  지목당했지만 위증이 아니었다 — 누명을 벗은 쪽
 *   WRONG    지목했는데 틀렸다 — 헛짚은 쪽
 */

/** 위증이 발각된 사람. 변명하거나, 체념하거나, 뻔뻔하거나 — 성격대로 갈린다. */
const CAUGHT_LINE: Record<string, string> = {
  s1: '…내가 잠시 착각했소.',
  s2: '…죄송합니다. 제가 잘못 말씀드렸습니다.',
  s3: '…들켰군요. 그럴 수밖에 없었습니다.',
  s4: '뭐, 들켰으면 별수 없지.',
  s5: '아, 아니 그게… 저, 저는…',
  s6: '…그래. 거짓이었다.',
}

/** 의심받았지만 결백했던 사람. */
const CLEARED_LINE: Record<string, string> = {
  s1: '보시오. 내 말이 옳지 않았소.',
  s2: '보셨지요. 저는 거짓을 말하지 않았습니다.',
  s3: '…그러니까, 제 말이 맞았습니다.',
  s4: '거봐. 괜한 사람 잡았네.',
  s5: '제, 제가 뭐랬습니까. 정말이었다니까요.',
  s6: '헛짚었군.',
}

/** 이의제기가 빗나간 사람. target은 participantLabel(「참가3」)이라 조사 처리가 필요 없다. */
const WRONG_CALL_LINE: Record<string, (target: string) => string> = {
  s1: (target) => `${target}, 내가 성급했소.`,
  s2: (target) => `${target}님, 제가 잘못 보았습니다.`,
  s3: (target) => `…${target}, 제가 틀렸습니다. 죄송합니다.`,
  s4: (target) => `${target}, 아니었나. 뭐 그럴 수도 있지.`,
  s5: (target) => `죄, 죄송합니다 ${target}. 제가 잘못 봤습니다.`,
  s6: (target) => `${target}. 내가 틀렸다.`,
}

/**
 * 여러 줄 중 하나를 salt에서 고른다. **랜덤이 아니라 seed다** —
 * 리렌더마다 말이 바뀌면 좌석이 딸꾹질하고, 같은 판을 다시 열었을 때 기록이 달라진다.
 */
function pick<T>(pool: readonly T[], salt: string): T | undefined {
  return pool.length === 0 ? undefined : pickOne(pool, createRng(salt))
}

/** characterId가 목록에 없으면(자료 누락 등) 고정 문구로 떨어진다 — 화면이 비지 않게. */
export function refuteLine(characterId: CardId, cardName: string, salt = ''): string {
  const make = pick(REFUTE_LINE[characterId] ?? [], `refute:${characterId}:${salt}`)
  return make ? make(cardName) : `${josa(cardName, 'ro')} 반증합니다`
}

export function passLine(characterId: CardId, salt = ''): string {
  return pick(PASS_LINE[characterId] ?? [], `pass:${characterId}:${salt}`) ?? '없습니다'
}

export function suggestLine(characterId: CardId, salt = ''): string {
  return pick(SUGGEST_LINE[characterId] ?? [], `suggest:${characterId}:${salt}`) ?? '제안한다'
}

export function challengeLine(characterId: CardId, target: string): string {
  const make = CHALLENGE_LINE[characterId]
  return make ? make(target) : `${target}, 거짓이다`
}

export function caughtLine(characterId: CardId): string {
  return CAUGHT_LINE[characterId] ?? '…거짓이었다'
}

export function clearedLine(characterId: CardId): string {
  return CLEARED_LINE[characterId] ?? '거짓이 아니었다'
}

export function wrongCallLine(characterId: CardId, target: string): string {
  const make = WRONG_CALL_LINE[characterId]
  return make ? make(target) : `${target}, 내가 틀렸다`
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
