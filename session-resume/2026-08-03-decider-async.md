# 2026-08-03 — Decider 비동기 전환과 UI 인계 계약

> 일정: A1~A2 (Decider 경계·비동기 전환) / 마감까지 D-7
> 작업자: A
> 커밋: `af05f83` … `e068179` (design/plan 포함 12개, 구현 6개)

## 완료

설계는 `docs/superpowers/specs/2026-08-03-decider-async-design.md`. 요지: 게임 진행을 동기 →
비동기로 바꾸고, AI 판단을 `Decider` 인터페이스 뒤로 숨겼다. LLM은 아직 한 번도 호출하지 않는다 —
이번 작업은 "LLM이 들어올 구멍을 규칙(순수 엔진·폴백 보장)을 지키는 모양으로 뚫어두기"다.

- `src/ai/decider.ts` (신규) — `Decider` 인터페이스(제안·반증·이의제기·최종 고발 4개, 전부
  `GameView`만 받아 `Promise`로 돌려준다) + `createRoundFallback`(preferred가 한 번 실패하면
  그 라운드의 남은 호출은 전부 fallback으로 보내는 래퍼) + `perRound`(같은 라운드 번호에는
  같은 Decider 인스턴스를 재사용하도록 강제 — `createRoundFallback`의 "넘어졌다" 상태가
  라운드 중간에 지워지지 않게 하는 장치).
- `src/ai/rule-decider.ts` (신규) — 규칙 기반 구현. **이게 폴백의 실체다.** `src/ai/rules.ts`의
  네 함수를 그대로 감싸고, seed를 인수로 받아 내부에 가둔다. `Decider` 인터페이스가
  `GameView`만 받으므로 seed가 밖으로 나갈 통로가 없다 — LLM 구현체는 seed를 아예 모르게 만드는
  것이 이 설계의 핵심 제약이다(정답 재계산을 막는다).
- `src/ai/flow.ts`, `src/ai/autoplay.ts` — `stepAi`/`advanceToHuman`/`declareWithHuman`/
  `passChallenge`/`autoPlay`를 async로 전환. 반증은 `Promise.all`(동시 선언 규칙과 일치),
  이의제기는 순차(첫 성공에서 멈춤, 원래 동작 그대로).
- `src/store/game.ts` — `apply`가 async가 되었고, `aiThinking`·`fallbackRound`를 새로 노출한다.
  `gameId`로 죽은 판 보호(§7.1 설계 문서, 아래 (2) 참고)도 여기 있다.
- `src/ai/rules.ts`, `src/engine/*`, `src/components/*`, `src/content/*` — **한 줄도 안 건드렸다.**
  회귀 판정 기준이었다.

### (1) 화면에 대기 표시가 전혀 없다 — B의 첫 작업

확인한 사실: `src/components/*` 어디에서도 `aiThinking`을 읽지 않는다. 실제 조작 잠금은
`src/store/game.ts`의 `apply()` 안 `if (get().aiThinking) return` 가드 하나뿐이다.

지금(A 단계)은 규칙 기반 Decider가 마이크로태스크 안에서 끝나 사람 눈에 안 보인다. **C 단계에서
LLM이 붙으면 1~5초가 생기고, 그 동안 버튼은 살아 있는 채로 클릭이 조용히 삼켜진다.** 사용자에게는
"버튼이 안 먹는다"로 보인다.

### (2) store가 새로 노출하는 것

```ts
aiThinking: boolean     // AI가 판단 중. true인 동안 awaitingHuman()은 false를 반환한다
fallbackRound: boolean  // 이번 라운드가 규칙 기반 폴백으로 떨어졌는가
```

`gameId`와 `deciderForRound`는 store 지역 변수라 계약에 없다. 화면이 알 필요가 없다.

**전달 경로는 실제로 존재한다.** `store.start()`가 `makeDeciders`로 고른 팩토리를 그대로 쓰지
않고 `createRoundFallback`으로 직접 감싸며, `onFallback` 콜백이 `fallbackRound`를 `true`로
만든다(`src/store/game.ts`). 임의의 팩토리를 꽂아도 규칙 기반 폴백이 자동으로 붙는다 — 절대
규칙 4를 "C 단계 작성자가 잊지 않는다"는 관례가 아니라 store 구조로 만든 지점이다.

**그런데도 `fallbackRound`는 A 단계에서 항상 `false`다.** 경로가 없어서가 아니라, 지금 꽂힌
규칙 Decider(`createRuleDecider`)가 절대 던지지 않아서다. 넘어질 일이 없으니 넘어졌다는
표시도 뜨지 않는다. C 단계에서 LLM Decider가 예외를 던지면 그때 `true`가 뜬다.

### (3) 컴포넌트는 한 줄도 안 바뀌었다 — 그리고 그만큼 잠금도 표시도 없다

`start`·`suggest`·`declare`·`challenge`·`passChallenge`·`accuse`가 전부 `Promise<void>`를
반환하지만, `GameScreen.tsx`를 포함해 컴포넌트가 반환값을 쓰지 않는다. **다만 조작 잠금도
화면에는 없다.** `awaitingHuman()`이 `aiThinking` 중 `false`를 돌려주는 배선은 store 쪽에만
있고, 그것을 읽어 버튼을 비활성화하는 코드는 없다(위 (1) 참고). A 단계에서는 규칙 Decider가
마이크로태스크 안에서 끝나 사람 입력으로는 가드에 도달조차 하지 않지만, C 단계에서 LLM이
붙으면 1~5초 창이 생겨 버튼이 살아 있는 채로 클릭이 삼켜진다. **비활성화와 대기 표시 둘 다
B가 넣어야 한다.**

### (4) `start`에 3번째 인수가 생겼다

```ts
start(seed: string, humanIndex?: number, makeDeciders?: (seed: string) => DeciderForRound)
```

기본값은 규칙 기반(`ruleDeciderForRound`)이다. 테스트가 지연을 주입하는 자리이자 **C 단계에서
LLM 팩토리를 꽂는 자리**다. B는 평소 이 인수를 쓸 일이 없다 — `GameScreen.tsx`의 `store.start(next)`
호출은 그대로 둔다.

## 미완 · 다음 액션

**다음에 여기부터:**

- **B(UI)**: `src/components/Table.tsx`의 `Seat` 컴포넌트(96~106행 근처, `isTurn` prop) —
  `aiThinking && isTurn`인 좌석에 판단 중 표시를 얹는다. 애니메이션은 `transform`·`opacity`만
  쓴다(프로젝트 규칙). 상단 바(`GameScreen.tsx`의 `<header className="bar">`, 99~107행)에
  `fallbackRound` 배너 자리를 잡아둔다 — A 단계에선 항상 `false`라 안 보이지만, C에서 store를
  다시 안 고쳐도 되게 지금 그려두는 게 싸다.
- **A(엔진·에이전트)**: 다음은 B 단계(Cloudflare Workers 프록시)다. 설계는
  `docs/superpowers/specs/2026-08-03-proxy-design.md`에 있고, 착수 전 대표 결정 3건
  (Cloudflare 계정 / 워커 자동 배포 여부 / 워커 도메인)이 필요하다.

## 막힌 것

해결된 문제는 없다. 리뷰 중 발견해서 미해결로 이월한 함정 두 가지 — 지금은 발현되지 않지만
LLM(C 단계)이 붙으면 재현 가능해지는 것들이다.

- **증상 가능성 1**: `start`가 실패하면 반쯤 시작된 화면이 남는다. `advanceToHuman` 앞에서
  이미 `state`를 공개하므로, 그것이 던지면 `GameScreen.tsx`의 `if (!store.state)` 가드를 통과해
  표지 대신 중간 화면이 뜬다.
  원인: 규칙 Decider(`createRuleDecider`)는 절대 던지지 않으므로 A 단계에서는 재현 불가.
  남은 가설: LLM Decider가 예외를 던질 수 있게 되는 C 단계에서 재검토. `start`가 실패를
  표지로 되돌리는 경로를 그때 추가한다.
- **증상 가능성 2**: `Promise.all`로 묶인 형제 호출 중 하나가 rejection을 던지면 unhandled가
  될 수 있다.
  원인: 지금은 `createRoundFallback`이 내부에서 잡아 무해하다.
  남은 가설: LLM Decider를 폴백 래핑 없이 직접 `Promise.all`에 넘기는 경로가 생기면(예: 설계
  변경으로 preferred를 감싸지 않고 쓰는 경우) 재검토 대상.

## 검증 상태

| 항목 | 상태 |
|---|---|
| `npm run typecheck` | 통과 |
| `npm run build` | 통과 |
| 테스트 | 138/138 (기존 119 + decider 10 + rule-decider 5 + store 신규 4) |
| 브라우저 1판 완주(표지 → 판결문) | 미확인 |
| 배포 | 이 브랜치(`refactor/agent-async-flow`)는 아직 `main`에 안 올라감 |

## 다음 세션 첫 명령

```bash
npm run typecheck && npx vitest run
```

## 팀에 전달

- **B가 지금 할 일은 표시만이 아니라 잠금까지다.** 액션 시그니처는 안 바뀌었으므로 기존
  컴포넌트를 갈아엎을 필요는 없지만, `aiThinking`을 읽어 버튼을 실제로 비활성화하는 코드가
  지금 하나도 없다(위 (1)(3) 참고). `aiThinking`·`fallbackRound` 두 값을 읽어서 대기 표시와
  조작 잠금을 함께 그려야 한다.
- **`fallbackRound`는 지금 배너를 만들어도 절대 안 보인다.** A 단계엔 넘어질 대상(LLM)이 없다.
  안 보인다고 배선이 잘못된 게 아니다. C 단계에서 `true`가 뜨는 걸 보면 그때 확인된다.
  스타일만 미리 확인하고 싶으면 커밋하지 않을 로컬 임시 코드로 `fallbackRound: true`를
  하드코딩해 눈으로만 보고 되돌리는 방법을 권한다.
- 엔진(`src/engine/*`)과 규칙 판단(`src/ai/rules.ts`)은 이번 작업에서 완전히 그대로다.
  판정 로직에 관해 B가 알아야 할 새 내용은 없다.
