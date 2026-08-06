import { CARDS, cardName, cardsOfKind } from './cards'
import { createRng, pickOne, shuffle } from './rng'
import type { CardId, GameState, Player, Solution } from './types'

export const PLAYER_COUNT = 6
export const HAND_SIZE = 2
/**
 * 한 라운드에 반증 «의무»를 지는 좌석 수. 제안자를 뺀 다섯 중에서 뽑는다.
 *
 * 전원 선언이던 것을 줄인 이유는 정보가 너무 빨리 열려서다 — 제안 한 번에 평균 2장이
 * 드러나는데 손패는 통틀어 12장뿐이라, 판이 중반에 다 보였다.
 * 2인이면 한 제안이 여는 카드가 평균 0.8장으로 떨어진다.
 */
export const REFUTER_COUNT = 2

/**
 * 판이 끝나는 **제안 회차**. 6인이 한 번씩 도는 것을 한 바퀴로 보면 넉 바퀴다 —
 * 화면에는 「라운드 N / 4」로 나가고, 이 값은 그 곱셈의 결과다(룰 개편 §3-1).
 *
 * 회차로 세는 이유는 사진사의 「다음 라운드」 때문이다. 바퀴 단위로 바꾸면 그 능력이
 * 최대 6선언 뒤에 풀려 대폭 세진다(룰 개편 §4). 바퀴는 화면 표시로만 만든다.
 *
 * 24인 이유는 이 값이 정보량을 정하기 때문이다. 제안 1회당 평균 0.8장이 열리므로
 * 1인당 아는 카드가 손패 2장 + 4회 × 0.8 ≈ 5.2장이 된다. 12장 중 5.2장이면
 * **혼자서는 못 푼다** — 밀담으로 교환해야만 닿는 지점이 이 게임이 노리는 자리다.
 * 더 늘리면 후반에 다 드러나고, 줄이면 정보가 말라 추리가 성립하지 않는다.
 */
export const DEFAULT_ROUNDS = 24

export interface SetupOptions {
  /** 이 값 하나가 판 전체를 결정한다. 같은 시드는 같은 판이다. */
  seed: string
  /** 사람이 앉을 자리. 기본 0번. */
  humanIndex?: number
  totalRounds?: number
  /**
   * 라운드당 밀담 건수. 사람이 전화교환수면 2다(결정 007).
   *
   * 엔진이 직업을 조회하지 않고 밖에서 받는 이유는 content → engine 한 방향 의존 때문이다.
   * 판을 만드는 쪽(store)이 배정표를 이미 갖고 있다.
   */
  parleyAllowance?: number
}

/**
 * 새 판을 만든다.
 *
 * 진영은 따로 뽑지 않는다 — 정답의 범인 카드를 맡은 플레이어가 곧 범인이다.
 * 사건을 저지른 사람이 그 자리에 앉아 있다는 뜻이라, 별도 난수 없이 규칙에서 파생된다.
 * 자기 캐릭터 카드를 손에 쥔 사람은 결백이 증명된다는 클루의 추리도 그대로 성립한다.
 */
export function createGame({
  seed,
  humanIndex = 0,
  totalRounds = DEFAULT_ROUNDS,
  parleyAllowance = 1,
}: SetupOptions): GameState {
  const rng = createRng(seed)

  const solution: Solution = {
    suspect: pickOne(cardsOfKind('suspect'), rng).id,
    weapon: pickOne(cardsOfKind('weapon'), rng).id,
    place: pickOne(cardsOfKind('place'), rng).id,
  }

  const sealed = new Set<CardId>([solution.suspect, solution.weapon, solution.place])
  const deck = shuffle(
    CARDS.filter((c) => !sealed.has(c.id)).map((c) => c.id),
    rng,
  )

  if (deck.length !== PLAYER_COUNT * HAND_SIZE) {
    throw new Error(
      `카드 구성이 맞지 않는다: ${deck.length}장을 ${PLAYER_COUNT}명에게 ${HAND_SIZE}장씩 나눌 수 없다`,
    )
  }

  const cast = shuffle(
    cardsOfKind('suspect').map((c) => c.id),
    rng,
  )

  const players: Player[] = cast.map((characterId, seat) => ({
    id: `p${seat}`,
    characterId,
    name: cardName(characterId),
    isHuman: seat === humanIndex,
    faction: characterId === solution.suspect ? 'culprit' : 'citizen',
    hand: deck.slice(seat * HAND_SIZE, seat * HAND_SIZE + HAND_SIZE),
    revealed: [],
  }))

  return {
    seed,
    round: 1,
    totalRounds,
    phase: 'suggest',
    turnIndex: 0,
    players,
    solution,
    rounds: [],
    powersUsed: [],
    eliminated: [],
    grants: [],
    pending: [],
    parleyAllowance,
    outcome: null,
  }
}
