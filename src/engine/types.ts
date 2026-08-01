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
}

export interface RoundRecord {
  readonly round: number
  readonly suggesterId: PlayerId
  readonly suggestion: Suggestion
  readonly declarations: readonly Declaration[]
  readonly challenge: ChallengeRecord | null
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
}
