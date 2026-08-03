# 2026-08-03 — Cloudflare 프록시 구축과 LLM 배선

> 일정: B단계 (프록시) / 마감까지 D-7
> 작업자: A
> 커밋: `16caf4f` … `26440de` (6개, 브랜치 `feat/proxy-worker-skeleton`)
> 같은 날 선행 작업: [2026-08-03-decider-async.md](2026-08-03-decider-async.md) (A단계, `main`에 병합됨)

## 한 줄 요약

브라우저 → Cloudflare 워커 → LLM 배선이 **끝까지 이어졌고 실제로 한 라운드가 돌았다.**
다만 **LLM 판단은 한 건도 성공하지 못했고**(전부 타임아웃), 그 덕에 폴백이 실제로 작동하는 것을 눈으로 확인했다.

---

## 완료

### 워커 (`workers/`)

| 파일 | 책임 |
|---|---|
| `wrangler.toml` | 워커 이름 · 일일 캡 · KV 바인딩 |
| `src/index.ts` | 라우팅 · CORS · 예산 캡 · LLM 호출 배선 |
| `src/schema.ts` | 요청 검증 (모양 · 길이 상한) |
| `src/budget.ts` | 일일 예산 · IP 레이트리밋 카운터 |
| `src/prompt.ts` | 프롬프트 조립 (불변 → 가변) |
| `src/llm.ts` | OpenAI 호환 호출 · 응답 좁히기 |
| `tsconfig.json` | **DOM 제거**, `@cloudflare/workers-types` 사용 |

- **배포됨**: `https://perjury-proxy.perjury.workers.dev` — 단 **1단계(라우팅·CORS) 버전만**.
  2·3단계는 로컬에서만 검증했고 아직 배포하지 않았다.
- **KV 네임스페이스 생성됨**: `BUDGET` (id는 `wrangler.toml`에 있음, 비밀 아님)

### 프론트 (`src/ai/`, `src/store/`)

- `src/ai/llm-decider.ts` — 프록시를 부르는 `Decider`. **불확실하면 던진다**가 유일한 계약.
- `src/ai/proxy-url.ts` — `import.meta.env.DEV`로 로컬/배포 분기. `.env`를 쓰지 않는다.
- `src/ai/decider.ts` — `onFallback`이 `FallbackReason`(`budget` | `error`)을 받도록 확장.
- `src/store/game.ts` — 기본 판단자가 **LLM이 됐다**. `fallbackReason` 노출.

### 설계에서 바꾼 것

**Anthropic 전용 형식 대신 OpenAI 호환 형식을 쓴다.** 로컬 올라마와 HF 라우터가 같은 모양이라,
개발은 로컬에서 하고 배포는 원격으로 하면서 코드를 안 바꾸기 위해서다.
**Anthropic으로 가면 `workers/src/llm.ts`에 어댑터가 하나 는다.**

`docs/superpowers/specs/2026-08-03-proxy-design.md` §5(구조화 출력)와
`docs/02-tech-and-plan.md` §4.1(기본 모델 `claude-opus-5`)이 이 변경을 아직 반영하지 않았다.
**운영 모델이 정해지면 문서를 먼저 고쳐야 한다.**

---

## 발견 — 다음 판단의 재료

### 1. 반증 5건 동시 호출이 타임아웃을 낸다

```
POST /decide 504 Gateway Timeout (25067ms)  × 5
```

단독 호출은 11초인데 반증은 **5명이 동시에** 나간다. 로컬은 GPU가 하나라 5개가 줄을 서서
5 × 11 = 55초가 되고 25초 상한을 넘는다.

로컬 하드웨어 한계지만 **원격 모델이 느려도 같은 일이 난다.** 라운드마다 5개가 동시에 나가는
구조 자체가 지연에 취약하다.

### 2. 예산 카운터가 동시 호출을 못 센다

```
호출 5건 → 남은 예산 241 → 240   (236이어야 맞다)
```

`chargeCall`이 **읽고 → 쓰는** 구조라, 5개가 동시에 들어오면 전부 같은 값을 읽고 각자 +1을 쓴다.

설계 §6.3은 "몇 회 새는 것은 허용"이라고 했지만 **우리 패턴은 매 라운드 반드시 5개가 동시에 나간다.**
우연한 충돌이 아니라 구조적 충돌이고 실제 누수는 **약 80%**다.

**심각한 이유**: 캡 250을 걸어도 실제 ~1,250회가 나갈 수 있고, KV 쓰기는 정직하게 5배로 나가
무료 한도(1,000/일)를 넘는다. 예산 통제라는 목적 자체가 무너진다.

### 3. 두 문제를 동시에 없애는 선택지

**반증을 규칙 기반으로 유지하고 대사만 LLM에 맡긴다.**
판당 호출이 50 → 15로 줄고 동시 호출이 사라진다. 설계 §8.5의 "호출 수를 줄인다" 레버이고,
반증 판단이 원래 기계적이라("제안된 3장 중 내 손에 있는 게 있나") 품질 손실이 작다.

---

## 미완 · 다음 액션

**다음에 여기부터:** 운영 LLM 결정. 그 전까지는 아래 어느 것도 확정할 수 없다.

- [ ] **운영 LLM 미정.** 아래 "결정 대기" 참조. 코드는 provider-agnostic이라 교체는 `llm.ts` 한 파일.
- [ ] **LLM 대사가 화면에 안 나온다.** 프록시는 `line`을 돌려주는데 프론트가 받아서 버린다.
      엔진 `Declaration`에 대사를 담을 자리가 없어 **엔진과 UI를 함께 손대야 한다.**
      표시된 "대리석 문진로 반증합니다"는 프론트가 만든 정형문이다.
      표시 지점: `src/ai/llm-decider.ts`의 `ask()` 안 주석.
- [ ] **2·3단계 워커 미배포.** 배포하려면 `npm run worker:deploy` + LLM 설정 주입 필요.
- [ ] **화면에 대기 표시도 조작 잠금도 없다.** (A단계에서 이월) LLM이 붙으면 버튼이 살아 있는 채
      클릭이 삼켜진다. 잠금은 store `apply`의 가드 하나뿐이고 컴포넌트는 `aiThinking`을 안 읽는다.
- [ ] **`fallbackReason`을 쓰는 UI가 없다.** 값만 있고 배너가 없다. (B 담당)
- [ ] 밀담 페이즈(D단계) · 폴백 대사 풀(D8) — **둘 다 통째로 없다. D8이 안전선이다.**

---

## 막힌 것

없음. 아래 셋은 해결됐고 재발 대비로만 남긴다.

- **배포 직후 엣지 오류.** 증상: `error code: 1104` / `1042`, `/decide`가 워커가 아닌 Cloudflare
  오류 페이지를 반환. 원인: 배포 전파 지연. 해결: 1분 뒤 재시도.
  **코드를 고치러 들어가기 전에 먼저 기다려볼 것.**
- **KV 네임스페이스 생성이 `Authentication error [code: 10000]`.** 같은 전파 지연이었다. 재시도로 해결.
- **Vite가 5173 대신 5174로 뜸.** Docker가 5173을 점유. 워커 CORS 허용 목록이 하드코딩이라 403이 났다.
  해결: 허용 오리진을 `ALLOWED_ORIGINS` 환경변수로 뺐다. **배포본에는 `github.io`만 남는다.**

---

## 결정 대기 (대표)

| # | 항목 | 상태 |
|---|---|---|
| 1 | **운영 LLM** | **미정.** Anthropic / HF 라우팅 / 제공자 직접 / 올라마 클라우드 |
| 2 | 심사 기간 총예산 | 미정 (실측 전) |
| 3 | 반증을 LLM에 맡길 것인가 | 미정 — 위 "발견 3" 참조 |

확정된 것:
- Cloudflare 계정: **개인 계정** 사용. 종료 후 정리 = 워커 삭제 + 키 폐기.
- 워커 배포: **수동** `npm run worker:deploy`. GitHub Actions 미사용(시크릿 유출 경로를 늘리지 않는다).
- 워커 도메인: `*.workers.dev` 기본.

**막혔던 사실 기록**: Claude Max 구독은 API에 적용되지 않는다(별도 과금).
HF PRO 월 크레딧($2)은 이미 소진 상태였다. **어느 경로로 가도 별도 결제가 한 번 필요하다.**

---

## 검증 상태

| 항목 | 상태 |
|---|---|
| `npm run typecheck` | 통과 |
| `npm run worker:typecheck` | 통과 |
| `npm run build` | 통과 |
| 테스트 | **178/178** (A단계 138 + 신규 40) |
| 배포 (프론트) | `main` 정상 — https://rhantj.github.io/perjury/ |
| 배포 (워커) | 1단계 버전만. `/health` 200 |
| 브라우저 실플레이 | 표지 → 브리핑 3막 → 라운드 1 반증까지. **콘솔 에러 0** |

---

## 다음 세션 첫 명령

```bash
git switch feat/proxy-worker-skeleton && git pull --rebase origin main
npm ci && npm run build && npx vitest run

# 로컬 LLM으로 돌려보려면 (올라마가 떠 있어야 한다)
npm run worker:dev    # 8787, 로컬 올라마를 가리킨다
npm run dev           # 5173
```

---

## 팀에 전달

- **새 devDependency 둘**: `wrangler`, `@cloudflare/workers-types`.
  프론트 번들 크기는 변하지 않았다(devDependency).
- **워커는 별도 tsconfig를 쓴다.** `npm run typecheck`는 워커를 검사하지 않는다.
  워커를 고쳤으면 `npm run worker:typecheck`를 따로 돌린다.
- **워커가 `src/engine/`을 타입으로 import한다.** `GameView`·`Card`가 단일 소스다.
  엔진 시야 구조를 바꾸면 **워커 타입체크가 깨져서** 알려준다. 이건 의도된 결합이다.
  대신 `src/engine/cards.ts`와 `src/engine/view.ts`는 **순수하게 유지해야 한다** —
  DOM·React·이미지를 import하면 워커 빌드가 깨진다.
- **`.dev.vars`는 각자 로컬에만 둔다.** 팀원은 자기 키를 자기 파일에 넣는다.
  루트 `.env`는 Vite용이라 워커가 읽지 않는다.
- **`main`은 이 브랜치를 아직 안 받았다.** 프론트 기본 판단자가 LLM으로 바뀌었으므로,
  병합하면 프록시가 없는 환경에서 매 라운드 폴백을 탄다(게임은 정상 진행된다).
