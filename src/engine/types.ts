export type CardKind = 'suspect' | 'weapon' | 'place'

export type CardId = string
export type PlayerId = string

export interface Card {
  readonly id: CardId
  readonly kind: CardKind
  readonly name: string
}

export type Faction = 'citizen' | 'culprit'

export interface Player {
  readonly id: PlayerId
  /** 이 플레이어가 연기하는 용의자 카드. 정답의 범인과 일치하면 범인 진영이다. */
  readonly characterId: CardId
  readonly name: string
  readonly isHuman: boolean
  readonly faction: Faction
  readonly hand: readonly CardId[]
  /** 이의제기 페널티로 공개된 카드. 전체가 볼 수 있다. */
  readonly revealed: readonly CardId[]
}

export interface Solution {
  readonly suspect: CardId
  readonly weapon: CardId
  readonly place: CardId
}

export type Phase = 'suggest' | 'refute' | 'challenge' | 'whisper' | 'accuse' | 'over'

/** 제안된 3요소. 종류별 1장씩이다. */
export interface Suggestion {
  readonly suspect: CardId
  readonly weapon: CardId
  readonly place: CardId
}

/**
 * 반증 선언. 동시형이므로 제안자를 제외한 전원이 하나씩 낸다.
 * refute는 제안된 3장 중 하나만 지목할 수 있다.
 */
export type Claim =
  | { readonly kind: 'refute'; readonly cardId: CardId }
  | { readonly kind: 'pass' }

export interface Declaration {
  readonly playerId: PlayerId
  readonly claim: Claim
  /**
   * 선언이 거짓인가. 엔진이 손패와 대조해 결정론적으로 계산한다.
   * UI와 AI 프롬프트에 노출하면 안 된다 — 그러면 이의제기가 무의미해진다.
   */
  readonly isPerjury: boolean
  /**
   * 그 자리에서 소리내어 한 말. 룰에는 전혀 관여하지 않는다 — isPerjury는 claim만 보고 정한다.
   *
   * 선언은 원래 «대사»이므로(설계 §1.4.1) 무엇을 말했는지가 기록의 일부다.
   * **사람과 규칙 기반 판단자는 대사를 만들지 않으므로 null이 정상 상태다.**
   */
  readonly line: string | null
}

export interface Reveal {
  readonly playerId: PlayerId
  readonly cardId: CardId
}

export interface ChallengeRecord {
  readonly challengerId: PlayerId
  readonly targetId: PlayerId
  /** 대상이 반증에 썼다고 선언한 카드. 고발자가 이걸 쥐고 있으면 위증이 증명된다. */
  readonly cardId: CardId
  readonly success: boolean
  readonly reveals: readonly Reveal[]
  /** 잡으면서 한 말. 없으면 null(설명은 Declaration.line). */
  readonly line: string | null
}

/**
 * 밀담 한 번. **룰은 이 값을 읽지 않는다** — 반증 대사와 같은 자리, 같은 성격이다.
 *
 * 「누가 걸었는가」를 담지 않는다. 언제나 사람이 건다(설계 §3).
 * AI끼리 밀담을 열게 되면 그때 필드를 추가한다.
 */
export interface ParleyRecord {
  readonly targetId: PlayerId
  /** 사람이 한 말. */
  readonly askLine: string
  /** 상대가 한 말. */
  readonly replyLine: string
}

export interface RoundRecord {
  readonly round: number
  readonly suggesterId: PlayerId
  readonly suggestion: Suggestion
  /** 제안하며 한 말. 없으면 null(설명은 Declaration.line). */
  readonly suggestionLine: string | null
  readonly declarations: readonly Declaration[]
  readonly challenge: ChallengeRecord | null
  /** 이 라운드에 오간 밀담. 라운드당 최대 하나다. 없으면 null이다. */
  readonly parley: ParleyRecord | null
}

export interface Vote {
  readonly playerId: PlayerId
  readonly accusation: Suggestion
  /** 고발에 표를 던지며 한 말. 없으면 null(설명은 Declaration.line). */
  readonly line: string | null
}

/**
 * 최종 고발의 주체. 플레이어의 진영에 따라 달라진다.
 *
 * 플레이어가 시민이면 플레이어가 고발한다.
 * 플레이어가 범인이면 AI 시민들이 합의로 고발하고, 플레이어는 그것을 틀리게 유도한다.
 * 범인이 스스로 고발하면 일부러 오답을 내서 무조건 이기므로 게임이 성립하지 않는다.
 */
export type Accuser =
  | { readonly kind: 'player'; readonly playerId: PlayerId }
  | { readonly kind: 'council'; readonly votes: readonly Vote[] }

export interface Outcome {
  readonly accusation: Suggestion
  readonly accuser: Accuser
  readonly correct: boolean
  readonly winner: Faction
}

/**
 * 판 전체의 상태. 모든 전이 함수는 이것을 받아 새 것을 반환한다.
 *
 * solution은 봉인된 정답이다. UI에 그리거나 AI 프롬프트에 넣으면 게임이 끝난다.
 * 범인 진영 에이전트에게만 엔진이 명시적으로 주입한다.
 */
export interface GameState {
  readonly seed: string
  readonly round: number
  readonly totalRounds: number
  readonly phase: Phase
  /** players 배열의 인덱스. 이번 라운드에 제안할 사람. */
  readonly turnIndex: number
  readonly players: readonly Player[]
  readonly solution: Solution
  /** 지난 라운드 기록. 위증 모순 검출의 근거가 된다. */
  readonly rounds: readonly RoundRecord[]
  /** 최종 고발 결과. 판이 끝나기 전에는 null이다. */
  readonly outcome: Outcome | null
}
