import { challenge, skipChallenge } from '../engine/challenge'
import { accuse, accuseByCouncil, nextRound } from '../engine/progress'
import { declareAll, suggest } from '../engine/round'
import { viewFor } from '../engine/view'
import type { Claim, GameState, PlayerId, Vote } from '../engine/types'
import { challengeTargetFrom, claimFrom, suggestionFrom, voteFrom } from './rules'

/** 판·라운드·플레이어마다 다른 시드를 파생시킨다. 판 전체는 여전히 시드 하나로 재현된다. */
export function salt(state: GameState, kind: string, playerId: PlayerId): string {
  return `${state.seed}:${kind}:${state.round}:${playerId}`
}

function humanOf(state: GameState) {
  const human = state.players.find((p) => p.isHuman)
  if (!human) throw new Error('사람 자리가 없다')
  return human
}

function lastRound(state: GameState) {
  const record = state.rounds[state.rounds.length - 1]
  if (!record) throw new Error('진행 중인 라운드가 없다')
  return record
}

/**
 * 사람의 결정이 필요한 지점인가.
 *
 * 이 판단을 컴포넌트에 흩뿌리면 "AI가 안 움직인다" 류의 버그가 화면 코드에 숨는다.
 * 한 곳에 모아두고 화면은 결과만 본다.
 */
export function needsHuman(state: GameState): boolean {
  const human = humanOf(state)

  switch (state.phase) {
    case 'suggest':
      return state.players[state.turnIndex]?.id === human.id
    case 'refute':
      return lastRound(state).suggesterId !== human.id
    case 'challenge':
      return true
    case 'accuse':
      return human.faction === 'citizen'
    case 'whisper':
    case 'over':
      return false
  }
}

/** AI가 처리할 수 있는 한 스텝. 사람 차례에 부르면 안 된다. */
export function stepAi(state: GameState): GameState {
  switch (state.phase) {
    case 'suggest': {
      const suggester = state.players[state.turnIndex]
      if (!suggester) throw new Error('제안자를 찾을 수 없다')
      const view = viewFor(state, suggester.id)
      return suggest(state, suggester.id, suggestionFrom(view, salt(state, 'sg', suggester.id)))
    }
    case 'refute': {
      const record = lastRound(state)
      const claims = new Map<PlayerId, Claim>(
        state.players
          .filter((p) => p.id !== record.suggesterId)
          .map((p) => [p.id, claimFrom(viewFor(state, p.id), salt(state, 'cl', p.id))]),
      )
      return declareAll(state, claims)
    }
    case 'challenge': {
      for (const player of state.players) {
        const targetId = challengeTargetFrom(viewFor(state, player.id))
        if (targetId) return challenge(state, player.id, targetId)
      }
      return skipChallenge(state)
    }
    case 'whisper':
      return nextRound(state)
    case 'accuse': {
      const human = humanOf(state)
      if (human.faction === 'citizen') {
        const view = viewFor(state, human.id)
        return accuse(state, voteFrom(view, salt(state, 'vote', human.id)), human.id)
      }
      const votes: Vote[] = state.players
        .filter((p) => !p.isHuman && p.faction === 'citizen')
        .map((p) => ({
          playerId: p.id,
          accusation: voteFrom(viewFor(state, p.id), salt(state, 'vote', p.id)),
        }))
      return accuseByCouncil(state, votes)
    }
    case 'over':
      return state
  }
}

/**
 * 사람의 선언에 AI들의 선언을 합쳐 한 번에 제출한다.
 *
 * 동시형이라 5명이 한 번에 들어가야 한다. 사람 것만 따로 낼 수 없다.
 */
export function declareWithHuman(state: GameState, humanClaim: Claim): GameState {
  const record = lastRound(state)
  const human = humanOf(state)

  const claims = new Map<PlayerId, Claim>(
    state.players
      .filter((p) => p.id !== record.suggesterId)
      .map((p) => [
        p.id,
        p.id === human.id ? humanClaim : claimFrom(viewFor(state, p.id), salt(state, 'cl', p.id)),
      ]),
  )
  return declareAll(state, claims)
}

/**
 * 사람이 이의제기를 넘겼을 때. 기회가 AI에게 넘어간다.
 *
 * 사람이 안 잡는다고 아무도 안 잡는 것이 아니다 —
 * 다른 카드 임자가 잡을 수 있고, 그것이 정보가 된다.
 */
export function passChallenge(state: GameState): GameState {
  const human = humanOf(state)

  for (const player of state.players) {
    if (player.id === human.id) continue
    const targetId = challengeTargetFrom(viewFor(state, player.id))
    if (targetId) return challenge(state, player.id, targetId)
  }
  return skipChallenge(state)
}

/** 사람의 결정이 필요한 지점까지 AI만으로 밀고 간다. */
export function advanceToHuman(state: GameState): GameState {
  let current = state
  for (let step = 0; step < 200; step += 1) {
    if (current.phase === 'over' || needsHuman(current)) return current
    current = stepAi(current)
  }
  throw new Error('진행이 멈추지 않는다 — 전이에 구멍이 있다')
}
