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
  /**
   * 변호사의 거부. 침묵과 달리 **반증 의무 자체를 면제**받으므로 위증이 되지 않는다.
   *
   * 이것은 «고를 수 있는 선언»이 아니다. 고르게 두면 변호사가 아닌 좌석도 거부할 수 있다.
   * 능력을 쓴 좌석의 선언을 엔진이 이걸로 바꾼다(round.ts의 declareAll).
   */
  | { readonly kind: 'refuse' }

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

/**
 * 능력 사용 선언. **종류는 쓰는 사람이 고르지 않는다** — 좌석에 배정된 직업에서 나온다.
 *
 * AI에게 종류를 고르게 하면 남의 능력을 쓸 수 있게 된다. AI는 「쓴다 + 대상」만 말하고,
 * 호출부가 그 좌석의 직업을 조회해 종류를 붙인다(작업 규칙 2 — AI가 룰을 어길 수 없어야 한다).
 *
 * 직업 문구와의 대응은 content/roles.ts의 `effect`에 있다. 엔진은 직업 이름을 모른다.
 */
export type PowerUse =
  /** 검시관 — 한 명의 손패 1장을 확인한다. */
  | { readonly kind: 'inspect-hand'; readonly targetId: PlayerId }
  /** 약제사 — 수단 카드 1장을 지정해 정답 여부를 확인한다. */
  | { readonly kind: 'check-weapon'; readonly cardId: CardId }
  /** 순사 — 한 명의 이번 라운드 반증이 참인지 통보받는다. 선언이 나와야 풀린다. */
  | { readonly kind: 'verify-claim'; readonly targetId: PlayerId }
  /** 사진사 — 지목한 사람이 «다음» 라운드에 위증하면 이의제기 없이 드러난다. */
  | { readonly kind: 'photograph'; readonly targetId: PlayerId }
  /**
   * 신문기자 — 지목한 사람의 «가장 최근» 지난 반증, 그 진위를 전체에 공개한다.
   *
   * 어느 라운드인지는 고르지 않는다. 고르게 하면 AI가 두 가지를 골라야 해서
   * 능력 개요(사람 하나 / 카드 하나 / 없음)로 표현할 수 없고 워커 계약이 넓어진다.
   */
  | { readonly kind: 'publish'; readonly targetId: PlayerId }
  /** 밀정 — 자기 위증 1회는 이의제기를 당해도 실패 처리된다. */
  | { readonly kind: 'shield' }
  /** 변호사 — 반증 요구를 1회 거부한다. */
  | { readonly kind: 'refuse-demand' }
  /** 협잡꾼 — 타인의 반증 1회를 조작한다. */
  | { readonly kind: 'frame'; readonly targetId: PlayerId }
  /** 전화교환수 — 밀담 1건을 엿듣는다(사람이 쥐면 회선이 하나 는다). */
  | { readonly kind: 'eavesdrop' }
  /** 정보상 — 밀담 상대 발언의 참·거짓을 판정한다. */
  | { readonly kind: 'detect-lie' }

/** 능력으로 알게 된 사실. 이것만 시야에 실린다 — 능력 자체는 시야에 나가지 않는다. */
export type Finding =
  | { readonly kind: 'hand'; readonly targetId: PlayerId; readonly cardId: CardId }
  | { readonly kind: 'weapon'; readonly cardId: CardId; readonly isSolution: boolean }
  | { readonly kind: 'claim'; readonly targetId: PlayerId; readonly truthful: boolean }
  /**
   * 정보상 — 밀담 상대가 «자기 입으로 신고한» 참·거짓.
   *
   * 엔진이 텍스트를 판정한 것이 아니다. 말한 쪽이 자기 거짓말 여부를 함께 낸 것을 옮겨 담는다.
   * 그래서 룰 엔진 순수성과 부딪히지 않는다 — 밀담은 원래 룰이 읽지 않는 자리다.
   */
  | { readonly kind: 'parley'; readonly targetId: PlayerId; readonly truthful: boolean }

/**
 * 「누가 무엇을 알게 됐는가」 한 건.
 *
 * 알게 된 사실을 그 사람의 손패나 시야에 바로 섞지 않고 따로 쌓는 이유는 출처가 남아야
 * 하기 때문이다 — 능력으로 «확인한» 것과 추측한 것은 프롬프트에서 무게가 다르다.
 */
export interface Grant {
  /** 알게 된 라운드. 프롬프트에서 「언제 알았나」로 쓴다. */
  readonly round: number
  /** 이것을 볼 수 있는 단 한 사람. */
  readonly ownerId: PlayerId
  readonly finding: Finding
}

/** 아직 답이 정해지지 않은 지목. 쓴 라운드를 함께 들고 있어야 «다음 라운드»를 판별할 수 있다. */
export interface PendingPower {
  readonly round: number
  readonly ownerId: PlayerId
  readonly use: PowerUse
}

export interface RoundRecord {
  readonly round: number
  readonly suggesterId: PlayerId
  readonly suggestion: Suggestion
  /** 제안하며 한 말. 없으면 null(설명은 Declaration.line). */
  readonly suggestionLine: string | null
  readonly declarations: readonly Declaration[]
  readonly challenge: ChallengeRecord | null
  /**
   * 사진사에게 발각된 위증자. **이의제기를 거치지 않고 전체가 본다.**
   *
   * isPerjury를 처음으로 밖에 내보내는 자리다. 한 사람만 알면 이의제기와 다를 게 없으므로
   * Grant가 아니라 라운드 기록에 남긴다 — 여기 있는 것은 모든 시야에 그대로 실린다.
   */
  readonly exposed: readonly PlayerId[]
  /**
   * 신문기자가 이 라운드의 반증에 대해 공개한 진위. 발각(exposed)과 달리 참도 실린다 —
   * 「거짓이 아니었다」도 판을 움직이는 정보이기 때문이다.
   */
  readonly published: readonly { readonly playerId: PlayerId; readonly truthful: boolean }[]
  /**
   * 이 라운드에 오간 밀담. 보통 한 건이고, 사람이 전화교환수면 두 건이다(결정 007).
   *
   * 배열인 이유가 「여러 건이 흔해서」는 아니다. 허용치를 상태로 두면 한 건이라는 규칙이
   * 자료 구조에 박히지 않아, 회선이 늘어나는 능력을 룰 한 줄로 표현할 수 있다.
   */
  readonly parleys: readonly ParleyRecord[]
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
  /** 능력을 이미 쓴 사람. 능력은 한 판에 한 번뿐이라 이 목록이 곧 소진 여부다. */
  readonly powersUsed: readonly PlayerId[]
  /** 능력으로 밝혀진 것들. 각자 자기 앞으로 온 것만 본다 — viewFor가 거른다. */
  readonly grants: readonly Grant[]
  /**
   * 답이 아직 안 나온 능력 지목.
   *
   * 능력의 절반은 «쓰는 시점»과 «답이 정해지는 시점»이 다르다 — 순사는 선언이 나와야,
   * 밀정은 이의제기가 들어와야, 사진사는 다음 라운드가 와야 답이 생긴다.
   * 그 사이를 여기서 들고 있다가 해소되면 grants나 라운드 기록으로 옮긴다.
   */
  readonly pending: readonly PendingPower[]
  /**
   * 라운드당 걸 수 있는 밀담 건수. 기본 1이고, 사람이 전화교환수면 2다(결정 007).
   *
   * **엔진은 직업을 모르므로** 이 값은 판을 만들 때 밖에서 받는다(SetupOptions).
   * 직업을 엔진이 조회하게 만들면 content → engine 한 방향 의존이 뒤집힌다.
   */
  readonly parleyAllowance: number
  /** 최종 고발 결과. 판이 끝나기 전에는 null이다. */
  readonly outcome: Outcome | null
}
