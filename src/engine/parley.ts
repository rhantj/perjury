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
 * 한 판에 걸 수 있는 밀담 횟수 (decisions/009).
 *
 * 라운드마다 문이 열리므로 제한이 없으면 8라운드 = 8번이고, 그러면 «언제 쓸까»가 사라진다.
 * 3회로 묶어 밀담을 **아껴 쓰는 자원**으로 만든다.
 */
export const PARLEY_LIMIT = 3

/**
 * 지금까지 성사된 밀담 수.
 *
 * **상태로 들지 않는다.** 기록에서 세면 나오는 값을 따로 저장하면 되감기·재현에서
 * 어긋날 자리가 하나 더 생긴다(decisions/008과 같은 이유).
 *
 * 기록 배열만 받는 이유도 같다 — GameView에 「남은 횟수」를 더하면 그 뷰가 그대로 워커로 간다.
 * 워커 스키마는 화이트리스트로 키를 검사하므로(workers/src/schema.ts) 필드를 늘리려면
 * **워커를 함께 넓히고 워커부터 배포해야** 한다. 세는 방법을 여기 한 벌만 두면 그 일이 없다.
 *
 * **라운드가 아니라 밀담 하나하나를 센다.** 전화교환수는 한 라운드에 둘을 걸 수 있는데
 * (결정 007), 라운드로 세면 그 판이 예산 3회를 넘겨 여섯 번까지 말하게 된다.
 * 회선이 느는 것은 «몰아 쓸 자유»지 «총량이 느는 것»이 아니다.
 *
 * 건너뛴 라운드는 배열이 비어 있어 0으로 센다. **말을 건 것만 값을 치른다.**
 */
export function parleysUsedIn(rounds: readonly { readonly parleys: readonly unknown[] }[]): number {
  return rounds.reduce((total, round) => total + round.parleys.length, 0)
}

/** 지금 밀담을 걸 수 있는가. 화면이 버튼을 막을 때와 엔진이 거절할 때가 같은 기준을 쓴다. */
export function canParley(state: GameState): boolean {
  // 거는 쪽은 언제나 사람이다(설계 §3). 그 사람이 탈락했으면 밀담을 잃는다(룰 개편 §2-5).
  const human = state.players.find((p) => p.isHuman)
  if (human && state.eliminated.includes(human.id)) return false
  return parleysUsedIn(state.rounds) < PARLEY_LIMIT
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
  /*
   * 탈락자는 밀담을 잃는다 — 거는 쪽으로도, 받는 쪽으로도(룰 개편 §2-5, 결정 011).
   *
   * canParley에만 두면 「밀담은 판당 N회까지다」로 되던져져, 한 번도 안 쓴 사람이
   * 한도 초과 안내를 본다. 사유가 다르면 메시지도 달라야 한다.
   */
  if (state.eliminated.includes(human.id)) {
    throw new Error('탈락자는 밀담을 걸 수 없다')
  }
  /*
   * 받는 쪽을 막는 것은 비용이 아니라 **밸런스** 결정이다(결정 011).
   * 탈락자의 손패 2장은 그대로 비밀인데, 캐낼 수 있게 두면 조기 고발이 「틀려도 정보원이 하나
   * 생긴다」가 되어 위험이 사라진다. 호출 절약이 근거가 아니다 — 호출은 이 함수보다
   * 먼저 나간다(store의 askParley).
   */
  if (state.eliminated.includes(targetId)) {
    throw new Error(`탈락자에게는 말을 걸 수 없다: ${targetId}`)
  }

  /*
   * 판당 상한 (decisions/009). 라운드당 1회와 **다른 것을 막는다** —
   * 아래 라운드당 1회는 «한 라운드 안에서 두 번»을, 이쪽은 «판 전체에서 네 번»을 막는다.
   *
   * skipParley에는 걸지 않는다. 한도가 나가는 문까지 막으면 밀담 페이즈가 갇힌다.
   */
  if (!canParley(state)) {
    throw new Error(`밀담은 판당 ${PARLEY_LIMIT}회까지다`)
  }

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

  /*
   * 허용을 다 써야 라운드가 넘어간다. 회선이 남아 있으면 밀담 페이즈에 그대로 머문다.
   *
   * **판당 예산이 먼저 마르는 경우도 함께 넘긴다.** 전화교환수의 회선 2개 중 하나만 쓰고
   * 예산이 떨어지면, 라운드 허용치는 남았는데 거는 것마다 거절당해 페이즈에 갇힌다.
   */
  const roundDone = parleys.length >= state.parleyAllowance
  return roundDone || !canParley(written) ? nextRound(written) : written
}

/** 밀담 없이 라운드를 넘긴다. 건너뛰기와 폴백이 같은 문으로 나간다. */
export function skipParley(state: GameState): GameState {
  if (state.phase !== 'whisper') throw new Error(`밀담 페이즈가 아니다: ${state.phase}`)
  return nextRound(state)
}
