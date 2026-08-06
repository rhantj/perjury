import { cardKind, cardsOfKind } from '../engine/cards'
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
      /*
       * 비공개 반증이라 내가 제안자가 아니었던 라운드는 카드가 null이다.
       * 안 보이는 것은 소거할 수 없다 — 추측으로 메우면 AI만 아는 정보가 생긴다.
       */
      if (declaration.claim.kind === 'refute' && declaration.claim.cardId !== null) {
        out.add(declaration.claim.cardId)
      }
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

/**
 * 세 칸 중 하나를 «내가 쥔 카드»로 바꿔 다는 확률 — 덫 제안.
 *
 * 비공개 반증이 되면서 필요해졌다. 반증 카드를 보는 사람이 제안자뿐이라
 * **제안자가 미리 덫을 놓지 않으면 위증을 잡을 길이 아예 없다.**
 * 내가 쥔 카드를 섞어 두면, 그 카드로 반증했다는 말이 곧 거짓말의 증거가 된다.
 *
 * 대가는 소거 속도다. 이미 답이 아닌 걸 아는 카드라 그 칸은 새로 알려주는 게 없다.
 * 그래서 매번이 아니라 확률로 둔다 — 늘 덫이면 판이 안 좁혀지고,
 * 덫이 없으면 거짓말이 공짜가 된다.
 */
const TRAP_RATE = 0.35

/** 남은 후보 중 하나씩 골라 제안한다. 소거를 진행시키는 것이 목적이다. */
export function suggestionFrom(view: GameView, salt: string): Suggestion {
  const rng = createRng(salt)
  const base: Suggestion = {
    suspect: pickOne(candidates(view, 'suspect'), rng),
    weapon: pickOne(candidates(view, 'weapon'), rng),
    place: pickOne(candidates(view, 'place'), rng),
  }

  /* rng를 이 순서 그대로 쓴다. 갈래마다 다른 줄기를 만들면 같은 시드가 다른 판이 된다. */
  const hand = me(view).hand ?? []
  if (hand.length === 0 || rng() >= TRAP_RATE) return base

  const bait = pickOne(hand, rng)
  const kind = cardKind(bait)
  return {
    suspect: kind === 'suspect' ? bait : base.suspect,
    weapon: kind === 'weapon' ? bait : base.weapon,
    place: kind === 'place' ? bait : base.place,
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
    /* 카드가 안 보이면 «내 손에 있는 걸 냈다»를 판정할 수 없다. 제안자만 이 길로 들어온다. */
    const cardId = declaration.claim.cardId
    if (cardId !== null && hand.includes(cardId)) return declaration.playerId
  }
  return null
}

/** 최종 투표. 남은 후보에서 고른다. */
export function voteFrom(view: GameView, salt: string): Suggestion {
  return suggestionFrom(view, salt)
}

/**
 * 지금 조기 고발할 것인가. 확신이 없으면 null이다 (룰 개편 §2-6, 3-C-2).
 *
 * **세 칸이 모두 한 장으로 좁혀졌을 때만 외친다.** 조기 고발은 틀리면 탈락이므로
 * 「그럴듯하다」로는 부족하다. 후보가 하나뿐이면 이 시야 안에서는 그것이 답이다.
 *
 * 확신이 틀릴 수 있다는 것이 이 판단의 성격이다 — 소거는 선언을 액면 그대로 믿으므로
 * (eliminated 주석) 위증 하나가 진짜 정답을 후보에서 지운다. 그래서 확신에 도달하는
 * 것 자체가 범인에게 조작당한 결과일 수 있고, **그게 이 게임이 의도한 함정이다.**
 * 여기서 안전장치를 더 두면 위증이 아무 힘도 못 쓴다.
 *
 * 범인은 부르지 않는다 — 외치면 자백이 되어 시민이 이긴다(결정 011 §2).
 * 그 차단은 부르는 쪽(ai/flow.ts)에 있다. 여기는 시야만 보고 답하는 자리다.
 */
export function accusationFrom(view: GameView): Suggestion | null {
  const only = (kind: CardKind): CardId | null => {
    const left = candidates(view, kind)
    // candidates는 모순으로 다 지워지면 전체로 되돌린다. 그때는 길이가 1이 아니라 안전하다.
    return left.length === 1 ? (left[0] ?? null) : null
  }

  const suspect = only('suspect')
  const weapon = only('weapon')
  const place = only('place')
  if (!suspect || !weapon || !place) return null
  return { suspect, weapon, place }
}
