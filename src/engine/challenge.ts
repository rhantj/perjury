import { createRng, pickOne } from './rng'
import type {
  CardId,
  ChallengeRecord,
  GameState,
  Player,
  PlayerId,
  Reveal,
  RoundRecord,
} from './types'

function currentRound(state: GameState): RoundRecord {
  const record = state.rounds[state.rounds.length - 1]
  if (!record) throw new Error('진행 중인 라운드가 없다')
  return record
}

function requirePlayer(state: GameState, playerId: PlayerId): Player {
  const player = state.players.find((p) => p.id === playerId)
  if (!player) throw new Error(`없는 플레이어: ${playerId}`)
  return player
}

/** 아직 공개되지 않은 손패에서 1장. 남은 게 없으면 공개할 것도 없다. */
function pickHidden(player: Player, rng: () => number): CardId | null {
  const hidden = player.hand.filter((c) => !player.revealed.includes(c))
  if (hidden.length === 0) return null
  return pickOne(hidden, rng)
}

function applyReveals(state: GameState, reveals: readonly Reveal[]): Player[] {
  return state.players.map((player) => {
    const mine = reveals.filter((r) => r.playerId === player.id).map((r) => r.cardId)
    if (mine.length === 0) return player
    return { ...player, revealed: [...player.revealed, ...mine] }
  })
}

function closeRound(
  state: GameState,
  record: RoundRecord,
  challengeRecord: ChallengeRecord | null,
  players: readonly Player[],
): GameState {
  return {
    ...state,
    phase: 'whisper',
    players,
    rounds: [...state.rounds.slice(0, -1), { ...record, challenge: challengeRecord }],
  }
}

/**
 * 이의제기. "저 사람은 그 카드를 갖고 있지 않다"를 주장한다.
 *
 * 증명 수단은 하나뿐이다 — 내가 그 카드를 쥐고 있으면 상대는 가질 수 없다.
 * 그래서 성공하려면 근거 카드를 공개해야 하고, 잡는 쪽도 정보를 잃는다.
 *
 * 침묵(pass) 선언은 대상이 될 수 없다. "너는 그 카드를 갖고 있다"는
 * 남의 손패를 볼 수 없는 이상 증명할 방법이 없기 때문이다 — 설계 문서 §1.4.1.
 */
export function challenge(
  state: GameState,
  challengerId: PlayerId,
  targetId: PlayerId,
): GameState {
  if (state.phase !== 'challenge') throw new Error(`이의제기 페이즈가 아니다: ${state.phase}`)
  if (challengerId === targetId) throw new Error('자기 자신에게 이의제기할 수 없다')

  const challenger = requirePlayer(state, challengerId)
  requirePlayer(state, targetId)

  const record = currentRound(state)
  const declaration = record.declarations.find((d) => d.playerId === targetId)
  if (!declaration) throw new Error('선언하지 않은 사람은 이의제기 대상이 아니다')
  if (declaration.claim.kind !== 'refute') {
    throw new Error('침묵 선언은 증명할 수 없으므로 이의제기 대상이 아니다')
  }

  const cardId = declaration.claim.cardId
  const success = challenger.hand.includes(cardId)

  // 상황에서 시드를 파생시킨다. 함수는 순수하게 두면서 판은 재현 가능하게 유지한다.
  const rng = createRng(`${state.seed}:challenge:${record.round}:${challengerId}:${targetId}`)

  const reveals: Reveal[] = []
  if (success) {
    const punished = pickHidden(requirePlayer(state, targetId), rng)
    if (punished) reveals.push({ playerId: targetId, cardId: punished })
    reveals.push({ playerId: challengerId, cardId })
  } else {
    const punished = pickHidden(challenger, rng)
    if (punished) reveals.push({ playerId: challengerId, cardId: punished })
  }

  return closeRound(
    state,
    record,
    { challengerId, targetId, cardId, success, reveals },
    applyReveals(state, reveals),
  )
}

/** 이의제기하지 않고 넘어간다. 알고도 말하지 않는 선택이다. */
export function skipChallenge(state: GameState): GameState {
  if (state.phase !== 'challenge') throw new Error(`이의제기 페이즈가 아니다: ${state.phase}`)
  return closeRound(state, currentRound(state), null, state.players)
}
