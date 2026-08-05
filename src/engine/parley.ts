import { nextRound } from './progress'
import type { GameState, PlayerId, RoundRecord } from './types'

/**
 * 밀담 페이즈의 출구는 둘뿐이고 **둘 다 라운드를 끝낸다.**
 *
 * 「상대 지목 → 내 말 → 상대의 말」을 프론트가 다 받아온 뒤 여기에 한 번 넣는다.
 * 두 번의 전이(열기 → 답하기)로 나누면 «말했는데 답이 안 왔다»가 상태로 남아
 * 응답이 오지 않을 때 페이즈가 갇힌다. 1왕복으로 정한 이상 그 유연성은 값을 못 한다(설계 §3).
 */

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
 * 기록 배열만 받는 이유도 같다 — GameView에 「남은 횟수」를 더하면 그 뷰가 그대로 워커로
 * 가고, 워커 스키마가 화이트리스트로 키를 검사해서(workers/src/schema.ts) 모든 LLM 호출이
 * 400으로 거절된다. 화면도 엔진도 이 함수 하나를 쓴다.
 *
 * 건너뛴 라운드는 `parley`가 null이라 세지 않는다. **말을 건 것만 값을 치른다.**
 */
export function parleysUsedIn(rounds: readonly { readonly parley: unknown }[]): number {
  return rounds.filter((r) => r.parley !== null).length
}

/** 지금 밀담을 걸 수 있는가. 화면이 버튼을 막을 때와 엔진이 거절할 때가 같은 기준을 쓴다. */
export function canParley(state: GameState): boolean {
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
): GameState {
  if (state.phase !== 'whisper') throw new Error(`밀담 페이즈가 아니다: ${state.phase}`)

  const human = state.players.find((p) => p.isHuman)
  if (!human) throw new Error('사람 자리가 없다')
  if (targetId === human.id) throw new Error('자기 자신과는 밀담할 수 없다')
  if (!state.players.some((p) => p.id === targetId)) throw new Error(`없는 플레이어: ${targetId}`)

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
  /*
   * 라운드당 1회. 이 전이가 곧바로 라운드를 넘기므로 화면에서는 여기에 닿을 수 없지만,
   * 엔진의 계약은 «화면이 만들 수 있는 상태»가 아니라 «모든 상태»에 대한 것이다.
   */
  if (record.parley) throw new Error('이번 라운드에는 이미 밀담했다')

  const updated: RoundRecord = { ...record, parley: { targetId, askLine, replyLine } }
  return nextRound({ ...state, rounds: [...state.rounds.slice(0, -1), updated] })
}

/** 밀담 없이 라운드를 넘긴다. 건너뛰기와 폴백이 같은 문으로 나간다. */
export function skipParley(state: GameState): GameState {
  if (state.phase !== 'whisper') throw new Error(`밀담 페이즈가 아니다: ${state.phase}`)
  return nextRound(state)
}
