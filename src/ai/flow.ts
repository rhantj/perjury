import { assignRoles, autoShieldSeats } from '../content/roles'
import {
  canChallenge as ruleAllowsChallenge,
  challenge,
  skipChallenge,
} from '../engine/challenge'
import { skipParley } from '../engine/parley'
import { buildPowerUse, usePower } from '../engine/power'
import type { PowerIntent } from '../engine/power'
import { accuse, accuseByCouncil, accuseEarly } from '../engine/progress'
import { declareAll, suggest } from '../engine/round'
import { viewFor } from '../engine/view'
import type { Claim, GameState, PlayerId, Suggestion, Vote } from '../engine/types'
import type { Decider, DeciderForRound, Spoken } from './decider'

function humanOf(state: GameState) {
  const human = state.players.find((p) => p.isHuman)
  if (!human) throw new Error('사람 자리가 없다')
  return human
}

function lastRound(state: GameState) {
  const record = state.rounds[state.rounds.length - 1]
  if (!record) throw new Error('진행 중인 라운드가 없다')
  return record
}

/**
 * 사람의 결정이 필요한 지점인가.
 *
 * 이 판단을 컴포넌트에 흩뿌리면 "AI가 안 움직인다" 류의 버그가 화면 코드에 숨는다.
 * 한 곳에 모아두고 화면은 결과만 본다.
 */
export function needsHuman(state: GameState): boolean {
  const human = humanOf(state)
  /*
   * 조기 고발에 실패해 탈락하면 고발·이의제기·밀담·능력을 잃는다(룰 개편 §2-5).
   * 여기서 빼지 않으면 화면이 버튼을 그리고, 누르면 엔진이 던져 그 페이즈에 갇힌다.
   * **반증만은 그대로 한다** — 탈락자는 「말 없는 카드 보관함」이지 자리를 뜨는 것이 아니다.
   */
  const out = state.eliminated.includes(human.id)

  switch (state.phase) {
    case 'suggest':
      return state.players[state.turnIndex]?.id === human.id
    case 'refute':
      /*
       * 추첨에 뽑혔을 때만 사람을 기다린다. 「제안자가 아니면」으로 두면 뽑히지 않은
       * 라운드에도 화면이 사람의 선언을 기다리며 멈춘다 — 낼 버튼도 없는 채로.
       */
      return lastRound(state).responderIds.includes(human.id)
    case 'challenge':
      /*
       * 이의제기는 제안자만 한다(룰 개편 §2-4). 제안자가 아닐 때도 사람을 기다리면
       * 화면이 낼 버튼도 없이 멈춘다 — 추첨(1-A)에서 겪은 것과 같은 종류의 정지다.
       *
       * 자격까지 같이 본다. 횟수를 다 썼거나 손패가 전부 열렸으면 대상 버튼이 전부
       * 비활성인 화면에서 「넘어가기」만 기다리게 되는데, AI 제안자였다면 offerChallenge가
       * 묻지도 않고 넘긴다. 사람만 한 번 더 누르게 할 이유가 없다 — 두 경로를 같은 기준으로 둔다.
       */
      return (
        !out && lastRound(state).suggesterId === human.id && ruleAllowsChallenge(state, human.id)
      )
    case 'accuse':
      return human.faction === 'citizen' && !out
    case 'whisper':
      // 밀담은 언제나 사람이 건다. 건너뛰더라도 «건너뛴다»는 결정을 사람이 한다(설계 §2).
      return !out
    case 'over':
      return false
  }
}

/**
 * 판단자가 낸 반증 선언을 룰이 받을 수 있는 모양으로 좁힌다.
 *
 * 스키마는 전체 카드를 허용하는데 엔진은 «제안된 3장»만 받는다 — 룰을 한 군데에만 두기로 한
 * 대가다(설계 §5.3). 제안 밖 카드로 반증하겠다는 선언은 애초에 성립하지 않으므로 침묵으로 읽는다.
 * 그대로 넘기면 declareAll이 던져 라운드가 멈춘다.
 *
 * **사람의 선언에는 쓰지 않는다.** 화면은 제안된 3장만 내주므로 사람은 이 경우에 빠질 수 없고,
 * 빠졌다면 조용히 바꾸는 대신 오류로 보여야 한다.
 */
function legalClaim(suggestion: Suggestion, claim: Claim): Claim {
  if (claim.kind !== 'refute') return claim
  const allowed = [suggestion.suspect, suggestion.weapon, suggestion.place]
  return allowed.includes(claim.cardId) ? claim : { kind: 'pass' }
}

/**
 * 선언을 좁히면서 대사도 같이 본다.
 *
 * **좁혀진 대사는 버린다.** 대사는 버린 그 선언을 설명하려고 쓴 말이라,
 * 남기면 기록에는 「넘김」인데 좌석에서는 "그건 내가 쥐고 있소"라고 말한다.
 * 플레이어에게는 AI가 룰을 어긴 것처럼 보인다.
 */
function legalSpoken(suggestion: Suggestion, spoken: Spoken<Claim>): Spoken<Claim> {
  const value = legalClaim(suggestion, spoken.value)
  return value === spoken.value ? spoken : { ...spoken, value, line: null }
}

/**
 * 좌석별 (선언, 대사)를 엔진이 받는 두 갈래로 나눈다. declareAll이 룰과 연출을 따로 받기 때문이다.
 *
 * **여기서는 좁히지 않는다.** legalClaim은 부르는 쪽에서 «AI 선언에만» 걸어야 한다 —
 * 여기 넣으면 사람의 선언까지 조용히 침묵으로 바뀐다(legalClaim 주석).
 */
type SpokenClaims = readonly (readonly [PlayerId, Spoken<Claim>])[]

function claimsOf(spokens: SpokenClaims): Map<PlayerId, Claim> {
  return new Map(spokens.map(([id, spoken]) => [id, spoken.value]))
}

/**
 * 대사가 없는 좌석은 아예 넣지 않는다. declareAll이 없는 키를 null로 읽으므로 결과가 같고,
 * null을 담은 항목이 맵에 쌓이지 않는다.
 */
function linesOf(spokens: SpokenClaims): Map<PlayerId, string> {
  const lines = new Map<PlayerId, string>()
  for (const [id, spoken] of spokens) {
    if (spoken.line !== null) lines.set(id, spoken.line)
  }
  return lines
}

/**
 * 이 지목이 이의제기로 성립하는가.
 *
 * 판단자는 **누구든 지목할 수 있다.** 프롬프트 스키마의 후보에 «반증을 선언한 사람»만
 * 남기지 않았기 때문이다 — 룰을 엔진과 스키마 두 군데에 두면 조용히 어긋난다(설계 §5.3).
 * 대신 성립하지 않는 지목이 올라올 수 있고, 그것을 엔진에 그대로 넣으면 엔진이 던진다.
 *
 * **그 예외를 여기서 막지 않으면 라운드가 그 자리에 멈춘다.** 배포본에서 이의제기 페이즈가
 * 넘어가지 않은 원인이 이것이었다. 성립하지 않는 지목은 «이 사람은 안 잡는다»로 읽는다.
 */
function canChallenge(state: GameState, challengerId: PlayerId, targetId: PlayerId): boolean {
  if (challengerId === targetId) return false
  /*
   * 횟수·자격은 엔진에 물어본다(decisions/008). 같은 판단을 여기 옮겨 적으면
   * 한쪽만 고쳐져 «화면은 되는데 엔진이 거절하는» 상태가 된다 — 그리고 그 거절은
   * 위 주석대로 라운드를 멈춘다.
   */
  if (!ruleAllowsChallenge(state, challengerId)) return false
  const declaration = lastRound(state).declarations.find((d) => d.playerId === targetId)
  return declaration?.claim.kind === 'refute'
}

/**
 * 이의제기 기회를 돌린다. **먼저 잡는 사람 하나만 성립한다.**
 *
 * **묻는 사람은 제안자 하나뿐이다**(룰 개편 §2-4). 반증 카드가 제안자에게만 보이므로
 * (1-B) 나머지 좌석은 「내가 쥔 카드를 냈다」를 판정할 자료가 없다.
 *
 * 예전에는 5좌석 전원에게 병렬로 물었다. 좌석 순서를 지키려고 답을 다 모은 뒤 훑는
 * 구조였는데, §2-4가 후보를 하나로 줄이면서 그 기계장치가 통째로 필요 없어졌다.
 * **판당 호출이 180회에서 80회로 준다** — 이의제기가 판당 120회에서 20회가 된다.
 * 구현 뒤에 다시 세어 확인한 값이다(session-resume 2026-08-07).
 * 워커 캡 400 기준으로 하루 2판이 5판이 된다.
 *
 * except는 이미 넘긴 사람이다 — 사람이 «넘어가기»를 누른 뒤에는 다시 묻지 않는다.
 * 제안자가 사람이면 그 한 명이 곧 후보이므로, 넘긴 순간 이 페이즈는 끝난다.
 */
async function offerChallenge(
  state: GameState,
  decider: Decider,
  except: PlayerId | null,
): Promise<GameState> {
  const suggesterId = lastRound(state).suggesterId
  /*
   * 자격을 «묻기 전에» 본다. 횟수를 다 썼거나 손패가 다 열렸거나 탈락했으면 어차피
   * 엔진이 거절하므로, 호출을 내보내는 것 자체가 낭비다.
   * (탈락자 배제도 여기 포함된다 — canChallenge가 eliminated를 본다.)
   */
  if (suggesterId === except || !ruleAllowsChallenge(state, suggesterId)) {
    return skipChallenge(state)
  }

  const spoken = await decider.chooseChallengeTarget(viewFor(state, suggesterId))
  if (spoken.value && canChallenge(state, suggesterId, spoken.value)) {
    // 밀정의 보호는 지목당하는 순간 저절로 펼쳐진다. 자격은 배정표를 아는 이쪽이 만들어 넘긴다.
    const shielded = autoShieldSeats(state.seed, state.players)
    return challenge(state, suggesterId, spoken.value, spoken.line, shielded)
  }
  // 안 잡기로 했을 때의 대사는 버린다 — 하지 않은 행동에는 기록할 자리가 없다.
  return skipChallenge(state)
}

/**
 * AI가 판단과 함께 낸 능력 사용을 적용한다.
 *
 * **종류는 AI가 고르지 않는다.** 좌석에 배정된 직업에서 뽑아 붙인다 — 그러지 않으면
 * LLM이 자기에게 없는 능력을 쓸 수 있다(작업 규칙 2 · 결정 007).
 *
 * 엔진이 거절하면(이미 썼다·자기 지목·끝난 판) **조용히 넘긴다.** LLM은 대상을 빠뜨리거나
 * 자기를 지목하는 일이 흔한데, 그때마다 라운드가 오류로 멈추면 판이 끝까지 가지 못한다.
 * 거절이 곧 «AI가 룰을 어길 수 없다»의 집행 지점이다.
 *
 * 판단 전이보다 **먼저** 부른다. 남의 선언을 건드리는 능력(협잡꾼)이 선언 기록에
 * 반영되려면 declareAll이 도는 시점에 이미 상태에 들어와 있어야 한다.
 *
 * **제안·반증에서만 걷는다.** 제안자는 chooseSuggestion을, 추첨된 좌석은 chooseClaim을
 * 정확히 한 번씩 부르므로 이 둘이면 그 라운드에 말하는 사람 전원을 한 번씩 훑게 된다.
 * 이의제기·고발에서 또 걷으면 같은 사람에게 두 번 묻는 셈이고, 프롬프트도 그만큼 길어진다.
 *
 * 추첨이 들어온 뒤로는 한 라운드에 물어보는 것이 제안자 1 + 뽑힌 2 = **6명 중 3명**이다.
 * 나머지 셋은 그 라운드에 능력을 쓸 기회가 없다 — 능력 대기(engine/power.ts)가 필요한
 * 이유가 여기서도 나온다.
 */
function withPowers(
  state: GameState,
  intents: readonly (readonly [PlayerId, PowerIntent | null | undefined])[],
): GameState {
  const wanted = intents.filter(([, intent]) => intent)
  if (wanted.length === 0) return state

  const roles = assignRoles(state.seed, state.players)

  return wanted.reduce((current, [playerId, intent]) => {
    const effect = roles[playerId]?.effect
    if (!effect || !intent) return current
    const use = buildPowerUse(effect, intent)
    if (!use) return current
    try {
      return usePower(current, playerId, use)
    } catch {
      return current
    }
  }, state)
}

/** AI가 처리할 수 있는 한 스텝. 사람 차례에 부르면 안 된다. */
export async function stepAi(state: GameState, decider: Decider): Promise<GameState> {
  switch (state.phase) {
    case 'suggest': {
      const suggester = state.players[state.turnIndex]
      if (!suggester) throw new Error('제안자를 찾을 수 없다')
      const spoken = await decider.chooseSuggestion(viewFor(state, suggester.id))
      /*
       * 조기 고발은 제안 «대신»이므로 능력을 걸기 «전에» 갈린다. 판당 1회짜리를
       * 제안도 안 하는 라운드에 태워 버리지 않으려는 것이다 — 외치고 탈락하면
       * 능력마저 잃는데(§2-5) powersUsed는 이미 찍혀 되돌릴 자리가 없다.
       *
       * **시민에게만 연다.** 범인이 외치면 엔진이 자백으로 읽어 시민 승으로 닫는데
       * (결정 011 §2), LLM이 한 번 잘못 고르면 판이 어이없이 끝난다. 엔진의 룰은
       * 그대로 두고 부르는 쪽에서 막는다 — 룰을 무르는 것이 아니라 안 쓰는 것이다.
       *
       * 엔진이 거절하면 조용히 평소 제안으로 간다. 판단자가 이상한 것을 골랐다고
       * 라운드가 멈추면 판이 끝까지 못 간다(withPowers와 같은 이유).
       */
      if (spoken.accuse && suggester.faction === 'citizen') {
        try {
          return accuseEarly(state, suggester.id, spoken.accuse)
        } catch {
          // 무시하고 아래 제안으로 떨어진다.
        }
      }
      const armed = withPowers(state, [[suggester.id, spoken.power]])
      return suggest(armed, suggester.id, spoken.value, spoken.line)
    }
    case 'refute': {
      const record = lastRound(state)
      // 뽑힌 좌석에게만 묻는다. 나머지에게 물어봐야 엔진이 버리므로 판단 호출만 낭비된다.
      const others = state.players.filter((p) => record.responderIds.includes(p.id))
      // 병렬인 것은 최적화가 아니라 룰이다 — 동시 선언은 서로의 답을 못 보고 낸다 (설계 §1.4.1)
      const spokens = await Promise.all(
        others.map(async (p) => {
          const spoken = await decider.chooseClaim(viewFor(state, p.id))
          return [p.id, legalSpoken(record.suggestion, spoken)] as const
        }),
      )
      const armed = withPowers(
        state,
        spokens.map(([id, spoken]) => [id, spoken.power] as const),
      )
      return declareAll(armed, claimsOf(spokens), linesOf(spokens))
    }
    case 'challenge':
      return offerChallenge(state, decider, null)
    case 'whisper':
      // 사람 자리를 AI가 대신 두는 경로(autoPlay)다. AI끼리는 밀담하지 않는다(설계 §2).
      return skipParley(state)
    case 'accuse': {
      const human = humanOf(state)
      if (human.faction === 'citizen' && !state.eliminated.includes(human.id)) {
        // 사람 자리를 AI가 대신 두는 경로(autoPlay)다. 사람의 고발에는 대사가 없다.
        const spoken = await decider.chooseAccusation(viewFor(state, human.id))
        return accuse(state, spoken.value, human.id)
      }
      /*
       * 탈락자는 고발권이 없으므로 합의에서도 뺀다. 엔진(accuseByCouncil)이 같은 기준으로
       * 인원을 세므로, 여기서 안 빼면 「전원이 투표해야 한다」에 걸려 판이 닫히지 않는다.
       *
       * 사람이 시민인데 탈락한 판도 이 경로로 온다 — 그때 판을 닫는 것은 남은 AI 시민들이다.
       */
      const citizens = state.players.filter(
        (p) => !p.isHuman && p.faction === 'citizen' && !state.eliminated.includes(p.id),
      )
      const votes: Vote[] = await Promise.all(
        citizens.map(async (p) => {
          const spoken = await decider.chooseAccusation(viewFor(state, p.id))
          return { playerId: p.id, accusation: spoken.value, line: spoken.line }
        }),
      )
      return accuseByCouncil(state, votes)
    }
    case 'over':
      return state
  }
}

/**
 * 사람의 선언에 AI들의 선언을 합쳐 한 번에 제출한다.
 *
 * 동시형이라 5명이 한 번에 들어가야 한다. 사람 것만 따로 낼 수 없다.
 */
export async function declareWithHuman(
  state: GameState,
  humanClaim: Claim,
  deciderForRound: DeciderForRound,
): Promise<GameState> {
  const record = lastRound(state)
  const human = humanOf(state)
  const decider = deciderForRound(state.round)

  const others = state.players.filter((p) => record.responderIds.includes(p.id))
  const spokens = await Promise.all(
    others.map(async (p) => {
      // 사람의 선언은 그대로 낸다 — 대사도 없고, legalClaim으로 조용히 바꾸지도 않는다.
      if (p.id === human.id) return [p.id, { value: humanClaim, line: null }] as const
      const spoken = await decider.chooseClaim(viewFor(state, p.id))
      return [p.id, legalSpoken(record.suggestion, spoken)] as const
    }),
  )
  const armed = withPowers(
    state,
    spokens.map(([id, spoken]) => [id, spoken.power] as const),
  )
  return declareAll(armed, claimsOf(spokens), linesOf(spokens))
}

/**
 * 사람이 이의제기를 넘겼을 때. 기회가 AI에게 넘어간다.
 *
 * 사람이 안 잡는다고 아무도 안 잡는 것이 아니다 —
 * 다른 카드 임자가 잡을 수 있고, 그것이 정보가 된다.
 */
export async function passChallenge(
  state: GameState,
  deciderForRound: DeciderForRound,
): Promise<GameState> {
  return offerChallenge(state, deciderForRound(state.round), humanOf(state).id)
}

/** 사람의 결정이 필요한 지점까지 AI만으로 밀고 간다. */
export async function advanceToHuman(
  state: GameState,
  deciderForRound: DeciderForRound,
): Promise<GameState> {
  let current = state
  for (let step = 0; step < 200; step += 1) {
    if (current.phase === 'over' || needsHuman(current)) return current
    current = await stepAi(current, deciderForRound(current.round))
  }
  throw new Error('진행이 멈추지 않는다 — 전이에 구멍이 있다')
}
