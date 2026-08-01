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
}
