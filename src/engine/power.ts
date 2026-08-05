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
 * 지금 써도 되는 능력인가.
 *
 * 답이 «선언»에서 나오는 능력은 선언 전에 지목해야 한다. 늦게 지목하면 답을 낼 기회가
 * 이미 지나가, 소진만 되고 답은 영영 오지 않는다. 화면에서 막을 수도 있지만 이건 룰이므로
 * 엔진이 막는다 — 화면 버그가 능력을 조용히 태워 없애면 안 된다(작업 규칙 2).
 */
export function usableIn(kind: PowerUse['kind'], phase: Phase): boolean {
  switch (kind) {
    case 'verify-claim':
      return phase === 'suggest' || phase === 'refute'
    case 'inspect-hand':
    case 'check-weapon':
    case 'photograph':
    case 'publish':
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

export function usePower(state: GameState, playerId: PlayerId, use: PowerUse): GameState {
  requirePlayer(state, playerId)
  /*
   * 페이즈는 따지지 않는다 — 능력은 판단 전이가 아니라 곁가지 행동이라 아무 때나 쓴다.
   * **끝난 판만 예외다.** 여기서 막지 않으면 결과 화면에서 능력을 태워 없앨 수 있다.
   */
  if (state.phase === 'over') throw new Error('끝난 판에서는 능력을 쓸 수 없다')
  if (!usableIn(use.kind, state.phase)) throw new Error(`지금은 쓸 수 없는 능력이다: ${state.phase}`)
  if (state.powersUsed.includes(playerId)) throw new Error('능력은 한 판에 한 번뿐이다')

  const target = targetOf(use)
  if (target !== null) {
    if (target === playerId) throw new Error('자기 자신은 지목할 수 없다')
    requirePlayer(state, target)
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
  /** 신문기자가 어느 라운드의 반증을 공개할지. */
  readonly round?: number
}

/**
 * 좌석의 능력 종류에 의사를 붙여 실행 가능한 형태로 만든다.
 *
 * 필요한 대상이 없으면 **던지지 않고 null**이다. 발동은 사람이 버튼을 잘못 누르거나
 * LLM이 대상을 빠뜨려서 불완전하게 들어오는 일이 흔한데, 그때마다 판이 오류로 멈추면
 * 안 되기 때문이다. 부르는 쪽은 null을 조용히 무시한다.
 */
export function buildPowerUse(effect: PowerUse['kind'], intent: PowerIntent): PowerUse | null {
  const { targetId, cardId, round } = intent

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
      return targetId && round !== undefined ? { kind: 'publish', round, targetId } : null
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
 * 선언이 확정된 뒤에야 답이 나오는 지목을 푼다. `declareAll`이 마지막에 부른다.
 *
 * 순사가 여기 걸린다 — 지목은 선언 «전»에 하고 답은 선언 «후»에 나온다.
 * 이번 라운드 것만 본다. 답을 낼 기회는 이 한 번뿐이라, 지목한 상대가 선언하지 않았으면
 * (제안자를 지목한 경우다) 답 없이 소진된다.
 */
export function resolveAfterDeclare(
  state: GameState,
  declarations: readonly Declaration[],
): GameState {
  const ripe = (p: PendingPower) => p.use.kind === 'verify-claim' && p.round === state.round
  if (!state.pending.some(ripe)) return state

  const grants = state.pending.reduce<Grant[]>((acc, p) => {
    // p.use를 꺼내 둬야 유니온이 좁혀진다 — 중첩 속성은 좁힘이 유지되지 않는다.
    const use = p.use
    if (!ripe(p) || use.kind !== 'verify-claim') return acc
    const declaration = declarations.find((d) => d.playerId === use.targetId)
    if (!declaration) return acc
    return [
      ...acc,
      {
        round: p.round,
        ownerId: p.ownerId,
        finding: { kind: 'claim', targetId: declaration.playerId, truthful: !declaration.isPerjury },
      },
    ]
  }, [])

  return {
    ...state,
    grants: [...state.grants, ...grants],
    pending: state.pending.filter((p) => !ripe(p)),
  }
}

/** 한 사람이 능력으로 알게 된 것들. viewFor와 프롬프트가 함께 쓴다. */
export function findingsFor(state: GameState, viewerId: PlayerId): readonly Grant[] {
  return state.grants.filter((grant) => grant.ownerId === viewerId)
}
