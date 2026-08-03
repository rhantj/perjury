# Decider 경계와 비동기 전환 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI 판단을 `Decider` 인터페이스 뒤로 옮기고 게임 진행을 비동기로 바꿔, LLM이 들어올 자리를 룰 엔진을 건드리지 않고 뚫는다.

**Architecture:** `src/ai/rules.ts`의 순수 판단 함수 4개를 `Decider` 인터페이스로 감싼다. 입력을 `GameView` 하나로 고정해 정보 격리를 타입으로 강제한다. `flow.ts`·`store/game.ts`를 async로 바꾸되 엔진(`src/engine/*`)과 컴포넌트(`src/components/*`)는 한 줄도 건드리지 않는다.

**Tech Stack:** TypeScript (strict), React 19, Zustand, Vitest, Vite. 새 의존성 없음.

설계 문서: [../specs/2026-08-03-decider-async-design.md](../specs/2026-08-03-decider-async-design.md)

## Global Constraints

- 세미콜론 없음, 홑따옴표, 들여쓰기 2칸.
- 타입만 가져올 때는 반드시 `import type { X } from './x'` (`verbatimModuleSyntax`).
- `any` 금지. `noUnusedLocals`·`noUnusedParameters` — 미사용 변수는 빌드 실패.
- `noUncheckedIndexedAccess` — 배열 인덱스 접근 결과는 `T | undefined`. 분기하거나 좁힌다.
- `noFallthroughCasesInSwitch` — `switch`의 각 case를 명시적으로 종료한다.
- 주석·커밋 메시지: **한국어**. 식별자: **영어**.
- 커밋 메시지 형식: `<type>: <한국어 설명>` — `feat` `fix` `refactor` `docs` `test` `chore`.
- 게임 도메인 용어 매핑 고정: 제안 `suggestion` / 반증 `refutation` / 위증 `perjury` / 밀담 `parley` / 최종 고발 `accusation` / 시민 `citizen` / 범인 `culprit`.
- 패키지 매니저는 **npm** 고정. 새 의존성 추가 금지.
- **`src/engine/*`, `src/components/*`, `src/content/*`, `src/ai/rules.ts`는 이 계획에서 수정하지 않는다.**
- `main`에 직접 커밋하지 않는다. Task 1~2는 `feat/agent-decider-boundary`, Task 3~6은 `refactor/agent-async-flow`.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `src/ai/decider.ts` (신규) | `Decider` 인터페이스, `DeciderForRound` 타입, `createRoundFallback`, `perRound`. 판단의 **모양**만 정한다. 어떤 판단도 하지 않는다 |
| `src/ai/rule-decider.ts` (신규) | `rules.ts`를 `Decider`로 감싼다. seed를 여기에 가둔다 |
| `src/ai/flow.ts` (수정) | 페이즈별 AI 스텝. `Decider`를 받아 `await`하고 결과를 엔진에 넣는다 |
| `src/ai/autoplay.ts` (수정) | 규칙 기반으로 판을 끝까지 굴린다 (D8 밸런싱·D3 안전선 검증) |
| `src/store/game.ts` (수정) | 사람 행동 → 엔진 → 화면. 대기 상태와 죽은 판 방어를 여기서 한다 |
| `session-resume/2026-08-03-decider-async.md` (신규) | B(UI)에게 넘길 계약 |

---

# A1 — Decider 경계 (브랜치 `feat/agent-decider-boundary`)

이 구간이 끝나도 **기존 코드는 한 줄도 안 바뀐다.** 신규 파일 4개만 생긴다. 기존 테스트 119개가 그대로 통과한다.

---

### Task 1: Decider 인터페이스와 수명 헬퍼

**Files:**
- Create: `src/ai/decider.ts`
- Test: `src/ai/decider.test.ts`

**Interfaces:**
- Consumes: `GameView` (`src/engine/view.ts`), `Claim`·`PlayerId`·`Suggestion` (`src/engine/types.ts`)
- Produces:
  - `interface Decider { chooseSuggestion(view: GameView): Promise<Suggestion>; chooseClaim(view: GameView): Promise<Claim>; chooseChallengeTarget(view: GameView): Promise<PlayerId | null>; chooseAccusation(view: GameView): Promise<Suggestion> }`
  - `type DeciderForRound = (round: number) => Decider`
  - `createRoundFallback(preferred: Decider, fallback: Decider, onFallback?: () => void): Decider`
  - `perRound(make: DeciderForRound): DeciderForRound`

- [ ] **Step 1: 브랜치를 만든다**

```bash
git switch -c feat/agent-decider-boundary
```

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`src/ai/decider.test.ts`를 새로 만든다.

```ts
import { describe, expect, it, vi } from 'vitest'
import { createRoundFallback, perRound } from './decider'
import type { Decider } from './decider'
import type { Claim, Suggestion } from '../engine/types'
import type { GameView } from '../engine/view'

/** 인터페이스 동작만 보는 테스트라 시야 내용은 필요 없다. */
const VIEW = {} as GameView
const PREFERRED: Suggestion = { suspect: 's1', weapon: 'w1', place: 'p1' }
const FALLBACK: Suggestion = { suspect: 's2', weapon: 'w2', place: 'p2' }

function stub(suggestion: Suggestion, fails = false): Decider {
  const guard = () => {
    if (fails) throw new Error('실패')
  }
  return {
    chooseSuggestion: async () => {
      guard()
      return suggestion
    },
    chooseClaim: async (): Promise<Claim> => {
      guard()
      return { kind: 'pass' }
    },
    chooseChallengeTarget: async () => {
      guard()
      return null
    },
    chooseAccusation: async () => {
      guard()
      return suggestion
    },
  }
}

describe('createRoundFallback — 라운드 단위 폴백', () => {
  it('preferred가 정상이면 fallback은 불리지 않는다', async () => {
    const fallback = stub(FALLBACK)
    const spy = vi.spyOn(fallback, 'chooseSuggestion')
    const decider = createRoundFallback(stub(PREFERRED), fallback)

    expect(await decider.chooseSuggestion(VIEW)).toEqual(PREFERRED)
    expect(spy).not.toHaveBeenCalled()
  })

  it('preferred가 던지면 그 호출이 fallback 결과를 낸다', async () => {
    const decider = createRoundFallback(stub(PREFERRED, true), stub(FALLBACK))

    expect(await decider.chooseSuggestion(VIEW)).toEqual(FALLBACK)
  })

  it('한 번 넘어지면 이후 호출은 preferred를 시도하지 않는다', async () => {
    const preferred = stub(PREFERRED, true)
    const spy = vi.spyOn(preferred, 'chooseClaim')
    const decider = createRoundFallback(preferred, stub(FALLBACK))

    await decider.chooseSuggestion(VIEW)
    expect(await decider.chooseClaim(VIEW)).toEqual({ kind: 'pass' })
    expect(spy).not.toHaveBeenCalled()
  })

  it('onFallback은 넘어진 순간 한 번만 불린다', async () => {
    const onFallback = vi.fn()
    const decider = createRoundFallback(stub(PREFERRED, true), stub(FALLBACK), onFallback)

    await decider.chooseSuggestion(VIEW)
    await decider.chooseClaim(VIEW)
    await decider.chooseAccusation(VIEW)

    expect(onFallback).toHaveBeenCalledTimes(1)
  })

  it('새 인스턴스는 preferred를 다시 시도한다', async () => {
    const fallen = createRoundFallback(stub(PREFERRED, true), stub(FALLBACK))
    await fallen.chooseSuggestion(VIEW)

    const fresh = createRoundFallback(stub(PREFERRED), stub(FALLBACK))

    expect(await fresh.chooseSuggestion(VIEW)).toEqual(PREFERRED)
  })
})

describe('perRound — 라운드마다 인스턴스 하나', () => {
  it('같은 라운드에는 같은 인스턴스를 준다', () => {
    const forRound = perRound(() => stub(PREFERRED))

    expect(forRound(1)).toBe(forRound(1))
  })

  it('라운드가 바뀌면 새로 만든다', () => {
    const forRound = perRound(() => stub(PREFERRED))

    expect(forRound(2)).not.toBe(forRound(1))
  })

  it('라운드가 돌아오면 그때도 새로 만든다', () => {
    const forRound = perRound(() => stub(PREFERRED))
    const first = forRound(1)
    forRound(2)

    expect(forRound(1)).not.toBe(first)
  })
})
```

- [ ] **Step 3: 테스트가 실패하는 것을 확인한다**

```bash
npx vitest run src/ai/decider.test.ts
```

Expected: FAIL — `Failed to resolve import "./decider"`

- [ ] **Step 4: 최소 구현을 쓴다**

`src/ai/decider.ts`를 새로 만든다.

```ts
import type { Claim, PlayerId, Suggestion } from '../engine/types'
import type { GameView } from '../engine/view'

/**
 * 에이전트가 무엇을 할지 고르는 것. 룰은 모른다 — 고른 행동은 엔진이 다시 검증한다.
 *
 * 입력이 GameView 하나로 고정된 것이 이 인터페이스의 핵심이다.
 * viewFor()가 seed·정답·남의 손패·isPerjury를 이미 뺐으므로,
 * 구현체가 무엇이든 전지적 정보를 받을 통로가 없다.
 */
export interface Decider {
  chooseSuggestion(view: GameView): Promise<Suggestion>
  chooseClaim(view: GameView): Promise<Claim>
  chooseChallengeTarget(view: GameView): Promise<PlayerId | null>
  /** 최종 고발. 자료형은 제안과 같지만 판을 끝내는 행위라 이름을 나눈다. */
  chooseAccusation(view: GameView): Promise<Suggestion>
}

/**
 * 라운드 하나에 쓸 Decider를 만든다.
 *
 * 계약: **같은 라운드 번호에는 같은 인스턴스를 돌려줘야 한다.**
 * createRoundFallback이 "이 라운드는 이미 넘어졌다"를 인스턴스 안에 들고 있기 때문이다.
 * 이 계약을 지키는 방법이 perRound다.
 */
export type DeciderForRound = (round: number) => Decider

/**
 * 한 라운드짜리 폴백 래퍼.
 *
 * preferred가 한 번이라도 실패하면 남은 호출은 전부 fallback으로 간다.
 * 인스턴스 수명이 한 라운드이므로 다음 라운드에는 새 인스턴스가 만들어지고
 * preferred를 다시 시도한다 — 별도 복구 로직이 없는 이유다.
 *
 * 가변 플래그를 쓴다. 이것은 게임 상태가 아니라 어댑터의 수명 표시라 불변 규칙 밖이다.
 */
export function createRoundFallback(
  preferred: Decider,
  fallback: Decider,
  onFallback?: () => void,
): Decider {
  let fallen = false

  async function run<T>(pick: (decider: Decider) => Promise<T>): Promise<T> {
    if (fallen) return pick(fallback)
    try {
      return await pick(preferred)
    } catch {
      fallen = true
      onFallback?.()
      return pick(fallback)
    }
  }

  return {
    chooseSuggestion: (view) => run((d) => d.chooseSuggestion(view)),
    chooseClaim: (view) => run((d) => d.chooseClaim(view)),
    chooseChallengeTarget: (view) => run((d) => d.chooseChallengeTarget(view)),
    chooseAccusation: (view) => run((d) => d.chooseAccusation(view)),
  }
}

/**
 * DeciderForRound의 계약(같은 라운드 = 같은 인스턴스)을 지키게 감싼다.
 *
 * 이게 없으면 한 라운드 안에서 인스턴스가 여러 번 만들어져
 * createRoundFallback의 "넘어졌다" 표시가 중간에 지워진다.
 */
export function perRound(make: DeciderForRound): DeciderForRound {
  let cachedRound: number | null = null
  let cached: Decider | null = null

  return (round) => {
    if (cachedRound !== round || !cached) {
      cachedRound = round
      cached = make(round)
    }
    return cached
  }
}
```

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

```bash
npx vitest run src/ai/decider.test.ts
npm run typecheck
```

Expected: 8 passed, typecheck 통과

- [ ] **Step 6: 커밋한다**

```bash
git add src/ai/decider.ts src/ai/decider.test.ts
git commit -m "feat: Decider 인터페이스와 라운드 폴백 래퍼"
```

---

### Task 2: 규칙 기반 Decider

**Files:**
- Create: `src/ai/rule-decider.ts`
- Test: `src/ai/rule-decider.test.ts`

**Interfaces:**
- Consumes: `Decider`·`DeciderForRound` (Task 1), `suggestionFrom`·`claimFrom`·`challengeTargetFrom`·`voteFrom` (`src/ai/rules.ts`)
- Produces:
  - `createRuleDecider(seed: string): Decider`
  - `ruleDeciderForRound(seed: string): DeciderForRound`

**핵심 제약:** salt 문자열이 지금 `flow.ts:9`가 만드는 것과 **글자 그대로 같아야** 한다. 다르면 같은 시드가 다른 판이 되어 A2의 회귀 판정이 무너진다. 형식은 `` `${seed}:${kind}:${round}:${playerId}` `` 이고 kind는 제안 `sg`, 반증 `cl`, 고발 `vote`다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/ai/rule-decider.test.ts`를 새로 만든다.

```ts
import { describe, expect, it } from 'vitest'
import { suggest } from '../engine/round'
import { createGame } from '../engine/setup'
import { viewFor } from '../engine/view'
import { claimFrom, suggestionFrom, voteFrom } from './rules'
import { createRuleDecider, ruleDeciderForRound } from './rule-decider'

const SEED = 'rule-decider'

function firstPlayerId(index: number): string {
  return `p${index}`
}

describe('createRuleDecider — rules.ts와 같은 결과', () => {
  it('제안이 suggestionFrom과 일치한다', async () => {
    const game = createGame({ seed: SEED, humanIndex: 0 })
    const view = viewFor(game, firstPlayerId(1))
    const expected = suggestionFrom(view, `${SEED}:sg:${game.round}:p1`)

    expect(await createRuleDecider(SEED).chooseSuggestion(view)).toEqual(expected)
  })

  it('반증 선언이 claimFrom과 일치한다', async () => {
    // claimFrom은 진행 중인 제안이 없으면 던진다. 제안을 하나 넣고 시작한다.
    const game = createGame({ seed: SEED, humanIndex: 0 })
    const suggester = game.players[game.turnIndex]
    if (!suggester) throw new Error('제안자가 없다')
    const started = suggest(game, suggester.id, { suspect: 's1', weapon: 'w1', place: 'p1' })
    const view = viewFor(started, firstPlayerId(2))
    const expected = claimFrom(view, `${SEED}:cl:${started.round}:p2`)

    expect(await createRuleDecider(SEED).chooseClaim(view)).toEqual(expected)
  })

  it('최종 고발이 voteFrom과 일치한다', async () => {
    const game = createGame({ seed: SEED, humanIndex: 0 })
    const view = viewFor(game, firstPlayerId(3))
    const expected = voteFrom(view, `${SEED}:vote:${game.round}:p3`)

    expect(await createRuleDecider(SEED).chooseAccusation(view)).toEqual(expected)
  })

  it('시드가 다르면 제안도 달라진다', async () => {
    const game = createGame({ seed: SEED, humanIndex: 0 })
    const view = viewFor(game, firstPlayerId(1))

    const a = await createRuleDecider('seed-a').chooseSuggestion(view)
    const b = await createRuleDecider('seed-b').chooseSuggestion(view)

    expect(a).not.toEqual(b)
  })
})

describe('ruleDeciderForRound', () => {
  it('라운드가 달라도 같은 인스턴스를 준다 — 규칙 기반은 라운드에 의존하지 않는다', () => {
    const forRound = ruleDeciderForRound(SEED)

    expect(forRound(1)).toBe(forRound(5))
  })
})
```

`claimFrom`은 진행 중인 제안이 없으면 던진다. 위 테스트에서 `chooseClaim` 케이스는 `createGame` 직후 `rounds`가 비어 있어 실패한다 — Step 2에서 실제 실패 메시지를 보고 Step 3에서 고친다.

- [ ] **Step 2: 테스트가 실패하는 것을 확인한다**

```bash
npx vitest run src/ai/rule-decider.test.ts
```

Expected: FAIL — `Failed to resolve import "./rule-decider"`

- [ ] **Step 3: 구현을 쓴다**

`src/ai/rule-decider.ts`를 새로 만든다.

```ts
import { challengeTargetFrom, claimFrom, suggestionFrom, voteFrom } from './rules'
import type { Decider, DeciderForRound } from './decider'
import type { GameView } from '../engine/view'

/**
 * 규칙 기반 Decider. 폴백 본체다 — LLM이 죽어도 이것으로 판이 끝난다.
 *
 * seed를 인수로 받아 이 안에 가둔다. Decider 인터페이스는 GameView만 받으므로
 * seed가 밖으로 나갈 통로가 없다. LLM 구현체는 seed를 아예 모른다 —
 * 알면 판을 재계산해 정답을 뽑을 수 있기 때문이다.
 */

/** flow.ts가 쓰던 salt와 글자 그대로 같아야 한다. 다르면 같은 시드가 다른 판이 된다. */
function saltOf(seed: string, kind: string, view: GameView): string {
  return `${seed}:${kind}:${view.round}:${view.viewerId}`
}

export function createRuleDecider(seed: string): Decider {
  return {
    chooseSuggestion: async (view) => suggestionFrom(view, saltOf(seed, 'sg', view)),
    chooseClaim: async (view) => claimFrom(view, saltOf(seed, 'cl', view)),
    chooseChallengeTarget: async (view) => challengeTargetFrom(view),
    chooseAccusation: async (view) => voteFrom(view, saltOf(seed, 'vote', view)),
  }
}

/** 규칙 기반은 라운드에 따라 달라지지 않으므로 인스턴스 하나를 재사용한다. */
export function ruleDeciderForRound(seed: string): DeciderForRound {
  const decider = createRuleDecider(seed)
  return () => decider
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

```bash
npx vitest run src/ai/rule-decider.test.ts
npm run typecheck
```

Expected: 5 passed, typecheck 통과

**여기서 실패하면 salt 형식이 틀린 것이다.** `flow.ts:9`의 `salt()`와 `rule-decider.ts`의 `saltOf()`를 나란히 놓고 글자 단위로 비교한다.

- [ ] **Step 5: 기존 테스트가 그대로인지 확인한다**

```bash
npx vitest run
```

Expected: **119 + 13 = 132 passed.** 기존 119개 중 하나라도 깨지면 이 구간에서 무언가를 잘못 건드린 것이다 — A1은 기존 파일을 수정하지 않는다.

- [ ] **Step 6: 커밋한다**

```bash
git add src/ai/rule-decider.ts src/ai/rule-decider.test.ts
git commit -m "feat: 규칙 기반 Decider — 폴백 본체"
```

---

# A2 — 비동기 전환 (브랜치 `refactor/agent-async-flow`)

여기부터 기존 파일을 고친다. **판정 내용이 바뀌면 안 된다.** 같은 시드는 같은 판이어야 한다.

- [ ] **A1을 main에 합치고 새 브랜치를 판다**

```bash
npm run build
git switch main && git pull origin main
git merge --no-ff feat/agent-decider-boundary
npm run build
git switch -c refactor/agent-async-flow
```

---

### Task 3: flow.ts를 async로

**Files:**
- Modify: `src/ai/flow.ts` (전체)
- Modify: `src/ai/flow.test.ts` (전체)

**Interfaces:**
- Consumes: `Decider`·`DeciderForRound` (Task 1), `ruleDeciderForRound` (Task 2)
- Produces:
  - `needsHuman(state: GameState): boolean` — **변경 없음 (동기)**
  - `stepAi(state: GameState, decider: Decider): Promise<GameState>`
  - `advanceToHuman(state: GameState, deciderForRound: DeciderForRound): Promise<GameState>`
  - `declareWithHuman(state: GameState, humanClaim: Claim, deciderForRound: DeciderForRound): Promise<GameState>`
  - `passChallenge(state: GameState, deciderForRound: DeciderForRound): Promise<GameState>`
  - `salt()`는 **삭제한다** — `rule-decider.ts`의 `saltOf`로 옮겨갔다

- [ ] **Step 1: 테스트를 async 시그니처로 고친다**

`src/ai/flow.test.ts`를 아래로 통째로 교체한다. 판정 내용은 원본과 동일하고 `await`와 decider 인수만 붙었다.

```ts
import { describe, expect, it } from 'vitest'
import { createGame } from '../engine/setup'
import type { GameState } from '../engine/types'
import { advanceToHuman, needsHuman, stepAi } from './flow'
import { ruleDeciderForRound } from './rule-decider'

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

  it('밀담 페이즈는 사람 개입 없이 넘어간다', () => {
    const game = createGame({ seed: 'w', humanIndex: 0 })

    expect(needsHuman({ ...game, phase: 'whisper' })).toBe(false)
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
```

- [ ] **Step 2: 테스트가 실패하는 것을 확인한다**

```bash
npx vitest run src/ai/flow.test.ts
```

Expected: FAIL — `advanceToHuman`이 2번째 인수를 받지 않으므로 타입 오류, 그리고 `ruleDeciderForRound` 결과가 무시되어 판정이 어긋난다.

- [ ] **Step 3: `flow.ts`를 고친다**

`src/ai/flow.ts`에서 다음 세 곳을 바꾼다.

**(a) import를 교체한다.** 상단의 `import { challengeTargetFrom, claimFrom, suggestionFrom, voteFrom } from './rules'`를 지우고 아래를 넣는다.

```ts
import type { Decider, DeciderForRound } from './decider'
```

**(b) `salt` 함수를 통째로 삭제한다.** (파일 상단 9~11행) `rule-decider.ts`의 `saltOf`로 옮겨갔으므로 죽은 코드다.

**(c) `stepAi` 이하를 아래로 교체한다.**

```ts
/** AI가 처리할 수 있는 한 스텝. 사람 차례에 부르면 안 된다. */
export async function stepAi(state: GameState, decider: Decider): Promise<GameState> {
  switch (state.phase) {
    case 'suggest': {
      const suggester = state.players[state.turnIndex]
      if (!suggester) throw new Error('제안자를 찾을 수 없다')
      const suggestion = await decider.chooseSuggestion(viewFor(state, suggester.id))
      return suggest(state, suggester.id, suggestion)
    }
    case 'refute': {
      const record = lastRound(state)
      const others = state.players.filter((p) => p.id !== record.suggesterId)
      // 병렬인 것은 최적화가 아니라 룰이다 — 동시 선언은 서로의 답을 못 보고 낸다 (설계 §1.4.1)
      const entries = await Promise.all(
        others.map(
          async (p) => [p.id, await decider.chooseClaim(viewFor(state, p.id))] as const,
        ),
      )
      return declareAll(state, new Map<PlayerId, Claim>(entries))
    }
    case 'challenge': {
      // 먼저 잡는 사람 하나만 성립한다. 전원에게 물어볼 필요가 없어 순차로 둔다.
      for (const player of state.players) {
        const targetId = await decider.chooseChallengeTarget(viewFor(state, player.id))
        if (targetId) return challenge(state, player.id, targetId)
      }
      return skipChallenge(state)
    }
    case 'whisper':
      return nextRound(state)
    case 'accuse': {
      const human = humanOf(state)
      if (human.faction === 'citizen') {
        const accusation = await decider.chooseAccusation(viewFor(state, human.id))
        return accuse(state, accusation, human.id)
      }
      const citizens = state.players.filter((p) => !p.isHuman && p.faction === 'citizen')
      const votes: Vote[] = await Promise.all(
        citizens.map(async (p) => ({
          playerId: p.id,
          accusation: await decider.chooseAccusation(viewFor(state, p.id)),
        })),
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

  const others = state.players.filter((p) => p.id !== record.suggesterId)
  const entries = await Promise.all(
    others.map(async (p) => {
      if (p.id === human.id) return [p.id, humanClaim] as const
      return [p.id, await decider.chooseClaim(viewFor(state, p.id))] as const
    }),
  )
  return declareAll(state, new Map<PlayerId, Claim>(entries))
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
  const human = humanOf(state)
  const decider = deciderForRound(state.round)

  for (const player of state.players) {
    if (player.id === human.id) continue
    const targetId = await decider.chooseChallengeTarget(viewFor(state, player.id))
    if (targetId) return challenge(state, player.id, targetId)
  }
  return skipChallenge(state)
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
```

`needsHuman`, `humanOf`, `lastRound`는 그대로 둔다.

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

```bash
npx vitest run src/ai/flow.test.ts
npm run typecheck
```

Expected: **10 passed.** `npm run typecheck`는 `autoplay.ts`와 `store/game.ts`가 아직 동기라 **실패한다** — Task 4·5에서 고친다. `flow.test.ts`만 통과하면 이 단계는 끝이다.

- [ ] **Step 5: 커밋한다**

```bash
git add src/ai/flow.ts src/ai/flow.test.ts
git commit -m "refactor: flow를 Decider 기반 비동기로 전환"
```

---

### Task 4: autoplay.ts를 async로

**Files:**
- Modify: `src/ai/autoplay.ts`
- Modify: `src/ai/autoplay.test.ts`

**Interfaces:**
- Consumes: `stepAi` (Task 3), `ruleDeciderForRound` (Task 2)
- Produces: `autoPlay(initial: GameState): Promise<GameState>` — **인수는 그대로 하나다.** Decider를 인수로 받지 않고 `initial.seed`로 내부에서 만든다. 이 함수의 존재 이유가 "규칙 기반만으로 완주"이기 때문이다.

- [ ] **Step 1: 테스트를 async로 고친다**

`src/ai/autoplay.test.ts`의 각 `it` 콜백에 `async`를 붙이고 `autoPlay(...)` 호출 앞에 `await`를 붙인다. 판정은 그대로다. 마지막 두 테스트는 배열 생성이라 `Promise.all`로 바꾼다.

```ts
  it('여러 시드를 돌려도 예외 없이 끝난다', async () => {
    const results = await Promise.all(
      Array.from({ length: 60 }, (_, i) => autoPlay(createGame({ seed: `sweep-${i}` }))),
    )

    expect(results.every((r) => r.phase === 'over')).toBe(true)
  })

  it('위증과 이의제기가 실제로 발생한다', async () => {
    const games = await Promise.all(
      Array.from({ length: 60 }, (_, i) => autoPlay(createGame({ seed: `event-${i}` }))),
    )

    const perjuries = games.flatMap((g) =>
      g.rounds.flatMap((r) => r.declarations.filter((d) => d.isPerjury)),
    )
    const challenges = games.flatMap((g) => g.rounds.filter((r) => r.challenge))

    expect(perjuries.length).toBeGreaterThan(0)
    expect(challenges.length).toBeGreaterThan(0)
  })
```

- [ ] **Step 2: 테스트가 실패하는 것을 확인한다**

```bash
npx vitest run src/ai/autoplay.test.ts
```

Expected: FAIL — `stepAi`가 인수 2개를 요구한다

- [ ] **Step 3: `autoplay.ts`를 고친다**

`src/ai/autoplay.ts`를 아래로 교체한다.

```ts
import type { GameState } from '../engine/types'
import { stepAi } from './flow'
import { ruleDeciderForRound } from './rule-decider'

/**
 * 규칙 기반 에이전트만으로 판을 끝까지 굴린다. LLM 호출은 0회다.
 * 사람 자리도 AI가 대신 둔다.
 *
 * 두 가지 용도가 있다.
 *   1. D3 안전선 검증 — LLM 없이 완주되는가
 *   2. D8 밸런싱 — 같은 조건으로 수천 판을 돌려 승률을 본다
 *
 * Decider를 인수로 받지 않는다. 이 함수의 존재 이유가 "규칙 기반만으로 완주"이므로
 * 다른 Decider를 꽂을 수 있게 열어두면 용도가 흐려진다.
 *
 * 화면에서 쓰는 advanceToHuman과 같은 stepAi를 공유한다.
 * 로직이 두 벌이면 한쪽만 고치는 사고가 난다.
 */
export async function autoPlay(initial: GameState): Promise<GameState> {
  const deciderForRound = ruleDeciderForRound(initial.seed)
  let state = initial

  // 8라운드 × 4페이즈 + 고발이면 충분하다. 넘으면 전이에 구멍이 있다는 뜻이다.
  for (let step = 0; step < 200 && state.phase !== 'over'; step += 1) {
    state = await stepAi(state, deciderForRound(state.round))
  }

  if (state.phase !== 'over') throw new Error('판이 끝나지 않았다 — 전이에 구멍이 있다')
  return state
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

```bash
npx vitest run src/ai/autoplay.test.ts
```

Expected: 7 passed. **특히 `'같은 시드는 같은 결과를 낸다'`와 `'8라운드가 전부 기록된다'`가 통과해야 한다** — salt 재구성이 틀렸다면 여기서 잡힌다.

- [ ] **Step 5: 커밋한다**

```bash
git add src/ai/autoplay.ts src/ai/autoplay.test.ts
git commit -m "refactor: autoPlay를 비동기로 전환"
```

---

### Task 5: store를 async로 + 대기 상태와 죽은 판 방어

**Files:**
- Modify: `src/store/game.ts`
- Modify: `src/store/game.test.ts`

**Interfaces:**
- Consumes: `advanceToHuman`·`declareWithHuman`·`passChallenge`·`needsHuman` (Task 3), `ruleDeciderForRound` (Task 2), `perRound`·`DeciderForRound` (Task 1)
- Produces: `useGame` — 아래 계약

```ts
interface GameStore {
  state: GameState | null
  error: string | null
  /** AI가 판단 중인가. true인 동안 awaitingHuman()은 false를 반환한다. */
  aiThinking: boolean
  /** 이번 라운드가 폴백으로 떨어졌는가. A 단계에서는 항상 false다. */
  fallbackRound: boolean

  start: (
    seed: string,
    humanIndex?: number,
    makeDeciders?: (seed: string) => DeciderForRound,
  ) => Promise<void>
  reset: () => void
  view: () => GameView
  role: () => Role
  awaitingHuman: () => boolean

  suggest: (suggestion: Suggestion) => Promise<void>
  declare: (claim: Claim) => Promise<void>
  challenge: (targetId: PlayerId) => Promise<void>
  passChallenge: () => Promise<void>
  accuse: (accusation: Suggestion) => Promise<void>
}
```

`gameId`와 `deciderForRound`는 계약에 없다 — `create()` 클로저 안의 지역 변수다. 화면이 알 필요가 없다.

- [ ] **Step 1: 기존 테스트를 async로 고치고 신규 케이스를 추가한다**

`src/store/game.test.ts`를 아래로 통째로 교체한다.

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { useGame } from './game'
import { createRuleDecider } from '../ai/rule-decider'
import type { Decider, DeciderForRound } from '../ai/decider'
import type { Suggestion } from '../engine/types'

const SUGGESTION: Suggestion = { suspect: 's1', weapon: 'w1', place: 'p1' }

const game = () => useGame.getState()

/** 모든 판단에 지연을 넣은 Decider. 비동기 경로를 눈에 보이게 만든다. */
function slowDeciders(ms: number): (seed: string) => DeciderForRound {
  return (seed) => {
    const base = createRuleDecider(seed)
    const wait = () => new Promise((resolve) => setTimeout(resolve, ms))
    const slow: Decider = {
      chooseSuggestion: async (view) => {
        await wait()
        return base.chooseSuggestion(view)
      },
      chooseClaim: async (view) => {
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
    }
    return () => slow
  }
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
    expect(game().view().rounds[0]?.declarations).toHaveLength(5)
    expect(game().error).toBeNull()
  })

  it('사람이 이의제기를 넘기면 라운드가 넘어간다', async () => {
    await game().start('pass', 0)
    await game().suggest(SUGGESTION)
    await game().passChallenge()

    expect(game().view().round).toBe(2)
  })

  it('사람이 제안자가 아니면 반증 선언을 사람이 한다', async () => {
    await game().start('declare', 3)
    expect(game().view().phase).toBe('refute')

    await game().declare({ kind: 'pass' })

    expect(game().view().rounds[0]?.declarations).toHaveLength(5)
    expect(game().error).toBeNull()
  })

  it('한 판을 끝까지 굴릴 수 있다', async () => {
    await game().start('finish', 0)

    for (let i = 0; i < 100 && game().view().phase !== 'over'; i += 1) {
      const view = game().view()
      if (view.phase === 'suggest') await game().suggest(SUGGESTION)
      else if (view.phase === 'refute') await game().declare({ kind: 'pass' })
      else if (view.phase === 'challenge') await game().passChallenge()
      else if (view.phase === 'accuse') await game().accuse(SUGGESTION)
      else break
    }

    expect(game().view().phase).toBe('over')
    expect(game().view().outcome).not.toBeNull()
  })

  it('AI가 판단하는 동안 aiThinking이 true이고 조작이 잠긴다', async () => {
    const started = game().start('think', 3, slowDeciders(5))

    expect(game().aiThinking).toBe(true)
    expect(game().awaitingHuman()).toBe(false)

    await started

    expect(game().aiThinking).toBe(false)
    expect(game().awaitingHuman()).toBe(true)
  })

  it('대기 중에 들어온 조작은 무시된다', async () => {
    await game().start('busy', 0, slowDeciders(5))

    const first = game().suggest(SUGGESTION)
    const ignored = game().suggest(SUGGESTION)
    await Promise.all([first, ignored])

    expect(game().error).toBeNull()
    expect(game().view().rounds).toHaveLength(1)
  })

  it('reset 뒤에 도착한 결과는 버려진다', async () => {
    const started = game().start('late', 3, slowDeciders(5))
    game().reset()
    await started

    expect(game().state).toBeNull()
    expect(game().aiThinking).toBe(false)
  })

  it('A 단계에서 fallbackRound는 항상 false다', async () => {
    await game().start('fallback', 0)

    expect(game().fallbackRound).toBe(false)
  })
})
```

- [ ] **Step 2: 테스트가 실패하는 것을 확인한다**

```bash
npx vitest run src/store/game.test.ts
```

Expected: FAIL — `aiThinking`이 없고 `start`가 3번째 인수를 받지 않는다

- [ ] **Step 3: `store/game.ts`를 고친다**

`src/store/game.ts`를 아래로 통째로 교체한다.

```ts
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
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

```bash
npx vitest run src/store/game.test.ts
```

Expected: 13 passed

- [ ] **Step 5: 전체를 돌린다**

```bash
npx vitest run
npm run typecheck
npm run build
```

Expected: **136 passed** (기존 119 + `decider` 8 + `rule-decider` 5 + `game` 신규 4), typecheck·build 통과.
기존 119개의 **판정 내용**은 그대로다. 하나라도 판정이 바뀌었다면 async 전환이 아니라 동작 변경이므로 되돌린다.

- [ ] **Step 6: 실제 화면에서 1판 완주를 확인한다**

```bash
npm run dev
```

브라우저에서 표지 → 브리핑 3막 → 게임판 → 판결문까지 한 판을 끝낸다. 확인할 것:
- 버튼을 눌렀을 때 정상 진행되는가
- 표지로 나갔다가(`reset`) 새 판을 시작해도 화면이 깨지지 않는가
- 콘솔에 에러가 없는가

- [ ] **Step 7: 커밋한다**

```bash
git add src/store/game.ts src/store/game.test.ts
git commit -m "refactor: store를 비동기로 전환, 대기 상태와 판 세대 방어 추가"
```

---

### Task 6: 프론트 인계 문서

**Files:**
- Create: `session-resume/2026-08-03-decider-async.md`

- [ ] **Step 1: 인계 문서를 쓴다**

`session-resume/CLAUDE.md`의 템플릿을 따른다. **B(UI) 담당이 읽고 바로 작업할 수 있어야 한다.** 반드시 담을 것:

- store가 새로 노출하는 `aiThinking`·`fallbackRound`의 의미와 값이 변하는 시점
- `awaitingHuman()`이 `aiThinking` 중에 `false`를 반환하므로 **기존 조작 잠금은 그대로 동작한다**는 것
- `start`·`suggest`·`declare`·`challenge`·`passChallenge`·`accuse`가 전부 `Promise<void>`가 되었지만, 컴포넌트가 반환값을 쓰지 않으므로 **컴포넌트 수정은 필요 없다**는 것
- 그리는 자리 제안: `aiThinking`은 원탁 좌석(`src/components/Table.tsx`)의 대기 표시, `fallbackRound`는 상단 배너
- A 단계에서 `fallbackRound`는 항상 `false`이고 C 단계부터 `true`가 될 수 있다는 것
- 검증 상태: typecheck / build / 테스트 수 / 배포

- [ ] **Step 2: 커밋한다**

```bash
git add session-resume/2026-08-03-decider-async.md
git commit -m "docs: Decider 비동기 전환 진행 상황과 UI 인계 계약"
```

- [ ] **Step 3: main에 합친다**

```bash
git fetch origin
git log --oneline HEAD..origin/main   # 팀원이 올린 것 확인 — 없으면 출력 없음
git pull --rebase origin main
npm run build
git switch main && git pull origin main
git merge --no-ff refactor/agent-async-flow
npm run build
```

푸시는 **대표 확인 후**에 한다. 푸시가 곧 배포다.

---

## 완료 기준

- [ ] `npm run typecheck` 통과
- [ ] `npm run build` 통과
- [ ] 기존 테스트 119개가 판정 내용 그대로 통과
- [ ] 신규 테스트 통과 (`decider.test.ts` 8 · `rule-decider.test.ts` 5 · `game.test.ts` 신규 4)
- [ ] `autoPlay`의 `'같은 시드는 같은 결과를 낸다'`가 통과 — salt 재구성이 맞다는 증거
- [ ] 지연 주입 Decider로 1판 완주, 대기 중 조작이 잠긴다
- [ ] 브라우저에서 표지 → 판결문까지 실제 1판 완주
- [ ] `session-resume/2026-08-03-decider-async.md`에 UI 인계 계약이 기록됨

## 이 계획이 손대지 않는 것

`src/engine/*`, `src/components/*`, `src/content/*`, `src/ai/rules.ts`, `vite.config.ts`.
이 중 하나라도 수정이 필요하다고 느껴지면 **계획이 틀린 것이므로 멈추고 보고한다.**
