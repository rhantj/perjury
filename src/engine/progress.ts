import { cardKind } from './cards'
import { tally } from './vote'
import type { Accuser, GameState, PlayerId, Suggestion, Vote } from './types'

function assertKinds(cards: Suggestion, what: string): void {
  if (
    cardKind(cards.suspect) !== 'suspect' ||
    cardKind(cards.weapon) !== 'weapon' ||
    cardKind(cards.place) !== 'place'
  ) {
    throw new Error(`${what}은 범인·흉기·장소 각 1장이어야 한다`)
  }
}

/**
 * 다음으로 제안할 자리. 탈락자는 건너뛴다 — 탈락자는 제안권을 잃기 때문이다.
 *
 * 한 바퀴를 다 돌아도 못 찾으면 제자리를 돌려준다. 범인은 탈락하지 않으므로
 * 실제로는 도달하지 않지만(시민이 전멸하면 그 자리에서 판이 끝난다), 이 함수만 보고는
 * 그 사실을 알 수 없으므로 무한 루프 대신 멈추는 쪽을 택한다.
 */
function nextSeat(state: GameState): number {
  const count = state.players.length
  for (let step = 1; step <= count; step += 1) {
    const index = (state.turnIndex + step) % count
    const player = state.players[index]
    if (player && !state.eliminated.includes(player.id)) return index
  }
  return state.turnIndex
}

/**
 * 밀담을 닫고 다음 라운드를 연다.
 *
 * 제안 순서는 한 자리씩 돈다. 6명과 8라운드가 나눠떨어지지 않아
 * 누군가는 두 번 제안하는데, 이 불균형은 자리 운으로 흡수한다.
 * 억지로 맞추려면 라운드 수를 6이나 12로 못 박아야 하고, 그러면 밸런싱 여지가 사라진다.
 */
export function nextRound(state: GameState): GameState {
  if (state.phase !== 'whisper') throw new Error(`밀담 페이즈가 아니다: ${state.phase}`)

  if (state.round >= state.totalRounds) {
    return { ...state, phase: 'accuse' }
  }

  return {
    ...state,
    round: state.round + 1,
    phase: 'suggest',
    turnIndex: nextSeat(state),
  }
}

/**
 * 판을 닫는다. 3요소를 모두 맞혀야 시민 승리다.
 *
 * 부분 정답은 없다. 두 개만 맞히는 것은 범인의 위장이 통했다는 뜻이므로 패배로 친다.
 * winner는 진영으로만 낸다 — "내가 이겼나"는 내 진영과 대조하면 나오는 파생값이다.
 */
function finish(state: GameState, accusation: Suggestion, accuser: Accuser): GameState {
  const correct =
    accusation.suspect === state.solution.suspect &&
    accusation.weapon === state.solution.weapon &&
    accusation.place === state.solution.place

  return {
    ...state,
    phase: 'over',
    outcome: { accusation, accuser, correct, winner: correct ? 'citizen' : 'culprit' },
  }
}

/**
 * 조기 고발. 시민 진영은 **아무 때나** 정답 3요소를 외칠 수 있다.
 *
 * 맞으면 그 자리에서 시민 승리로 판이 끝난다. 틀리면 외친 사람만 탈락하고 판은 이어진다 —
 * 손패는 공개하지 않고 반증도 계속한다. 손패를 까면 남은 사람들이 2장을 한꺼번에 알게 되어
 * 판이 즉시 끝나기 때문이다(클루 원본이 탈락자를 「말 없는 카드 보관함」으로 두는 이유).
 *
 * **범인이 외치면 자백으로 쳐서 시민 승리다.** 범인은 정답을 아니까 일부러 틀리게 외쳐
 * 판을 흔들 수 있는데, 이 한 줄이 그 구멍을 닫는다. 그래서 범인은 절대 외치지 않는다.
 *
 * 페이즈를 가리지 않는다. 「언제 외칠까」가 이 룰의 판단 지점이므로 때를 제한하면
 * 그 판단이 사라진다. 끝난 판만 예외다.
 */
export function accuseEarly(
  state: GameState,
  accuserId: PlayerId,
  accusation: Suggestion,
): GameState {
  if (state.phase === 'over') throw new Error('끝난 판에서는 고발할 수 없다')
  /*
   * 최종 고발 페이즈만 예외다. 거기서도 받으면 «같은 사람의 같은 오답»이 부르는 함수에 따라
   * 「판 종료·범인 승」(accuse)과 「나만 탈락·판 계속」(여기)으로 갈린다.
   * 그러면 룰이 화면 배선에 따라 정해지는 셈이라 엔진이 막는다(작업 규칙 2).
   */
  if (state.phase === 'accuse') throw new Error('최종 고발 페이즈에서는 조기 고발을 쓰지 않는다')
  assertKinds(accusation, '고발')

  const accuser = state.players.find((p) => p.id === accuserId)
  if (!accuser) throw new Error(`없는 플레이어: ${accuserId}`)
  if (state.eliminated.includes(accuserId)) {
    throw new Error(`탈락자는 고발할 수 없다: ${accuserId}`)
  }

  // 자백. 무엇을 외쳤든 진실이 드러난 것이므로 기록에는 정답을 남긴다.
  if (accuser.faction === 'culprit') {
    return finish(state, state.solution, { kind: 'player', playerId: accuserId })
  }

  if (
    accusation.suspect === state.solution.suspect &&
    accusation.weapon === state.solution.weapon &&
    accusation.place === state.solution.place
  ) {
    return finish(state, accusation, { kind: 'player', playerId: accuserId })
  }

  const eliminated = [...state.eliminated, accuserId]
  const standing = state.players.filter(
    (p) => p.faction === 'citizen' && !eliminated.includes(p.id),
  )
  /*
   * 마지막 시민이 쓰러졌다. 맞힐 사람이 남지 않았으므로 범인 승리다.
   * 방금 빗나간 고발을 결과로 남긴다 — 판을 닫은 것이 그 고발이고, 오답이므로
   * finish가 곧바로 범인 승으로 접는다.
   */
  if (standing.length === 0) {
    return finish({ ...state, eliminated }, accusation, { kind: 'player', playerId: accuserId })
  }

  /*
   * 자기 차례에 쓰러지면 제안권도 그 자리에서 잃는다. 넘기지 않으면 turnIndex가
   * 탈락자를 가리킨 채 제안 페이즈에 갇혀 판이 멈춘다.
   */
  const stalled = state.phase === 'suggest' && state.players[state.turnIndex]?.id === accuserId
  const withFallen: GameState = { ...state, eliminated }
  return stalled ? { ...withFallen, turnIndex: nextSeat(withFallen) } : withFallen
}

/**
 * 플레이어의 최종 고발. 플레이어가 시민 진영일 때의 경로다.
 *
 * 범인 진영은 고발할 수 없다. 정답을 알고 있으므로 일부러 틀리면 무조건 이긴다.
 * 범인의 승리 조건은 스스로 고발하는 것이 아니라 남의 고발을 틀리게 만드는 것이다.
 */
export function accuse(
  state: GameState,
  accusation: Suggestion,
  accuserId: PlayerId,
): GameState {
  if (state.phase !== 'accuse') throw new Error(`고발 페이즈가 아니다: ${state.phase}`)
  assertKinds(accusation, '고발')

  const accuser = state.players.find((p) => p.id === accuserId)
  if (!accuser) throw new Error(`없는 플레이어: ${accuserId}`)
  if (accuser.faction !== 'citizen') {
    throw new Error('범인 진영은 최종 고발을 하지 않는다')
  }
  if (state.eliminated.includes(accuserId)) {
    throw new Error(`탈락자는 고발할 수 없다: ${accuserId}`)
  }

  return finish(state, accusation, { kind: 'player', playerId: accuserId })
}

/**
 * AI 시민들의 합의 고발. 플레이어가 범인 진영일 때의 경로다.
 * 표는 칸별 다수결로 모은다 — vote.ts 참고.
 */
export function accuseByCouncil(state: GameState, votes: readonly Vote[]): GameState {
  if (state.phase !== 'accuse') throw new Error(`고발 페이즈가 아니다: ${state.phase}`)

  // 탈락자는 고발권을 잃었으므로 합의에도 끼지 않는다. 전원이 탈락했다면 판은 이미 끝나 있다.
  const council = state.players.filter(
    (p) => !p.isHuman && p.faction === 'citizen' && !state.eliminated.includes(p.id),
  )
  if (votes.length !== council.length) {
    throw new Error(`AI 시민 ${council.length}명 전원이 투표해야 한다 (받은 수: ${votes.length})`)
  }
  if (new Set(votes.map((v) => v.playerId)).size !== votes.length) {
    throw new Error('중복 투표')
  }

  for (const vote of votes) {
    if (!council.some((p) => p.id === vote.playerId)) {
      throw new Error(`합의 투표에 참여할 수 없는 플레이어: ${vote.playerId}`)
    }
    assertKinds(vote.accusation, '투표')
  }

  return finish(state, tally(votes, state.seed), { kind: 'council', votes })
}
