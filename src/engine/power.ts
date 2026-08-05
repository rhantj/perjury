import { createRng } from './rng'
import type { Finding, GameState, Grant, PlayerId, PowerUse } from './types'

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
function pickFromHand(state: GameState, targetId: PlayerId): string {
  const target = requirePlayer(state, targetId)
  const hidden = target.hand.filter((cardId) => !target.revealed.includes(cardId))
  const pool = hidden.length > 0 ? hidden : target.hand
  const rng = createRng(`${state.seed}:power:hand:${targetId}`)
  const picked = pool[Math.floor(rng() * pool.length)]
  if (!picked) throw new Error(`손패가 비었다: ${targetId}`)
  return picked
}

function resolve(state: GameState, use: PowerUse): Finding {
  switch (use.kind) {
    case 'inspect-hand':
      return { kind: 'hand', targetId: use.targetId, cardId: pickFromHand(state, use.targetId) }
    case 'check-weapon':
      return { kind: 'weapon', cardId: use.cardId, isSolution: state.solution.weapon === use.cardId }
  }
}

export function usePower(state: GameState, playerId: PlayerId, use: PowerUse): GameState {
  requirePlayer(state, playerId)
  if (state.powersUsed.includes(playerId)) throw new Error('능력은 한 판에 한 번뿐이다')
  if (use.kind === 'inspect-hand') {
    if (use.targetId === playerId) throw new Error('자기 손패는 이미 안다')
    requirePlayer(state, use.targetId)
  }

  const grant: Grant = { round: state.round, ownerId: playerId, finding: resolve(state, use) }

  return {
    ...state,
    powersUsed: [...state.powersUsed, playerId],
    grants: [...state.grants, grant],
  }
}

/** 한 사람이 능력으로 알게 된 것들. viewFor와 프롬프트가 함께 쓴다. */
export function findingsFor(state: GameState, viewerId: PlayerId): readonly Grant[] {
  return state.grants.filter((grant) => grant.ownerId === viewerId)
}
