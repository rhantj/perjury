import { cardKind } from './cards'
import { resolveAfterDeclare } from './power'
import type {
  CardId,
  Claim,
  Declaration,
  GameState,
  PlayerId,
  RoundRecord,
  Suggestion,
} from './types'

function suggestedCards(suggestion: Suggestion): CardId[] {
  return [suggestion.suspect, suggestion.weapon, suggestion.place]
}

/** 제안된 3장 중 하나라도 손에 있으면 반증할 수 있다. 동시에 반증 의무이기도 하다. */
export function mustRefute(hand: readonly CardId[], suggestion: Suggestion): boolean {
  return suggestedCards(suggestion).some((id) => hand.includes(id))
}

/**
 * 선언이 거짓인가. 손패와 대조하면 끝나므로 결정론적이다 — LLM이 개입할 여지가 없다.
 *
 * 두 방향 모두 위증이다.
 *   없는데 "있다" → 정보 오염 (즉시 발각 가능)
 *   있는데 "없다" → 정답 위장 (지연 발각)
 */
export function isPerjury(
  hand: readonly CardId[],
  suggestion: Suggestion,
  claim: Claim,
): boolean {
  if (claim.kind === 'refute') return !hand.includes(claim.cardId)
  return mustRefute(hand, suggestion)
}

function requirePlayer(state: GameState, playerId: PlayerId) {
  const player = state.players.find((p) => p.id === playerId)
  if (!player) throw new Error(`없는 플레이어: ${playerId}`)
  return player
}

function currentRound(state: GameState): RoundRecord {
  const record = state.rounds[state.rounds.length - 1]
  if (!record) throw new Error('진행 중인 라운드가 없다')
  return record
}

/**
 * 제안한다. 라운드 기록을 열고 반증 페이즈로 넘긴다.
 *
 * line은 제안하며 한 말이다. 사람과 규칙 기반 판단자에겐 없으므로 기본이 null이다.
 */
export function suggest(
  state: GameState,
  suggesterId: PlayerId,
  suggestion: Suggestion,
  line: string | null = null,
): GameState {
  if (state.phase !== 'suggest') throw new Error(`제안 페이즈가 아니다: ${state.phase}`)

  const suggester = requirePlayer(state, suggesterId)
  if (state.players[state.turnIndex]?.id !== suggesterId) {
    throw new Error(`${suggester.name}의 차례가 아니다`)
  }

  if (
    cardKind(suggestion.suspect) !== 'suspect' ||
    cardKind(suggestion.weapon) !== 'weapon' ||
    cardKind(suggestion.place) !== 'place'
  ) {
    throw new Error('제안은 범인·흉기·장소 각 1장이어야 한다')
  }

  return {
    ...state,
    phase: 'refute',
    rounds: [
      ...state.rounds,
      {
        round: state.round,
        suggesterId,
        suggestion,
        suggestionLine: line,
        declarations: [],
        challenge: null,
        parley: null,
      },
    ],
  }
}

/**
 * 동시 반증. 제안자를 제외한 전원이 한 번에 선언한다.
 *
 * 순차형이 아니므로 침묵에 "앞사람이 이미 반증했다"는 변명이 없다.
 * 그래서 pass도 진술이고, 위증 판정 대상이 된다.
 *
 * lines는 선언자별 대사다. **claims와 별도로 받는 이유** — 대사는 룰에 관여하지 않아서
 * 선언 수 검사·카드 검사가 전부 claims만 보면 끝나야 하기 때문이다. 없는 사람은 null이 되고,
 * 선언하지 않은 사람의 대사는 기록이 선언을 따라가므로 그대로 버려진다.
 */
export function declareAll(
  state: GameState,
  claims: ReadonlyMap<PlayerId, Claim>,
  lines: ReadonlyMap<PlayerId, string> = new Map(),
): GameState {
  if (state.phase !== 'refute') throw new Error(`반증 페이즈가 아니다: ${state.phase}`)

  const record = currentRound(state)
  const responders = state.players.filter((p) => p.id !== record.suggesterId)
  const allowed = suggestedCards(record.suggestion)

  if (claims.size !== responders.length) {
    throw new Error(`선언은 ${responders.length}명 전원이 해야 한다 (받은 수: ${claims.size})`)
  }

  const declarations: Declaration[] = responders.map((player) => {
    const claim = claims.get(player.id)
    if (!claim) throw new Error(`${player.name}의 선언이 없다`)
    if (claim.kind === 'refute' && !allowed.includes(claim.cardId)) {
      throw new Error(`제안에 없는 카드로는 반증할 수 없다: ${claim.cardId}`)
    }
    return {
      playerId: player.id,
      claim,
      isPerjury: isPerjury(player.hand, record.suggestion, claim),
      line: lines.get(player.id) ?? null,
    }
  })

  return resolveAfterDeclare(
    {
      ...state,
      phase: 'challenge',
      rounds: [...state.rounds.slice(0, -1), { ...record, declarations }],
    },
    declarations,
  )
}
