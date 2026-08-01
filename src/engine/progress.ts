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
    turnIndex: (state.turnIndex + 1) % state.players.length,
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

  return finish(state, accusation, { kind: 'player', playerId: accuserId })
}

/**
 * AI 시민들의 합의 고발. 플레이어가 범인 진영일 때의 경로다.
 * 표는 칸별 다수결로 모은다 — vote.ts 참고.
 */
export function accuseByCouncil(state: GameState, votes: readonly Vote[]): GameState {
  if (state.phase !== 'accuse') throw new Error(`고발 페이즈가 아니다: ${state.phase}`)

  const council = state.players.filter((p) => !p.isHuman && p.faction === 'citizen')
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
