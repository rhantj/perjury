# 직업 10종 능력 발동 구현 계획

> **에이전트 작업자에게:** 이 계획은 태스크 단위로 실행한다.
> 체크박스(`- [ ]`)로 진행을 표시한다.

**목표:** 정의만 되어 있고 발동하지 않던 직업 능력 10종을 실제로 게임에 물린다.

**접근:** 능력을 직업별이 아니라 **고치는 자리별**로 묶는다. 자리는 4곳이다 —
보이는 범위(`view.ts`) · 판정 규칙(`round.ts`·`challenge.ts`) · 숨긴 것 공개(`isPerjury` 노출) ·
말한 사람의 신고(`speakInParley` 반환형). AI는 능력의 **종류를 고르지 않는다** — 「쓴다 + 대상」만
말하고 종류는 좌석의 직업에서 파생된다. 능력 사용은 새 LLM 호출을 만들지 않고 기존 판단 호출의
구조화 출력에 얹는다.

**근거 문서:** [결정 007](../../decisions/007-직업-능력-발동.md) · [게임 설계](../../01-game-design.md)

---

## 전역 제약

루트 `CLAUDE.md`에서 그대로 가져온다. 모든 태스크에 적용된다.

- **룰 엔진은 순수 함수다.** LLM 호출·랜덤·시간·DOM 접근을 넣지 않는다. 난수가 필요하면
  `createRng(상황에서 파생한 시드)`를 쓴다.
- **AI가 룰을 어길 수 없어야 한다.** LLM이 고른 것은 반드시 엔진을 통과한다.
- **`content` → `engine` 한 방향 의존.** 엔진은 직업 이름·시나리오를 모른다. 역방향 import 금지.
- **상태는 불변.** 제자리 변경 금지, 새 객체 반환.
- `noUncheckedIndexedAccess` — 배열 인덱스 접근은 `T | undefined`다. `!`로 뭉개지 말고 분기한다.
- `verbatimModuleSyntax` — 타입만 가져올 때는 `import type`.
- `noUnusedLocals` / `noUnusedParameters` — 미사용 변수는 **빌드 실패**다.
- `any` 금지. `noFallthroughCasesInSwitch` — switch의 각 case를 명시적으로 종료한다.
- 세미콜론 없음, 홑따옴표, 들여쓰기 2칸.
- 식별자는 영어, 주석·커밋 메시지는 한국어.
- 커밋 메시지: `<type>: <한국어 설명>`. 커밋·푸시는 **명시적 요청이 있을 때만** 한다.
- 한 태스크는 **300줄 / 5파일 이내**. 넘으면 쪼갠다.
- 검증 명령: `npx vitest run` · `npm run typecheck` · `npm run build`

## 안전장치

`src/content/roles.ts`의 `ROLES`에서 **아직 구현되지 않은 직업을 빼두고 시작한다.**
배정 로직(`assignRoles`)은 그대로 두므로, 어느 태스크에서 멈춰도 게임은 온전하다 —
구현 안 된 직업이 그 판에 등장하지 않을 뿐이다. 태스크가 끝날 때마다 그 직업을 풀에 되돌린다.

**시민 최소 5종 · 범인 최소 1종**을 항상 유지해야 한다(`assignRoles`가 시민 5명 · 범인 1명에게
서로 다른 직업을 나눠주므로, 시민 풀이 5 미만이면 던진다).

---

## 파일 구조

| 파일 | 책임 | 상태 |
|---|---|---|
| `src/engine/types.ts` | `PowerUse`·`Finding`·`Grant`·상태 필드 | Task 0에서 추가됨 |
| `src/engine/power.ts` | `usePower`·`findingsFor`·`buildPowerUse` | Task 0에서 생성됨 |
| `src/engine/view.ts` | 알게 된 것을 시야에 싣는다 | Task 1 |
| `src/engine/round.ts` | 변호사·협잡꾼 — 선언 판정 | Task 8·9 |
| `src/engine/challenge.ts` | 밀정·사진사 — 이의제기 판정 | Task 5·7 |
| `src/engine/parley.ts` | 밀담 다건화 | Task 10 |
| `src/content/roles.ts` | 직업 → 능력 종류 대응표 | Task 1 |
| `src/ai/decider.ts` | `Spoken`에 능력 사용 의사 | Task 3 |
| `src/store/game.ts` | 좌석 → 직업 조회 후 엔진 호출 | Task 2 |
| `workers/src/prompt.ts` | 알게 된 것을 프롬프트에 | Task 1 |

---

## Task 0: 발동 뼈대 + 검시관·약제사 (완료됨)

이미 브랜치 `feat/engine-role-powers`에 있다. 다음 태스크의 전제이므로 여기 기록해 둔다.

**생성:** `src/engine/power.ts` · `src/engine/power.test.ts`
**수정:** `src/engine/types.ts` · `src/engine/setup.ts`

**Produces (뒤 태스크가 의존하는 것):**

```ts
// engine/types.ts
export type PowerUse =
  | { readonly kind: 'inspect-hand'; readonly targetId: PlayerId }
  | { readonly kind: 'check-weapon'; readonly cardId: CardId }

export type Finding =
  | { readonly kind: 'hand'; readonly targetId: PlayerId; readonly cardId: CardId }
  | { readonly kind: 'weapon'; readonly cardId: CardId; readonly isSolution: boolean }

export interface Grant {
  readonly round: number
  readonly ownerId: PlayerId
  readonly finding: Finding
}

// GameState에 추가된 필드
readonly powersUsed: readonly PlayerId[]
readonly grants: readonly Grant[]

// engine/power.ts
export function usePower(state: GameState, playerId: PlayerId, use: PowerUse): GameState
export function findingsFor(state: GameState, viewerId: PlayerId): readonly Grant[]
```

검증 상태: `npx vitest run` 270/270 · `npm run typecheck` 통과.

---

## Task 0.5: 밀담 폴백 대사 (D8 안전선)

**직업보다 먼저 한다.** 이건 능력이 아니라 안전선이다 — 프록시가 죽었을 때 게임이 끝까지
가야 한다는 절대규칙 4에 걸려 있다.

지금 `rule-decider.ts:33`의 `speakInParley`가 `null`을 돌려주므로 **폴백 라운드에는 밀담
패널이 아예 닫힌다.** 팀원이 `cf8a8ad`·`da9e694`로 제안·반증·이의제기 대사를 캐릭터별로
채웠으므로 남은 자리는 여기 하나다.

**Files:**
- Modify: `src/content/fallback-lines.ts` (밀담 대사 풀 + `parleyLine`)
- Modify: `src/ai/rule-decider.ts:33`
- Test: `src/content/fallback-lines.test.ts` (신규)

**Interfaces:**
- Consumes: 기존 `REFUTE_LINE` 등과 같은 `characterId` 키 체계 (`s1`~`s6`)
- Produces:
  ```ts
  export function parleyLine(characterId: CardId, salt: string): string
  ```

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/content/fallback-lines.test.ts`를 만든다.

```ts
import { describe, expect, it } from 'vitest'
import { parleyLine } from './fallback-lines'

describe('parleyLine — 폴백 밀담 대사', () => {
  it('같은 자리·같은 salt면 같은 말이 나온다', () => {
    expect(parleyLine('s1', 'a')).toBe(parleyLine('s1', 'a'))
  })

  it('salt가 다르면 같은 말만 반복하지 않는다', () => {
    const said = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((r) => parleyLine('s1', `r${r}`)))
    expect(said.size).toBeGreaterThan(1)
  })

  it('캐릭터마다 말투가 다르다', () => {
    expect(parleyLine('s1', 'x')).not.toBe(parleyLine('s6', 'x'))
  })

  it('모르는 캐릭터도 화면이 비지 않는다', () => {
    expect(parleyLine('없는-카드', 'x').length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

실행: `npx vitest run src/content/fallback-lines.test.ts`
예상: `parleyLine is not exported` 로 실패

- [ ] **Step 3: 대사 풀과 선택 함수를 만든다**

`src/content/fallback-lines.ts`에 더한다. 캐릭터당 **4줄 이상**이어야 8라운드에 같은 말이
반복되지 않는다. 내용은 «답을 피하는 말»로 통일한다 — 규칙 기반 판단자는 질문을 읽지
못하므로, 무엇을 물어도 어긋나지 않는 대답이어야 한다.

```ts
const PARLEY_LINE: Record<string, readonly string[]> = {
  s1: ['그건 여기서 할 얘기가 아니오.', /* ... */],
  // s2~s6
}

/** 대사 선택은 salt에서 결정론적으로 나온다 — 같은 판을 다시 돌리면 같은 말이 나온다. */
export function parleyLine(characterId: CardId, salt: string): string {
  const pool = PARLEY_LINE[characterId] ?? ['…']
  const picked = pool[hashOf(salt) % pool.length]
  return picked ?? '…'
}
```

`hashOf`는 `engine/rng.ts`의 `createRng`를 그대로 쓴다. 새 해시 함수를 만들지 않는다.

- [ ] **Step 4: 통과를 확인한다**

실행: `npx vitest run src/content/fallback-lines.test.ts`
예상: PASS

- [ ] **Step 5: 규칙 기반 판단자를 잇는다**

`src/ai/rule-decider.ts`의 `speakInParley`를 고친다. 주석도 함께 고친다 —
「D8 작업이라 침묵한다」는 더 이상 사실이 아니다.

```ts
    /*
     * 사전생성 대사 풀에서 답한다. 질문을 읽지 못하므로 무엇을 물어도 어긋나지 않는
     * «답을 피하는 말»만 들어 있다. 폴백에서도 밀담 패널이 닫히지 않는 것이 요점이다.
     */
    speakInParley: async (view) => parleyLine(characterOf(view), saltOf(seed, 'pl', view)),
```

`characterOf(view)`는 `view.players.find((p) => p.isMe)?.characterId`다. 없으면 빈 문자열을
넘겨 기본 대사로 떨어진다(`noUncheckedIndexedAccess` 때문에 분기가 필요하다).

- [ ] **Step 6: 폴백 라운드에 밀담이 열리는지 확인한다**

`src/store/game.test.ts`에 추가한다.

```ts
it('폴백 라운드에도 밀담이 답한다', async () => {
  await game().start('parley-fallback', 0, (seed) => ruleDeciderForRound(seed))
  // 밀담 페이즈까지 진행한 뒤
  expect(await game().askParley('p1', '왜 침묵했지')).not.toBeNull()
})
```

**주의:** `src/components/Parley.tsx`가 `fallbackRound`를 보고 문을 닫는 분기가 있다면 함께
고쳐야 한다. 폴백에서도 밀담이 되므로 그 분기의 근거가 사라진다.

- [ ] **Step 7: 검증**

```bash
npx vitest run && npm run typecheck && npm run build
```

- [ ] **Step 8: 커밋**

```bash
git add src/content/fallback-lines.ts src/content/fallback-lines.test.ts src/ai/rule-decider.ts src/store/game.test.ts
git commit -m "feat: 폴백에서도 밀담이 답한다"
```

---

## Task 1: 알게 된 것이 시야와 프롬프트에 실린다

능력을 써도 아무도 그 결과를 볼 수 없으면 발동한 게 아니다. 이 태스크가 그 통로를 뚫는다.
**이 태스크가 끝나면 검시관·약제사가 실제로 작동한다.**

**Files:**
- Modify: `src/engine/view.ts` (`GameView`에 `findings` 추가, `viewFor`에서 채움)
- Modify: `src/content/roles.ts` (`Role`에 `effect` 필드)
- Modify: `workers/src/prompt.ts` (관측 로그에 「확인한 것」 절 추가)
- Test: `src/engine/view.test.ts` (기존 파일에 추가)

**Interfaces:**
- Consumes: `findingsFor(state, viewerId)`, `Grant`, `Finding` (Task 0)
- Produces:
  ```ts
  // engine/view.ts — GameView에 추가
  readonly findings: readonly Grant[]

  // content/roles.ts — Role에 추가
  readonly effect: PowerUse['kind']
  ```

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/engine/view.test.ts` 끝에 추가한다.

```ts
describe('viewFor — 능력으로 알게 된 것', () => {
  it('내 앞으로 온 것만 시야에 실린다', () => {
    const state = createGame({ seed: 'view-findings' })
    const me = state.players[0]
    const other = state.players[1]
    const third = state.players[2]
    if (!me || !other || !third) throw new Error('좌석이 모자란다')

    const after = usePower(state, me.id, { kind: 'inspect-hand', targetId: third.id })

    expect(viewFor(after, me.id).findings).toHaveLength(1)
    expect(viewFor(after, other.id).findings).toHaveLength(0)
  })

  it('능력을 쓰기 전에는 비어 있다', () => {
    const state = createGame({ seed: 'view-findings' })
    const me = state.players[0]
    if (!me) throw new Error('좌석이 없다')

    expect(viewFor(state, me.id).findings).toEqual([])
  })
})
```

파일 상단 import에 `usePower`를 더한다.

```ts
import { usePower } from './power'
```

- [ ] **Step 2: 실패를 확인한다**

실행: `npx vitest run src/engine/view.test.ts`
예상: `Property 'findings' does not exist on type 'GameView'` 로 실패

- [ ] **Step 3: `GameView`에 필드를 추가한다**

`src/engine/view.ts`의 `GameView` 인터페이스에 넣는다. `solution` 바로 위가 좋다.

```ts
  /**
   * 능력으로 «확인한» 것. 추측과 구별되어야 하므로 rounds와 섞지 않는다.
   * 자기 앞으로 온 것만 들어온다.
   */
  readonly findings: readonly Grant[]
```

import에 타입을 더한다.

```ts
import { findingsFor } from './power'
import type { Grant } from './types'
```

`viewFor`의 반환 객체에 한 줄을 더한다.

```ts
    findings: findingsFor(state, viewerId),
```

- [ ] **Step 4: 통과를 확인한다**

실행: `npx vitest run src/engine/view.test.ts`
예상: PASS

- [ ] **Step 5: 직업에 능력 종류를 붙인다**

`src/content/roles.ts`의 `Role` 인터페이스에 필드를 더한다.

```ts
  /**
   * 이 직업이 발동하는 능력의 종류. 엔진의 `PowerUse` 종류와 1:1이다.
   *
   * `power`(사람이 읽는 문구)와 나누는 이유는 문구가 콘텐츠고 종류가 룰이기 때문이다.
   * 문구를 다듬어도 룰이 흔들리지 않아야 한다.
   */
  readonly effect: PowerUse['kind']
```

import를 더한다.

```ts
import type { Faction, PlayerId, PowerUse } from '../engine/types'
```

`ROLES`의 검시관·약제사에 값을 넣는다.

```ts
  // 검시관
  effect: 'inspect-hand',
  // 약제사
  effect: 'check-weapon',
```

**나머지 8종은 아직 `PowerUse`에 종류가 없다.** 안전장치대로 `ROLES` 배열에서 잠시 뺀다 —
빼는 대신 파일 하단에 보관 배열을 두어 되돌리기 쉽게 한다.

```ts
/**
 * 아직 능력이 발동하지 않는 직업. 구현되는 대로 ROLES로 옮긴다(계획서 Task 4~11).
 * 여기 있는 동안에는 그 판에 등장하지 않는다.
 */
const PENDING: readonly Omit<Role, 'effect'>[] = [
  /* 순사·신문기자·변호사·정보상·전화교환수·사진사·협잡꾼·밀정을 여기로 옮긴다 */
]
```

**주의:** `assignRoles`는 시민 5명·범인 1명에게 서로 다른 직업을 준다. `ROLES`에 시민이
5종 미만이면 던진다. 검시관·약제사만 남기면 **2종뿐이라 게임이 시작되지 않는다.**
그러므로 이 Step에서는 `effect`를 붙이지 못한 8종을 빼지 말고, 대신 **임시로 전부
`'inspect-hand'`를 주지 않는다** — 다음 Step에서 해결한다.

- [ ] **Step 6: 10종의 능력 종류를 «전부» 미리 선언한다**

**이 Step이 이후 병렬 작업의 전제다.** 여기서 10종을 다 선언해두면 Task 4~10이
`types.ts`와 `roles.ts`를 건드리지 않고 각자 다른 파일에서만 작업한다.
나중에 한 줄씩 추가하면 7개 작업이 같은 유니온에서 매번 충돌한다.

`src/engine/types.ts`의 `PowerUse`를 10종으로 넓힌다.

```ts
export type PowerUse =
  /** 검시관 — 한 명의 손패 1장을 확인한다. */
  | { readonly kind: 'inspect-hand'; readonly targetId: PlayerId }
  /** 약제사 — 수단 카드 1장을 지정해 정답 여부를 확인한다. */
  | { readonly kind: 'check-weapon'; readonly cardId: CardId }
  /** 순사 — 한 명의 이번 라운드 반증이 참인지 통보받는다. 선언 후에 풀린다. */
  | { readonly kind: 'verify-claim'; readonly targetId: PlayerId }
  /** 사진사 — 지목한 사람이 «다음» 라운드에 위증하면 이의제기 없이 드러난다. */
  | { readonly kind: 'photograph'; readonly targetId: PlayerId }
  /** 신문기자 — 지난 반증 1건의 진위를 전체에 공개한다. */
  | { readonly kind: 'publish'; readonly round: number; readonly targetId: PlayerId }
  /** 밀정 — 자기 위증 1회는 이의제기를 당해도 실패 처리된다. */
  | { readonly kind: 'shield' }
  /** 변호사 — 반증 요구를 1회 거부한다. */
  | { readonly kind: 'refuse-demand' }
  /** 협잡꾼 — 타인의 반증 1회를 조작한다. */
  | { readonly kind: 'frame'; readonly targetId: PlayerId }
  /** 전화교환수 — 밀담 1건을 엿듣는다(사람이 쥐면 회선이 하나 는다). */
  | { readonly kind: 'eavesdrop' }
  /** 정보상 — 밀담 상대 발언의 참·거짓을 판정한다. */
  | { readonly kind: 'detect-lie' }
```

`power.ts`의 `resolve()`는 `switch`이고 `noFallthroughCasesInSwitch`가 켜져 있으므로,
**아직 구현하지 않은 8종을 명시적으로 처리해야 컴파일된다.** 즉시 해소되지 않는 것들이므로
`null`을 돌려주고 `usePower`가 `pending`에만 넣게 한다.

```ts
/** 즉시 답이 나오는 능력만 Finding을 만든다. 나머지는 pending에 머문다. */
function resolve(state: GameState, use: PowerUse): Finding | null {
  switch (use.kind) {
    case 'inspect-hand':
      return { kind: 'hand', targetId: use.targetId, cardId: pickFromHand(state, use.targetId) }
    case 'check-weapon':
      return { kind: 'weapon', cardId: use.cardId, isSolution: state.solution.weapon === use.cardId }
    // 아래는 나중 시점에 풀린다 — 지목만 남기고 여기서는 답하지 않는다.
    case 'verify-claim':
    case 'photograph':
    case 'publish':
    case 'shield':
    case 'refuse-demand':
    case 'frame':
    case 'eavesdrop':
    case 'detect-lie':
      return null
  }
}
```

`GameState`에 `pending`을 이 Step에서 함께 넣는다(Task 4·5·7·9가 전부 이것을 쓴다).

```ts
  /**
   * 결과가 아직 안 나온 능력 지목. 선언·이의제기·밀담이 끝나야 답이 정해지는 것들이 머문다.
   * 해소되면 grants로 옮겨가거나 라운드 기록에 반영된다.
   */
  readonly pending: readonly { readonly ownerId: PlayerId; readonly use: PowerUse }[]
```

- [ ] **Step 6b: 직업에 값을 매긴다**

`effect`를 `PowerUse['kind'] | null`로 둔다. **구현된 것만 값을 주고 나머지는 `null`이다** —
`null`이면 능력 버튼이 뜨지 않고 AI도 쓰지 않는다. 풀에서 빼지 않으므로 배정이 깨지지 않는다
(`assignRoles`는 시민 5종·범인 1종이 필요하다).

```ts
  /**
   * 이 직업이 발동하는 능력의 종류. 아직 구현되지 않았으면 null이다.
   * 태스크가 끝날 때마다 해당 직업에 값을 매긴다(계획서 Task 4~11).
   */
  readonly effect: PowerUse['kind'] | null
```

이 태스크 시점의 값: 검시관 `'inspect-hand'` · 약제사 `'check-weapon'` · **나머지 8종 `null`**.

Step 5의 `PENDING` 배열은 만들지 않는다 — `null`이 같은 일을 더 단순하게 한다.

- [ ] **Step 7: 프롬프트에 싣는다**

`workers/src/prompt.ts`의 관측 로그를 만드는 곳에, 라운드 목록 다음에 붙인다.
스키마는 `workers/src/schema.ts`의 `view` 파싱에도 `findings`가 통과해야 한다.

```ts
function findingLines(view: DecideView): string[] {
  if (view.findings.length === 0) return []
  const lines = view.findings.map((grant) => {
    const f = grant.finding
    switch (f.kind) {
      case 'hand':
        return `  · ${grant.round}R 능력으로 확인: ${who(f.targetId)}는 «${cardName(f.cardId)}»를 갖고 있다`
      case 'weapon':
        return `  · ${grant.round}R 능력으로 확인: «${cardName(f.cardId)}»는 정답이 ${f.isSolution ? '맞다' : '아니다'}`
    }
  })
  return ['[내가 능력으로 확인한 것 — 추측이 아니라 사실이다]', ...lines]
}
```

- [ ] **Step 8: 전체 검증**

```bash
npx vitest run && npm run typecheck && npm run worker:typecheck
```
예상: 전부 통과

- [ ] **Step 9: 커밋**

```bash
git add src/engine/view.ts src/engine/view.test.ts src/content/roles.ts workers/src/prompt.ts workers/src/schema.ts
git commit -m "feat: 능력으로 확인한 것이 시야와 프롬프트에 실린다"
```

---

## Task 2a: 사람이 능력을 쓴다 — 스토어 (담당 A)

**Task 2b(UI)와 동시에 갈 수 있다.** 파일이 겹치지 않는다.
이 태스크가 끝나면 능력이 «호출 가능»해지고, 2b가 끝나면 «클릭 가능»해진다.

**Files:**
- Modify: `src/store/game.ts` (`usePower` 액션)
- Modify: `src/engine/power.ts` (`buildPowerUse`)
- Test: `src/store/game.test.ts`

**Interfaces:**
- Consumes: `usePower`, `findingsFor` (Task 0), `Role.effect` (Task 1)
- Produces:
  ```ts
  // store/game.ts
  usePower: (intent: { targetId?: PlayerId; cardId?: CardId }) => void
  powerUsed: () => boolean
  ```

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/store/game.test.ts`의 `describe('useGame')` 안에 넣는다.

```ts
it('사람이 능력을 쓰면 알게 된 것이 시야에 남는다', async () => {
  await game().start('power-store', 0)
  const target = game().view().players.find((p) => !p.isMe)
  if (!target) throw new Error('상대가 없다')

  game().usePower({ targetId: target.id })

  expect(game().view().findings.length).toBeGreaterThan(0)
  expect(game().powerUsed()).toBe(true)
})

it('능력이 없는 직업이면 아무 일도 하지 않는다', async () => {
  await game().start('power-none', 0)
  // effect가 null인 직업이 배정된 시드에서는 발동이 무시된다.
  const before = game().state
  if (game().role().effect !== null) return

  game().usePower({ targetId: 'p1' })

  expect(game().state).toBe(before)
})
```

- [ ] **Step 2: 실패를 확인한다**

실행: `npx vitest run src/store/game.test.ts`
예상: `usePower is not a function` 으로 실패

- [ ] **Step 3: 스토어에 액션을 더한다**

`src/store/game.ts`. `role()` 근처에 둔다.

```ts
    powerUsed: () => {
      const state = get().state
      if (!state) return false
      return state.powersUsed.includes(humanId(state))
    },

    /**
     * 사람의 능력 발동.
     *
     * **종류는 인자로 받지 않는다** — 좌석에 배정된 직업에서 나온다.
     * 화면이 종류를 정하게 두면 화면 버그가 곧 룰 위반이 된다.
     */
    usePower: (intent) => {
      const state = get().state
      if (!state) return
      const effect = get().role().effect
      if (effect === null) return
      const use = buildPowerUse(effect, intent)
      if (!use) return
      apply((s) => usePowerIn(s, humanId(s), use))
    },
```

`buildPowerUse`를 `src/engine/power.ts`에 더한다.

```ts
/** 「쓴다 + 대상」에 좌석의 능력 종류를 붙여 실행 가능한 형태로 만든다. */
export function buildPowerUse(
  effect: PowerUse['kind'],
  intent: { targetId?: PlayerId; cardId?: CardId },
): PowerUse | null {
  switch (effect) {
    case 'inspect-hand':
      return intent.targetId ? { kind: 'inspect-hand', targetId: intent.targetId } : null
    case 'check-weapon':
      return intent.cardId ? { kind: 'check-weapon', cardId: intent.cardId } : null
  }
}
```

- [ ] **Step 4: 통과를 확인한다**

실행: `npx vitest run src/store/game.test.ts`
예상: PASS

- [ ] **Step 5: 검증 후 커밋**

```bash
npx vitest run && npm run typecheck
git add src/store/game.ts src/store/game.test.ts src/engine/power.ts
git commit -m "feat: 스토어가 사람의 능력 발동을 받는다"
```

---

## Task 2b: 사람이 능력을 쓴다 — 화면 (담당 B)

**Task 2a·3과 동시에 갈 수 있다.** 컴포넌트와 CSS만 건드린다.

**Files:**
- Create: `src/components/PowerPanel.tsx`
- Modify: `src/components/GameScreen.tsx` (패널 배치 + 확인 결과 표시)
- Modify: `src/styles/game.css`

**Interfaces:**
- Consumes (Task 2a가 만든 것):
  ```ts
  store.usePower(intent: { targetId?: PlayerId; cardId?: CardId }): void
  store.powerUsed(): boolean
  store.role(): Role          // role.effect가 null이면 능력이 없다
  view.findings: readonly Grant[]
  ```

- [ ] **Step 1: 발동 패널을 만든다**

`src/components/PowerPanel.tsx`. `role().effect !== null && !powerUsed()`일 때만 뜬다.
대상 선택은 `effect`에 따라 갈린다 — `inspect-hand`는 사람 목록, `check-weapon`은 수단 카드 목록.
그 외 8종은 이 시점에 `null`이므로 패널이 뜨지 않는다.

제약: 애니메이션은 `transform`·`opacity`만. 색·타이포·간격은 `global.css`의 CSS 변수를 쓰고
값을 컴포넌트에 직접 박지 않는다. 클래스는 `power__panel`·`power__pick` 형태의 BEM.

- [ ] **Step 2: 확인한 것을 표시한다**

`GameScreen.tsx`에서 `view.findings`를 읽어 추리표 옆에 건다.
**「능력으로 확인」 표시를 반드시 단다** — 추측과 구별되지 않으면 이 능력의 값이 사라진다.

- [ ] **Step 3: 검증 후 커밋**

```bash
npm run build
git add src/components/PowerPanel.tsx src/components/GameScreen.tsx src/styles/game.css
git commit -m "feat: 능력 발동 패널과 확인 결과 표시"
```

---

## Task 3: AI가 능력을 쓴다

**Files:**
- Modify: `src/ai/decider.ts` (`Spoken`에 `power` 필드)
- Modify: `src/ai/llm-decider.ts` · `src/ai/rule-decider.ts`
- Modify: `src/ai/flow.ts` (판단 뒤 능력 적용)
- Modify: `workers/src/schema.ts` · `workers/src/prompt.ts` (구조화 출력에 필드 추가)
- Test: `src/ai/flow.test.ts`

**Interfaces:**
- Consumes: `buildPowerUse`, `usePower` (Task 0·2)
- Produces:
  ```ts
  // ai/decider.ts — Spoken에 추가
  readonly power?: { readonly targetId?: PlayerId; readonly cardId?: CardId } | null
  ```

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
it('AI가 능력을 쓰겠다고 하면 라운드가 그것을 반영한다', async () => {
  const state = createGame({ seed: 'ai-power' })
  const decider: Decider = {
    ...ruleDecider,
    chooseClaim: async (view) => ({
      value: { kind: 'pass' },
      line: null,
      power: { targetId: view.players.find((p) => !p.isMe)?.id },
    }),
  }

  const after = await stepAi(afterSuggest(state), decider)

  expect(after.grants.length).toBeGreaterThan(0)
})

it('능력이 없는 좌석이 쓰겠다고 해도 발동하지 않는다', async () => {
  // effect가 null인 좌석은 buildPowerUse가 호출되지 않는다 — AI가 룰을 어길 수 없다.
})
```

- [ ] **Step 2: 실패를 확인한다**

실행: `npx vitest run src/ai/flow.test.ts`
예상: `grants` 가 비어 있어 실패

- [ ] **Step 3: `Spoken`을 확장한다**

`src/ai/decider.ts`.

```ts
export interface Spoken<T> {
  readonly value: T
  readonly line: string | null
  /**
   * 능력을 함께 쓰겠다는 의사. 없으면 안 쓴다.
   *
   * **종류가 없는 것이 핵심이다.** 종류를 실으면 LLM이 남의 능력을 쓸 수 있다.
   * 호출부가 좌석의 직업을 조회해 종류를 붙인다(결정 007).
   */
  readonly power?: { readonly targetId?: PlayerId; readonly cardId?: CardId } | null
}
```

`silent()`는 `power`를 안 실으므로 그대로 둔다 — 규칙 기반 판단자는 능력을 쓰지 않는다.

- [ ] **Step 4: flow에서 적용한다**

`src/ai/flow.ts`의 `stepAi`·`declareWithHuman`에서 판단을 받은 직후, 좌석의 직업을 조회해
`buildPowerUse`로 만든 뒤 `usePower`를 통과시킨다. 이미 썼거나 `effect`가 `null`이면 건너뛴다.

- [ ] **Step 5: 워커 스키마에 필드를 더한다**

`workers/src/schema.ts`의 구조화 출력 스키마에 `power`를 선택 필드로 넣고,
`prompt.ts`에 「능력을 쓸 수 있다면 언제 쓸지」를 한 문단으로 설명한다.
**아직 안 쓴 경우에만** 프롬프트에 넣는다 — 쓸 수 없는 턴에 설명을 실으면 캐시 프리픽스가 흔들린다.

- [ ] **Step 6: 검증 후 커밋**

```bash
npx vitest run && npm run typecheck && npm run worker:typecheck
git commit -m "feat: AI가 기존 판단 호출에 얹어 능력을 쓴다"
```

---

## Task 4: 순사 — 지목이 먼저, 결과가 나중

「한 명의 이번 라운드 반증이 참인지 통보받는다」. 선언 **전에** 지목하고 선언 **후에** 받는다.

**Files:**
- Modify: `src/engine/types.ts` (`PowerUse`에 `verify-claim`, `Finding`에 `claim`)
- Modify: `src/engine/power.ts` (미해소 지목 보관)
- Modify: `src/engine/round.ts` (`declareAll` 끝에서 해소)
- Modify: `src/content/roles.ts` (순사 `effect`)
- Test: `src/engine/power.test.ts`

**Interfaces:**
- Produces:
  ```ts
  | { readonly kind: 'verify-claim'; readonly targetId: PlayerId }   // PowerUse
  | { readonly kind: 'claim'; readonly targetId: PlayerId; readonly truthful: boolean }  // Finding
  ```

- [ ] **Step 1: 실패하는 테스트**

```ts
it('순사는 선언이 나온 뒤에 진위를 통보받는다', () => {
  const state = afterSuggest(createGame({ seed: 'constable' }))
  const me = state.players[1]
  const target = state.players[2]
  if (!me || !target) throw new Error('좌석이 모자란다')

  const armed = usePower(state, me.id, { kind: 'verify-claim', targetId: target.id })
  expect(findingsFor(armed, me.id)).toHaveLength(0)   // 아직 결과가 없다

  const declared = declareAll(armed, claimsFor(armed))
  const grant = findingsFor(declared, me.id)[0]

  if (grant?.finding.kind !== 'claim') throw new Error('finding 종류가 다르다')
  const declaration = declared.rounds[0]?.declarations.find((d) => d.playerId === target.id)
  expect(grant.finding.truthful).toBe(!declaration?.isPerjury)
})
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/engine/power.test.ts`

- [ ] **Step 3: 미해소 지목을 상태에 둔다**

`GameState`에 필드를 하나 더한다.

```ts
  /**
   * 결과가 아직 안 나온 능력 지목. 선언이 끝나야 답이 정해지는 것들이 여기 머문다.
   * 해소되면 grants로 옮겨간다.
   */
  readonly pending: readonly { readonly ownerId: PlayerId; readonly use: PowerUse }[]
```

- [ ] **Step 4: `declareAll` 끝에서 해소한다**

`round.ts`의 `declareAll` 반환 직전에, `state.pending` 중 `verify-claim`을 찾아
해당 선언의 `isPerjury`를 읽어 `Grant`로 옮긴다.

```ts
/** 선언이 확정된 뒤에야 답이 나오는 지목을 푼다. */
function resolvePending(state: GameState, declarations: readonly Declaration[]) {
  // pending에서 verify-claim만 꺼내 truthful로 바꾸고 grants에 넣는다
}
```

- [ ] **Step 5: 통과 확인 후 순사를 풀에 되돌린다** — `effect: 'verify-claim'`

- [ ] **Step 6: 검증 후 커밋** — `git commit -m "feat: 순사가 반증의 진위를 통보받는다"`

---

## Task 5: 사진사 — 다음 라운드 위증 즉시 발각

`isPerjury`를 쓰는 첫 능력이다. 지금 이 값은 계산만 되고 아무도 못 본다(`types.ts:54`).

**Files:** `src/engine/types.ts` · `src/engine/power.ts` · `src/engine/round.ts` · `src/content/roles.ts` · `src/engine/power.test.ts`

- [ ] **Step 1: 실패하는 테스트**

```ts
it('촬영당한 사람이 다음 라운드에 위증하면 이의제기 없이 드러난다', () => {
  // 촬영 → 다음 라운드 declareAll에서 대상이 위증 → 그 사실이 전체에 공개된다
})
```

- [ ] **Step 2~4:** `PowerUse`에 `{ kind: 'photograph'; targetId }`, `pending`에 라운드를 실어
  **다음** 라운드 `declareAll`에서 검사한다. 결과는 한 사람이 아니라 **전체 공개**이므로
  `Grant`가 아니라 `RoundRecord`에 남긴다.

```ts
// RoundRecord에 추가
/** 사진사에게 발각된 위증. 이의제기를 거치지 않고 전체가 본다. */
readonly exposed: readonly PlayerId[]
```

- [ ] **Step 5: 검증 후 커밋** — `git commit -m "feat: 사진사가 다음 라운드 위증을 즉시 발각한다"`

---

## Task 6: 신문기자 — 지난 반증의 진위를 전체 공개

**Files:** `src/engine/types.ts` · `src/engine/power.ts` · `src/engine/view.ts` · `src/content/roles.ts` · `src/engine/power.test.ts`

능력 문구를 다듬는다. 「자기가 본 반증 1건을 전체에 공개한다」 →
**「지난 반증 1건의 진위를 전체에 공개한다」.** 반증 선언 자체는 이미 공개이고
숨겨진 것은 진위뿐이므로, 지금 문구는 능력이 비어 보인다.

- [ ] **Step 1: 실패하는 테스트** — 공개 후 **모든** 시야에서 그 진위가 보이는지
- [ ] **Step 2~4:** `PowerUse`에 `{ kind: 'publish'; round: number; targetId: PlayerId }`.
  결과는 전체 공개이므로 `RoundRecord`에 `published: readonly {playerId, truthful}[]`로 남긴다.
- [ ] **Step 5: 검증 후 커밋** — `git commit -m "feat: 신문기자가 지난 반증의 진위를 공개한다"`

---

## Task 7: 밀정 — 이의제기 1회 무효

가장 작은 태스크다. `challenge.ts:82`의 `success`를 덮는다.

**Files:** `src/engine/types.ts` · `src/engine/challenge.ts` · `src/content/roles.ts` · `src/engine/challenge.test.ts`

- [ ] **Step 1: 실패하는 테스트**

```ts
it('밀정은 카드가 잡혀도 이의제기가 실패한다', () => {
  // 고발자가 대상의 선언 카드를 쥐고 있는 상황을 만든다 → 평소엔 success: true
  // 밀정 보호가 걸려 있으면 success: false 이고 벌칙이 고발자에게 간다
})
```

- [ ] **Step 2~4:** `PowerUse`에 `{ kind: 'shield' }`(대상 없음, 자기 보호).
  `challenge()`에서 `state.powersUsed`가 아니라 **소진 시점**을 따로 봐야 한다 —
  능력은 선언 시점에 예약되고 이의제기 시점에 쓰인다. `pending`을 그대로 쓴다.

```ts
const shielded = state.pending.some((p) => p.ownerId === targetId && p.use.kind === 'shield')
const success = !shielded && challenger.hand.includes(cardId)
```

- [ ] **Step 5: 검증 후 커밋** — `git commit -m "feat: 밀정의 위증 1회는 이의제기를 견딘다"`

---

## Task 8: 변호사 — 반증 요구 1회 거부

`Claim` 유니온을 넓힌다. `noFallthroughCasesInSwitch`가 켜져 있어 **컴파일러가 고칠 자리를
전부 짚어준다.** 그 목록을 따라가는 것이 이 태스크다.

**Files:** `src/engine/types.ts` · `src/engine/round.ts` · `src/engine/challenge.ts` · `src/engine/view.ts` · `src/components/*` · `src/content/fallback-lines.ts` · 관련 테스트 전부

- [ ] **Step 1: 실패하는 테스트**

```ts
it('거부는 위증이 아니고 이의제기 대상도 아니다', () => {
  // claim: {kind:'refuse'} → isPerjury false, challenge()가 던진다
})
```

- [ ] **Step 2: 실패 확인** — 타입 에러가 여러 파일에서 난다. **그 목록이 작업 목록이다.**
- [ ] **Step 3: `Claim`에 추가**

```ts
export type Claim =
  | { readonly kind: 'refute'; readonly cardId: CardId }
  | { readonly kind: 'pass' }
  /** 변호사의 거부. 침묵과 달리 «반증 의무 자체를 면제»받는다 — 위증이 되지 않는다. */
  | { readonly kind: 'refuse' }
```

- [ ] **Step 4:** `isPerjury`가 `refuse`에 `false`를 반환하게, `challenge()`가 `refuse`를
  침묵과 같이 거부하게, UI가 거부 버튼을 변호사에게만 보이게 한다.
- [ ] **Step 5: 검증 후 커밋** — `git commit -m "feat: 변호사가 반증 요구를 1회 거부한다"`

**리뷰 크기 주의:** 이 태스크는 300줄을 넘길 수 있다. 넘으면 엔진(Step 3~4)과 UI를 나눈다.

---

## Task 9: 협잡꾼 — 남의 선언 카드를 바꿔치기

**중요:** `challenge.ts:82`는 `success = challenger.hand.includes(cardId)`다.
이의제기 성공은 `isPerjury`가 아니라 **카드 소지**로 정해진다. 그러므로 `isPerjury`를
뒤집어도 아무 일이 일어나지 않는다 — **선언한 카드 자체를 바꿔야** 물린다.

**Files:** `src/engine/types.ts` · `src/engine/round.ts` · `src/content/roles.ts` · `src/engine/round.test.ts`

- [ ] **Step 1: 실패하는 테스트**

```ts
it('조작당한 사람은 자기가 안 낸 카드로 선언한 것이 된다', () => {
  // 협잡꾼이 대상을 지목 → declareAll에서 대상의 claim.cardId가 바뀐다
  // 바뀐 카드를 쥔 제3자가 이의제기하면 성공한다
})

it('조작은 대상의 대사를 바꾸지 않는다', () => {
  // line은 그대로다 — 말은 그대로인데 기록만 달라진 것이 이 능력의 무서움이다
})
```

- [ ] **Step 2~4:** `PowerUse`에 `{ kind: 'frame'; targetId }`. `declareAll`에서 `pending`을 보고
  대상의 `claim.cardId`를 제안된 3장 중 다른 것으로 바꾼다(시드 파생 난수).
  `claim.kind`가 `refute`가 아니면 조작할 것이 없으므로 조용히 넘어간다.
- [ ] **Step 5: 검증 후 커밋** — `git commit -m "feat: 협잡꾼이 남의 반증을 조작한다"`

---

## Task 10: 밀담 다건화 + 전화교환수

**전제 확인:** `parley()`는 기록 후 **즉시 `nextRound`를 부른다**(`parley.ts:44`).
`RoundRecord.parley`도 단수다. 밀담 2건은 이 둘을 함께 바꿔야 한다 —
어제 추정한 「상한값 하나」보다 크다.

**Files:** `src/engine/types.ts` · `src/engine/parley.ts` · `src/engine/view.ts` · `src/store/game.ts` · `src/components/Parley.tsx` · `workers/src/prompt.ts` · 관련 테스트

- [ ] **Step 1: 실패하는 테스트**

```ts
it('밀담 허용이 2건이면 첫 밀담은 라운드를 넘기지 않는다', () => {
  const state = atWhisper(createGame({ seed: 'operator' }))
  const after = parley(state, 'p1', '묻는다', '답한다')
  expect(after.phase).toBe('whisper')
  expect(after.round).toBe(state.round)
})

it('허용을 다 쓰면 라운드가 넘어간다', () => { /* 2건째에 nextRound */ })

it('전화교환수는 자기가 끼지 않은 밀담도 본다', () => {
  // AI 전화교환수 시야에 사람↔제3자 밀담이 실린다
})
```

- [ ] **Step 2: 실패 확인**
- [ ] **Step 3: `RoundRecord.parley`를 배열로 바꾼다**

```ts
  /** 이 라운드에 오간 밀담. 보통 최대 1건, 전화교환수(사람)가 있으면 2건이다. */
  readonly parleys: readonly ParleyRecord[]
```

`GameState`에 허용치를 둔다.

```ts
  /** 라운드당 밀담 허용 건수. 사람이 전화교환수면 2다(결정 007). */
  readonly parleyAllowance: number
```

- [ ] **Step 4:** `parley()`가 허용치에 닿았을 때만 `nextRound`를 부르게 고친다.
  `viewFor`의 밀담 필터에 엿듣기 항을 더한다.

```ts
    parleys: record.parleys.filter(
      (p) => viewer.isHuman || p.targetId === viewerId || canEavesdrop(state, viewerId, record.round),
    ),
```

- [ ] **Step 5:** `createGame`에서 사람의 직업이 전화교환수면 `parleyAllowance: 2`.
  **엔진은 직업 이름을 모르므로** 이 값은 `SetupOptions`로 받는다.
- [ ] **Step 6: 검증 후 커밋** — `git commit -m "feat: 전화교환수가 회선을 하나 더 쓰거나 엿듣는다"`

**리뷰 크기 주의:** 이 태스크는 확실히 300줄을 넘는다. 엔진(Step 3~5)과 UI를 반드시 나눈다.

---

## Task 11: 정보상 — 말한 사람의 자기 신고

**착수 전에 결정이 필요하다.** 능력은 밀담 상대 발언의 참·거짓 판정인데, AI가 쥐면 판정
대상이 «사람이 타이핑한 자유 텍스트»가 된다. 자기 신고는 말한 쪽이 자기 거짓말을 알아야
성립하는데 **사람은 엔진에 신고하지 않는다.** 전화교환수와 같은 비대칭이다.

대표 결정 후 이 자리를 채운다. 그때까지 정보상의 `effect`는 `null`로 둔다.

**Files (결정 후):** `src/ai/decider.ts` (`speakInParley` 반환형) · `src/ai/llm-decider.ts` ·
`src/ai/rule-decider.ts` · `workers/src/schema.ts` · `src/engine/types.ts` · `src/store/game.ts`

사람이 쥔 경우의 구현은 이미 정해져 있다.

```ts
// ai/decider.ts
speakInParley(view: GameView, ask: string): Promise<{ line: string; truthful: boolean } | null>
```

말한 에이전트가 자기 거짓말 여부를 함께 신고한다. **엔진이 텍스트를 판정하지 않으므로**
룰 엔진 순수성(설계 §5)과 부딪히지 않는다. 밀담은 원래 룰이 읽지 않는 자리다(`types.ts:83`).
규칙 기반 판단자는 `null`을 그대로 돌려주므로 폴백 경로가 깨지지 않는다.

---

## 실행 순서와 중단 지점

일정이 밀리면 **어느 태스크 끝에서 멈춰도 게임은 온전하다.** 남은 직업은 `effect: null`이라
배정에는 나오되 능력만 없다.

순서는 **직렬 구간**과 **병렬 구간**으로 갈린다.

### 직렬 구간 — 여기는 순서를 지킨다

| 순서 | 태스크 | 끝나면 |
|---|---|---|
| 1 | **Task 0.5** | **폴백에서도 밀담이 답한다 — D8 안전선이 닫힌다** |
| 2 | Task 1 | 능력 종류 10종 선언 + 검시관·약제사가 AI에게 보인다 |
| 3 | Task 2a · **2b 동시** | 사람이 능력을 쓴다 — 첫 플레이 가능 지점 |
| 4 | Task 3 | AI도 능력을 쓴다. LLM 호출 수는 12/라운드 그대로 |

Task 1의 Step 6이 10종을 미리 선언하므로, **여기부터 병렬이 열린다.**

### 병렬 구간 — 서로 다른 파일이라 동시에 간다

| 갈래 | 태스크 | 건드리는 파일 |
|---|---|---|
| X | Task 7 (밀정) | `engine/challenge.ts` |
| Y | Task 4 → 5 → 9 (순사 → 사진사 → 협잡꾼) | `engine/round.ts` — **셋이 같은 파일이라 갈래 안에서는 순차** |
| Z | Task 6 (신문기자) | 라운드 기록 + `engine/view.ts` |
| W | Task 10 (전화교환수) | `engine/parley.ts` |

**Task 8(변호사)은 병렬로 돌리지 않는다.** `Claim` 유니온을 넓히므로 엔진·UI·테스트 전체에
파급된다. 다른 갈래가 모두 끝난 뒤 혼자 돌린다.

**Task 11(정보상)은 대표 결정 대기다.**

### 중단선

**D8·D9를 위협하면 Task 3에서 멈춘다.** 그 시점에 안전선(0.5)이 닫혀 있고 능력 2종이 완전히
작동하며 나머지 8종은 `effect: null`로 이야기 소재로 남는다 — 지금과 같은 상태이므로 잃는 것이 없다.

### 팀 분업

`CLAUDE.md`의 브랜치 scope 경계에 맞춘다.

| 담당 | 태스크 |
|---|---|
| A (`engine`·`agent`·`fallback`) | Task 0.5 · 1 · 2a · 3 · 병렬 구간 전부 |
| B (`ui`·`content`·`docs`) | Task 2b · D9 문서 3종 · 영상 |

---

## 자체 점검

**결정 007 대응:** 4기전 분류(Task 1·4~9·10·11), AI 능동 사용을 기존 호출에 얹기(Task 3),
전화교환수 (가)안(Task 10), 정보상 미결(Task 11에 명시) — 모두 태스크가 있다.

**미결로 남긴 것:** Task 11의 정보상. 결정 007에도 「아직 정하지 않은 것」으로 적혀 있다.

**타입 일관성:** `PowerUse['kind']`가 곧 직업의 `effect`다. `buildPowerUse`(Task 2)가 유일한
변환 지점이고 Task 3의 AI 경로도 이것을 쓴다. `Finding` 종류는 `PowerUse` 종류와 1:1이 아니다 —
사진사·신문기자는 전체 공개라 `Grant`가 아니라 `RoundRecord`로 간다.

**리뷰 크기 초과 경고를 붙인 태스크:** Task 8 · Task 10.
