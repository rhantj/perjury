import { beforeEach, describe, expect, it } from 'vitest'
import { useGame } from './game'
import { createRuleDecider, ruleDeciderForRound } from '../ai/rule-decider'
import type { Decider, DeciderForRound, FallbackReason } from '../ai/decider'
import { REFUTER_COUNT } from '../engine/setup'
import type { Suggestion } from '../engine/types'

const SUGGESTION: Suggestion = { suspect: 's1', weapon: 'w1', place: 'p1' }

const game = () => useGame.getState()

/**
 * 테스트용 Decider 프로브.
 *
 * 지연은 비동기 창을 만들어 대기 상태를 관측 가능하게 하고,
 * 호출 카운터는 대기 가드가 두 번째 진행을 실제로 막았는지 보여준다.
 * 가드가 막지 못하면 같은 라운드의 판단이 두 벌 돌아 횟수가 배가 된다.
 */
function probeDeciders(ms: number) {
  let claims = 0

  const source = (seed: string): DeciderForRound => {
    const base = createRuleDecider(seed)
    const wait = () => new Promise((resolve) => setTimeout(resolve, ms))
    const probe: Decider = {
      chooseSuggestion: async (view) => {
        await wait()
        return base.chooseSuggestion(view)
      },
      chooseClaim: async (view) => {
        claims += 1
        await wait()
        return base.chooseClaim(view)
      },
      chooseChallengeTarget: async (view) => {
        await wait()
        return base.chooseChallengeTarget(view)
      },
      chooseAccusation: async (view) => {
        await wait()
        return base.chooseAccusation(view)
      },
      speakInParley: async () => null,
    }
    return () => probe
  }

  return { source, claims: () => claims }
}

/**
 * 항상 던지는 판단자. 폴백 래퍼가 사유를 실제로 옮기는지 보려는 것이다.
 * fallbackReason은 예외에 붙은 태그로 전달되므로, 태그만 흉내내면 네트워크가 필요 없다.
 */
function failingDeciders(reason: FallbackReason): DeciderForRound {
  const boom = () => {
    const e = new Error('판단 실패') as Error & { fallbackReason: FallbackReason }
    e.fallbackReason = reason
    throw e
  }
  const decider: Decider = {
    chooseSuggestion: async () => boom(),
    chooseClaim: async () => boom(),
    chooseChallengeTarget: async () => boom(),
    chooseAccusation: async () => boom(),
    speakInParley: async () => boom(),
  }
  return () => decider
}

describe('useGame', () => {
  beforeEach(() => {
    useGame.getState().reset()
  })

  it('시작하기 전에는 시야를 만들 수 없다', () => {
    expect(() => game().view()).toThrow()
    expect(game().awaitingHuman()).toBe(false)
  })

  it('같은 시드로 시작하면 같은 판이 된다', async () => {
    await game().start('same')
    const first = game().state
    await game().start('same')

    expect(game().state).toEqual(first)
  })

  it('시야는 사람 플레이어 기준으로 만들어진다', async () => {
    await game().start('seat', 2)
    const view = game().view()

    expect(view.viewerId).toBe('p2')
    expect(view.players.find((p) => p.id === 'p2')?.isMe).toBe(true)
  })

  it('시작하면 사람 개입 지점까지 AI가 밀고 간다', async () => {
    await game().start('push', 3)

    expect(game().awaitingHuman()).toBe(true)
    expect(game().view().rounds.length).toBeGreaterThan(0)
  })

  it('룰 위반은 상태를 바꾸지 않고 메시지만 남긴다', async () => {
    await game().start('guard', 3) // 사람 차례가 아니므로 제안 페이즈가 아니다
    const before = game().state

    await game().suggest(SUGGESTION)

    expect(game().state).toBe(before)
    expect(game().error).not.toBeNull()
  })

  it('사람이 제안하면 AI 선언까지 자동으로 진행된다', async () => {
    await game().start('flow', 0)
    expect(game().view().phase).toBe('suggest')

    await game().suggest(SUGGESTION)

    // 제안자가 사람이므로 반증 선언은 AI만 하고, 이의제기 지점에서 멈춘다
    expect(game().view().phase).toBe('challenge')
    // 전원이 아니라 추첨으로 뽑힌 좌석만 선언한다.
    expect(game().view().rounds[0]?.declarations).toHaveLength(REFUTER_COUNT)
    expect(game().error).toBeNull()
  })

  it('사람이 이의제기를 넘기면 밀담에서 멈춘다', async () => {
    await game().start('pass', 0)
    await game().suggest(SUGGESTION)
    await game().passChallenge()

    // 라운드를 넘기는 것은 이제 밀담의 두 출구뿐이다 — 건너뛰는 것도 사람의 결정이다.
    expect(game().view().phase).toBe('whisper')
    expect(game().view().round).toBe(1)
  })

  it('밀담을 건너뛰면 라운드가 넘어간다', async () => {
    await game().start('pass', 0)
    await game().suggest(SUGGESTION)
    await game().passChallenge()

    await game().skipParley()

    expect(game().view().round).toBe(2)
  })

  /* humanIndex는 «사람이 추첨에 뽑히는» 자리로 잡았다 — 이 시드에서는 p1·p2가 뽑힌다. */
  it('추첨에 뽑히면 반증 선언을 사람이 한다', async () => {
    await game().start('declare', 1)
    expect(game().view().phase).toBe('refute')

    await game().declare({ kind: 'pass' })

    expect(game().view().rounds[0]?.declarations).toHaveLength(REFUTER_COUNT)
    expect(game().error).toBeNull()
  })

  it('한 판을 끝까지 굴릴 수 있다', async () => {
    await game().start('finish', 0)

    for (let i = 0; i < 100 && game().view().phase !== 'over'; i += 1) {
      const view = game().view()
      if (view.phase === 'suggest') await game().suggest(SUGGESTION)
      else if (view.phase === 'refute') await game().declare({ kind: 'pass' })
      else if (view.phase === 'challenge') await game().passChallenge()
      // 밀담은 매 라운드 사람을 기다린다. 완주 경로에서는 건너뛴다.
      else if (view.phase === 'whisper') await game().skipParley()
      else if (view.phase === 'accuse') await game().accuse(SUGGESTION)
      else break
    }

    expect(game().view().phase).toBe('over')
    expect(game().view().outcome).not.toBeNull()
  })

  it('AI가 판단하는 동안 aiThinking이 true이고 조작이 잠긴다', async () => {
    const started = game().start('think', 3, probeDeciders(5).source)

    expect(game().aiThinking).toBe(true)
    expect(game().awaitingHuman()).toBe(false)

    await started

    expect(game().aiThinking).toBe(false)
    expect(game().awaitingHuman()).toBe(true)
  })

  it('대기 중에 들어온 조작은 무시된다', async () => {
    const probe = probeDeciders(5)
    await game().start('busy', 0, probe.source)
    expect(game().view().phase).toBe('suggest')

    const before = probe.claims()
    const first = game().suggest(SUGGESTION)
    const ignored = game().suggest(SUGGESTION)
    await Promise.all([first, ignored])

    // 제안 한 번이면 추첨에 뽑힌 좌석이 한 번씩 반증을 고른다.
    // 가드가 없으면 두 번째 apply가 같은 상태에서 또 돌아 이 수가 배가 된다.
    expect(probe.claims() - before).toBe(REFUTER_COUNT)
    expect(game().view().rounds).toHaveLength(1)
  })

  it('reset 뒤에 도착한 결과는 버려진다', async () => {
    const started = game().start('late', 3, probeDeciders(5).source)
    game().reset()
    await started

    expect(game().state).toBeNull()
    expect(game().aiThinking).toBe(false)
  })

  it('판단자가 멀쩡하면 폴백 표시가 서지 않는다', async () => {
    await game().start('fallback', 0, (seed) => ruleDeciderForRound(seed))

    expect(game().fallbackRound).toBe(false)
    expect(game().fallbackReason).toBeNull()
  })

  /**
   * humanIndex 1이라 사람 차례 전에 AI가 한 번 제안한다 — 실패는 여기 한 번뿐이다.
   * 낙오 하나로는 배너를 띄우지 않는다(결정 006). 띄우면 멀쩡한 밀담까지 막힌다.
   */
  it('실패가 한 번뿐이면 받아내되 폴백 표시는 서지 않는다', async () => {
    await game().start('fallback', 2, () => failingDeciders('error'))

    expect(game().fallbackRound).toBe(false)
    // 폴백이 받아냈으므로 판은 살아 있어야 한다.
    expect(game().state).not.toBeNull()
    expect(game().error).toBeNull()
  })

  it('같은 라운드에서 실패가 이어지면 라운드를 접고 사유를 남긴다', async () => {
    await game().start('fallback', 2, () => failingDeciders('error'))
    // 사람이 선언하면 나머지 좌석의 판단이 한꺼번에 나간다 — 여기서 차단기가 내려간다.
    await game().declare({ kind: 'pass' })

    expect(game().fallbackRound).toBe(true)
    expect(game().fallbackReason).toBe('error')
    expect(game().state).not.toBeNull()
    expect(game().error).toBeNull()
  })

  it('예산 소진은 사유가 budget으로 구분된다', async () => {
    await game().start('fallback', 2, () => failingDeciders('budget'))
    await game().declare({ kind: 'pass' })

    expect(game().fallbackReason).toBe('budget')
  })
})

/**
 * 시드마다 사람이 받는 직업이 다르다. 아래 시드는 p0에게 각각 검시관·약제사를 준다.
 */
describe('능력 발동', () => {
  beforeEach(() => {
    useGame.getState().reset()
  })

  it('검시관은 상대의 손패 1장을 확인한다', async () => {
    await game().start('power-s3', 0)
    const target = game().view().players.find((p) => !p.isMe)
    if (!target) throw new Error('상대가 없다')

    game().usePower({ targetId: target.id })

    const found = game().view().findings[0]?.finding
    if (found?.kind !== 'hand') throw new Error('finding 종류가 다르다')
    expect(found.targetId).toBe(target.id)
    expect(game().powerUsed()).toBe(true)
  })

  /*
   * 「已使」와 「아직 안 걸렸다」는 다른 상태다(룰 개편 §2-7).
   * 화면이 powersUsed(지목 시점)만 보면 대기 중인 능력이 다 쓴 것으로 보인다.
   * 변호사가 특히 문제다 — 다 썼다고 읽고 있는데 나중에 거부 버튼이 나타난다.
   */
  it('걸어만 두고 아직 안 걸린 능력은 대기로 읽힌다', async () => {
    await game().start('power-s5', 0)
    expect(game().role().effect).toBe('photograph')
    const target = game().view().players.find((p) => !p.isMe)
    if (!target) throw new Error('상대가 없다')

    game().usePower({ targetId: target.id })

    expect(game().powerUsed()).toBe(true)
    expect(game().powerWaiting()).toBe(true)
  })

  it('그 자리에서 답이 나오는 능력은 대기가 아니다', async () => {
    await game().start('power-s3', 0)
    const target = game().view().players.find((p) => !p.isMe)
    if (!target) throw new Error('상대가 없다')

    game().usePower({ targetId: target.id })

    expect(game().powerUsed()).toBe(true)
    expect(game().powerWaiting()).toBe(false)
  })

  it('아직 안 쓴 능력은 대기가 아니다', async () => {
    await game().start('power-s5', 0)

    expect(game().powerWaiting()).toBe(false)
  })

  it('약제사는 수단 카드의 정답 여부를 확인한다', async () => {
    await game().start('power-s23', 0)

    game().usePower({ cardId: 'w1' })

    const found = game().view().findings[0]?.finding
    if (found?.kind !== 'weapon') throw new Error('finding 종류가 다르다')
    expect(found.cardId).toBe('w1')
  })

  /**
   * 대상이 빠진 발동은 화면 실수다. 판을 오류로 멈추지 않고 조용히 무시해야 한다.
   *
   * 「effect가 null인 직업」으로 이걸 확인하지 않는다 — 그 직업들을 하나씩 구현하는 중이라
   * 시드가 어떤 직업을 뽑느냐에 테스트가 매달리게 된다.
   */
  it('대상이 빠진 발동은 아무 일도 하지 않는다', async () => {
    await game().start('power-s3', 0)
    expect(game().role().effect).toBe('inspect-hand')
    const before = game().state

    game().usePower({})

    expect(game().state).toBe(before)
    expect(game().powerUsed()).toBe(false)
  })

  it('한 판에 두 번은 못 쓴다 — 두 번째는 오류만 남고 상태는 그대로다', async () => {
    await game().start('power-s3', 0)
    game().usePower({ targetId: 'p1' })
    const after = game().state

    game().usePower({ targetId: 'p2' })

    expect(game().state).toBe(after)
    expect(game().error).not.toBeNull()
  })

  /** 대상이 빠진 발동은 화면 실수다. 판을 오류로 멈추지 않고 조용히 무시한다. */
  it('대상이 없으면 조용히 무시한다', async () => {
    await game().start('power-s3', 0)
    const before = game().state

    game().usePower({})

    expect(game().state).toBe(before)
    expect(game().error).toBeNull()
  })

  /** 다른 조작과 같은 잠금이다. AI가 도는 중에 상태를 갈아끼우면 판단이 옛 상태 위에서 끝난다. */
  it('AI가 판단하는 동안에는 발동되지 않는다', async () => {
    const started = game().start('power-s3', 0, probeDeciders(5).source)
    expect(game().aiThinking).toBe(true)

    game().usePower({ targetId: 'p1' })
    expect(game().powerUsed()).toBe(false)

    await started
  })

  it('능력은 페이즈를 넘기지 않는다 — 판단 전이가 아니다', async () => {
    await game().start('power-s3', 0)
    const phase = game().view().phase
    const round = game().view().round

    game().usePower({ targetId: 'p1' })

    expect(game().view().phase).toBe(phase)
    expect(game().view().round).toBe(round)
  })
})

describe('밀담', () => {
  /** 밀담에만 답하는 판단자. 나머지는 규칙 기반 그대로다. */
  function talkingDeciders(reply: string | null): DeciderForRound {
    const source = (seed: string): DeciderForRound => {
      const base = createRuleDecider(seed)
      const decider: Decider = {
        ...base,
        speakInParley: async () => (reply === null ? null : { line: reply, truthful: null }),
      }
      return () => decider
    }
    return source('parley-store')
  }

  async function atWhisper() {
    await game().start('store-parley', 0, () => talkingDeciders('못 봤소'))
    // 밀담 페이즈에 설 때까지 사람의 차례를 규칙대로 넘긴다.
    return game()
  }

  it('askParley는 상대의 대사를 돌려주고 엔진을 건드리지 않는다', async () => {
    await atWhisper()
    const before = game().state

    const reply = await game().askParley('p1', '왜 침묵했지')

    expect(reply?.line).toBe('못 봤소')
    expect(game().state).toBe(before)
  })

  it('판단자가 침묵하면 null이다 — 화면은 밀담을 닫는다', async () => {
    await game().start('store-parley', 0, () => talkingDeciders(null))

    expect(await game().askParley('p1', '묻는다')).toBeNull()
  })

  /**
   * 폴백은 «게임이 끝까지 간다»가 요점이다(절대규칙 4). 밀담이 닫히면 라운드를 넘기는
   * 두 출구 중 하나가 사라지므로, 규칙 기반 판단자도 반드시 답해야 한다.
   */
  it('규칙 기반 판단자도 밀담에 답한다', async () => {
    await game().start('rule-parley', 0, (seed) => ruleDeciderForRound(seed))

    const reply = await game().askParley('p1', '왜 침묵했지')

    expect(reply).not.toBeNull()
    expect(reply?.line.length).toBeGreaterThan(0)
  })

  it('상대가 다르면 다른 말이 나온다 — 여섯이 한목소리로 답하지 않는다', async () => {
    await game().start('rule-parley', 0, (seed) => ruleDeciderForRound(seed))

    const replies = await Promise.all(
      ['p1', 'p2', 'p3', 'p4', 'p5'].map((id) => game().askParley(id, '묻는다')),
    )

    expect(new Set(replies).size).toBeGreaterThan(1)
  })
})

describe('전화교환수의 회선', () => {
  beforeEach(() => {
    useGame.getState().reset()
  })

  /** 엔진은 직업을 모른다. 회선 수를 정하는 것은 배정표를 아는 store다. */
  it('사람이 전화교환수면 라운드당 밀담이 두 건이다', async () => {
    await game().start('op-14', 0)

    expect(game().role().effect).toBe('eavesdrop')
    expect(game().state?.parleyAllowance).toBe(2)
  })

  it('다른 직업이면 한 건이다', async () => {
    await game().start('power-s3', 0)

    expect(game().role().effect).toBe('inspect-hand')
    expect(game().state?.parleyAllowance).toBe(1)
  })
})
