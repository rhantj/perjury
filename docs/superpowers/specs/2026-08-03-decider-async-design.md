# 설계 — Decider 경계와 비동기 전환 (LLM 작업 A단계)

> 작성일 2026-08-03 / 마감까지 D-7
> 담당 A (엔진·에이전트)
> 상위 문서: [01-game-design.md](../../01-game-design.md) §5, [02-tech-and-plan.md](../../02-tech-and-plan.md) §2·§4

---

## 0. 이 문서의 범위

LLM 연동 전체가 아니라 **그 첫 조각 하나**다.

LLM 작업은 다섯 덩어리로 쪼갰다.

| # | 덩어리 | 상태 |
|---|---|---|
| **A** | **비동기 전환 + Decider 경계** | **이 문서** |
| B | Cloudflare Workers 프록시 (키·CORS·예산 캡) | 미착수 |
| C | 반증 판단 LLM화 (구조화 출력) + 비용 실측 | 미착수 |
| D | 밀담 페이즈 (UI·대화·신뢰도) | 미착수 |
| E | 최종 투표 LLM화 | 미착수 |

A → B → C → D → E 순으로 간다. A는 LLM을 **한 번도 호출하지 않는다.** 그런데도 먼저 하는 이유가 §1이다.

---

## 1. 왜 이것부터인가

### 1.1 바뀌기 전에는 무엇이 있었나

지금 게임은 전부 동기다.

```
GameScreen ──▶ store/game.ts ──▶ ai/flow.ts ──▶ engine/*  (순수·동기)
                  apply()          advanceToHuman()
                                        │
                                        └─▶ ai/rules.ts  (규칙 기반 판단)
```

`advanceToHuman()`은 사람 차례가 올 때까지 AI 스텝을 최대 200번 도는 **동기 루프**다(`src/ai/flow.ts:133`).
store의 `apply()`도 동기다(`src/store/game.ts:63`). 사람이 버튼을 누르면 AI 5명의 판단이 같은 프레임 안에 끝난다.
대기라는 개념이 코드에 없다.

`src/ai/rules.ts`는 `GameView` 하나만 보고 판단하는 순수 함수 네 개다 — 제안·반증·이의제기·투표.
파일 주석이 이미 밝히고 있듯 **이것이 곧 폴백**이다. LLM이 들어와도 버리지 않는다.

### 1.2 왜 바꾸는가

LLM 호출은 async다. 즉 "LLM 붙이기"는 판단 로직 교체가 아니라 **실행 모델 전환**이다.
동기 루프를 그대로 두면 B·C·D·E 어느 것도 붙일 자리가 없다.

동시에, 붙이는 방식이 프로젝트의 절대 규칙 두 개를 건드린다.

- **규칙 2 — 룰 엔진은 순수 함수다.** LLM 호출이 엔진에 새어 들어가면 안 된다.
- **규칙 4 — 폴백 경로를 깨지 않는다.** LLM 응답이 있어야만 동작하는 코드를 쓰면 안 된다.

그래서 A는 "async로 바꾸기"가 아니라 **"LLM이 들어올 구멍을 규칙을 지키는 모양으로 뚫어두기"** 다.

### 1.3 어떤 원리를 쓰는가

**의존성 역전 하나뿐이다.** 판단을 인터페이스(`Decider`) 뒤로 숨기고, 구현체를 갈아 끼운다.

핵심 제약은 인터페이스의 **입력**에 있다. 입력을 `GameView`로 고정하면 정보 격리가 타입으로 강제된다.
`viewFor()`는 이미 seed·정답·남의 손패·`isPerjury`를 빼고 담는다(`src/engine/view.ts:80`).
`GameView`만 받는 `Decider`는 **전지적 정보를 받을 물리적 통로가 없다.**

설계 §5.1의 "AI는 게임 엔진이 준 컨텍스트로만 판단한다"가 주석이 아니라 타입이 된다.

### 1.4 그래서 코드가 이렇게 된다

§2부터.

---

## 2. 파일 구성

```
src/ai/
  rules.ts              불변   순수 판단 함수 — 한 줄도 고치지 않는다
  decider.ts            신규   Decider 인터페이스 + createRoundFallback
  decider.test.ts       신규
  rule-decider.ts       신규   rules.ts를 Decider로 감싼다 (= 폴백 본체)
  rule-decider.test.ts  신규
  flow.ts               수정   stepAi / advanceToHuman / declareWithHuman / passChallenge → async
  flow.test.ts          수정   async 시그니처
  autoplay.ts           수정   async (D8 밸런싱 도구)
  autoplay.test.ts      수정   async 시그니처
src/store/
  game.ts               수정   apply → async, aiThinking·fallbackRound 노출, gameId
  game.test.ts          수정   async 시그니처 + 대기·gameId 케이스 추가
```

**건드리지 않는 것:** `src/engine/*` 전부, `src/components/*` 전부, `src/content/*` 전부.

---

## 3. Decider 인터페이스

```ts
export interface Decider {
  chooseSuggestion(view: GameView): Promise<Suggestion>
  chooseClaim(view: GameView): Promise<Claim>
  chooseChallengeTarget(view: GameView): Promise<PlayerId | null>
  chooseAccusation(view: GameView): Promise<Suggestion>
}
```

`src/ai/rules.ts`의 네 함수와 1:1로 대응한다. 이름은 **동사 + 반환 타입**으로 맞췄다 —
`chooseClaim`이 `Claim`을 준다는 것이 호출부에서 바로 읽힌다.

`chooseAccusation`만 이름이 반환 타입(`Suggestion`)과 다르다. 최종 고발은 제안과 자료형이 같지만
**의미가 다르기 때문이다** — 제안은 정보를 캐는 행위고, 고발은 판을 끝내는 행위다.
도메인 용어 매핑(최종 고발 = `accusation`)을 따른다.

반환 타입이 전부 엔진 타입이므로, `Decider`가 무엇을 돌려주든 **엔진의 검증을 그대로 통과해야 한다.**
AI가 룰을 어길 수 없다(규칙 2).

### 3.1 배제한 대안

| 대안 | 왜 버렸나 |
|---|---|
| 스텝 단위 `decider.step(state): Promise<GameState>` | Decider가 `GameState`(정답 포함)를 받고 엔진 함수도 호출하게 된다. 규칙 2가 무너진다 |
| 라운드 배치 `decider.decideRound(views): Promise<Decisions>` | LLM 호출을 5→1로 줄여 비용에 유리하다. 그러나 5명의 시야가 한 프롬프트에 들어가는 순간 에이전트가 서로의 손패를 본다. 위증이 성립하지 않는다 |

---

## 4. seed는 경계를 넘지 않는다

`rules.ts`의 판단 함수는 `salt`를 받는다. salt는 `${seed}:${kind}:${round}:${playerId}` 형태다(`src/ai/flow.ts:9`).
그런데 `GameView`에는 seed가 없다 — 알면 판을 재계산해 정답을 뽑을 수 있어서 `viewFor()`가 일부러 뺐다.

seed를 인터페이스에 태우지 않고 **구현체에 가둔다.**

```ts
export function createRuleDecider(seed: string): Decider
// 내부에서 view.round + view.viewerId로 salt를 재구성한다.
// 인터페이스는 (view) => Promise<T>뿐이라 seed가 나갈 통로가 없다.
```

LLM Decider는 seed를 아예 받지 않으므로 프롬프트에 섞일 수 없다.

**시드 재현성은 유지된다.** salt 문자열은 지금과 글자 그대로 같다. 같은 시드로 규칙 기반 판을 돌리면
지금과 동일한 결과가 나온다 — 이것이 A2 회귀 테스트의 판정 기준이다.

---

## 5. 데이터 흐름

```
사람 조작
   ↓
store.apply(transition)             async. aiThinking = true
   ↓
flow.advanceToHuman(state, ...)     사람 차례가 올 때까지 await 루프 (최대 200스텝)
   ↓
flow.stepAi(state, decider)
   ├ suggest    await decider.chooseSuggestion(view)
   ├ refute     await Promise.all(제안자 제외 5명)
   ├ challenge  순차 await (첫 잡는 사람에서 멈춤)
   └ accuse     await Promise.all(AI 시민들)
   ↓
engine 순수 함수                     여기는 그대로 동기
   ↓
store.set({ state, aiThinking: false })
```

### 5.1 라운드 스코프 Decider는 누가 만드는가

`createRoundFallback`이 만드는 Decider는 수명이 한 라운드다(§6).
그래서 flow는 Decider를 **직접 받지 않고 팩토리를 받는다.**

```ts
export type DeciderForRound = (round: number) => Decider

export async function advanceToHuman(state: GameState, deciderForRound: DeciderForRound): Promise<GameState>
// 루프 안에서 state.round가 바뀔 때만 deciderForRound를 다시 부른다.
// 같은 라운드 안에서는 같은 인스턴스를 쓴다.

export async function stepAi(state: GameState, decider: Decider): Promise<GameState>
// 스텝 하나는 Decider 인스턴스를 그대로 받는다. 라운드 경계를 모른다.
```

store가 `deciderForRound`를 소유한다. store의 `start()`가 `makeDeciders(seed)`로 고른 팩토리를
**항상** `createRoundFallback(chosen(round), createRuleDecider(seed), onFallback)`으로 감싸
넘긴다 — A 단계부터 이미 그렇다. C 단계에서 `makeDeciders`에 LLM 팩토리를 꽂아도 이 감싸는
지점은 그대로다. **flow와 store의 시그니처는 그때 바뀌지 않는다.**

### 5.2 반증이 `Promise.all`인 이유

최적화가 아니라 **룰과의 일치**다. 설계 §1.4.1의 동시 선언은 서로의 답을 보지 못한 채 내는 것이고,
병렬 호출이 그 구조 그대로다. 순차로 돌리면 뒤에 호출된 에이전트가 앞 결과를 볼 수 있는 코드 경로가 생긴다.

부수적으로 지연이 5회분이 아니라 1회분으로 눌린다.

### 5.3 이의제기가 순차인 이유

이의제기는 원래 "먼저 잡는 사람 하나"만 성립한다(`src/ai/flow.ts:67`). 전원에게 물어볼 필요가 없다.
현재 동작을 그대로 유지한다. C 단계에서 LLM이 붙으면 호출 수가 늘 수 있으므로, 그때 재검토 대상으로 남긴다.

---

## 6. 폴백 범위

```ts
// 라운드마다 새로 만든다.
// 실패한 호출은 그 호출만 fallback으로 간다.
// 같은 라운드에서 두 번째 실패가 나면 남은 호출을 전부 fallback으로 보낸다.
export function createRoundFallback(preferred: Decider, fallback: Decider): Decider
```

인스턴스 수명이 한 라운드이므로 **다음 라운드에 자동으로 preferred를 재시도한다.** 별도 복구 로직이 없다.

### 6.1 왜 이 범위인가

| 단위 | 문제 |
|---|---|
| 라운드 단위 (첫 실패에 전부) | 한 라운드가 12번 호출한다. 호출당 3.6% 실패가 라운드 40%로 증폭된다 |
| 세션 단위 | 일시적 429·타임아웃 한 번에 남은 12분이 전부 폴백으로 떨어진다 |
| **호출 단위 + 2회 차단기** | 낙오 하나는 그 좌석만 삼키고, 회선이 죽으면 라운드를 접는다 |

**처음에는 「첫 실패 하나로 라운드 전체」였다.** 근거는 「호출 단위로 하면 LLM 대사와
사전생성 대사가 라운드 안에 섞여 톤이 무너진다」였는데, D5 실측이 이 근거를 두 군데서 뒤집었다.

- 규칙 기반 판단자는 대사를 **아예 내지 않는다**(`line: null`). 섞일 톤 자체가 없다.
  라운드를 통째로 접으면 그 라운드는 **여섯 명 전원이 침묵**한다. 한 좌석만 조용한 쪽이 덜 무너진다.
- 배포본 110건 측정에서 실패는 4건(3.6%)이고, 전부 병렬 5건 중 **하나만 늦은 낙오**였다
  (같은 배치의 나머지 넷은 4.2~4.8초, 낙오만 24~25초). 회선이 죽은 것이 아니다.

그래서 낙오 하나로는 접지 않는다. 다만 회선이 정말 죽었을 때 남은 페이즈까지
25초씩 매달리면 안 되므로, **같은 라운드에서 두 번째 실패가 나면 그때 접는다.**
병렬 배치는 실패해도 한꺼번에 실패하므로 이 둘은 잘 갈린다.

### 6.2 배너는 «접혔을 때»만 뜬다

`onFallback`은 차단기가 내려간 순간에만 부른다. 낙오 하나는 배너를 띄우지 않는다.
`fallbackRound`의 뜻이 「이 라운드는 규칙 기반이다」로 유지돼야 하기 때문이다 —
밀담 패널이 이 값을 보고 문을 닫으므로(설계 §9), 낙오 하나에 켜지면 멀쩡한 밀담이 막힌다.

### 6.3 A 단계에서의 상태

LLM Decider(`preferred`)가 아직 없다. 지금 store가 감싸는 `createRoundFallback`의 두 인수는
결국 규칙 Decider끼리다 — `makeDeciders`의 기본값이 `ruleDeciderForRound`이고, 감싸는 쪽의
`fallback`도 `createRuleDecider(seed)`다. **감싸는 배선 자체는 A 단계부터 이미 store에 있다.**
LLM Decider는 B·C에서 `makeDeciders` 자리에 꽂힌다. 지금 LLM 클라이언트 스텁을 만들지 않는다 — YAGNI.

넘어졌다는 사실은 store가 `fallbackRound`로 노출한다(§8).

**A 단계에서 `fallbackRound`는 항상 `false`다.** 경로가 없어서가 아니라, 지금 꽂힌 규칙
Decider가 절대 던지지 않아 넘어질 일이 없기 때문이다. 전달 경로는 이미 존재하며, C 단계에서
LLM Decider가 예외를 던지면 그대로 `true`가 뜬다.

---

## 7. 에러 처리

async가 되면서 없던 사고가 두 개 생긴다.

| 사고 | 대응 |
|---|---|
| 대기 중 사람이 버튼을 또 누름 | `aiThinking`이면 `apply`가 즉시 무시하고 반환 |
| 대기 중 `reset()` / 새 판 시작 → 늦게 도착한 결과가 **죽은 판을 되살림** | `gameId` 대조 |

### 7.1 `gameId`로 죽은 판을 막는다

`start`와 `reset`마다 새 `gameId`를 발급한다. 비동기 결과를 상태에 반영하기 **직전에**
시작 시점의 `gameId`와 현재 `gameId`를 대조하고, 다르면 결과를 버린다.

```
start(seed)   → gameId 1 → apply 시작 (gameId 1을 기억)
                             ↓
reset()       → gameId 2     │  ← 사람이 표지로 나감
start(새 시드) → gameId 3     │
                             ↓
                       결과 도착 (기억한 1 ≠ 현재 3) → 버린다
```

이 방어가 없으면 표지로 나갔다가 새 판을 시작했을 때 **이전 판의 응답이 새 판을 덮어쓴다.**
A 단계에서는 지연이 짧아 재현이 어렵지만, C 단계에서 실제 LLM이 붙으면 흔한 사고가 된다.
지금 넣어두는 것이 싸다.

### 7.2 룰 위반

엔진이 던지는 예외는 지금과 동일하게 처리한다 — 상태를 그대로 두고 `error`에만 메시지를 담는다
(`src/store/game.ts:63`). 잘못된 조작으로 판이 깨지지 않게 하는 지점이 그대로 유지된다.

---

## 8. store가 노출하는 계약

```ts
interface GameStore {
  // 기존
  state: GameState | null
  error: string | null
  // 신규
  /** AI가 판단 중인가. true인 동안 awaitingHuman()은 false를 반환한다. */
  aiThinking: boolean
  /** 이번 라운드가 폴백으로 떨어졌는가. 라운드가 바뀌면 다시 false가 된다. */
  fallbackRound: boolean
}
```

`gameId`는 store 내부에서만 쓰는 값이라 계약에 넣지 않는다. 화면이 알 필요가 없다.

**기존 컴포넌트의 액션 호출부는 수정이 필요 없다.** `suggest(...)` 등의 반환값을 컴포넌트가
쓰지 않기 때문이다. 다만 `aiThinking`을 읽어 조작을 잠그는 코드는 컴포넌트 쪽에 아직 없다 —
`awaitingHuman()`이 그 값을 반영해 `false`를 반환하도록 store에 배선은 돼 있지만, 그것을
읽어 버튼을 비활성화하는 것은 별도 작업(B)이다.

`aiThinking`·`fallbackRound`를 화면에 그리는 것은 B(UI) 작업이다. 인계 내용은
`session-resume/`의 해당 날짜 파일에 남긴다 — 다음 작업 세션에서 바로 보이도록.

---

## 9. 테스트

LLM은 한 번도 호출하지 않는다. 지연은 `setTimeout` 기반 테스트 더블로 만든다.

| 대상 | 검증 내용 |
|---|---|
| `src/ai/decider.test.ts` (신규) | `createRoundFallback` — 첫 호출 실패 후 남은 호출이 fallback으로 가는가 / 새 인스턴스가 preferred를 다시 시도하는가 / preferred가 정상이면 fallback이 호출되지 않는가 |
| `src/ai/rule-decider.test.ts` (신규) | 같은 시드·같은 시야에서 `rules.ts` 직접 호출과 **동일한 결과**를 내는가 (salt 재구성이 맞는지) |
| `src/store/game.test.ts` (케이스 추가) | 지연 주입 Decider로 `aiThinking` 전이 / 대기 중 조작이 무시되는가 / **reset 후 늦게 온 결과가 무시되는가** |
| `src/ai/flow.test.ts` · `src/ai/autoplay.test.ts` · `src/store/game.test.ts` (기존 케이스) | async 시그니처로 수정. 판정 내용은 그대로 유지 |
| `src/engine/*.test.ts` | 무관. 손대지 않는다 |

**회귀 판정 기준:** 기존 테스트 119개가 전부 통과해야 한다. 하나라도 판정 내용이 바뀌면
그것은 async 전환이 아니라 동작 변경이므로 되돌린다.

---

## 10. 두 단계로 쪼갠다

전부 한 번에 하면 300줄/5파일 제한을 넘긴다.

| 단계 | 범위 | 이 시점의 상태 |
|---|---|---|
| **A1** | `decider.ts` · `rule-decider.ts` + 두 테스트 파일 (신규 4, 기존 수정 0) | 아무것도 안 깨진다. 경계만 생긴다. 기존 119개 그대로 통과 |
| **A2** | `flow.ts` · `autoplay.ts` · `store/game.ts` async 전환 + 기존 테스트 수정 | 게임이 async로 돈다. UI 변경 0 |

A1이 통과한 뒤 A2로 간다. A1만으로도 커밋 가능한 상태다.

브랜치: `feat/agent-decider-boundary` (A1) → `refactor/agent-async-flow` (A2).

---

## 11. 완료 기준

- [ ] `npm run typecheck` 통과
- [ ] `npm run build` 통과
- [ ] 기존 테스트 119개 전부 통과 (판정 내용 불변)
- [ ] 신규 테스트 통과
- [ ] 지연 주입 Decider로 1판 완주 — 대기 중 조작이 잠기고, 끝까지 진행된다
- [ ] `autoPlay`로 규칙 기반 판이 전과 동일한 결과를 낸다 (같은 시드 → 같은 승패)
- [ ] `session-resume/`에 프론트 인계 계약이 기록됨

---

## 12. 이 결정을 되돌리려면

`Decider` 인터페이스를 지우고 `flow.ts`의 `await`를 걷어내면 원래 동기 구조로 돌아간다.
`rules.ts`와 `src/engine/*`은 변경되지 않으므로 되돌림의 영향 범위가
`src/ai/` 3파일 + `src/store/game.ts`로 한정된다.

되돌릴 상황: B(프록시)가 심사 기간 안에 안정화되지 못한다고 판단될 때. 그 경우 규칙 기반만으로 제출한다.
D3 안전선(LLM 없이 완주)은 A 이후에도 유지되므로, 이 되돌림은 언제든 가능하다.

---

## 13. 다음 문서

A가 끝나면 B(프록시) 설계를 별도 스펙으로 쓴다. 이 문서는 B를 다루지 않는다.
