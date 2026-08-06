import { create } from 'zustand'
import { createRoundFallback, perRound } from '../ai/decider'
import type { DeciderForRound, FallbackReason, ParleyReply } from '../ai/decider'
import { advanceToHuman, declareWithHuman, needsHuman, passChallenge } from '../ai/flow'
import { powerLookup } from '../ai/power-brief'
import type { PowerLookup } from '../ai/power-brief'
import { createRuleDecider, ruleDeciderForRound } from '../ai/rule-decider'
import { assignRoles } from '../content/roles'
import type { Role } from '../content/roles'
import { challenge } from '../engine/challenge'
import { parley, skipParley } from '../engine/parley'
import { buildPowerUse, usePower } from '../engine/power'
import type { PowerIntent } from '../engine/power'
import { accuse, accuseEarly } from '../engine/progress'
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
    makeDeciders?: (seed: string, powerOf: PowerLookup) => DeciderForRound,
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

  /** 내 능력이 이미 소진됐는가. 능력은 한 판에 한 번뿐이다. */
  powerUsed: () => boolean
  /**
   * 내 능력을 발동한다. **종류를 인자로 받지 않는다** — 좌석에 배정된 직업에서 나온다.
   * 화면이 종류를 정하게 두면 화면 버그가 곧 룰 위반이 된다(작업 규칙 2).
   *
   * 페이즈 전이가 아니라서 동기다. AI를 깨우지도, 라운드를 넘기지도 않는다.
   */
  usePower: (intent: PowerIntent) => void

  suggest: (suggestion: Suggestion) => Promise<void>
  declare: (claim: Claim) => Promise<void>
  challenge: (targetId: PlayerId) => Promise<void>
  passChallenge: () => Promise<void>
  accuse: (accusation: Suggestion) => Promise<void>
  /** 라운드 중간에 혼자 외치는 고발. 맞으면 시민 승, 틀리면 외친 사람만 탈락한다. */
  accuseEarly: (accusation: Suggestion) => Promise<void>

  /**
   * 밀담 응답을 받아온다. **엔진을 건드리지 않는다.**
   *
   * 실패하면 던지지 않고 null을 돌려주는 것이 §9의 오류 정책 그 자체다 —
   * 밀담은 진행에 필수가 아니므로 실패의 최선은 «어떻게든 응답을 만든다»가 아니라
   * «솔직히 닫고 넘어간다»이다. 화면은 null을 받으면 밀담을 닫고 건너뛰기만 남긴다.
   */
  askParley: (targetId: PlayerId, ask: string) => Promise<ParleyReply | null>
  /**
   * 오간 말을 기록한다. 화면이 응답을 다 받은 뒤에만 부른다.
   * 회선이 남아 있으면 라운드는 넘어가지 않는다(전화교환수).
   *
   * truthful은 «말한 쪽의 자기 신고»다. 정보상이 걸어뒀으면 그것이 판정 결과가 된다.
   */
  parley: (
    targetId: PlayerId,
    askLine: string,
    replyLine: string,
    truthful?: boolean | null,
  ) => Promise<void>
  /** 밀담 없이 라운드를 넘긴다. */
  skipParley: () => Promise<void>
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
    fallbackReason: null,

    start: async (seed, humanIndex = 0, makeDeciders = ruleDeciderForRound) => {
      gameId += 1
      const myGameId = gameId
      const draft = createGame({ seed, humanIndex })
      const roles = assignRoles(seed, draft.players)
      /*
       * 회선 수는 엔진이 정하지 못한다 — 엔진은 직업을 모른다(content → engine 한 방향).
       * 배정표를 아는 여기서 정해 넘긴다. 같은 시드는 같은 판이라 두 번 만들어도 결과가 같다.
       */
      const operator = roles[draft.players[humanIndex]?.id ?? '']?.effect === 'eavesdrop'
      const initial = operator ? createGame({ seed, humanIndex, parleyAllowance: 2 }) : draft
      /*
       * 판단자가 배정표를 스스로 구하려면 시드가 필요한데, LLM 구현체에 시드를 주면
       * 판을 재계산해 정답을 뽑을 수 있다(rule-decider 주석).
       * 그래서 «좌석 → 내 능력»으로 좁힌 조회 함수만 넘긴다.
       */
      const chosen = makeDeciders(seed, powerLookup(roles))

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

    powerUsed: () => {
      const state = get().state
      return state !== null && state.powersUsed.includes(humanId(state))
    },

    usePower: (intent) => {
      const state = get().state
      // AI가 판단하는 동안은 다른 조작과 마찬가지로 잠근다.
      if (!state || get().aiThinking) return

      const effect = get().role().effect
      if (effect === null) return

      const use = buildPowerUse(effect, intent)
      // 대상이 빠진 발동은 화면 실수다. 판을 오류로 멈추지 않고 조용히 무시한다.
      if (!use) return

      try {
        set({ state: usePower(state, humanId(state), use), error: null })
      } catch (e) {
        set({ error: messageOf(e) })
      }
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
    /*
     * 조기 고발. 최종 고발과 «같은 오답»이 전혀 다른 결과를 내므로 함수를 따로 둔다 —
     * 여기서는 판이 끝나지 않고 외친 사람만 탈락한다(룰 개편 §2-5).
     * 어느 쪽을 쓸지는 페이즈로 엔진이 가른다(engine/progress.ts의 accuseEarly).
     */
    accuseEarly: (accusation) => apply((s) => accuseEarly(s, humanId(s), accusation)),

    askParley: async (targetId, ask) => {
      const deciders = deciderForRound
      const current = get().state
      if (!deciders || !current) return null

      const myGameId = gameId
      try {
        const reply = await deciders(current.round).speakInParley(viewFor(current, targetId), ask)
        // 표지로 나갔다가 새 판을 시작했으면 이 응답은 버려진 판의 것이다.
        return myGameId === gameId ? reply : null
      } catch {
        return null
      }
    },

    parley: (targetId, askLine, replyLine, truthful = null) =>
      apply((s) => parley(s, targetId, askLine, replyLine, truthful)),
    skipParley: () => apply((s) => skipParley(s)),
  }
})
