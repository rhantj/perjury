import { cardKind } from './cards'
import { resolveAfterDeclare } from './power'
import { createRng, pickOne, shuffle } from './rng'
import { REFUTER_COUNT } from './setup'
import type {
  CardId,
  Claim,
  Declaration,
  GameState,
  PendingPower,
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
  // 거부는 의무를 면제받은 것이라 어길 의무가 없다. 침묵과 갈리는 지점이 여기다.
  if (claim.kind === 'refuse') return false
  return mustRefute(hand, suggestion)
}

/**
 * 협잡꾼의 조작. 낸 카드를 제안된 나머지 중 하나로 «바꿔치기»한다.
 *
 * isPerjury를 뒤집는 것으로는 아무 일도 일어나지 않는다 — 이의제기 성공은 진위가 아니라
 * **카드 소지**로 정해지기 때문이다(challenge.ts). 선언한 카드 자체를 바꿔야 물린다.
 *
 * 침묵·거부는 바꿀 카드가 없으므로 그대로 둔다. 대사도 손대지 않는다 —
 * 말은 그대로인데 기록만 달라진 것이 이 능력의 무서움이다.
 */
function frameClaim(
  state: GameState,
  record: RoundRecord,
  targetId: PlayerId,
  claim: Claim,
): Claim {
  if (claim.kind !== 'refute') return claim
  const others = suggestedCards(record.suggestion).filter((id) => id !== claim.cardId)
  if (!others[0]) return claim
  // 대상을 시드에 넣는다. 지금은 한 판에 협잡꾼도 대상도 하나뿐이라 없어도 되지만,
  // 그 전제가 코드에 적혀 있지 않다. 이의제기(challenge.ts)가 이미 같은 이유로 양쪽을 넣는다.
  const rng = createRng(`${state.seed}:frame:${record.round}:${targetId}:${claim.cardId}`)
  return { kind: 'refute', cardId: pickOne(others, rng) }
}

/**
 * 이번 라운드에 반증 «의무»를 질 좌석을 뽑는다. 제안자를 뺀 다섯 중 REFUTER_COUNT명이다.
 *
 * **시드에서 파생되므로 순수 함수다** — 같은 판·같은 라운드면 언제 불러도 같은 결과다.
 * 시드를 `:draw:라운드`로 갈라 쓰는 이유는 격리다. createGame의 rng를 같이 쓰면
 * 여기서 난수를 뽑는 순간 기존 시드의 카드 배분이 전부 달라진다(content/roles.ts와 같은 사안).
 *
 * 좌석 순서로 되돌려 돌려준다. 뽑은 «순서»는 아무 의미가 없는데, 그대로 두면
 * 화면과 기록에 라운드마다 뒤죽박죽인 차례로 나타나 없는 규칙이 있는 것처럼 읽힌다.
 */
export function drawResponders(
  seed: string,
  round: number,
  candidates: readonly PlayerId[],
): PlayerId[] {
  if (candidates.length <= REFUTER_COUNT) return [...candidates]
  const drawn = new Set(
    shuffle(candidates, createRng(`${seed}:draw:${round}`)).slice(0, REFUTER_COUNT),
  )
  return candidates.filter((id) => drawn.has(id))
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
  /*
   * 탈락자는 제안권을 잃는다. 정상 경로에서는 차례 계산(progress.ts의 nextSeat)이 이미
   * 건너뛰지만, 그 보장이 «다른 파일»에 있어서 화면이나 AI가 차례를 잘못 흉내내면
   * 그대로 통과한다. 룰이므로 엔진이 막는다(작업 규칙 2).
   */
  if (state.eliminated.includes(suggesterId)) {
    throw new Error(`탈락자는 제안할 수 없다: ${suggester.name}`)
  }
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
        responderIds: drawResponders(
          state.seed,
          state.round,
          state.players.filter((p) => p.id !== suggesterId).map((p) => p.id),
        ),
        declarations: [],
        challenge: null,
        exposed: [],
        published: [],
        parleys: [],
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
/**
 * 이 지목이 «이번 라운드에» 실제로 걸렸는가. 걸렸으면 1회를 쓴 것이므로 거둔다.
 *
 * 걸리지 않았으면 남겨 다음 라운드를 기다린다(룰 개편 §2-7). 안 그러면 판당 1회짜리가
 * 아무 일도 없이 증발한다 — 추첨은 다섯 중 둘만 뽑으므로 대상이 빠질 확률이 3/5다.
 * 순사·사진사가 power.ts에서 같은 원칙을 지킨다(2-A). 이 둘은 «선언»에 걸리는 능력이라
 * 선언이 만들어지는 여기에 있다.
 *
 * 걸리는 조건이 서로 다르다는 것이 핵심이다.
 *
 *   refuse-demand(변호사) — 거부하는 것은 «자신»이므로 자기가 선언했으면 그것으로 걸렸다.
 *     뽑히기만 하면 아래에서 무엇을 냈든 거부로 덮이므로, 선언의 «내용»은 볼 것이 없다.
 *
 *   frame(협잡꾼) — 조작하는 것은 «남의» 반증이다. 대상이 뽑히는 것만으로는 모자라다 —
 *     frameClaim이 반증만 바꾸고 침묵·거부는 그대로 돌려주므로(위 `claim.kind !== 'refute'`),
 *     대상이 낼 카드가 없어 침묵하면 뽑혀도 아무 일이 없다. 대상이 거부 능력까지 쥐고 있어
 *     거부로 덮이는 경우도 같다. 그래서 «뽑혔는가»가 아니라 «반증이 남았는가»를 본다.
 *
 * 그래서 responderIds가 아니라 이번 라운드의 선언 결과를 받는다. 뽑힌 것과 실제로
 * 무엇을 냈는지는 다른 값이고, 이 판정에 필요한 것은 뒤쪽이다.
 */
function spent(pending: PendingPower, declarations: readonly Declaration[]): boolean {
  const said = (id: PlayerId) => declarations.find((d) => d.playerId === id)
  if (pending.use.kind === 'refuse-demand') return said(pending.ownerId) !== undefined
  if (pending.use.kind === 'frame') return said(pending.use.targetId)?.claim.kind === 'refute'
  return false
}

export function declareAll(
  state: GameState,
  claims: ReadonlyMap<PlayerId, Claim>,
  lines: ReadonlyMap<PlayerId, string> = new Map(),
): GameState {
  if (state.phase !== 'refute') throw new Error(`반증 페이즈가 아니다: ${state.phase}`)

  const record = currentRound(state)
  /*
   * 선언하는 것은 «뽑힌» 좌석뿐이다. 제안자를 뺀 전원이 아니다.
   *
   * 뽑히지 않은 좌석의 선언이 함께 들어와도 던지지 않고 버린다. 부르는 쪽이 다섯 명에게
   * 다 물어본 뒤 넘길 수도 있고, 그건 룰 위반이 아니라 낭비일 뿐이다 —
   * 룰이 지켜야 하는 것은 «뽑힌 사람은 반드시 답한다»이고 그건 아래에서 던진다.
   */
  const responders = state.players.filter((p) => record.responderIds.includes(p.id))
  const allowed = suggestedCards(record.suggestion)
  const refusing = new Set(
    state.pending.filter((p) => p.use.kind === 'refuse-demand').map((p) => p.ownerId),
  )
  const framed = new Set(
    state.pending.flatMap((p) => (p.use.kind === 'frame' ? [p.use.targetId] : [])),
  )

  const missing = responders.filter((p) => !claims.has(p.id))
  if (missing.length > 0) {
    throw new Error(`뽑힌 좌석의 선언이 빠졌다: ${missing.map((p) => p.name).join(', ')}`)
  }

  const declarations: Declaration[] = responders.map((player) => {
    const given = claims.get(player.id)
    if (!given) throw new Error(`${player.name}의 선언이 없다`)
    if (given.kind === 'refute' && !allowed.includes(given.cardId)) {
      throw new Error(`제안에 없는 카드로는 반증할 수 없다: ${given.cardId}`)
    }
    /*
     * 「거부」는 «내는» 선언이 아니라 능력이 만드는 선언이다.
     *
     * 능력을 쓴 좌석은 무엇을 냈든 거부가 되고, 쓰지 않은 좌석이 거부를 내면 던진다.
     * 엔진은 직업을 모르지만 pending은 안다 — 능력을 통과했다는 사실만으로 자격을 판정하므로
     * 바깥 층(화면·AI·워커) 중 하나가 뚫려도 룰이 무너지지 않는다(작업 규칙 2).
     */
    if (given.kind === 'refuse' && !refusing.has(player.id)) {
      throw new Error(`거부는 능력 없이 낼 수 없다: ${player.name}`)
    }
    const claim: Claim = refusing.has(player.id)
      ? { kind: 'refuse' }
      : framed.has(player.id)
        ? frameClaim(state, record, player.id, given)
        : given
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
      pending: state.pending.filter((p) => !spent(p, declarations)),
      rounds: [...state.rounds.slice(0, -1), { ...record, declarations }],
    },
    declarations,
  )
}
