import { CARDS, cardName, cardsOfKind } from './cards'
import { createRng, pickOne, shuffle } from './rng'
import type { CardId, GameState, Player, Solution } from './types'

export const PLAYER_COUNT = 6
export const HAND_SIZE = 2
export const DEFAULT_ROUNDS = 8

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
    grants: [],
    pending: [],
    parleyAllowance,
    outcome: null,
  }
}
