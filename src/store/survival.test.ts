import { beforeEach, describe, expect, it } from 'vitest'
import { useGame } from './game'
import type { Decider, DeciderForRound, FallbackReason } from '../ai/decider'
import { cardKind, cardsOfKind } from '../engine/cards'
import { CHALLENGE_LIMIT, challengesUsedIn } from '../engine/challenge'
import { needsOf, usableIn } from '../engine/power'
import { PARLEY_LIMIT, parleysUsedIn } from '../engine/parley'
import type { Claim, PlayerId, Suggestion } from '../engine/types'

/**
 * **절대 규칙 4의 증명.** 프록시가 죽어도 판이 끝까지 가는가.
 *
 * 기존 폴백 테스트는 «한 라운드»만 본다 — 배너가 서는지, 사유가 옮겨지는지.
 * 그런데 안전선의 약속은 라운드가 아니라 판이다(D8). 중간에 한 페이즈라도 멈추면
 * 심사자는 멈춘 화면을 본다. 그래서 여기서는 판단자가 **처음부터 끝까지 죽어 있는 상태로**
 * 앱이 실제로 쓰는 배선(store + 폴백 래퍼)을 통해 한 판을 완주시킨다.
 *
 * autoPlay(ai/autoplay.ts)와 다른 것을 본다. 그쪽은 규칙 기반 판단자를 «직접» 꽂아
 * 사람 자리까지 AI가 두지만, 이쪽은 사람이 조작하는 경로로 굴린다 —
 * 실제 장애는 그 경로에서 난다.
 */

const game = () => useGame.getState()

/** 무엇을 묻든 던지는 판단자. 프록시가 완전히 죽은 상태다. */
function deadDecider(reason: FallbackReason): DeciderForRound {
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

/** 아무 제안이나 하나. 무엇을 고르는지는 완주와 무관하다. */
function anySuggestion(): Suggestion {
  return { suspect: 's1', weapon: 'w1', place: 'p1' }
}

/**
 * 지금 낼 수 있는 선언. 제안된 셋 중 손에 있는 것이 있으면 반증하고, 없으면 넘긴다.
 * 「거부」는 고르지 않는다 — 능력 없이 내면 엔진이 던진다(engine/round.ts).
 */
function legalClaim(): Claim {
  const view = game().view()
  const me = view.players.find((p) => p.isMe)
  const record = view.rounds[view.rounds.length - 1]
  if (!me || !record) throw new Error('내 자리나 라운드가 없다')

  const { suspect, weapon, place } = record.suggestion
  const held = [suspect, weapon, place].find((card) => me.hand?.includes(card))
  return held ? { kind: 'refute', cardId: held } : { kind: 'pass' }
}

/**
 * 지금 말을 걸 수 있는 상대. 없으면 null이다.
 *
 * **화면과 같은 관문을 쓴다.** Parley.tsx는 판당 예산이 마르면 상대 목록을 감추고
 * 「넘어간다」만 남긴다 — 여기서 그 관문을 흉내내지 않으면 제품에 없는 경로를 시험하게 된다.
 */
function parleyTarget(): PlayerId | null {
  const view = game().view()
  if (PARLEY_LIMIT - parleysUsedIn(view.rounds) <= 0) return null

  const record = view.rounds[view.rounds.length - 1]
  const spoken = record?.round === view.round ? record.parleys : []
  const other = view.players.find(
    (p) => !p.isMe && !spoken.some((done) => done.targetId === p.id),
  )
  return other ? other.id : null
}

/**
 * 지금 이의제기를 걸 수 있는 상대. 없으면 null이다.
 *
 * **화면과 같은 관문을 쓴다**(GameScreen.tsx) — 판당 상한, 낼 수 있는 패, 그리고
 * 반증을 선언한 남의 자리. 엔진이 거절하기 «전에» 눌리지 않아야 한다.
 */
function challengeTarget(): PlayerId | null {
  const view = game().view()
  const me = view.players.find((p) => p.isMe)
  if (!me) throw new Error('내 자리가 없다')
  if (CHALLENGE_LIMIT - challengesUsedIn(view.rounds, view.viewerId) <= 0) return null

  const hidden = (me.hand ?? []).filter((c) => !me.revealed.includes(c))
  if (hidden.length === 0) return null

  const record = view.rounds[view.rounds.length - 1]
  const target = (record?.declarations ?? []).find(
    (d) => d.claim.kind === 'refute' && d.playerId !== view.viewerId,
  )
  return target ? target.playerId : null
}

/**
 * 쓸 수 있으면 능력을 쓴다. 이미 썼거나 지금 쓸 수 없는 능력이면 아무 일도 하지 않는다.
 *
 * 대상은 화면과 같은 방식으로 고른다 — 종류는 «좌석의 직업»에서 나오므로
 * 여기서 정하는 것은 대상뿐이다(store.usePower, 작업 규칙 2).
 */
function useAnyPower(): void {
  const view = game().view()
  const effect = game().role().effect
  if (effect === null || game().powerUsed()) return
  if (!usableIn(effect, view)) return

  switch (needsOf(effect)) {
    case 'none':
      game().usePower({})
      return
    case 'weapon': {
      const card = cardsOfKind('weapon')[0]
      if (card) game().usePower({ cardId: card.id })
      return
    }
    case 'player': {
      const other = view.players.find((p) => !p.isMe)
      if (other) game().usePower({ targetId: other.id })
      return
    }
  }
}

type Whisper = 'skip' | 'talk'

/**
 * 사람이 실제로 누를 수 있는 것을 전부 눌러본다.
 *
 * 능력과 이의제기는 판단자를 거치지 않는 «순수 엔진 호출»이라, 폴백과 무관해 보인다.
 * 그런데 그 둘이 남기는 것(pending·grants·공개된 패)은 다음 페이즈의 입력이 된다 —
 * 협잡꾼이 남의 반증을 바꾸고, 밀정이 이의제기를 막고, 변호사가 「거부」를 만든다.
 * 판단자가 죽은 상태에서 그 결합이 판을 세우지 않는지 보려면 실제로 눌러야 한다.
 */
type Aggression = 'quiet' | 'loud'

/** 밀담이 아닌 페이즈를 한 걸음 민다. 밀담까지 도달하려면 그 앞을 지나야 한다. */
async function playOneStep(): Promise<void> {
  switch (game().view().phase) {
    case 'suggest':
      return game().suggest(anySuggestion())
    case 'refute':
      return game().declare(legalClaim())
    case 'challenge':
      return game().passChallenge()
    case 'whisper':
      return game().skipParley()
    case 'accuse':
      return game().accuse(anySuggestion())
    case 'over':
      return
  }
}

/**
 * 사람 자리를 대신 눌러 판을 끝까지 민다.
 *
 * 한 걸음도 진전이 없으면 즉시 멈춘다 — 그것이 «판이 섰다»의 정의다.
 * 200은 8라운드 × 페이즈 수보다 넉넉하다. 넘으면 전이에 구멍이 있다는 뜻이다.
 */
async function playToEnd(whisper: Whisper, aggression: Aggression = 'quiet'): Promise<void> {
  for (let step = 0; step < 200; step += 1) {
    const view = game().view()
    if (view.phase === 'over') return
    if (aggression === 'loud') useAnyPower()
    if (!game().awaitingHuman()) throw new Error(`사람 차례가 아닌 채로 멈췄다: ${view.phase}`)

    switch (view.phase) {
      case 'suggest':
        await game().suggest(anySuggestion())
        break
      case 'refute':
        await game().declare(legalClaim())
        break
      case 'challenge': {
        const target = aggression === 'loud' ? challengeTarget() : null
        if (target === null) await game().passChallenge()
        else await game().challenge(target)
        break
      }
      case 'whisper': {
        const target = whisper === 'talk' ? parleyTarget() : null
        if (target === null) {
          await game().skipParley()
          break
        }
        const reply = await game().askParley(target, '그날 밤 어디에 있었소')
        // 답이 없으면 대화가 성립하지 않는다. 그때도 나가는 문은 열려 있어야 한다.
        if (reply === null) await game().skipParley()
        else await game().parley(target, '그날 밤 어디에 있었소', reply.line, reply.truthful)
        break
      }
      case 'accuse':
        await game().accuse(anySuggestion())
        break
      // 'over'는 위에서 이미 빠져나갔다 — 여기 오면 타입이 안 맞는다.
    }
  }

  throw new Error(`판이 끝나지 않았다 — ${game().view().phase}에서 멈췄다`)
}

beforeEach(() => {
  game().reset()
})

describe('판단자가 죽은 채로 완주 (절대 규칙 4)', () => {
  /** 시드를 바꾸면 진영·직업·손패가 전부 갈린다. 한 판만 보면 운으로 통과할 수 있다. */
  const SEEDS = ['dead-1', 'dead-2', 'dead-3', 'dead-4', 'dead-5']

  it.each(SEEDS)('프록시 장애로 시작해도 판이 끝난다 — %s', async (seed) => {
    await game().start(seed, 0, () => deadDecider('error'))

    await playToEnd('skip')

    expect(game().view().phase).toBe('over')
    expect(game().error).toBeNull()
  })

  it.each(SEEDS)('밀담까지 걸면서도 끝난다 — %s', async (seed) => {
    await game().start(seed, 0, () => deadDecider('error'))

    await playToEnd('talk')

    expect(game().view().phase).toBe('over')
    expect(game().error).toBeNull()
  })

  it('예산이 마른 판도 끝난다', async () => {
    await game().start('dead-budget', 0, () => deadDecider('budget'))

    await playToEnd('skip')

    expect(game().view().phase).toBe('over')
    expect(game().fallbackReason).toBe('budget')
  })

  /**
   * 사람이 범인이면 고발을 시민 AI가 한다. 그 경로도 죽은 판단자를 지난다.
   *
   * **조건에 맞는 시드를 찾을 때까지 늘린다.** 고정 시드 몇 개에 기대면, 엔진 셋업의
   * rng 파생 순서가 바뀌는 것만으로 이 테스트가 «무관한 이유로» 깨진다 —
   * 재는 것은 완주지 시드가 아니다.
   */
  it('사람이 범인인 판도 끝난다', async () => {
    for (let i = 0; i < 40; i += 1) {
      game().reset()
      await game().start(`dead-culprit-${i}`, 0, () => deadDecider('error'))
      if (game().view().players.find((p) => p.isMe)?.faction !== 'culprit') continue

      await playToEnd('skip')

      expect(game().view().phase).toBe('over')
      expect(game().error).toBeNull()
      return
    }
    throw new Error('40개 시드 안에 사람이 범인인 판이 없다 — 진영 배정이 깨졌을 수 있다')
  })

  /**
   * 능력과 이의제기는 판단자를 거치지 않는 순수 엔진 호출이라 폴백과 무관해 보인다.
   * 그런데 그 둘이 남기는 것(pending·grants·공개된 패)은 다음 페이즈의 입력이 된다 —
   * 협잡꾼이 남의 반증을 바꾸고, 밀정이 이의제기를 막고, 변호사가 「거부」를 만든다.
   * 죽은 판단자 아래에서 그 결합이 판을 세우지 않는지 실제로 눌러서 본다.
   */
  it.each(SEEDS)('능력을 쓰고 이의제기를 걸어도 끝난다 — %s', async (seed) => {
    await game().start(seed, 0, () => deadDecider('error'))

    await playToEnd('talk', 'loud')

    expect(game().view().phase).toBe('over')
    expect(game().error).toBeNull()
  })

  /** 위 시나리오가 실제로 능력과 이의제기를 지나갔는지 — 안 눌렸으면 아무것도 재지 않은 것이다. */
  it('loud 모드는 능력과 이의제기를 실제로 지나간다', async () => {
    const used: string[] = []
    for (const seed of SEEDS) {
      game().reset()
      await game().start(seed, 0, () => deadDecider('error'))
      await playToEnd('talk', 'loud')

      if (game().powerUsed()) used.push(`${seed}:power`)
      if (game().view().rounds.some((r) => r.challenge !== null)) used.push(`${seed}:challenge`)
    }

    expect(used.some((u) => u.endsWith(':power')), '능력이 한 번도 안 쓰였다').toBe(true)
    expect(used.some((u) => u.endsWith(':challenge')), '이의제기가 한 번도 없었다').toBe(true)
  })

  /**
   * 밀담 예산이 마른 뒤에도 **나가는 문은 열려 있어야 한다.**
   *
   * `parley()`는 예산이 마르면 던지므로, 그때 화면이 상대 목록을 계속 내주면 판이 그 자리에 선다.
   * 화면은 `left > 0`으로 목록을 감추고 「넘어간다」만 남긴다(Parley.tsx) — 그 약속을 여기서 묶는다.
   */
  it('밀담을 다 쓴 뒤에도 넘어가기로 라운드가 넘어간다', async () => {
    await game().start('dead-exit', 0, () => deadDecider('error'))

    // 예산을 다 쓸 때까지 말을 건다.
    for (let step = 0; step < 200 && parleyTarget() !== null; step += 1) {
      if (game().view().phase !== 'whisper') {
        await playOneStep()
        continue
      }
      const target = parleyTarget()
      if (target === null) break
      const reply = await game().askParley(target, '한 번 더 묻겠소')
      if (reply === null) await game().skipParley()
      else await game().parley(target, '한 번 더 묻겠소', reply.line, reply.truthful)
    }

    expect(PARLEY_LIMIT - parleysUsedIn(game().view().rounds)).toBe(0)

    // 예산이 말랐다. 남은 판이 끝까지 가야 한다 — 나가는 문이 닫혔으면 여기서 던진다.
    await playToEnd('talk')

    expect(game().view().phase).toBe('over')
    expect(game().error).toBeNull()
  })

  /**
   * 완주만으로는 모자라다. 폴백이 대사를 못 채우면 좌석이 빈 채로 끝까지 간다 —
   * 「돌아가긴 하는데 아무도 말을 안 한다」가 심사자가 보는 화면이 된다.
   */
  it('완주한 판의 좌석 대사가 비어 있지 않다', async () => {
    await game().start('dead-lines', 0, () => deadDecider('error'))

    await playToEnd('skip')

    // 규칙 기반 판단자는 대사를 내지 않는다(silent). 화면이 fallback-lines로 채우므로
    // 기록의 line은 null이 맞다 — 확인할 것은 «선언 자체가 남았는가»다.
    const declared = game().view().rounds.flatMap((r) => r.declarations)
    expect(declared.length).toBeGreaterThan(0)
  })

  /**
   * 조기 고발에 실패한 사람은 **반증만 이어 간다**(룰 개편 §2-5).
   *
   * 완주 테스트에 이 경로가 없었다 — playToEnd는 조기 고발을 하지 않으므로 탈락한 좌석을
   * 한 번도 지나가지 않는다. 그런데 이 상태는 다른 어떤 상태와도 다르다: 엔진이 그 사람의
   * 선언을 계속 «요구»하면서 나머지 행동은 전부 «던진다». 요구와 금지가 한 좌석에 겹치는
   * 유일한 자리라, 한쪽만 보고 닫으면 판이 선다.
   *
   * 실제로 화면이 그렇게 닫혀 있었다(GameScreen.tsx 액션 바 가드) — 탈락하면 반증 줄까지
   * 같이 사라져 반증 페이즈에서 판이 영영 멈췄다.
   */
  it('조기 고발에 실패해도 반증을 이어 가며 판이 끝난다', async () => {
    for (let i = 0; i < 40; i += 1) {
      game().reset()
      await game().start(`dead-early-${i}`, 0, () => deadDecider('error'))
      const me = game().view().players.find((p) => p.isMe)
      // 범인이 외치면 자백이라 판이 그 자리에서 끝난다(engine/progress.ts) — 탈락 경로가 아니다.
      if (!me || me.faction !== 'citizen') continue

      await game().accuseEarly(wrongAccusation())
      // 틀린 고발이었는지부터 확인한다. 맞았으면 판이 끝나 재려던 것을 못 잰다.
      if (game().view().phase === 'over') throw new Error('고발이 맞았다 — wrongAccusation이 틀렸다')
      expect(game().view().eliminated).toContain(game().view().viewerId)

      const before = declaredByMe()
      await playToEnd('skip')

      expect(game().view().phase).toBe('over')
      expect(game().error).toBeNull()
      // 「반증만 이어 간다」의 실체. 한 번도 안 뽑혔다면 아무것도 증명하지 못한 판이다.
      expect(declaredByMe(), '탈락 뒤 반증을 한 번도 못 냈다').toBeGreaterThan(before)
      return
    }
    throw new Error('40개 시드 안에 사람이 시민인 판이 없다 — 진영 배정이 깨졌을 수 있다')
  })
})

/** 내가 지금까지 낸 선언 수. 탈락 전후를 비교해 «반증이 이어졌는가»를 잰다. */
function declaredByMe(): number {
  const view = game().view()
  return view.rounds.flatMap((r) => r.declarations).filter((d) => d.playerId === view.viewerId)
    .length
}

/**
 * **반드시 틀리는** 고발. 내 손패에 있는 카드는 정답일 수 없다(engine/setup.ts —
 * 정답 석 장을 빼고 나머지를 나눈다). 그 카드를 제 칸에 박으면 오답이 보장된다.
 *
 * 정답을 조회해 «비켜 가는» 방법을 쓰지 않는 이유는, 시민 시야에는 solution이 null이라
 * (engine/view.ts) 테스트만 아는 정보로 판을 만들게 되기 때문이다.
 */
function wrongAccusation(): Suggestion {
  const me = game().view().players.find((p) => p.isMe)
  const held = me?.hand?.[0]
  if (!held) throw new Error('내 손패가 비었다')

  const base = anySuggestion()
  return { ...base, [cardKind(held)]: held }
}
