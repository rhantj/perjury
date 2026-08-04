import type { Faction, Phase } from '../../src/engine/types'
import type { GameView } from '../../src/engine/view'

/**
 * 프론트에서 오는 요청을 좁힌다.
 *
 * 이 파일이 하는 일은 두 가지다.
 *
 * 1. **모양 강제** — 받는 것은 GameView 하나뿐이고, 모르는 키가 있으면 거부한다.
 *    seed·남의 손패·isPerjury는 **스키마에 자리가 없어서** 통과할 물리적 통로가 없다.
 *    viewFor()가 이미 걸러내지만(src/engine/view.ts), 여기가 두 번째 벽이다.
 * 2. **길이 제한** — 프롬프트 인젝션 표면을 좁힌다.
 *
 * **룰은 여기서 집행하지 않는다.** 카드 id가 실재하는지, 반증이 적법한지는 룰 엔진의 일이다.
 * 같은 룰을 두 군데 두면 엔진이 바뀔 때 조용히 어긋난다(설계 §5.3).
 */

export const LIMITS = {
  /** 정상 GameView는 8라운드에도 몇 KB다. */
  bodyBytes: 32 * 1024,
  /** 게임 규칙상 고정. */
  players: 6,
  /** 최대 라운드 수보다 넉넉히. */
  rounds: 12,
  declarations: 6,
  reveals: 6,
  votes: 6,
  /** 이름·카드 id 등 문자열 전반. */
  stringLength: 200,
  /**
   * 에이전트 대사. 다른 문자열보다 짧게 잡는다 — **이건 프롬프트로 되돌아간다.**
   * 프론트가 이미 60자로 자르지만(llm-decider.ts), 프론트는 위조 가능하므로 여기가 진짜 벽이다.
   */
  lineLength: 80,
  /**
   * 밀담의 세 문자열(요청의 ask, 기록의 askLine·replyLine).
   * 좌석 대사보다 길다 — 두어 문장이 자연스러운 자리다(설계 §7).
   * **여기가 플레이어 자유 입력이 LLM에 닿는 유일한 통로다.**
   */
  parleyLength: 200,
} as const

/** Decider의 다섯 메서드와 1:1이다. */
export type DecideKind = 'suggest' | 'refute' | 'challenge' | 'accuse' | 'parley'

const KINDS: readonly DecideKind[] = ['suggest', 'refute', 'challenge', 'accuse', 'parley']
const PHASES: readonly Phase[] = ['suggest', 'refute', 'challenge', 'whisper', 'accuse', 'over']
const FACTIONS: readonly Faction[] = ['citizen', 'culprit']

export interface DecideRequest {
  readonly v: 1
  readonly kind: DecideKind
  /** 로그 상관관계 전용. 위조 가능하므로 신뢰하지 않는다. */
  readonly sessionId: string
  /** 밀담에서 플레이어가 한 말. 다른 kind에서는 반드시 null이다. */
  readonly ask: string | null
  readonly view: GameView
}

export type Validated<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string }

class Invalid extends Error {}

function bad(where: string, detail: string): never {
  throw new Invalid(`${where}: ${detail}`)
}

function record(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) bad(where, '객체가 아니다')
  return value as Record<string, unknown>
}

/** 화이트리스트. 모르는 키가 하나라도 있으면 거부한다 — 이것이 정보 격리의 두 번째 벽이다. */
function onlyKeys(obj: Record<string, unknown>, allowed: readonly string[], where: string): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) bad(where, `허용되지 않은 필드 '${key}'`)
  }
}

function text(obj: Record<string, unknown>, key: string, where: string): string {
  const value = obj[key]
  if (typeof value !== 'string') bad(where, `${key}가 문자열이 아니다`)
  if (value.length > LIMITS.stringLength) bad(where, `${key}가 ${LIMITS.stringLength}자를 넘는다`)
  return value
}

/** 허용 목록의 리터럴 타입으로 좁혀서 돌려준다. 호출부가 캐스팅하지 않게 하려는 것이다. */
function oneOf<T extends string>(
  obj: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  where: string,
): T {
  const value = text(obj, key, where)
  if (!(allowed as readonly string[]).includes(value)) bad(where, `${key}가 허용값이 아니다`)
  return value as T
}

function count(obj: Record<string, unknown>, key: string, where: string): number {
  const value = obj[key]
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    bad(where, `${key}가 0 이상의 정수가 아니다`)
  }
  return value
}

function flag(obj: Record<string, unknown>, key: string, where: string): boolean {
  const value = obj[key]
  if (typeof value !== 'boolean') bad(where, `${key}가 불리언이 아니다`)
  return value
}

function list(obj: Record<string, unknown>, key: string, max: number, where: string): unknown[] {
  const value = obj[key]
  if (!Array.isArray(value)) bad(where, `${key}가 배열이 아니다`)
  if (value.length > max) bad(where, `${key}가 ${max}개를 넘는다`)
  return value
}

/**
 * 에이전트 대사. 없을 수 있으므로 null을 허용하되, 있으면 짧아야 한다.
 *
 * 룰에는 관여하지 않는 값이라 «있으면 통과»로 두고 싶어지지만, 이 문자열은 다음 호출의
 * 프롬프트에 그대로 실려 돌아간다. 길이 제한이 인젝션 표면을 좁히는 유일한 수단이다.
 */
function line(obj: Record<string, unknown>, key: string, where: string): string | null {
  const value = obj[key]
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') bad(where, `${key}가 문자열이 아니다`)
  if (value.length > LIMITS.lineLength) bad(where, `${key}가 ${LIMITS.lineLength}자를 넘는다`)
  return value
}

function cardIds(obj: Record<string, unknown>, key: string, where: string): string[] {
  return list(obj, key, LIMITS.players * 3, where).map((entry, i) => {
    if (typeof entry !== 'string') bad(where, `${key}[${i}]가 문자열이 아니다`)
    if (entry.length > LIMITS.stringLength) bad(where, `${key}[${i}]가 너무 길다`)
    return entry
  })
}

function suggestion(value: unknown, where: string) {
  const obj = record(value, where)
  onlyKeys(obj, ['suspect', 'weapon', 'place'], where)
  return {
    suspect: text(obj, 'suspect', where),
    weapon: text(obj, 'weapon', where),
    place: text(obj, 'place', where),
  }
}

function claim(value: unknown, where: string) {
  const obj = record(value, where)
  const kind = oneOf(obj, 'kind', ['refute', 'pass'], where)
  if (kind === 'pass') {
    onlyKeys(obj, ['kind'], where)
    return { kind: 'pass' } as const
  }
  onlyKeys(obj, ['kind', 'cardId'], where)
  return { kind: 'refute', cardId: text(obj, 'cardId', where) } as const
}

function player(value: unknown, index: number) {
  const where = `players[${index}]`
  const obj = record(value, where)
  onlyKeys(obj, ['id', 'characterId', 'name', 'isHuman', 'isMe', 'revealed', 'hand', 'faction'], where)
  return {
    id: text(obj, 'id', where),
    characterId: text(obj, 'characterId', where),
    name: text(obj, 'name', where),
    isHuman: flag(obj, 'isHuman', where),
    isMe: flag(obj, 'isMe', where),
    revealed: cardIds(obj, 'revealed', where),
    hand: obj['hand'] === null ? null : cardIds(obj, 'hand', where),
    faction: obj['faction'] === null ? null : oneOf(obj, 'faction', FACTIONS, where),
  }
}

function challengeRecord(value: unknown, where: string) {
  const obj = record(value, where)
  onlyKeys(obj, ['challengerId', 'targetId', 'cardId', 'success', 'reveals', 'line'], where)
  return {
    challengerId: text(obj, 'challengerId', where),
    targetId: text(obj, 'targetId', where),
    cardId: text(obj, 'cardId', where),
    success: flag(obj, 'success', where),
    reveals: list(obj, 'reveals', LIMITS.reveals, where).map((entry, i) => {
      const at = `${where}.reveals[${i}]`
      const reveal = record(entry, at)
      onlyKeys(reveal, ['playerId', 'cardId'], at)
      return { playerId: text(reveal, 'playerId', at), cardId: text(reveal, 'cardId', at) }
    }),
    line: line(obj, 'line', where),
  }
}

/** 밀담 기록. viewFor가 이미 낀 두 사람에게만 실었으므로, 여기서는 모양과 길이만 본다. */
function parleyRecord(value: unknown, where: string) {
  const obj = record(value, where)
  onlyKeys(obj, ['targetId', 'askLine', 'replyLine'], where)
  const bounded = (key: string) => {
    const text = obj[key]
    if (typeof text !== 'string') bad(where, `${key}가 문자열이 아니다`)
    if (text.length > LIMITS.parleyLength) bad(where, `${key}가 ${LIMITS.parleyLength}자를 넘는다`)
    return text
  }
  return {
    targetId: text(obj, 'targetId', where),
    askLine: bounded('askLine'),
    replyLine: bounded('replyLine'),
  }
}

function roundView(value: unknown, index: number) {
  const where = `rounds[${index}]`
  const obj = record(value, where)
  onlyKeys(
    obj,
    ['round', 'suggesterId', 'suggestion', 'suggestionLine', 'declarations', 'challenge', 'parley'],
    where,
  )
  return {
    round: count(obj, 'round', where),
    suggesterId: text(obj, 'suggesterId', where),
    suggestion: suggestion(obj['suggestion'], `${where}.suggestion`),
    suggestionLine: line(obj, 'suggestionLine', where),
    declarations: list(obj, 'declarations', LIMITS.declarations, where).map((entry, i) => {
      const at = `${where}.declarations[${i}]`
      const decl = record(entry, at)
      onlyKeys(decl, ['playerId', 'claim', 'line'], at)
      return {
        playerId: text(decl, 'playerId', at),
        claim: claim(decl['claim'], `${at}.claim`),
        line: line(decl, 'line', at),
      }
    }),
    challenge: obj['challenge'] === null ? null : challengeRecord(obj['challenge'], `${where}.challenge`),
    // 없는 것과 null을 같게 읽는다 — 밀담이 없는 라운드가 기본이다.
    parley:
      obj['parley'] === null || obj['parley'] === undefined
        ? null
        : parleyRecord(obj['parley'], `${where}.parley`),
  }
}

function gameView(value: unknown): GameView {
  const where = 'view'
  const obj = record(value, where)
  onlyKeys(
    obj,
    ['viewerId', 'round', 'totalRounds', 'phase', 'turnIndex', 'players', 'rounds', 'solution', 'outcome'],
    where,
  )

  const players = list(obj, 'players', LIMITS.players, where)
  if (players.length !== LIMITS.players) bad(where, `players가 정확히 ${LIMITS.players}명이 아니다`)

  // 끝난 판에는 결정을 요청하지 않는다. outcome을 받지 않으면 정답 공개 경로도 함께 닫힌다.
  if (obj['outcome'] !== null) bad(where, 'outcome은 null이어야 한다')

  return {
    viewerId: text(obj, 'viewerId', where),
    round: count(obj, 'round', where),
    totalRounds: count(obj, 'totalRounds', where),
    phase: oneOf(obj, 'phase', PHASES, where),
    turnIndex: count(obj, 'turnIndex', where),
    players: players.map(player),
    rounds: list(obj, 'rounds', LIMITS.rounds, where).map(roundView),
    solution: obj['solution'] === null ? null : suggestion(obj['solution'], `${where}.solution`),
    outcome: null,
  }
}

/** 본문 문자열을 받아 좁힌다. 던지지 않고 결과로 돌려준다. */
export function parseDecideRequest(body: string): Validated<DecideRequest> {
  if (body.length > LIMITS.bodyBytes) {
    return { ok: false, message: `본문이 ${LIMITS.bodyBytes}바이트를 넘는다` }
  }

  let raw: unknown
  try {
    raw = JSON.parse(body)
  } catch {
    return { ok: false, message: 'JSON이 아니다' }
  }

  try {
    const obj = record(raw, 'body')
    onlyKeys(obj, ['v', 'kind', 'sessionId', 'ask', 'view'], 'body')
    if (obj['v'] !== 1) bad('body', '모르는 계약 버전이다')

    const kind = oneOf(obj, 'kind', KINDS, 'body')

    /*
     * ask는 밀담에서만 존재한다. 다른 kind에 실려 오면 거부한다 —
     * 「어떤 kind가 무엇을 실을 수 있는가」를 느슨하게 두면 프롬프트에 들어갈 자유 텍스트의
     * 경로가 늘어나고, 그 경로마다 인젝션 표면이 생긴다.
     */
    const said = obj['ask']
    let ask: string | null = null
    if (kind === 'parley') {
      if (typeof said !== 'string') bad('body', '밀담에는 ask가 있어야 한다')
      if (said.length === 0) bad('body', 'ask가 비었다')
      if (said.length > LIMITS.parleyLength) bad('body', `ask가 ${LIMITS.parleyLength}자를 넘는다`)
      ask = said
    } else if (said !== undefined && said !== null) {
      bad('body', '밀담이 아닌 요청에는 ask를 실을 수 없다')
    }

    return {
      ok: true,
      value: {
        v: 1,
        kind,
        sessionId: text(obj, 'sessionId', 'body'),
        ask,
        view: gameView(obj['view']),
      },
    }
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, message: e.message }
    throw e
  }
}
