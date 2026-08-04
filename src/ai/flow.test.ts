import { describe, expect, it } from 'vitest'
import { declareAll, suggest } from '../engine/round'
import { createGame } from '../engine/setup'
import type { Claim, GameState, PlayerId, Suggestion } from '../engine/types'
import type { Decider, DeciderForRound } from './decider'
import { silent } from './decider'
import { advanceToHuman, declareWithHuman, needsHuman, passChallenge, stepAi } from './flow'
import { createRuleDecider, ruleDeciderForRound } from './rule-decider'

/** 사람이 지정한 진영인 판을 찾는다. 진영은 시드마다 다르다. */
function gameWhereHumanIs(faction: 'citizen' | 'culprit'): GameState {
  for (let i = 0; i < 60; i += 1) {
    const game = createGame({ seed: `flow-${faction}-${i}` })
    if (game.players.find((p) => p.isHuman)?.faction === faction) return game
  }
  throw new Error('해당 진영의 판을 찾지 못했다')
}

/** 테스트에서 판마다 필요한 Decider 팩토리. */
const deciders = (game: GameState) => ruleDeciderForRound(game.seed)

describe('needsHuman — 개입 지점', () => {
  it('내 차례의 제안은 사람이 한다', () => {
    const game = createGame({ seed: 'turn', humanIndex: 0 })

    expect(game.turnIndex).toBe(0)
    expect(needsHuman(game)).toBe(true)
  })

  it('남의 차례 제안은 AI가 한다', () => {
    const game = createGame({ seed: 'turn', humanIndex: 3 })

    expect(needsHuman(game)).toBe(false)
  })

  it('내가 제안자가 아니면 반증 선언은 사람이 한다', async () => {
    const initial = createGame({ seed: 'refute', humanIndex: 3 })
    const game = await advanceToHuman(initial, deciders(initial))

    expect(game.phase).toBe('refute')
    expect(needsHuman(game)).toBe(true)
  })

  it('밀담 페이즈에서는 사람이 상대를 고른다', () => {
    const game = createGame({ seed: 'w', humanIndex: 0 })

    expect(needsHuman({ ...game, phase: 'whisper' })).toBe(true)
  })

  it('판이 끝나면 개입 지점이 없다', () => {
    const game = createGame({ seed: 'o', humanIndex: 0 })

    expect(needsHuman({ ...game, phase: 'over' })).toBe(false)
  })
})

describe('advanceToHuman — AI 자동 진행', () => {
  it('사람 차례가 아니면 AI가 밀고 간다', async () => {
    const initial = createGame({ seed: 'push', humanIndex: 3 })
    const game = await advanceToHuman(initial, deciders(initial))

    expect(needsHuman(game)).toBe(true)
    expect(game.rounds.length).toBeGreaterThan(0)
  })

  it('이미 사람 차례면 아무것도 하지 않는다', async () => {
    const game = createGame({ seed: 'stay', humanIndex: 0 })

    expect(await advanceToHuman(game, deciders(game))).toBe(game)
  })

  it('같은 시드는 같은 지점에서 멈춘다', async () => {
    const first = createGame({ seed: 'det', humanIndex: 2 })
    const second = createGame({ seed: 'det', humanIndex: 2 })
    const a = await advanceToHuman(first, deciders(first))
    const b = await advanceToHuman(second, deciders(second))

    expect(b).toEqual(a)
  })

  it('사람이 범인이면 최종 고발까지 AI가 진행한다', async () => {
    let game = gameWhereHumanIs('culprit')
    const forRound = deciders(game)

    for (let i = 0; i < 60 && game.phase !== 'over'; i += 1) {
      game = await advanceToHuman(game, forRound)
      if (game.phase === 'over') break
      game = await stepAi(game, forRound(game.round)) // 사람 자리를 규칙 AI로 대신 둔다
    }

    expect(game.phase).toBe('over')
    expect(game.outcome?.accuser.kind).toBe('council')
  })

  it('사람이 시민이면 고발 지점에서 멈춘다', async () => {
    let game = gameWhereHumanIs('citizen')
    const forRound = deciders(game)

    for (let i = 0; i < 60 && game.phase !== 'accuse'; i += 1) {
      game = await advanceToHuman(game, forRound)
      if (game.phase === 'accuse') break
      game = await stepAi(game, forRound(game.round))
    }

    expect(game.phase).toBe('accuse')
    expect(needsHuman(game)).toBe(true)
  })
})

/**
 * LLM은 스키마상 «누구든» 지목할 수 있다 — 룰을 스키마에 복제하지 않기로 했기 때문이다(설계 §5.3).
 * 그래서 성립하지 않는 지목이 실제로 올라온다. 그것을 엔진에 그대로 넣으면 엔진이 던지고,
 * 라운드가 그 자리에 멈춘다. 배포본에서 이의제기 페이즈가 안 넘어간 원인이 이것이다.
 */
describe('이의제기 — 성립하지 않는 지목', () => {
  function playerAt(state: GameState, index: number) {
    const player = state.players[index]
    if (!player) throw new Error('플레이어가 없다')
    return player
  }

  /** 제안 뒤 전원이 침묵을 선언한 이의제기 페이즈. 잡을 대상이 하나도 없는 판이다. */
  function allPassed(): GameState {
    const game = createGame({ seed: 'challenge-illegal', humanIndex: 1 })
    const suggester = playerAt(game, game.turnIndex)
    const suggested = suggest(game, suggester.id, { suspect: 's1', weapon: 'w1', place: 'p1' })
    const claims = new Map<PlayerId, Claim>(
      suggested.players
        .filter((p) => p.id !== suggester.id)
        .map((p) => [p.id, { kind: 'pass' } as Claim]),
    )
    return declareAll(suggested, claims)
  }

  /** 항상 «앞사람»을 지목한다. 전원이 침묵했으므로 어느 지목도 성립하지 않는다. */
  function alwaysPoints(state: GameState): DeciderForRound {
    const decider: Decider = {
      chooseSuggestion: () => Promise.reject(new Error('부르면 안 된다')),
      chooseClaim: () => Promise.reject(new Error('부르면 안 된다')),
      chooseChallengeTarget: (view) => {
        const other = state.players.find((p) => p.id !== view.viewerId)
        return Promise.resolve(silent(other ? other.id : null))
      },
      chooseAccusation: () => Promise.reject(new Error('부르면 안 된다')),
      speakInParley: () => Promise.reject(new Error('부르면 안 된다')),
    }
    return () => decider
  }

  it('stepAi — 성립하지 않는 지목은 «안 잡는다»로 읽고 라운드를 닫는다', async () => {
    const state = allPassed()

    const next = await stepAi(state, alwaysPoints(state)(state.round))

    expect(next.phase).toBe('whisper')
    expect(next.rounds[next.rounds.length - 1]?.challenge).toBeNull()
  })

  it('passChallenge — 사람이 넘긴 뒤에도 라운드가 멈추지 않는다', async () => {
    const state = allPassed()

    const next = await passChallenge(state, alwaysPoints(state))

    expect(next.phase).toBe('whisper')
  })

  it('성립하는 지목은 그대로 이의제기가 된다', async () => {
    const game = createGame({ seed: 'challenge-legal', humanIndex: 1 })
    const suggester = playerAt(game, game.turnIndex)
    const suggested = suggest(game, suggester.id, { suspect: 's1', weapon: 'w1', place: 'p1' })
    const responders = suggested.players.filter((p) => p.id !== suggester.id)
    const first = responders[0]
    if (!first) throw new Error('응답자가 없다')
    const claims = new Map<PlayerId, Claim>(
      responders.map((p) => [
        p.id,
        p.id === first.id ? { kind: 'refute', cardId: 's1' } : { kind: 'pass' },
      ]),
    )
    const state = declareAll(suggested, claims)

    const decider: Decider = {
      chooseSuggestion: () => Promise.reject(new Error('부르면 안 된다')),
      chooseClaim: () => Promise.reject(new Error('부르면 안 된다')),
      chooseChallengeTarget: (view) =>
        Promise.resolve(silent(view.viewerId === first.id ? null : first.id)),
      chooseAccusation: () => Promise.reject(new Error('부르면 안 된다')),
      speakInParley: () => Promise.reject(new Error('부르면 안 된다')),
    }

    const next = await stepAi(state, decider)

    expect(next.rounds[next.rounds.length - 1]?.challenge?.targetId).toBe(first.id)
  })

  /**
   * 묻는 것은 병렬이어도 «먼저 잡는 사람»은 좌석 순서로 정해야 한다.
   * 응답 도착 순서로 정하면 같은 판이 네트워크 운에 따라 다르게 끝난다.
   */
  it('여럿이 잡으려 하면 앞 좌석이 가져간다 — 응답 순서가 아니라', async () => {
    const game = createGame({ seed: 'challenge-order', humanIndex: 1 })
    const suggester = playerAt(game, game.turnIndex)
    const suggested = suggest(game, suggester.id, { suspect: 's1', weapon: 'w1', place: 'p1' })
    const responders = suggested.players.filter((p) => p.id !== suggester.id)
    const target = responders[0]
    if (!target) throw new Error('응답자가 없다')
    const claims = new Map<PlayerId, Claim>(
      responders.map((p) => [
        p.id,
        p.id === target.id ? { kind: 'refute', cardId: 's1' } : { kind: 'pass' },
      ]),
    )
    const state = declareAll(suggested, claims)

    /** 전원이 같은 대상을 지목한다. 뒷좌석일수록 «빨리» 답한다. */
    const seatOf = new Map(state.players.map((p, index) => [p.id, index]))
    const decider: Decider = {
      chooseSuggestion: () => Promise.reject(new Error('부르면 안 된다')),
      chooseClaim: () => Promise.reject(new Error('부르면 안 된다')),
      chooseChallengeTarget: (view) =>
        new Promise((resolve) => {
          const seat = seatOf.get(view.viewerId) ?? 0
          setTimeout(() => resolve(silent(target.id)), (state.players.length - seat) * 5)
        }),
      chooseAccusation: () => Promise.reject(new Error('부르면 안 된다')),
      speakInParley: () => Promise.reject(new Error('부르면 안 된다')),
    }

    const next = await stepAi(state, decider)

    // 대상 본인은 자기를 못 잡으므로, 그를 제외한 가장 앞 좌석이 잡아야 한다.
    const expected = state.players.find((p) => p.id !== target.id)
    expect(next.rounds[next.rounds.length - 1]?.challenge?.challengerId).toBe(expected?.id)
  })
})

/**
 * 같은 결함이 반증 경로에도 있다. 스키마는 전체 카드를 허용하지만 엔진은 제안된 3장만 받는다.
 * 반증은 라운드마다 5번 나가므로 이쪽이 더 자주 터진다.
 */
describe('반증 — 제안에 없는 카드', () => {
  function suggested() {
    const game = createGame({ seed: 'refute-illegal', humanIndex: 1 })
    const suggester = game.players[game.turnIndex]
    if (!suggester) throw new Error('제안자가 없다')
    return suggest(game, suggester.id, { suspect: 's1', weapon: 'w1', place: 'p1' })
  }

  /** 제안에 없는 카드(s6)로 반증하겠다고 우긴다. */
  const stubborn: Decider = {
    chooseSuggestion: () => Promise.reject(new Error('부르면 안 된다')),
    chooseClaim: () => Promise.resolve(silent<Claim>({ kind: 'refute', cardId: 's6' })),
    chooseChallengeTarget: () => Promise.resolve(silent(null)),
    chooseAccusation: () => Promise.reject(new Error('부르면 안 된다')),
    speakInParley: () => Promise.reject(new Error('부르면 안 된다')),
  }

  it('stepAi — 침묵으로 읽고 라운드를 계속 밀고 간다', async () => {
    const next = await stepAi(suggested(), stubborn)

    expect(next.phase).toBe('challenge')
    const declarations = next.rounds[next.rounds.length - 1]?.declarations ?? []
    expect(declarations.every((d) => d.claim.kind === 'pass')).toBe(true)
  })

  it('declareWithHuman — AI 선언만 좁히고 사람 선언은 그대로 낸다', async () => {
    const state = suggested()

    const next = await declareWithHuman(state, { kind: 'refute', cardId: 's1' }, () => stubborn)

    const declarations = next.rounds[next.rounds.length - 1]?.declarations ?? []
    const human = next.players.find((p) => p.isHuman)
    const mine = declarations.find((d) => d.playerId === human?.id)
    expect(mine?.claim).toEqual({ kind: 'refute', cardId: 's1' })
    expect(declarations.filter((d) => d.playerId !== human?.id).every((d) => d.claim.kind === 'pass')).toBe(true)
  })
})

/**
 * 대사가 판단자에서 엔진 기록까지 실제로 닿는가. 중간에 한 군데만 빠져도 화면에는 아무것도 안 뜬다.
 * 판단은 규칙 기반과 같게 두고 «대사만» 붙인 판단자로 확인한다.
 */
describe('대사 전달', () => {
  /** 무엇을 고르든 좌석 이름이 섞인 대사를 함께 낸다. */
  function talkative(state: GameState): Decider {
    const suggestion: Suggestion = { suspect: 's1', weapon: 'w1', place: 'p1' }
    return {
      chooseSuggestion: (view) => Promise.resolve({ value: suggestion, line: `${view.viewerId} 제안` }),
      chooseClaim: (view) =>
        Promise.resolve({ value: { kind: 'pass' } as Claim, line: `${view.viewerId} 반증` }),
      chooseChallengeTarget: (view) => {
        const target = state.players.find((p) => p.id !== view.viewerId)
        return Promise.resolve({ value: target ? target.id : null, line: `${view.viewerId} 이의` })
      },
      chooseAccusation: (view) => Promise.resolve({ value: suggestion, line: `${view.viewerId} 고발` }),
      speakInParley: () => Promise.reject(new Error('부르면 안 된다')),
    }
  }

  it('제안 대사가 라운드 기록에 남는다', async () => {
    const game = createGame({ seed: 'line-suggest', humanIndex: 3 })

    const next = await stepAi(game, talkative(game))

    expect(next.rounds[0]?.suggestionLine).toBe(`${next.rounds[0]?.suggesterId} 제안`)
  })

  it('반증 대사가 선언자별로 남는다', async () => {
    const game = createGame({ seed: 'line-refute', humanIndex: 3 })
    const suggested = await stepAi(game, talkative(game))

    const next = await stepAi(suggested, talkative(suggested))

    const declarations = next.rounds[0]?.declarations ?? []
    expect(declarations).not.toHaveLength(0)
    expect(declarations.every((d) => d.line === `${d.playerId} 반증`)).toBe(true)
  })

  it('사람의 선언에는 대사가 붙지 않는다', async () => {
    const game = createGame({ seed: 'line-human', humanIndex: 3 })
    const suggested = await advanceToHuman(game, () => talkative(game))

    const next = await declareWithHuman(suggested, { kind: 'pass' }, () => talkative(suggested))

    const human = next.players.find((p) => p.isHuman)
    const mine = (next.rounds[0]?.declarations ?? []).find((d) => d.playerId === human?.id)
    expect(mine?.line).toBeNull()
  })

  it('이의제기 대사는 «실제로 잡은 사람»의 것만 남는다', async () => {
    const game = createGame({ seed: 'line-challenge', humanIndex: 1 })
    const suggester = game.players[game.turnIndex]
    if (!suggester) throw new Error('제안자가 없다')
    const suggested = suggest(game, suggester.id, { suspect: 's1', weapon: 'w1', place: 'p1' })
    const responders = suggested.players.filter((p) => p.id !== suggester.id)
    const target = responders[0]
    if (!target) throw new Error('응답자가 없다')
    const state = declareAll(
      suggested,
      new Map<PlayerId, Claim>(
        responders.map((p) => [
          p.id,
          p.id === target.id ? { kind: 'refute', cardId: 's1' } : { kind: 'pass' },
        ]),
      ),
    )

    const next = await stepAi(state, talkative(state))

    const record = next.rounds[next.rounds.length - 1]?.challenge
    expect(record?.line).toBe(`${record?.challengerId} 이의`)
  })
})

describe('stepAi — 밀담 페이즈', () => {
  /** 전원이 침묵을 선언한 라운드. 밀담 페이즈로 강제 전환해 쓴다. */
  function passedRound(): GameState {
    const game = createGame({ seed: 'flow-whisper', humanIndex: 0 })
    const suggester = game.players[game.turnIndex]
    if (!suggester) throw new Error('제안자를 찾을 수 없다')
    const suggested = suggest(game, suggester.id, { suspect: 's1', weapon: 'w1', place: 'p1' })
    const claims = new Map<PlayerId, Claim>(
      suggested.players
        .filter((p) => p.id !== suggester.id)
        .map((p) => [p.id, { kind: 'pass' } as Claim]),
    )
    return declareAll(suggested, claims)
  }

  it('AI만 도는 경로에서는 밀담을 건너뛰고 라운드를 넘긴다', async () => {
    const base = passedRound()
    const whisper: GameState = { ...base, phase: 'whisper' }

    const next = await stepAi(whisper, createRuleDecider('flow-whisper'))

    expect(next.round).toBe(base.round + 1)
    expect(next.rounds[next.rounds.length - 1]?.parley).toBeNull()
  })
})
