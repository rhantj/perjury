import { challenge, skipChallenge } from '../engine/challenge'
import { accuse, accuseByCouncil, nextRound } from '../engine/progress'
import { declareAll, suggest } from '../engine/round'
import { viewFor } from '../engine/view'
import type { Claim, GameState, PlayerId, Suggestion, Vote } from '../engine/types'
import type { Decider, DeciderForRound } from './decider'

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

/**
 * 판단자가 낸 반증 선언을 룰이 받을 수 있는 모양으로 좁힌다.
 *
 * 스키마는 전체 카드를 허용하는데 엔진은 «제안된 3장»만 받는다 — 룰을 한 군데에만 두기로 한
 * 대가다(설계 §5.3). 제안 밖 카드로 반증하겠다는 선언은 애초에 성립하지 않으므로 침묵으로 읽는다.
 * 그대로 넘기면 declareAll이 던져 라운드가 멈춘다.
 *
 * **사람의 선언에는 쓰지 않는다.** 화면은 제안된 3장만 내주므로 사람은 이 경우에 빠질 수 없고,
 * 빠졌다면 조용히 바꾸는 대신 오류로 보여야 한다.
 */
function legalClaim(suggestion: Suggestion, claim: Claim): Claim {
  if (claim.kind !== 'refute') return claim
  const allowed = [suggestion.suspect, suggestion.weapon, suggestion.place]
  return allowed.includes(claim.cardId) ? claim : { kind: 'pass' }
}

/**
 * 이 지목이 이의제기로 성립하는가.
 *
 * 판단자는 **누구든 지목할 수 있다.** 프롬프트 스키마의 후보에 «반증을 선언한 사람»만
 * 남기지 않았기 때문이다 — 룰을 엔진과 스키마 두 군데에 두면 조용히 어긋난다(설계 §5.3).
 * 대신 성립하지 않는 지목이 올라올 수 있고, 그것을 엔진에 그대로 넣으면 엔진이 던진다.
 *
 * **그 예외를 여기서 막지 않으면 라운드가 그 자리에 멈춘다.** 배포본에서 이의제기 페이즈가
 * 넘어가지 않은 원인이 이것이었다. 성립하지 않는 지목은 «이 사람은 안 잡는다»로 읽는다.
 */
function canChallenge(state: GameState, challengerId: PlayerId, targetId: PlayerId): boolean {
  if (challengerId === targetId) return false
  const declaration = lastRound(state).declarations.find((d) => d.playerId === targetId)
  return declaration?.claim.kind === 'refute'
}

/**
 * 이의제기 기회를 돌린다. **먼저 잡는 사람 하나만 성립한다.**
 *
 * **묻는 것은 병렬로, 고르는 것은 좌석 순서로** 나눈다.
 * 순차로 물으면 «먼저»가 좌석 순서로 정해져 결과는 맞지만, 판단자가 원격이면
 * 5명 × 10초로 라운드마다 1분 넘게 멈춘 것처럼 보인다.
 * 그렇다고 도착 순서로 채택하면 같은 판이 네트워크 운에 따라 다르게 끝난다 —
 * 그래서 답을 «다 모은 뒤» 좌석 순서로 훑는다. 결과는 순차와 완전히 같다.
 *
 * 대가: 앞 좌석이 잡아도 뒷사람 몫까지 이미 호출했으므로 비용이 나간다(라운드당 약 $0.01).
 * 조기 종료로 아끼는 것보다 «멈춘 것처럼 보이지 않는 것»이 크다고 봤다.
 *
 * except는 이미 넘긴 사람이다 — 사람이 «넘어가기»를 누른 뒤에는 사람을 건너뛴다.
 */
async function offerChallenge(
  state: GameState,
  decider: Decider,
  except: PlayerId | null,
): Promise<GameState> {
  const askable = state.players.filter((player) => player.id !== except)
  const answers = await Promise.all(
    askable.map(async (player) => ({
      player,
      targetId: await decider.chooseChallengeTarget(viewFor(state, player.id)),
    })),
  )

  // Promise.all은 «입력 순서»로 결과를 돌려준다. askable이 좌석 순서이므로 이 순회가 곧 좌석 순서다.
  for (const { player, targetId } of answers) {
    if (targetId && canChallenge(state, player.id, targetId)) {
      return challenge(state, player.id, targetId)
    }
  }
  return skipChallenge(state)
}

/** AI가 처리할 수 있는 한 스텝. 사람 차례에 부르면 안 된다. */
export async function stepAi(state: GameState, decider: Decider): Promise<GameState> {
  switch (state.phase) {
    case 'suggest': {
      const suggester = state.players[state.turnIndex]
      if (!suggester) throw new Error('제안자를 찾을 수 없다')
      const suggestion = await decider.chooseSuggestion(viewFor(state, suggester.id))
      return suggest(state, suggester.id, suggestion)
    }
    case 'refute': {
      const record = lastRound(state)
      const others = state.players.filter((p) => p.id !== record.suggesterId)
      // 병렬인 것은 최적화가 아니라 룰이다 — 동시 선언은 서로의 답을 못 보고 낸다 (설계 §1.4.1)
      const entries = await Promise.all(
        others.map(
          async (p) =>
            [
              p.id,
              legalClaim(record.suggestion, await decider.chooseClaim(viewFor(state, p.id))),
            ] as const,
        ),
      )
      return declareAll(state, new Map<PlayerId, Claim>(entries))
    }
    case 'challenge':
      return offerChallenge(state, decider, null)
    case 'whisper':
      return nextRound(state)
    case 'accuse': {
      const human = humanOf(state)
      if (human.faction === 'citizen') {
        const accusation = await decider.chooseAccusation(viewFor(state, human.id))
        return accuse(state, accusation, human.id)
      }
      const citizens = state.players.filter((p) => !p.isHuman && p.faction === 'citizen')
      const votes: Vote[] = await Promise.all(
        citizens.map(async (p) => ({
          playerId: p.id,
          accusation: await decider.chooseAccusation(viewFor(state, p.id)),
          line: null,
        })),
      )
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
export async function declareWithHuman(
  state: GameState,
  humanClaim: Claim,
  deciderForRound: DeciderForRound,
): Promise<GameState> {
  const record = lastRound(state)
  const human = humanOf(state)
  const decider = deciderForRound(state.round)

  const others = state.players.filter((p) => p.id !== record.suggesterId)
  const entries = await Promise.all(
    others.map(async (p) => {
      if (p.id === human.id) return [p.id, humanClaim] as const
      const claim = await decider.chooseClaim(viewFor(state, p.id))
      return [p.id, legalClaim(record.suggestion, claim)] as const
    }),
  )
  return declareAll(state, new Map<PlayerId, Claim>(entries))
}

/**
 * 사람이 이의제기를 넘겼을 때. 기회가 AI에게 넘어간다.
 *
 * 사람이 안 잡는다고 아무도 안 잡는 것이 아니다 —
 * 다른 카드 임자가 잡을 수 있고, 그것이 정보가 된다.
 */
export async function passChallenge(
  state: GameState,
  deciderForRound: DeciderForRound,
): Promise<GameState> {
  return offerChallenge(state, deciderForRound(state.round), humanOf(state).id)
}

/** 사람의 결정이 필요한 지점까지 AI만으로 밀고 간다. */
export async function advanceToHuman(
  state: GameState,
  deciderForRound: DeciderForRound,
): Promise<GameState> {
  let current = state
  for (let step = 0; step < 200; step += 1) {
    if (current.phase === 'over' || needsHuman(current)) return current
    current = await stepAi(current, deciderForRound(current.round))
  }
  throw new Error('진행이 멈추지 않는다 — 전이에 구멍이 있다')
}
