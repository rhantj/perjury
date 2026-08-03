import { create } from 'zustand'
import { createRoundFallback, perRound } from '../ai/decider'
import type { DeciderForRound, FallbackReason } from '../ai/decider'
import { advanceToHuman, declareWithHuman, needsHuman, passChallenge } from '../ai/flow'
import { llmDeciderForRound } from '../ai/llm-decider'
import { createRuleDecider } from '../ai/rule-decider'
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
  /** 이번 라운드가 규칙 기반 폴백으로 떨어졌는가. */
  fallbackRound: boolean
  /**
   * 왜 떨어졌는가. fallbackRound가 true일 때만 의미가 있다.
   * budget이면 그날 안에 낫지 않고, error면 다음 라운드에 복구될 수 있다 — 안내 문구가 달라진다.
   */
  fallbackReason: FallbackReason | null

  /**
   * 판을 시작한다.
   *
   * makeDeciders의 기본값은 **규칙 기반**이다. store가 네트워크를 기본으로 물면
   * 단위 테스트가 서버 없이는 못 돌고, 어떤 판단자를 쓸지는 앱이 정할 일이다.
   * 실제 LLM은 GameScreen이 넣는다.
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

/**
 * 기본 판단자는 LLM이다. seed를 받지 않는 이유는 LLM 판단이 시드로 재현되지 않기 때문이다.
 * 실패하면 start()가 감싸는 폴백이 같은 seed의 규칙 기반으로 받아낸다.
 */
function defaultDeciders(_seed: string): DeciderForRound {
  return llmDeciderForRound()
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
    fallbackReason: null,

    start: async (seed, humanIndex = 0, makeDeciders = defaultDeciders) => {
      gameId += 1
      const myGameId = gameId
      const chosen = makeDeciders(seed)

      /**
       * 어떤 팩토리를 꽂아도 규칙 기반 폴백이 붙는다.
       * 절대 규칙 4(폴백 경로를 깨지 않는다)를 관례가 아니라 구조로 만드는 지점이다.
       * 라운드마다 새 래퍼가 만들어지므로 "이 라운드는 넘어졌다"는 표시도 라운드 경계에서 지워진다.
       */
      deciderForRound = perRound((round) => {
        set({ fallbackRound: false, fallbackReason: null })
        return createRoundFallback(chosen(round), createRuleDecider(seed), (reason) =>
          set({ fallbackRound: true, fallbackReason: reason }),
        )
      })

      const initial = createGame({ seed, humanIndex })
      set({ state: initial, error: null, aiThinking: true, fallbackRound: false, fallbackReason: null })

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
      set({ state: null, error: null, aiThinking: false, fallbackRound: false, fallbackReason: null })
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
