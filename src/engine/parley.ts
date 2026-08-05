import { nextRound } from './progress'
import type { GameState, PlayerId, RoundRecord } from './types'

/**
 * 밀담 페이즈의 출구는 둘뿐이고 **둘 다 라운드를 끝낸다.**
 *
 * 「상대 지목 → 내 말 → 상대의 말」을 프론트가 다 받아온 뒤 여기에 한 번 넣는다.
 * 두 번의 전이(열기 → 답하기)로 나누면 «말했는데 답이 안 왔다»가 상태로 남아
 * 응답이 오지 않을 때 페이즈가 갇힌다. 1왕복으로 정한 이상 그 유연성은 값을 못 한다(설계 §3).
 */

/**
 * 정보상이 걸어둔 판정을 푼다. 신고가 없으면(판정할 것이 없었으면) 그대로 남겨 다음 밀담을 기다린다.
 *
 * 능력의 주인은 언제나 사람이다 — 정보상은 사람 좌석에만 배정된다(content/roles.ts).
 */
function detected(
  state: GameState,
  ownerId: PlayerId,
  targetId: PlayerId,
  truthful: boolean | null,
): GameState {
  if (truthful === null) return state
  const armed = state.pending.find((p) => p.ownerId === ownerId && p.use.kind === 'detect-lie')
  if (!armed) return state

  return {
    ...state,
    grants: [...state.grants, { round: state.round, ownerId, finding: { kind: 'parley', targetId, truthful } }],
    pending: state.pending.filter((p) => p !== armed),
  }
}

function currentRound(state: GameState): RoundRecord {
  const record = state.rounds[state.rounds.length - 1]
  if (!record) throw new Error('진행 중인 라운드가 없다')
  return record
}

/**
 * 밀담을 기록하고 다음 라운드를 연다.
 *
 * **길이는 검증하지 않는다.** 룰이 아니라 경계의 일이라 프론트와 워커가 맡는다(설계 §5).
 */
export function parley(
  state: GameState,
  targetId: PlayerId,
  askLine: string,
  replyLine: string,
  /**
   * 상대가 «자기 입으로 신고한» 참·거짓. 판정할 것이 없었으면 null이다.
   *
   * 엔진이 텍스트를 읽어 정한 값이 아니다 — 말한 쪽이 자기 거짓말 여부를 함께 낸 것이다.
   * 기록(ParleyRecord)에는 넣지 않는다. 넣으면 능력 없이도 시야에서 그대로 읽힌다.
   */
  truthful: boolean | null = null,
): GameState {
  if (state.phase !== 'whisper') throw new Error(`밀담 페이즈가 아니다: ${state.phase}`)

  const human = state.players.find((p) => p.isHuman)
  if (!human) throw new Error('사람 자리가 없다')
  if (targetId === human.id) throw new Error('자기 자신과는 밀담할 수 없다')
  if (!state.players.some((p) => p.id === targetId)) throw new Error(`없는 플레이어: ${targetId}`)

  const record = currentRound(state)
  if (record.parleys.length >= state.parleyAllowance) {
    throw new Error('이번 라운드에 걸 수 있는 밀담을 다 썼다')
  }
  // 같은 상대와 두 번 거는 것은 회선을 늘린 뜻이 아니다. 상대가 달라야 정보가 는다.
  if (record.parleys.some((p) => p.targetId === targetId)) {
    throw new Error('이번 라운드에 이미 이야기한 상대다')
  }

  const parleys = [...record.parleys, { targetId, askLine, replyLine }]
  const updated: RoundRecord = { ...record, parleys }
  const written = detected(
    { ...state, rounds: [...state.rounds.slice(0, -1), updated] },
    human.id,
    targetId,
    truthful,
  )

  // 허용을 다 써야 라운드가 넘어간다. 회선이 남아 있으면 밀담 페이즈에 그대로 머문다.
  return parleys.length >= state.parleyAllowance ? nextRound(written) : written
}

/** 밀담 없이 라운드를 넘긴다. 건너뛰기와 폴백이 같은 문으로 나간다. */
export function skipParley(state: GameState): GameState {
  if (state.phase !== 'whisper') throw new Error(`밀담 페이즈가 아니다: ${state.phase}`)
  return nextRound(state)
}
