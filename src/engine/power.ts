import { createRng, pickOne } from './rng'
import type {
  CardId,
  Declaration,
  Finding,
  GameState,
  Grant,
  PendingPower,
  Phase,
  PlayerId,
  PowerUse,
} from './types'

/**
 * 직업 능력의 발동. 다른 전이 함수와 같이 **순수 함수**다.
 *
 * 능력은 판단이 아니라 «룰»이므로 여기 있다. 무엇을 알게 되는지는 게임 상태에서
 * 결정론적으로 나오고, LLM은 「쓸지 말지·누구에게」까지만 정한다.
 *
 * 직업 이름을 모른다 — 받는 것은 `PowerUse`의 종류뿐이다.
 * 「이 좌석이 이 능력을 가졌는가」는 호출부가 배정표를 보고 확인한다(엔진은 배정표를 모른다.
 * content → engine 한 방향 의존을 지키기 위해서다).
 */

function requirePlayer(state: GameState, playerId: PlayerId) {
  const player = state.players.find((p) => p.id === playerId)
  if (!player) throw new Error(`없는 플레이어: ${playerId}`)
  return player
}

/**
 * 손패에서 한 장을 고른다. 상황에서 시드를 파생시켜 순수성과 재현성을 함께 지킨다.
 * 이미 공개된 카드는 알려줘야 소용이 없으므로 뺀다.
 */
function pickFromHand(state: GameState, targetId: PlayerId): CardId {
  const target = requirePlayer(state, targetId)
  const hidden = target.hand.filter((cardId) => !target.revealed.includes(cardId))
  // 이미 공개된 카드를 알려주면 능력이 헛돈다. 다 공개됐으면 어쩔 수 없이 손패 전체에서 고른다.
  const pool = hidden.length > 0 ? hidden : target.hand
  if (pool.length === 0) throw new Error(`손패가 비었다: ${targetId}`)
  return pickOne(pool, createRng(`${state.seed}:power:hand:${targetId}`))
}

/** 남을 지목하는 능력이면 그 대상. 대상이 없는 능력이면 null. */
function targetOf(use: PowerUse): PlayerId | null {
  switch (use.kind) {
    case 'inspect-hand':
    case 'verify-claim':
    case 'photograph':
    case 'publish':
    case 'frame':
      return use.targetId
    case 'check-weapon':
    case 'shield':
    case 'refuse-demand':
    case 'eavesdrop':
    case 'detect-lie':
      return null
  }
}

/** 능력을 쓰려면 무엇을 골라야 하는가. */
export type PowerNeeds = 'player' | 'weapon' | 'none'

/**
 * 종류마다 무엇을 고르는지. 화면(대상 목록)과 프롬프트(선택지 목록)가 같은 답을 써야 하므로
 * 여기 한 곳에 둔다. 종류가 늘면 컴파일러가 이 switch를 짚는다.
 */
export function needsOf(kind: PowerUse['kind']): PowerNeeds {
  switch (kind) {
    case 'inspect-hand':
    case 'verify-claim':
    case 'photograph':
    case 'publish':
    case 'frame':
      return 'player'
    case 'check-weapon':
      return 'weapon'
    case 'shield':
    case 'refuse-demand':
    case 'eavesdrop':
    case 'detect-lie':
      return 'none'
  }
}

/**
 * 「지금」이 언제인가. GameState와 GameView 양쪽이 그대로 들어맞는다 —
 * 같은 판정을 엔진과 화면이 함께 써야 하기 때문이다.
 */
export interface PowerTiming {
  readonly phase: Phase
  readonly round: number
  readonly totalRounds: number
}

/**
 * 지금 써도 되는 능력인가.
 *
 * 막는 이유가 둘이고, 능력마다 다르다.
 *   답이 나올 «나중»이 없다 — 마지막 라운드의 촬영, 첫 라운드의 신문.
 *     쓰면 소진만 되고 답은 영영 오지 않는다.
 *   지목이 선언보다 앞서야 한다 — 순사.
 *     선언을 다 듣고 지목하면 「참인지 알려달라」가 아니라 「거짓말한 놈을 짚어달라」가 된다.
 *     대기가 생긴 뒤로는 회수 자체는 가능하므로, 이 가드는 밸런스로만 남는다.
 *
 * 화면에서 막을 수도 있지만 이건 룰이므로 엔진이 막는다 —
 * 화면 버그가 능력을 조용히 태워 없애면 안 된다(작업 규칙 2).
 */
export function usableIn(kind: PowerUse['kind'], at: PowerTiming): boolean {
  switch (kind) {
    case 'verify-claim':
      return at.phase === 'suggest' || at.phase === 'refute'
    // 겨누는 것이 «다음» 라운드다. 마지막 라운드에는 그 다음이 오지 않는다.
    case 'photograph':
      return at.round < at.totalRounds
    // 신문은 지나간 일을 쓴다. 첫 라운드에는 지난 반증이 없다.
    case 'publish':
      return at.round > 1
    case 'inspect-hand':
    case 'check-weapon':
    case 'shield':
    case 'refuse-demand':
    case 'frame':
    case 'eavesdrop':
    case 'detect-lie':
      return true
  }
}

/**
 * 지금 답이 나오는 능력만 사실을 만든다.
 *
 * null을 돌려주면 pending에 머문다 — 선언·이의제기·밀담이 지나야 답이 정해지는 것들이다.
 * 어느 쪽인지는 능력마다 고정이라 여기 한 곳에서 갈린다.
 */
function resolve(state: GameState, use: PowerUse): Finding | null {
  switch (use.kind) {
    case 'inspect-hand':
      return { kind: 'hand', targetId: use.targetId, cardId: pickFromHand(state, use.targetId) }
    case 'check-weapon':
      return { kind: 'weapon', cardId: use.cardId, isSolution: state.solution.weapon === use.cardId }
    case 'verify-claim':
    case 'photograph':
    case 'publish':
    case 'shield':
    case 'refuse-demand':
    case 'frame':
    case 'eavesdrop':
    case 'detect-lie':
      return null
  }
}

/**
 * 지목한 사람의 «가장 최근» 지난 선언을 찾아 그 진위를 라운드 기록에 새긴다.
 *
 * 이번 라운드는 보지 않는다. 아직 이의제기가 남아 있는 선언의 진위를 미리 밝히면
 * 그 라운드의 이의제기가 통째로 무의미해진다 — 신문은 지나간 일을 쓴다.
 *
 * 공개할 것이 없으면 **던진다.** 조용히 넘어가면 능력만 소진되고 아무 일도 안 일어나는데,
 * 지목한 상대가 매 라운드 제안자였는지는 화면도 미리 막아줄 수 없는 선택이라 알려야 한다.
 */
function publishInto(state: GameState, targetId: PlayerId): GameState['rounds'] {
  // 뒤에서부터 찾는다 — 「가장 최근」이므로. 이번 라운드는 아직 이의제기가 남아 제외한다.
  let index = -1
  for (let i = state.rounds.length - 1; i >= 0; i -= 1) {
    const record = state.rounds[i]
    if (!record || record.round >= state.round) continue
    // 침묵도 선언이고 진위가 있다(카드를 쥐고도 침묵하면 위증). 순사와 같은 기준으로 본다.
    if (record.declarations.some((d) => d.playerId === targetId)) {
      index = i
      break
    }
  }

  const found = state.rounds[index]
  const declaration = found?.declarations.find((d) => d.playerId === targetId)
  if (!found || !declaration) throw new Error(`공개할 지난 반증이 없다: ${targetId}`)

  const truthful = !declaration.isPerjury
  return state.rounds.map((entry, i) =>
    i === index ? { ...entry, published: [...entry.published, { playerId: targetId, truthful }] } : entry,
  )
}

export function usePower(state: GameState, playerId: PlayerId, use: PowerUse): GameState {
  requirePlayer(state, playerId)
  /*
   * 페이즈는 따지지 않는다 — 능력은 판단 전이가 아니라 곁가지 행동이라 아무 때나 쓴다.
   * **끝난 판만 예외다.** 여기서 막지 않으면 결과 화면에서 능력을 태워 없앨 수 있다.
   */
  if (state.phase === 'over') throw new Error('끝난 판에서는 능력을 쓸 수 없다')
  // 탈락자는 능력을 잃는다(룰 개편 §2-5). 지목 «대상»으로는 여전히 유효하다 — 반증은 계속하므로.
  if (state.eliminated.includes(playerId)) throw new Error(`탈락자는 능력을 쓸 수 없다: ${playerId}`)
  if (!usableIn(use.kind, state)) throw new Error(`지금은 쓸 수 없는 능력이다: ${state.phase}`)
  if (state.powersUsed.includes(playerId)) throw new Error('능력은 한 판에 한 번뿐이다')

  const target = targetOf(use)
  if (target !== null) {
    if (target === playerId) throw new Error('자기 자신은 지목할 수 없다')
    requirePlayer(state, target)
  }

  // 결과가 전체 공개인 능력. 알게 된 사람이 하나가 아니라 기록 자체가 바뀐다.
  if (use.kind === 'publish') {
    const rounds = publishInto(state, use.targetId)
    return { ...state, powersUsed: [...state.powersUsed, playerId], rounds }
  }

  const finding = resolve(state, use)
  const used = { ...state, powersUsed: [...state.powersUsed, playerId] }

  if (!finding) {
    return { ...used, pending: [...state.pending, { round: state.round, ownerId: playerId, use }] }
  }

  const grant: Grant = { round: state.round, ownerId: playerId, finding }
  return { ...used, grants: [...state.grants, grant] }
}

/**
 * 능력을 쓰겠다는 «의사». 종류가 없는 것이 핵심이다.
 *
 * 사람도 AI도 「쓴다 + 대상」까지만 말하고, 종류는 좌석에 배정된 직업에서 나온다.
 * 종류까지 고르게 두면 AI가 남의 능력을 쓸 수 있고, 화면 버그가 곧 룰 위반이 된다
 * (작업 규칙 2 — AI가 룰을 어길 수 없어야 한다).
 */
export interface PowerIntent {
  readonly targetId?: PlayerId
  readonly cardId?: CardId
}

/**
 * 좌석의 능력 종류에 의사를 붙여 실행 가능한 형태로 만든다.
 *
 * 필요한 대상이 없으면 **던지지 않고 null**이다. 발동은 사람이 버튼을 잘못 누르거나
 * LLM이 대상을 빠뜨려서 불완전하게 들어오는 일이 흔한데, 그때마다 판이 오류로 멈추면
 * 안 되기 때문이다. 부르는 쪽은 null을 조용히 무시한다.
 */
export function buildPowerUse(effect: PowerUse['kind'], intent: PowerIntent): PowerUse | null {
  const { targetId, cardId } = intent

  switch (effect) {
    case 'inspect-hand':
      return targetId ? { kind: 'inspect-hand', targetId } : null
    case 'check-weapon':
      return cardId ? { kind: 'check-weapon', cardId } : null
    case 'verify-claim':
      return targetId ? { kind: 'verify-claim', targetId } : null
    case 'photograph':
      return targetId ? { kind: 'photograph', targetId } : null
    case 'publish':
      return targetId ? { kind: 'publish', targetId } : null
    case 'frame':
      return targetId ? { kind: 'frame', targetId } : null
    case 'shield':
      return { kind: 'shield' }
    case 'refuse-demand':
      return { kind: 'refuse-demand' }
    case 'eavesdrop':
      return { kind: 'eavesdrop' }
    case 'detect-lie':
      return { kind: 'detect-lie' }
  }
}

/**
 * 이 지목이 지금 «누구의 선언»을 기다리고 있는가. 기다릴 때가 아직 아니면 null.
 *
 * 겨누기 시작하는 라운드가 능력마다 다르다.
 *   verify-claim(순사) — 지목한 그 라운드부터
 *   photograph(사진사) — 지목한 «다음» 라운드부터
 *
 * 시점이 아니라 «구간»인 것이 핵심이다. 그 라운드 하나만 보면 대상이 선언하지 않은 라운드에
 * 걸렸을 때 판당 1회짜리 능력이 답 없이 증발한다 — 추첨제에서는 대상이 안 뽑힐 확률이
 * 3/5라 증발이 예외가 아니라 기본이 된다.
 */
function watchedTarget(p: PendingPower, round: number): PlayerId | null {
  if (p.use.kind === 'verify-claim' && p.round <= round) return p.use.targetId
  if (p.use.kind === 'photograph' && p.round < round) return p.use.targetId
  return null
}

/**
 * 선언이 확정된 뒤에야 답이 나오는 지목을 푼다. `declareAll`이 마지막에 부른다.
 *
 * 순사가 여기 걸린다 — 지목은 선언 «전»에 하고 답은 선언 «후»에 나온다.
 * 지목한 상대가 이번 라운드에 선언하지 않았으면 거두지 않고 **다음 라운드로 넘긴다.**
 * 판이 끝날 때까지 대상이 한 번도 말하지 않으면 그때는 답 없이 남는다.
 */
export function resolveAfterDeclare(
  state: GameState,
  declarations: readonly Declaration[],
): GameState {
  const said = new Map(declarations.map((d) => [d.playerId, d]))

  const ripe: { readonly pending: PendingPower; readonly declaration: Declaration }[] = []
  for (const pending of state.pending) {
    const targetId = watchedTarget(pending, state.round)
    if (targetId === null) continue
    const declaration = said.get(targetId)
    if (!declaration) continue
    ripe.push({ pending, declaration })
  }
  if (ripe.length === 0) return state

  const grants: Grant[] = []
  const exposed: PlayerId[] = []

  for (const { pending, declaration } of ripe) {
    if (pending.use.kind === 'verify-claim') {
      grants.push({
        // 지목한 라운드가 아니라 답이 나온 라운드다. Grant.round는 「언제 알았나」이므로.
        round: state.round,
        ownerId: pending.ownerId,
        finding: { kind: 'claim', targetId: declaration.playerId, truthful: !declaration.isPerjury },
      })
      continue
    }
    if (declaration.isPerjury) exposed.push(declaration.playerId)
  }

  const settled = new Set(ripe.map((r) => r.pending))
  const record = state.rounds[state.rounds.length - 1]
  return {
    ...state,
    grants: [...state.grants, ...grants],
    pending: state.pending.filter((p) => !settled.has(p)),
    rounds:
      record && exposed.length > 0
        ? [...state.rounds.slice(0, -1), { ...record, exposed: [...record.exposed, ...exposed] }]
        : state.rounds,
  }
}

/** 한 사람이 능력으로 알게 된 것들. viewFor와 프롬프트가 함께 쓴다. */
export function findingsFor(state: GameState, viewerId: PlayerId): readonly Grant[] {
  return state.grants.filter((grant) => grant.ownerId === viewerId)
}
