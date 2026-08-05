import type { PowerBrief } from '../../src/ai/power-brief'
import type { Faction, Grant, Phase } from '../../src/engine/types'
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
  /** 능력은 한 판에 한 번뿐이므로 한 사람 앞으로 오는 것은 사실상 1건이다. 넉넉히 잡는다. */
  findings: 6,
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
const FINDING_KINDS = ['hand', 'weapon', 'claim'] as const
const POWER_NEEDS = ['player', 'weapon', 'none'] as const

export interface DecideRequest {
  readonly v: 1
  readonly kind: DecideKind
  /** 로그 상관관계 전용. 위조 가능하므로 신뢰하지 않는다. */
  readonly sessionId: string
  /** 밀담에서 플레이어가 한 말. 다른 kind에서는 반드시 null이다. */
  readonly ask: string | null
  readonly view: GameView
  /**
   * 이 좌석이 아직 쓸 수 있는 직업 능력. 없으면 null이다.
   *
   * **워커는 직업 이름도 능력 종류도 모른다.** 프롬프트에 붙일 문구와 «무엇을 고르게
   * 할 것인가»만 받는다 — 종류를 알면 룰이 프론트와 워커 두 군데로 갈린다(설계 §5.3).
   */
  readonly power: PowerBrief | null
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

function ids(obj: Record<string, unknown>, key: string, max: number, where: string): string[] {
  return list(obj, key, max, where).map((entry, i) => {
    if (typeof entry !== 'string') bad(where, `${key}[${i}]가 문자열이 아니다`)
    if (entry.length > LIMITS.stringLength) bad(where, `${key}[${i}]가 너무 길다`)
    return entry
  })
}

function cardIds(obj: Record<string, unknown>, key: string, where: string): string[] {
  return ids(obj, key, LIMITS.players * 3, where)
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

/**
 * 좌석이 쓸 수 있는 능력 개요.
 *
 * text는 프롬프트에 그대로 들어가므로 **좌석 대사와 같은 상한**을 건다 —
 * 프론트가 보내는 값이라 위조 가능하고, 여기가 인젝션 표면을 좁히는 자리다.
 */
function powerBrief(value: unknown, where: string): PowerBrief {
  const obj = record(value, where)
  onlyKeys(obj, ['text', 'needs'], where)
  const text_ = obj['text']
  if (typeof text_ !== 'string') bad(where, 'text가 문자열이 아니다')
  if (text_.length === 0) bad(where, 'text가 비었다')
  if (text_.length > LIMITS.lineLength) bad(where, `text가 ${LIMITS.lineLength}자를 넘는다`)
  return { text: text_, needs: oneOf(obj, 'needs', POWER_NEEDS, where) }
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

/**
 * 능력으로 확인한 것 한 건. viewFor가 이미 주인만 골라 실었으므로 모양만 본다.
 *
 * 프롬프트에 «사실»로 들어가는 값이라 종류를 좁게 받는다 — 모르는 kind를 통과시키면
 * prompt.ts의 switch가 undefined를 한 줄 뱉는다.
 */
function finding(value: unknown, where: string): Grant['finding'] {
  const obj = record(value, where)
  const kind = oneOf(obj, 'kind', FINDING_KINDS, where)

  switch (kind) {
    case 'hand':
      onlyKeys(obj, ['kind', 'targetId', 'cardId'], where)
      return { kind, targetId: text(obj, 'targetId', where), cardId: text(obj, 'cardId', where) }
    case 'weapon':
      onlyKeys(obj, ['kind', 'cardId', 'isSolution'], where)
      return { kind, cardId: text(obj, 'cardId', where), isSolution: flag(obj, 'isSolution', where) }
    case 'claim':
      onlyKeys(obj, ['kind', 'targetId', 'truthful'], where)
      return { kind, targetId: text(obj, 'targetId', where), truthful: flag(obj, 'truthful', where) }
  }
}

function grant(value: unknown, index: number): Grant {
  const where = `findings[${index}]`
  const obj = record(value, where)
  onlyKeys(obj, ['round', 'ownerId', 'finding'], where)

  return {
    round: count(obj, 'round', where),
    ownerId: text(obj, 'ownerId', where),
    finding: finding(obj['finding'], `${where}.finding`),
  }
}

function roundView(value: unknown, index: number) {
  const where = `rounds[${index}]`
  const obj = record(value, where)
  onlyKeys(
    obj,
    [
      'round',
      'suggesterId',
      'suggestion',
      'suggestionLine',
      'declarations',
      'challenge',
      'exposed',
      'parley',
    ],
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
    /*
     * 옛 프론트 번들에는 이 항목이 없다. 워커를 먼저 배포하는 순서를 지키면
     * 「새 워커 + 옛 프론트」 구간이 반드시 생기므로, 없으면 빈 배열로 읽는다.
     */
    exposed: obj['exposed'] === undefined ? [] : ids(obj, 'exposed', LIMITS.players, where),
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
    [
      'viewerId',
      'round',
      'totalRounds',
      'phase',
      'turnIndex',
      'players',
      'rounds',
      'findings',
      'powerSpent',
      'solution',
      'outcome',
    ],
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
    /*
     * 없으면 빈 배열로 본다. 워커와 프론트는 따로 배포되므로, 필수로 받으면 워커가 먼저
     * 올라간 순간 캐시된 옛 번들이 전부 400을 맞고 폴백으로 떨어진다.
     * **워커를 먼저 배포하고 프론트를 나중에** 올리면 이 관용 하나로 창이 닫힌다.
     */
    findings:
      obj['findings'] === undefined
        ? []
        : list(obj, 'findings', LIMITS.findings, where).map(grant),
    // findings와 같은 이유로 관용한다 — 워커를 먼저 배포하는 순서를 지키기 위한 창이다.
    powerSpent: obj['powerSpent'] === undefined ? false : flag(obj, 'powerSpent', where),
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
    onlyKeys(obj, ['v', 'kind', 'sessionId', 'ask', 'view', 'power'], 'body')
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
        power:
          obj['power'] === undefined || obj['power'] === null
            ? null
            : powerBrief(obj['power'], 'body.power'),
        ask,
        view: gameView(obj['view']),
      },
    }
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, message: e.message }
    throw e
  }
}
