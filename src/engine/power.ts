import { createRng, pickOne } from './rng'
import type { CardId, Finding, GameState, Grant, PlayerId, PowerUse } from './types'

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

/** 한 사람이 능력으로 알게 된 것들. viewFor와 프롬프트가 함께 쓴다. */
export function findingsFor(state: GameState, viewerId: PlayerId): readonly Grant[] {
  return state.grants.filter((grant) => grant.ownerId === viewerId)
}
