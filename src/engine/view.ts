import { findingsFor } from './power'
import type {
  Accuser,
  CardId,
  ChallengeRecord,
  Claim,
  Faction,
  GameState,
  Grant,
  ParleyRecord,
  Phase,
  PlayerId,
  Solution,
  Suggestion,
} from './types'

export interface PlayerView {
  readonly id: PlayerId
  readonly characterId: CardId
  readonly name: string
  readonly isHuman: boolean
  readonly isMe: boolean
  /** 페널티로 공개된 카드. 전체 공개다. */
  readonly revealed: readonly CardId[]
  /** 나 자신일 때만 채워진다. */
  readonly hand: readonly CardId[] | null
  /** 나 자신일 때만 채워진다. */
  readonly faction: Faction | null
}

/** Declaration에서 isPerjury를 뺀 것. 선언 내용은 공개, 진위는 비공개다. */
export interface DeclarationView {
  readonly playerId: PlayerId
  readonly claim: Claim
  /**
   * 그 자리에서 «소리내어» 한 말이라 전원이 들었다. 그래서 시야에서 뺄 이유가 없다.
   * 오히려 실어야 에이전트가 남의 말에 반응할 수 있다. 없으면 null이다.
   */
  readonly line: string | null
}

export interface RoundView {
  readonly round: number
  readonly suggesterId: PlayerId
  readonly suggestion: Suggestion
  readonly suggestionLine: string | null
  /**
   * 이번 라운드에 반증 의무를 진 좌석. **전체 공개다** — 누가 뽑혔는지는 모두가 본다.
   *
   * 감추면 침묵의 뜻이 갈리지 않는다. 「답할 자리였는데 넘겼다」와 「애초에 뽑히지 않았다」가
   * 같은 화면이 되면 추리표에 아무것도 적을 수 없다.
   */
  readonly responderIds: readonly PlayerId[]
  readonly declarations: readonly DeclarationView[]
  readonly challenge: ChallengeRecord | null
  /** 사진사에게 발각된 위증자. 전체 공개이므로 걸러내지 않고 그대로 실린다. */
  readonly exposed: readonly PlayerId[]
  /** 신문기자가 공개한 반증의 진위. 발각과 달리 「참이었다」도 실린다. */
  readonly published: readonly { readonly playerId: PlayerId; readonly truthful: boolean }[]
  /**
   * 밀담. **낀 두 사람에게만 실린다** — 나머지에게는 빈 배열이다.
   *
   * 내용만 감추고 「누가 누구와 따로 이야기했다」를 남길 수도 있지만 그러지 않는다.
   * 상대가 보이면 그것만으로 정보가 되고, 그걸 의도적으로 설계하려면 규칙이 하나 더 필요하다(설계 §5.1).
   *
   * 전화교환수가 엿듣는 좌석은 예외다 — 그에게는 자기가 끼지 않은 밀담도 실린다.
   */
  readonly parleys: readonly ParleyRecord[]
}

export interface OutcomeView {
  readonly accusation: Suggestion
  readonly accuser: Accuser
  readonly correct: boolean
  readonly winner: Faction
  /** 판이 끝났으므로 정답을 공개한다. */
  readonly solution: Solution
  /** 이 시야의 주인이 이겼는가. winner와 내 진영을 대조한 파생값이다. */
  readonly viewerWon: boolean
}

export interface GameView {
  readonly viewerId: PlayerId
  readonly round: number
  readonly totalRounds: number
  readonly phase: Phase
  readonly turnIndex: number
  readonly players: readonly PlayerView[]
  readonly rounds: readonly RoundView[]
  /**
   * 능력으로 «확인한» 것. 자기 앞으로 온 것만 들어온다.
   *
   * rounds와 섞지 않는 이유는 출처가 달라서다. rounds는 모두가 들은 말이라 거짓일 수 있지만
   * 이쪽은 엔진이 상태에서 뽑아낸 사실이다. 프롬프트에서도 이 둘의 무게가 달라야 한다.
   */
  readonly findings: readonly Grant[]
  /**
   * 내 능력을 이미 썼는가. **내 것만** 나간다 — 남이 능력을 썼는지는 추리 대상이다.
   *
   * findings가 비어 있어도 쓴 경우가 있다(지목만 하고 답은 나중에 나오는 능력).
   * 그래서 «썼는가»를 따로 싣는다.
   */
  readonly powerSpent: boolean
  /** 범인 진영만 안다. 시민이면 null. */
  readonly solution: Solution | null
  readonly outcome: OutcomeView | null
}

/**
 * 한 사람의 시야를 만든다. UI가 그리는 것도, AI 프롬프트에 들어가는 것도 이것이다.
 *
 * 상태를 넘기고 민감한 필드를 지우는 방식이 아니라, **줄 항목만 골라 담는다.**
 * 지우는 방식은 GameState에 필드가 하나 늘 때마다 새는 구멍이 생긴다.
 * 골라 담으면 새 필드는 기본적으로 나가지 않는다.
 *
 * 내보내지 않는 것:
 *   - seed         → 알면 판 전체를 재계산해 정답을 뽑아낼 수 있다. 판이 끝난 뒤에만 쓴다
 *   - solution     → 범인 진영과 종료 후에만
 *   - 남의 hand     → 공개된 카드만
 *   - 남의 faction  → 그것이 추리 대상이다
 *   - isPerjury    → 보이면 이의제기가 무의미해진다
 *   - 남의 밀담     → 낀 두 사람만. 있었다는 사실도 감춘다
 */
export function viewFor(state: GameState, viewerId: PlayerId): GameView {
  const viewer = state.players.find((p) => p.id === viewerId)
  if (!viewer) throw new Error(`없는 플레이어: ${viewerId}`)

  const over = state.phase === 'over'
  /*
   * 엿듣는 좌석. 밀담은 원래 낀 두 사람만 보는데, 이 능력만이 그 벽을 넘는다.
   * 「쓴 라운드부터」가 아니라 판 전체다 — 회선을 잡아둔 사람은 계속 듣는다.
   */
  const eavesdropping = new Set(
    state.pending.filter((p) => p.use.kind === 'eavesdrop').map((p) => p.ownerId),
  )

  const players: PlayerView[] = state.players.map((player) => {
    const isMe = player.id === viewerId
    return {
      id: player.id,
      characterId: player.characterId,
      name: player.name,
      isHuman: player.isHuman,
      isMe,
      revealed: player.revealed,
      hand: isMe || over ? player.hand : null,
      faction: isMe || over ? player.faction : null,
    }
  })

  const rounds: RoundView[] = state.rounds.map((record) => ({
    round: record.round,
    suggesterId: record.suggesterId,
    suggestion: record.suggestion,
    suggestionLine: record.suggestionLine,
    responderIds: record.responderIds,
    declarations: record.declarations.map((d) => ({
      playerId: d.playerId,
      claim: d.claim,
      line: d.line,
    })),
    challenge: record.challenge,
    exposed: record.exposed,
    published: record.published,
    /*
     * 언제나 사람이 걸었으므로, 볼 수 있는 사람은 «사람»과 «지목당한 상대» 둘뿐이다.
     * 엿듣는 좌석은 여기에 더해진다 — 그 좌석에는 자기가 끼지 않은 밀담도 실린다.
     */
    parleys: viewer.isHuman || eavesdropping.has(viewerId)
      ? record.parleys
      : record.parleys.filter((p) => p.targetId === viewerId),
  }))

  const outcome: OutcomeView | null = state.outcome
    ? {
        accusation: state.outcome.accusation,
        accuser: state.outcome.accuser,
        correct: state.outcome.correct,
        winner: state.outcome.winner,
        solution: state.solution,
        viewerWon: state.outcome.winner === viewer.faction,
      }
    : null

  return {
    viewerId,
    round: state.round,
    totalRounds: state.totalRounds,
    phase: state.phase,
    turnIndex: state.turnIndex,
    players,
    rounds,
    findings: findingsFor(state, viewerId),
    powerSpent: state.powersUsed.includes(viewerId),
    solution: viewer.faction === 'culprit' || over ? state.solution : null,
    outcome,
  }
}
