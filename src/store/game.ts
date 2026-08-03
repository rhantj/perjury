import { create } from 'zustand'
import { perRound } from '../ai/decider'
import type { DeciderForRound } from '../ai/decider'
import { advanceToHuman, declareWithHuman, needsHuman, passChallenge } from '../ai/flow'
import { ruleDeciderForRound } from '../ai/rule-decider'
import { assignRoles } from '../content/roles'
import type { Role } from '../content/roles'
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
  /** AI가 판단 중인가. true인 동안 awaitingHuman()은 false를 반환한다. */
  aiThinking: boolean
  /**
   * 이번 라운드가 규칙 기반 폴백으로 떨어졌는가.
   * A 단계에서는 LLM Decider가 없으므로 항상 false다. C 단계부터 true가 될 수 있다.
   */
  fallbackRound: boolean

  /**
   * 판을 시작한다.
   * makeDeciders는 C 단계에서 LLM 팩토리를 넣는 지점이자, 테스트가 지연을 주입하는 지점이다.
   */
  start: (
    seed: string,
    humanIndex?: number,
    makeDeciders?: (seed: string) => DeciderForRound,
  ) => Promise<void>
  /** 판을 버리고 표지로 돌아간다. 브리핑에서 되돌아 나오는 경로가 이것뿐이다. */
  reset: () => void
  view: () => GameView
  /**
   * **내** 직업. 남의 직업은 내보내지 않는다 —
   * 범인 전용 2종(협잡꾼·밀정)이 섞여 있어서 알면 곧바로 범인이 드러난다.
   */
  role: () => Role
  /** 사람이 지금 결정해야 하는가. 화면은 이 값으로 조작 가능 여부를 정한다. */
  awaitingHuman: () => boolean

  suggest: (suggestion: Suggestion) => Promise<void>
  declare: (claim: Claim) => Promise<void>
  challenge: (targetId: PlayerId) => Promise<void>
  passChallenge: () => Promise<void>
  accuse: (accusation: Suggestion) => Promise<void>
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

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export const useGame = create<GameStore>((set, get) => {
  /**
   * 지금 살아 있는 판의 번호. start·reset마다 올린다.
   *
   * 비동기 결과가 도착했을 때 이 값이 시작 시점과 다르면 그 판은 이미 버려진 것이다.
   * 이 대조가 없으면 표지로 나갔다가 새 판을 시작했을 때
   * **이전 판의 응답이 새 판을 덮어쓴다.**
   */
  let gameId = 0
  let deciderForRound: DeciderForRound | null = null

  /**
   * 사람의 행동 하나를 적용하고, 다음 개입 지점까지 AI로 밀어놓는다.
   *
   * 엔진이 룰 위반을 던지면 상태를 그대로 두고 메시지만 남긴다.
   * 잘못된 조작으로 판이 깨지지 않게 하는 유일한 지점이다.
   */
  const apply = async (
    transition: (state: GameState, deciders: DeciderForRound) => Promise<GameState> | GameState,
  ) => {
    if (get().aiThinking) return
    const deciders = deciderForRound
    if (!deciders) {
      set({ error: '시작되지 않은 판이다' })
      return
    }

    const myGameId = gameId
    set({ aiThinking: true, error: null })

    try {
      const moved = await transition(requireState(get().state), deciders)
      const next = await advanceToHuman(moved, deciders)
      if (myGameId !== gameId) return
      set({ state: next, aiThinking: false, error: null })
    } catch (e) {
      if (myGameId !== gameId) return
      set({ aiThinking: false, error: messageOf(e) })
    }
  }

  return {
    state: null,
    error: null,
    aiThinking: false,
    fallbackRound: false,

    start: async (seed, humanIndex = 0, makeDeciders = ruleDeciderForRound) => {
      gameId += 1
      const myGameId = gameId
      deciderForRound = perRound(makeDeciders(seed))

      const initial = createGame({ seed, humanIndex })
      set({ state: initial, error: null, aiThinking: true, fallbackRound: false })

      try {
        const next = await advanceToHuman(initial, deciderForRound)
        if (myGameId !== gameId) return
        set({ state: next, aiThinking: false })
      } catch (e) {
        if (myGameId !== gameId) return
        set({ aiThinking: false, error: messageOf(e) })
      }
    },

    reset: () => {
      gameId += 1
      deciderForRound = null
      set({ state: null, error: null, aiThinking: false, fallbackRound: false })
    },

    view: () => {
      const state = requireState(get().state)
      return viewFor(state, humanId(state))
    },

    role: () => {
      const state = requireState(get().state)
      const mine = assignRoles(state.seed, state.players)[humanId(state)]
      if (!mine) throw new Error('직업이 배정되지 않았다')
      return mine
    },

    awaitingHuman: () => {
      const { state, aiThinking } = get()
      if (aiThinking) return false
      return state !== null && state.phase !== 'over' && needsHuman(state)
    },

    suggest: (suggestion) => apply((s) => suggest(s, humanId(s), suggestion)),
    declare: (claim) => apply((s, deciders) => declareWithHuman(s, claim, deciders)),
    challenge: (targetId) => apply((s) => challenge(s, humanId(s), targetId)),
    passChallenge: () => apply((s, deciders) => passChallenge(s, deciders)),
    accuse: (accusation) => apply((s) => accuse(s, accusation, humanId(s))),
  }
})
