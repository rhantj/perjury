import { cardsOfKind } from '../engine/cards'
import { createRng, pickOne } from '../engine/rng'
import type { CardId, CardKind, Claim, PlayerId, Suggestion } from '../engine/types'
import type { GameView } from '../engine/view'

/**
 * 규칙 기반 에이전트. 시야(GameView)만 보고 판단한다.
 *
 * D4에서 이 자리를 LLM이 대체하지만 입력은 바뀌지 않는다.
 * 그래서 이 코드는 버리는 물건이 아니라 폴백 그 자체다 —
 * 예산이 소진되거나 프록시가 죽으면 여기로 되돌아온다.
 */

function me(view: GameView) {
  const self = view.players.find((p) => p.isMe)
  if (!self) throw new Error('시야의 주인을 찾을 수 없다')
  return self
}

function currentSuggestion(view: GameView): Suggestion {
  const record = view.rounds[view.rounds.length - 1]
  if (!record) throw new Error('진행 중인 제안이 없다')
  return record.suggestion
}

function slots(suggestion: Suggestion): CardId[] {
  return [suggestion.suspect, suggestion.weapon, suggestion.place]
}

/**
 * 지금까지 "누군가 갖고 있다"고 관측된 카드.
 *
 * 선언을 액면 그대로 믿는다. 이 순진함이 의도한 것이다 —
 * 위증이 통하는 이유가 여기다. 거짓 반증 하나가 이 집합을 오염시키고,
 * 특히 정답 카드로 위증하면 진짜 정답이 후보에서 지워진다.
 */
function eliminated(view: GameView): Set<CardId> {
  const out = new Set<CardId>()

  for (const card of me(view).hand ?? []) out.add(card)
  for (const player of view.players) for (const card of player.revealed) out.add(card)
  for (const round of view.rounds) {
    for (const declaration of round.declarations) {
      if (declaration.claim.kind === 'refute') out.add(declaration.claim.cardId)
    }
  }
  return out
}

/** 아직 지워지지 않은 후보. 모순으로 전부 지워졌으면 전체로 되돌린다. */
function candidates(view: GameView, kind: CardKind): CardId[] {
  const gone = eliminated(view)
  const all = cardsOfKind(kind).map((c) => c.id)
  const left = all.filter((id) => !gone.has(id))
  return left.length > 0 ? left : all
}

/** 남은 후보 중 하나씩 골라 제안한다. 소거를 진행시키는 것이 목적이다. */
export function suggestionFrom(view: GameView, salt: string): Suggestion {
  const rng = createRng(salt)
  return {
    suspect: pickOne(candidates(view, 'suspect'), rng),
    weapon: pickOne(candidates(view, 'weapon'), rng),
    place: pickOne(candidates(view, 'place'), rng),
  }
}

/** 안전한 위증(정답 카드)을 고를 확률. 증명 불가라 공짜지만 그것만 쓰면 잡힐 일이 없다. */
const SAFE_LIE_RATE = 0.6
/** 위험한 위증을 고를 확률. 카드 임자가 즉시 증명할 수 있다. */
const RISKY_LIE_RATE = 0.4

/**
 * 반증 선언.
 *
 * 시민은 정직하다 — 있으면 내고 없으면 침묵한다.
 *
 * 범인은 두 가지 거짓말을 쓴다.
 *   안전한 위증 — 제안에 섞인 정답 카드로 반증한다. 아무도 갖고 있지 않아 증명할 수 없고,
 *                진짜 정답을 후보에서 지운다.
 *   위험한 위증 — 남이 쥔 카드로 반증한다. 임자가 즉시 잡을 수 있다.
 *
 * 안전한 쪽만 쓰면 판에 증명 가능한 위증이 존재하지 않아 **이의제기가 영원히 발동하지 않는다.**
 * 폴백 모드에서 게임의 코어 메커니즘이 죽는다는 뜻이라, 위험한 쪽도 섞는다.
 */
export function claimFrom(view: GameView, salt: string): Claim {
  const suggestion = currentSuggestion(view)
  const hand = me(view).hand ?? []
  const held = slots(suggestion).filter((id) => hand.includes(id))
  const rng = createRng(salt)

  if (view.solution) {
    const sealedCards = [view.solution.suspect, view.solution.weapon, view.solution.place]
    const safe = slots(suggestion).find((id) => sealedCards.includes(id))

    if (safe && rng() < SAFE_LIE_RATE) return { kind: 'refute', cardId: safe }
    if (held.length === 0 && rng() < RISKY_LIE_RATE) {
      return { kind: 'refute', cardId: pickOne(slots(suggestion), rng) }
    }
  }

  const card = held[0]
  return card ? { kind: 'refute', cardId: card } : { kind: 'pass' }
}

export interface ChallengeIntent {
  readonly challengerId: PlayerId
  readonly targetId: PlayerId
}

/**
 * 이의제기 대상. 증명할 수 있을 때만 잡는다.
 *
 * 상대가 "이 카드로 반증한다"고 했는데 그 카드가 내 손에 있으면 상대는 가질 수 없다.
 * 심증만으로는 잡지 않는다 — 증명 수단이 없으면 실패하고 내 카드만 공개된다.
 */
export function challengeTargetFrom(view: GameView): PlayerId | null {
  const record = view.rounds[view.rounds.length - 1]
  if (!record) return null

  const hand = me(view).hand ?? []
  for (const declaration of record.declarations) {
    if (declaration.playerId === view.viewerId) continue
    if (declaration.claim.kind !== 'refute') continue
    if (hand.includes(declaration.claim.cardId)) return declaration.playerId
  }
  return null
}

/** 최종 투표. 남은 후보에서 고른다. */
export function voteFrom(view: GameView, salt: string): Suggestion {
  return suggestionFrom(view, salt)
}
