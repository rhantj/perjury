import { cardKind } from './cards'
import type { GameState, Suggestion } from './types'

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
 * 최종 고발. 3요소를 모두 맞혀야 시민 승리다.
 *
 * 부분 정답은 없다. 두 개만 맞히는 것은 범인의 위장이 통했다는 뜻이므로 패배로 친다.
 */
export function accuse(state: GameState, accusation: Suggestion): GameState {
  if (state.phase !== 'accuse') throw new Error(`고발 페이즈가 아니다: ${state.phase}`)
  assertKinds(accusation, '고발')

  const correct =
    accusation.suspect === state.solution.suspect &&
    accusation.weapon === state.solution.weapon &&
    accusation.place === state.solution.place

  return {
    ...state,
    phase: 'over',
    outcome: { accusation, correct, winner: correct ? 'citizen' : 'culprit' },
  }
}
