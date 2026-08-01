import { challenge, skipChallenge } from '../engine/challenge'
import { accuse, accuseByCouncil, nextRound } from '../engine/progress'
import { declareAll, suggest } from '../engine/round'
import { viewFor } from '../engine/view'
import type { Claim, GameState, PlayerId, Vote } from '../engine/types'
import { challengeTargetFrom, claimFrom, suggestionFrom, voteFrom } from './rules'

/** 판·라운드·플레이어마다 다른 시드를 파생시킨다. 판 전체는 여전히 시드 하나로 재현된다. */
function salt(state: GameState, kind: string, playerId: PlayerId): string {
  return `${state.seed}:${kind}:${state.round}:${playerId}`
}

function findChallenger(state: GameState): { challengerId: PlayerId; targetId: PlayerId } | null {
  for (const player of state.players) {
    const targetId = challengeTargetFrom(viewFor(state, player.id))
    if (targetId) return { challengerId: player.id, targetId }
  }
  return null
}

function finalAccusation(state: GameState): GameState {
  const human = state.players.find((p) => p.isHuman)
  if (!human) throw new Error('사람 자리가 없다')

  if (human.faction === 'citizen') {
    return accuse(state, voteFrom(viewFor(state, human.id), salt(state, 'vote', human.id)), human.id)
  }

  const votes: Vote[] = state.players
    .filter((p) => !p.isHuman && p.faction === 'citizen')
    .map((p) => ({
      playerId: p.id,
      accusation: voteFrom(viewFor(state, p.id), salt(state, 'vote', p.id)),
    }))
  return accuseByCouncil(state, votes)
}

/**
 * 규칙 기반 에이전트만으로 판을 끝까지 굴린다. LLM 호출은 0회다.
 *
 * 두 가지 용도가 있다.
 *   1. D3 안전선 검증 — LLM 없이 완주되는가
 *   2. D8 밸런싱 — 같은 조건으로 수천 판을 돌려 승률을 본다
 */
export function autoPlay(initial: GameState): GameState {
  let state = initial

  // 8라운드 × 4페이즈 + 고발이면 충분하다. 넘으면 전이에 구멍이 있다는 뜻이다.
  for (let step = 0; step < 200 && state.phase !== 'over'; step += 1) {
    switch (state.phase) {
      case 'suggest': {
        const suggester = state.players[state.turnIndex]
        if (!suggester) throw new Error('제안자를 찾을 수 없다')
        const view = viewFor(state, suggester.id)
        state = suggest(state, suggester.id, suggestionFrom(view, salt(state, 'sg', suggester.id)))
        break
      }
      case 'refute': {
        const record = state.rounds[state.rounds.length - 1]
        if (!record) throw new Error('진행 중인 라운드가 없다')
        const claims = new Map<PlayerId, Claim>(
          state.players
            .filter((p) => p.id !== record.suggesterId)
            .map((p) => [
              p.id,
              claimFrom(viewFor(state, p.id), salt(state, 'cl', p.id)),
            ]),
        )
        state = declareAll(state, claims)
        break
      }
      case 'challenge': {
        const intent = findChallenger(state)
        state = intent
          ? challenge(state, intent.challengerId, intent.targetId)
          : skipChallenge(state)
        break
      }
      case 'whisper':
        state = nextRound(state)
        break
      case 'accuse':
        state = finalAccusation(state)
        break
    }
  }

  if (state.phase !== 'over') throw new Error('판이 끝나지 않았다 — 전이에 구멍이 있다')
  return state
}
