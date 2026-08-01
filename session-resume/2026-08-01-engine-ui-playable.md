# 2026-08-01 — 룰 엔진부터 플레이 가능한 화면까지

> 일정: D1~D3 (배포 파이프라인 · 룰 엔진 · UI 연결) / 마감까지 D-9
> 작업자: A
> 커밋: `5137212` … `53b9961` (20개)

계획서상 D3는 8/2였다. **하루 앞서 있다.**

---

## 완료

### D1 — 배포 파이프라인 (`a92728b`, `c774120`)

- `vite.config.ts` — `base: '/perjury/'`. 없으면 Pages에서 에셋이 404가 나고 흰 화면이 된다.
  로컬 `npm run dev`에서는 드러나지 않아 배포해야만 보인다. 그래서 첫날에 뚫었다.
- `.github/workflows/deploy.yml` — main 푸시 시 자동 배포. `concurrency: cancel-in-progress`로
  연속 푸시 시 옛 커밋이 최신을 덮어쓰는 것을 막는다.
- `package.json` — `build`가 `tsc --noEmit && vite build`. 타입 에러가 배포가 아니라 빌드에서 죽는다.

### D2 — 룰 엔진 (`aadde3e` … `7ec89dc`)

| 파일 | 내용 |
|---|---|
| `src/engine/types.ts` | `GameState` · `Declaration` · `ChallengeRecord` · `Outcome` |
| `src/engine/cards.ts` | 카드 15장 (범인 6 / 흉기 4 / 장소 5). **이름은 임시, D7에 교체** |
| `src/engine/rng.ts` | mulberry32 시드 난수 + Fisher-Yates |
| `src/engine/setup.ts` | `createGame()` — 정답 3장 봉인 후 12장을 6명이 2장씩 |
| `src/engine/round.ts` | `suggest()` · `declareAll()` · `isPerjury()` |
| `src/engine/challenge.ts` | `challenge()` · `skipChallenge()` |
| `src/engine/progress.ts` | `nextRound()` · `accuse()` · `accuseByCouncil()` |
| `src/engine/vote.ts` | `tally()` — 칸별 다수결 |
| `src/engine/view.ts` | `viewFor()` — 시야 화이트리스트 |

전부 순수 함수. `Math.random()`을 쓰지 않아 시드 하나로 판 전체가 재현된다.

### D3 — 규칙 AI + 화면 (`032700b` … `53b9961`)

| 파일 | 내용 |
|---|---|
| `src/ai/rules.ts` | `claimFrom` · `challengeTargetFrom` · `voteFrom` — **`GameView`만 입력** |
| `src/ai/flow.ts` | `needsHuman` · `advanceToHuman` · `declareWithHuman` · `passChallenge` |
| `src/ai/autoplay.ts` | LLM 0회로 판 완주 (D8 밸런싱 도구 겸용) |
| `src/store/game.ts` | Zustand. 사람이 할 수 있는 행동만 노출 |
| `src/components/` | `GameScreen` · `Table` · `Notebook` · `Log` |

`src/mock/`은 삭제했다.

---

## 이번 세션에서 정해진 룰 (문서 반영 완료)

`docs/01-game-design.md`와 `docs/decisions/001-반증-공개와-이의제기.md`에 있다. 요약만 적는다.

| 항목 | 값 |
|---|---|
| 카드 | 범인 6 / 흉기 4 / 장소 5 = 15장, 손패 2장씩 |
| 반증 | **공개 선언**. 비공개면 발각 경로가 없어 거짓말 비용이 0이 된다 |
| 반증 방식 | **동시형** — 제안자 제외 5명 전원이 선언. 침묵도 진술이라 위증 대상 |
| 위증 페널티 | 이의제기 성공 시 위증자 손패 1장 공개 + 고발자 근거 카드 공개 |
| 오심 페널티 | 이의제기 실패 시 고발자 손패 1장 공개 |
| 최종 고발 | 플레이어가 시민이면 본인, 범인이면 **AI 시민 5명 합의** |

마지막 항목은 이번에 발견한 구멍을 막은 것이다. 범인이 스스로 고발하면 정답을 알고 있으니
일부러 틀려서 무조건 이긴다. 승리 조건이 "고발을 틀리게 **유도**"인 이유가 여기 있었다.

---

## 미완 · 다음 액션

**다음에 여기부터:** 새 브랜치 `feat/proxy-workers-setup` 또는 `feat/agent-llm-claim`.
교체 지점은 `src/ai/rules.ts`의 세 함수다. 시그니처를 유지하면 폴백이 함수 갈아끼우기로 끝난다.

- [ ] **대표 결정 대기** — Cloudflare 계정 준비 여부. 준비됐으면 프록시 먼저, 아니면 프롬프트 먼저
- [ ] D4-1 `feat/proxy-workers-setup` — 키 보관 · 레이트리밋 · 일일 예산 캡 · CORS 제한
- [ ] D4-2 `feat/agent-llm-claim` — 프롬프트 + 구조화 출력. `claimFrom`과 같은 시그니처 유지
- [ ] D4-3 `feat/fallback-llm-recovery` — 타임아웃·예산 초과·파싱 실패 시 규칙 AI로 복귀
- [ ] D5 비용 실측 후 `claude-opus-5` 유지 여부 결정
- [ ] 밀담(parley) 페이즈는 **아직 구현 없음.** 페이즈 타입만 있고 UI·엔진 모두 비어 있다

---

## 막힌 것

해결된 것은 재발 방지 목적으로만 남긴다.

- **gh는 되는데 git push가 거부됨** — 인증 저장소가 두 군데였다.
  `gh auth refresh`는 gh 키링만 갱신하고, `git push`는 macOS 키체인의 옛 토큰을 보냈다.
  `gh auth setup-git`으로 해결. 이 머신에서 또 나면 여기부터 의심한다.
- **CI 한 번 실패** (`032700b`) — `npm run typecheck 2>&1 | tail -3 && git commit`으로 묶었더니
  파이프의 종료 코드가 `tail`의 것이라 타입 에러가 가려졌다.
  **검사 명령에 파이프를 붙이지 않는다.** 다음 커밋에서 복구.

---

## 알아둘 것 (미해결 · 향후 판단 필요)

- **폴백 승률 문제.** 규칙 AI만으로 2000판 실측: **시민 승률 3.0%**, 판당 위증 3.57회,
  이의제기 0.63회(성공률 100%). 규칙 AI가 선언을 액면 그대로 믿어서 후보 목록이 오염된다.
  예산 소진으로 폴백에 내려가면 승률 3%짜리 게임이 된다 — D8에 최소한의 의심 로직이 필요하다.
- **정답 카드 위증은 원리적으로 발각되지 않는다.** 봉인된 카드는 아무도 안 갖고 있어 증명이 불가능하다.
  범인의 최강수이고 룰 구조상 필연이다. 너무 강하면 직업 능력(검시관) 비중을 올려야 한다 — D8 감시.
- **`createGame`의 rng가 취약하다.** 하나의 난수 수열을 정답 뽑기와 셔플이 나눠 쓴다.
  rng 호출을 **하나만 추가해도** 기존 시드가 전부 무효화된다.
  `challenge.ts`처럼 용도별 시드 파생(`${seed}:solution`, `${seed}:deal`)으로 바꾸는 것이 안전하다.
  카드 구성이 바뀌는 D8 전에 할 일.
- **브랜치 규칙을 D1~D3 내내 어겼다.** `main`에 직접 커밋했다.
  히스토리는 되감지 않는다(커밋 기록 유지가 제출 요건, force push 금지). 다음 작업부터 적용.

---

## 검증 상태

실제로 돌린 결과다.

| 항목 | 상태 |
|---|---|
| `npm run typecheck` | 통과 |
| `npm run build` | 통과 (JS 67.07 kB gzip / CSS 2.07 kB gzip) |
| 테스트 | 119/119 |
| CI | `53b9961` success |
| 배포 | https://rhantj.github.io/perjury/ — 200, 실제 플레이 확인 |

번들 예산(마이크로사이트 JS < 80 kB)에 아직 여유가 있다. LLM 연동 후 재확인.

---

## 다음 세션 첫 명령

```bash
npm run typecheck && npx vitest run && git log --oneline -5
```

---

## 팀에 전달

- **`src/engine/view.ts`의 `viewFor`가 유일한 유출 경계다.** UI와 AI가 같은 함수를 쓴다.
  여기를 지나지 않고 `GameState`를 읽는 코드를 만들지 마라 — `solution`과 `isPerjury`가 새면
  각각 정답이 새고 이의제기 메커니즘이 통째로 죽는다.
- **`src/ai/rules.ts`의 세 함수 시그니처를 바꾸지 마라.** LLM 교체와 폴백 복귀가 이 형태에 의존한다.
- 밸런싱을 볼 때는 `autoPlay(createGame({ seed }))`를 돌리면 된다. LLM 호출이 없어 비용 0이다.
- 카드 이름은 임시다(`src/engine/cards.ts`). 개수는 룰이므로 바꾸지 말고, 이름만 D7에 교체한다.
