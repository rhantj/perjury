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

/**
 * 한 사람이 한 판에 걸 수 있는 이의제기 횟수 (decisions/008).
 *
 * 규칙상 이의제기는 이기든 지든 내 패 1장을 소모하므로 손패 2장이면 자연히 두 번이
 * 상한이다. 그걸 명시적 자원으로 만들어 화면에 보여주려고 상수로 둔다.
 */
export const CHALLENGE_LIMIT = 2

/** 아직 공개되지 않은 손패. 이의제기에 낼 수 있는 카드이자 페널티로 깔 대상이다. */
function hiddenHand(player: Player): readonly CardId[] {
  return player.hand.filter((c) => !player.revealed.includes(c))
}

/** 아직 공개되지 않은 손패에서 1장. 남은 게 없으면 공개할 것도 없다. */
function pickHidden(player: Player, rng: () => number): CardId | null {
  const hidden = hiddenHand(player)
  if (hidden.length === 0) return null
  return pickOne(hidden, rng)
}

/**
 * 이 사람이 지금까지 건 이의제기 횟수.
 *
 * **상태로 들지 않는다.** 기록에서 세면 나오는 값을 따로 저장하면 되감기·재현에서
 * 어긋날 자리가 하나 더 생긴다(decisions/008).
 */
export function challengesUsed(state: GameState, playerId: PlayerId): number {
  return challengesUsedIn(state.rounds, playerId)
}

/**
 * 기록 배열만 받는 판. **화면이 쓰는 입구다.**
 *
 * GameView에 「남은 횟수」 필드를 더하지 않으려고 이 모양으로 뺐다 — 그 뷰는 그대로
 * 워커로 전송되고, 워커 스키마가 화이트리스트로 키를 검사하기 때문에(workers/src/schema.ts)
 * 필드가 하나 늘면 모든 LLM 호출이 400으로 거절된다. 세는 방법은 여기 한 벌만 둔다.
 */
export function challengesUsedIn(
  rounds: readonly { readonly challenge: { readonly challengerId: PlayerId } | null }[],
  playerId: PlayerId,
): number {
  return rounds.filter((r) => r.challenge?.challengerId === playerId).length
}

/** 지금 이의제기를 걸 수 있는가. 화면이 버튼을 막을 때와 엔진이 거절할 때가 같은 기준을 쓴다. */
export function canChallenge(state: GameState, playerId: PlayerId): boolean {
  const player = state.players.find((p) => p.id === playerId)
  if (!player) return false
  if (state.eliminated.includes(playerId)) return false
  return challengesUsed(state, playerId) < CHALLENGE_LIMIT && hiddenHand(player).length > 0
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
  line: string | null = null,
): GameState {
  if (state.phase !== 'challenge') throw new Error(`이의제기 페이즈가 아니다: ${state.phase}`)
  if (challengerId === targetId) throw new Error('자기 자신에게 이의제기할 수 없다')

  const challenger = requirePlayer(state, challengerId)
  requirePlayer(state, targetId)

  /*
   * 횟수와 자격 (decisions/008). 둘은 다른 구멍을 막는다 —
   * 횟수는 «양»을, 자격은 «값»을 보장한다.
   *
   * 자격이 따로 필요한 이유: 손패는 이의제기 말고도 비는 길이 있다(위증하다 걸리면
   * 내 패가 열린다). 패가 다 열린 사람의 이의제기는 pickHidden이 null을 돌려줘
   * 페널티가 아예 없는 «공짜 행동»이 되고, 값이 없는 행동은 남발된다.
   */
  /*
   * 탈락자는 이의제기하지 않는다. 실패하면 미공개 손패가 1장 열리는데, 그것이
   * 「탈락자 손패는 공개하지 않는다」(룰 개편 §2-5)와 정면으로 부딪히기 때문이다.
   * 룰 개편 §2-4에서 이의제기가 제안자 전용이 되면 어차피 자연히 배제된다.
   */
  if (state.eliminated.includes(challengerId)) {
    throw new Error(`탈락자는 이의제기할 수 없다: ${challengerId}`)
  }
  if (challengesUsed(state, challengerId) >= CHALLENGE_LIMIT) {
    throw new Error(`이의제기는 판당 ${CHALLENGE_LIMIT}회까지다: ${challengerId}`)
  }
  if (hiddenHand(challenger).length === 0) {
    throw new Error(`공개되지 않은 손패가 없으면 이의제기할 수 없다: ${challengerId}`)
  }

  const record = currentRound(state)
  const declaration = record.declarations.find((d) => d.playerId === targetId)
  if (!declaration) throw new Error('선언하지 않은 사람은 이의제기 대상이 아니다')
  if (declaration.claim.kind !== 'refute') {
    throw new Error('침묵 선언은 증명할 수 없으므로 이의제기 대상이 아니다')
  }

  const cardId = declaration.claim.cardId
  /*
   * 잡혔는가와 성공했는가를 나눈다.
   *
   * 밀정의 보호는 «잡힌» 위증만 막는다. 어차피 실패할 이의제기까지 삼키면
   * 보호가 헛되이 사라지고, 밀정은 아무것도 얻지 못한 채 능력만 잃는다.
   */
  const caught = challenger.hand.includes(cardId)
  const shield = caught
    ? state.pending.find((p) => p.ownerId === targetId && p.use.kind === 'shield')
    : undefined
  const success = caught && !shield

  // 상황에서 시드를 파생시킨다. 함수는 순수하게 두면서 판은 재현 가능하게 유지한다.
  const rng = createRng(`${state.seed}:challenge:${record.round}:${challengerId}:${targetId}`)

  const reveals: Reveal[] = []
  if (success) {
    const punished = pickHidden(requirePlayer(state, targetId), rng)
    if (punished) reveals.push({ playerId: targetId, cardId: punished })
    // 증명 카드가 이미 공개돼 있으면 또 넣지 않는다 — revealed에 같은 id가 두 번 쌓여
    // 화면에 같은 카드가 두 장 그려졌다(decisions/008 «곁다리로 발견한 결함»).
    if (!challenger.revealed.includes(cardId)) {
      reveals.push({ playerId: challengerId, cardId })
    }
  } else {
    const punished = pickHidden(challenger, rng)
    if (punished) reveals.push({ playerId: challengerId, cardId: punished })
  }

  return closeRound(
    // 쓴 보호는 여기서 거둔다. 「위증 1회」이므로 라운드가 아니라 한 번 막는 것으로 끝난다.
    shield ? { ...state, pending: state.pending.filter((p) => p !== shield) } : state,
    record,
    { challengerId, targetId, cardId, success, reveals, line },
    applyReveals(state, reveals),
  )
}

/** 이의제기하지 않고 넘어간다. 알고도 말하지 않는 선택이다. */
export function skipChallenge(state: GameState): GameState {
  if (state.phase !== 'challenge') throw new Error(`이의제기 페이즈가 아니다: ${state.phase}`)
  return closeRound(state, currentRound(state), null, state.players)
}
