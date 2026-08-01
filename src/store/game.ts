import { create } from 'zustand'
import { advanceToHuman, declareWithHuman, needsHuman, passChallenge } from '../ai/flow'
import { challenge } from '../engine/challenge'
import { accuse } from '../engine/progress'
import { suggest } from '../engine/round'
import { createGame } from '../engine/setup'
import { viewFor } from '../engine/view'
import type { GameView } from '../engine/view'
import type { Claim, GameState, PlayerId, Suggestion } from '../engine/types'

/**
 * 화면이 쓰는 상태. 엔진 함수를 그대로 노출하지 않고 **사람이 할 수 있는 행동만** 연다.
 * playerId를 화면이 들고 다니지 않아도 되고, 남의 차례에 끼어드는 호출이 애초에 불가능해진다.
 */
interface GameStore {
  /**
   * 진짜 상태. 정답과 위증 판정이 들어 있으므로 컴포넌트가 직접 읽으면 안 된다.
   * 화면은 반드시 view()를 거친다.
   */
  state: GameState | null
  /** 마지막 룰 위반 메시지. 엔진이 던진 것을 담아 화면에 띄운다. */
  error: string | null

  start: (seed: string, humanIndex?: number) => void
  view: () => GameView
  /** 사람이 지금 결정해야 하는가. 화면은 이 값으로 조작 가능 여부를 정한다. */
  awaitingHuman: () => boolean

  suggest: (suggestion: Suggestion) => void
  declare: (claim: Claim) => void
  challenge: (targetId: PlayerId) => void
  passChallenge: () => void
  accuse: (accusation: Suggestion) => void
}

function requireState(state: GameState | null): GameState {
  if (!state) throw new Error('시작되지 않은 판이다')
  return state
}

function humanId(state: GameState): PlayerId {
  const human = state.players.find((p) => p.isHuman)
  if (!human) throw new Error('사람 플레이어가 없다')
  return human.id
}

export const useGame = create<GameStore>((set, get) => {
  /**
   * 사람의 행동 하나를 적용하고, 다음 개입 지점까지 AI로 밀어놓는다.
   *
   * 엔진이 룰 위반을 던지면 상태를 그대로 두고 메시지만 남긴다.
   * 잘못된 조작으로 판이 깨지지 않게 하는 유일한 지점이다.
   */
  const apply = (transition: (state: GameState) => GameState) => {
    try {
      set({ state: advanceToHuman(transition(requireState(get().state))), error: null })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  }

  return {
    state: null,
    error: null,

    start: (seed, humanIndex = 0) =>
      set({ state: advanceToHuman(createGame({ seed, humanIndex })), error: null }),

    view: () => {
      const state = requireState(get().state)
      return viewFor(state, humanId(state))
    },

    awaitingHuman: () => {
      const state = get().state
      return state !== null && state.phase !== 'over' && needsHuman(state)
    },

    suggest: (suggestion) => apply((s) => suggest(s, humanId(s), suggestion)),
    declare: (claim) => apply((s) => declareWithHuman(s, claim)),
    challenge: (targetId) => apply((s) => challenge(s, humanId(s), targetId)),
    passChallenge: () => apply(passChallenge),
    accuse: (accusation) => apply((s) => accuse(s, accusation, humanId(s))),
  }
})
