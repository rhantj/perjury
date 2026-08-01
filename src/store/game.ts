import { create } from 'zustand'
import { challenge, skipChallenge } from '../engine/challenge'
import { accuse, accuseByCouncil, nextRound } from '../engine/progress'
import { declareAll, suggest } from '../engine/round'
import { createGame } from '../engine/setup'
import { viewFor } from '../engine/view'
import type { GameView } from '../engine/view'
import type { Claim, GameState, PlayerId, Suggestion, Vote } from '../engine/types'

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

  suggest: (suggesterId: PlayerId, suggestion: Suggestion) => void
  declareAll: (claims: ReadonlyMap<PlayerId, Claim>) => void
  challenge: (challengerId: PlayerId, targetId: PlayerId) => void
  skipChallenge: () => void
  nextRound: () => void
  accuse: (accusation: Suggestion, accuserId: PlayerId) => void
  accuseByCouncil: (votes: readonly Vote[]) => void
}

function requireState(state: GameState | null): GameState {
  if (!state) throw new Error('시작되지 않은 판이다')
  return state
}

export const useGame = create<GameStore>((set, get) => {
  /**
   * 전이 하나를 적용한다. 엔진이 룰 위반을 던지면 상태를 그대로 두고 메시지만 남긴다.
   * 잘못된 조작으로 판이 깨지지 않게 하는 유일한 지점이다.
   */
  const apply = (transition: (state: GameState) => GameState) => {
    try {
      set({ state: transition(requireState(get().state)), error: null })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  }

  return {
    state: null,
    error: null,

    start: (seed, humanIndex = 0) =>
      set({ state: createGame({ seed, humanIndex }), error: null }),

    view: () => {
      const state = requireState(get().state)
      const human = state.players.find((p) => p.isHuman)
      if (!human) throw new Error('사람 플레이어가 없다')
      return viewFor(state, human.id)
    },

    suggest: (suggesterId, suggestion) =>
      apply((s) => suggest(s, suggesterId, suggestion)),
    declareAll: (claims) => apply((s) => declareAll(s, claims)),
    challenge: (challengerId, targetId) =>
      apply((s) => challenge(s, challengerId, targetId)),
    skipChallenge: () => apply(skipChallenge),
    nextRound: () => apply(nextRound),
    accuse: (accusation, accuserId) => apply((s) => accuse(s, accusation, accuserId)),
    accuseByCouncil: (votes) => apply((s) => accuseByCouncil(s, votes)),
  }
})
