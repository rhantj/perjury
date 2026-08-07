import { CARDS, cardName } from '../engine/cards'
import { createRng, pickOne } from '../engine/rng'
import type { CardId, PlayerId, Suggestion } from '../engine/types'
import type { GameView } from '../engine/view'
import { josa } from './josa'
import type { Scenario, Title } from './scenarios'
import { toneOf } from './voice'

/**
 * 카드 «표시 이름». 엔진은 건드리지 않는다 — 카드 id도 장수도 그대로고, 화면에 쓰는 글자만 바꾼다.
 *
 * 이름을 엔진에서 갈아끼우지 않는 이유는 시나리오가 룰이 아니기 때문이다.
 * 엔진이 시나리오를 알면 «제안·반증·승패»가 콘텐츠에 묶여 테스트가 시나리오마다 갈라진다.
 *
 * 용의자 6명은 시나리오와 무관하게 고정이다(docs/decisions/002). 바뀌는 것은 수단 4·장소 5뿐이라
 * 폴백 대사 풀을 한 벌로 유지할 수 있다.
 */

const MEANS: readonly CardId[] = ['w1', 'w2', 'w3', 'w4']
const PLACES: readonly CardId[] = ['p1', 'p2', 'p3', 'p4', 'p5']
const SUSPECTS: readonly CardId[] = ['s1', 's2', 's3', 's4', 's5', 's6']

export function cardLabel(scenario: Scenario, id: CardId): string {
  const means = MEANS.indexOf(id)
  if (means >= 0) return scenario.means[means] ?? cardName(id)

  const place = PLACES.indexOf(id)
  if (place >= 0) return scenario.places[place] ?? cardName(id)

  return cardName(id)
}

/**
 * 제안 한 문장. 상 위에 흩어진 카드 석 장을 «그 좌석이 한 말»로 잇는다.
 *
 * 카드 세 장이 나란히 놓인 것만으로는 «이 사람이 무슨 주장을 했는가»가 안 읽힌다 —
 * 그림은 물건이고 주장은 문장이다.
 *
 * 맺는 말은 말하는 사람의 말투를 따라간다(content/voice.ts). 여섯 좌석이 전부
 * 「죽였습니다」로 끝나면 자막이지 대사가 아니다. 같은 말투 안에서도 여러 줄을
 * 두고 salt로 골라, 같은 사람이 매번 같은 문장을 읊지 않게 한다.
 *
 * 조사는 josa로 붙인다. 카드 이름은 데이터라 받침이 제각각이고, 템플릿에 박으면
 * 「아편대으로」가 그대로 나간다.
 *
 * **순수 함수다.** 같은 salt면 언제 그려도 같은 문장이 나온다 — 리렌더마다
 * 말이 바뀌면 읽는 도중에 문장이 갈린다.
 */
export function suggestionSentence(
  scenario: Scenario,
  suggestion: Suggestion,
  /** 말한 사람. 제안자 좌석의 인물이다. */
  speakerId: CardId,
  /** 라운드 등 «같은 제안»을 가리키는 씨앗. */
  salt = '',
): string {
  const who = cardLabel(scenario, suggestion.suspect)
  const where = cardLabel(scenario, suggestion.place)
  const how = cardLabel(scenario, suggestion.weapon)
  const tone = toneOf(speakerId)
  const pool = scenario.deed[tone]
  /* pickOne은 빈 배열에 던진다. 여기는 렌더 중이라 던지면 판 전체가 흰 화면이 된다. */
  const deed =
    pool.length > 0 ? pickOne(pool, createRng(`deed:${scenario.id}:${tone}:${salt}`)) : '그리 했습니다.'
  return `${josa(who, 'i')} ${where}에서 ${josa(how, 'ro')} ${deed}`
}

/**
 * 카드 전체의 표시 이름표. 프록시에 실어 보내 모델도 화면과 같은 이름으로 말하게 한다.
 *
 * 이걸 안 보내면 모델은 엔진 기본 이름만 알고, 화면은 사건별 이름으로 그린다 —
 * 같은 카드를 두고 좌석 대사와 그 옆 카드 그림이 서로 다른 이름을 부른다.
 */
export function cardNames(scenario: Scenario): Record<CardId, string> {
  return Object.fromEntries(CARDS.map((card) => [card.id, cardLabel(scenario, card.id)]))
}

/**
 * 이 말이 카드 이름을 대고 있는가.
 *
 * **비공개 반증의 마지막 구멍을 막는 검사다.** 엔진은 카드를 이미 가리지만(engine/view.ts),
 * LLM이 쓴 대사는 자유 텍스트라 그 안에서 «넥타이는 내 손에 있소»처럼 새어 나온다.
 * 워커 프롬프트에서도 막지만 그건 모델이 지키기를 «바라는» 것이라 보장이 아니다 —
 * 카드가 안 보이는 시야에서는 이 검사에 걸린 대사를 통째로 버린다(Table·Log).
 *
 * 엔진 기본 이름과 사건별 표시 이름을 둘 다 본다. 모델에는 표시 이름을 넘기지만
 * 기본 이름을 부르는 응답이 섞여 들어오므로, 한쪽만 보면 그쪽으로 샌다.
 */
export function namesAnyCard(scenario: Scenario, text: string): boolean {
  return CARDS.some(
    (card) => text.includes(cardLabel(scenario, card.id)) || text.includes(card.name),
  )
}

/**
 * 용의자의 직함. 이름은 고정이고 직함만 사건을 따라간다 —
 * 같은 «강도윤»이 저택에서는 장남이고 극장에서는 주연이다.
 */
/**
 * 조서 순번(0~5)의 용의자 «이름». 이름은 시나리오와 무관하게 고정이라 사건을 받지 않는다.
 * 카드 앞면은 身元 未詳로 두고, 펼친 조서에서만 이 이름이 열린다.
 */
export function suspectNameAt(index: number): string | null {
  const id = SUSPECTS[index]
  return id ? cardName(id) : null
}

export function suspectTitle(scenario: Scenario, characterId: CardId): string | null {
  const index = SUSPECTS.indexOf(characterId)
  if (index < 0) return null
  return scenario.titles[index]?.ko ?? null
}

/** 직함 전체(한글·한자·한 줄 소개). 손패 카드 호버에서 «이 사람이 누구인가»를 보여주는 자리에 쓴다. */
export function suspectTitleFull(scenario: Scenario, characterId: CardId): Title | null {
  const index = SUSPECTS.indexOf(characterId)
  if (index < 0) return null
  return scenario.titles[index] ?? null
}

/**
 * 좌석 표시 이름. 게임판에서는 player.name(용의자 이름)을 그대로 보여주지 않는다 —
 * 카드 내용(«강도윤 카드»)과 좌석 정체성(«이 사람이 강도윤이다»)이 같은 글자라
 * "이 사람이 무슨 카드를 쥐고 있나"처럼 읽혀 헷갈린다. 그래서 판이 도는 동안은
 * 좌석을 참가 번호로 부르고, 용의자 이름은 카드 내용으로만 남긴다.
 * 조서(SuspectsAct)와 판결문(Verdict)은 각각 사건 소개·사후 공개라 이 대상이 아니다.
 */
export function participantLabel(view: GameView, playerId: PlayerId): string {
  const player = view.players.find((p) => p.id === playerId)
  if (player?.isMe) return '나'
  const others = view.players.filter((p) => !p.isMe)
  const index = others.findIndex((p) => p.id === playerId)
  return index >= 0 ? `참가${index + 1}` : '참가?'
}

/** 원탁에서 좌석이 앉는 칸. game.css의 grid-template-areas와 이름이 같다. */
export type SeatSlot = 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'me'

/**
 * 좌석이 원탁 어느 칸에 앉는가.
 *
 * **participantLabel과 같은 순서를 쓴다.** 둘 다 «나를 뺀 좌석 배열»의 인덱스로 매기므로
 * 「참가3」과 칸 p3이 같은 사람을 가리킨다. 이 대응이 어긋나면 추첨 명패가
 * 엉뚱한 사람 쪽으로 날아가고, 화면은 멀쩡해 보이는데 뜻만 틀린다.
 */
export function seatSlot(view: GameView, playerId: PlayerId): SeatSlot {
  const player = view.players.find((p) => p.id === playerId)
  if (player?.isMe) return 'me'
  const others = view.players.filter((p) => !p.isMe)
  const index = others.findIndex((p) => p.id === playerId)
  return index >= 0 && index < 5 ? (`p${index + 1}` as SeatSlot) : 'p5'
}

/** 좌석 얼굴칸에 쓰는 한 글자/숫자. participantLabel과 짝이다. */
export function participantInitial(view: GameView, playerId: PlayerId): string {
  const full = participantLabel(view, playerId)
  return full === '나' ? '나' : full.slice(2)
}
