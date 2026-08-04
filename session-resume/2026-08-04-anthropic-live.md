# 2026-08-04 — Anthropic 연동 완료, 배포 링크에서 LLM이 돈다

> 일정: B단계 마무리 / 마감까지 D-6
> 작업자: A
> 병합: `0bb4f30` (브랜치 `feat/proxy-anthropic-adapter`, 커밋 5개)
> 직전 기록: [2026-08-03-proxy-worker.md](2026-08-03-proxy-worker.md)

## 한 줄 요약

**https://rhantj.github.io/perjury/ 에서 실제 LLM이 판단한다.** 모델은 Sonnet 5,
경로는 브라우저 → 워커 → Cloudflare AI Gateway → Anthropic.

---

## 결정된 것 (문서로 남김)

| 결정 | 문서 |
|---|---|
| 운영 모델 **`claude-sonnet-5`** | [decisions/003](../docs/decisions/003-운영-llm-모델.md) |
| 상류를 **AI Gateway** 경유로 | [decisions/004](../docs/decisions/004-프록시-상류-ai-gateway.md) |

### 왜 AI Gateway인가 — 이것이 이번의 핵심

**Anthropic이 Cloudflare Workers의 출구를 막는다.** 워커에서 부르면 403
`{"type":"forbidden","message":"Request not allowed"}`이고, 같은 키·같은 본문이
내 머신에서는 200이다. 본문 없는 `GET /v1/models`도 403이라 요청 내용과 무관하다.

우회는 게이트웨이 경유다. `llm.ts`는 그대로고 `LLM_BASE_URL`만 바꿨다.

**막히면 여기부터 의심할 것**: 헤더(`User-Agent`, `anthropic-dangerous-direct-browser-access`)를
아무리 만져도 안 된다. 이건 네트워크 차단이다.

---

## 워커 설정 (재현에 필요)

```bash
npm run worker:deploy
```

`workers/wrangler.toml`에 있는 것: `LLM_MODEL`, 캡, KV 바인딩.
**시크릿으로만 넣는 것 둘** — 리포에 없다:

| 시크릿 | 무엇 |
|---|---|
| `LLM_API_KEY` | Anthropic 키 |
| `LLM_BASE_URL` | AI Gateway 주소 (`.../<account>/perjury/anthropic/v1`) |

게이트웨이 이름 `perjury`, **인증 꺼짐**. Cloudflare 대시보드 AI → AI Gateway에서 만들었다.
인증을 켜면 `cf-aig-authorization` 토큰이 하나 더 필요하다.

---

## 실측 (배포본에서 잰 값)

| 항목 | 값 |
|---|---|
| 호출당 입력 | 약 90 (비캐시) + **1,250 (캐시 적중)** |
| 호출당 출력 | 160~190 |
| 호출당 비용 | **약 $0.0023** |
| 응답 | 7~15초 |

**프리픽스 캐싱이 걸렸다.** 어제 Sonnet에서 안 걸리던 것이 프롬프트에 [전략] 블록이 붙어
최소 길이를 넘겼다. 걸렸는지는 응답 헤더 `X-Upstream-Tokens`(입력/출력/캐시적중) 세 번째 값으로 본다.

---

## 고친 버그 둘

### 1. 판단자의 성립하지 않는 선택에 라운드가 멈춤 (`src/ai/flow.ts`)

배포본에서 이의제기 페이즈가 넘어가지 않았다. AI가 **침묵 선언한 사람**을 이의제기 대상으로
지목하면 엔진이 던지고, store가 오류만 남긴 채 상태를 그대로 두어 같은 자리에 갇혔다.

프롬프트 스키마는 룰을 복제하지 않으므로(설계 §5.3) 성립하지 않는 선택이 **실제로 올라온다.**
그것을 엔진에 그대로 넣지 않고 «안 한다»로 읽는다.

- 이의제기: `canChallenge()` — 반증을 선언한 사람만 대상이 된다
- 반증: `legalClaim()` — 제안 밖 카드는 침묵으로 읽는다 (라운드당 5회라 더 자주 터진다)
- **사람의 선언에는 적용하지 않는다.** 조용히 바꾸는 대신 오류로 보여야 한다

### 2. store 기본 판단자가 LLM으로 되돌아가 있었음 (`src/store/game.ts`)

**PR #4 병합(`4bcac4a`)이 충돌을 옛 버전으로 해결하면서 `d4aeaa5`가 되돌아갔다.**
그래서 store 테스트 7개가 5초씩 타임아웃으로 깨진 채 main에 올라가 있었다(전체 35초 → 지금 0.7초).

**병합 후 테스트를 안 돌리면 이런 게 조용히 들어온다.**

---

## 미완 · 다음 액션

**다음에 여기부터:** 대기 표시와 조작 잠금. 지금 판을 끝까지 돌리기 가장 큰 걸림돌이다.

- [ ] **대기 표시도 조작 잠금도 없다.** (A단계부터 이월) 컴포넌트가 `aiThinking`을 안 읽는다.
      AI가 생각하는 동안 누른 클릭이 삼켜지고, 페이즈가 바뀌며 버튼 위치가 달라지면
      **엉뚱한 버튼이 눌린다.** 실제로 테스트 중 의도치 않은 위증이 나갔다.
- [ ] **`passChallenge`가 순차라 최대 70초 걸린다.** `src/ai/flow.ts`의 `offerChallenge`.
      «먼저 잡는 사람 하나만 성립»이라 순차로 둔 것인데, 화면에서는 멈춘 것처럼 보인다.
      병렬로 바꾸려면 «누가 먼저인가»를 좌석 순서로 정하는 규칙이 필요하다.
- [ ] **LLM 대사가 화면에 안 나온다.** 프록시는 `line`을 돌려주는데 프론트가 버린다.
      엔진 `Declaration`에 대사 자리가 없어 **엔진과 UI를 함께 손대야 한다.**
      표시 지점: `src/ai/llm-decider.ts`의 `ask()` 안 주석.
- [ ] **예산 카운터가 동시 호출을 못 센다.** 읽고→쓰는 구조라 5건이 1~2로 세어진다.
      이제 실제 돈이 나가므로 캡 250이 실제로는 훨씬 많은 호출을 허용한다.
      Sonnet 기준 최악 하루 $7 수준이라 급하진 않다.
- [ ] **`fallbackReason`을 쓰는 UI가 없다.** (B 담당)
- [ ] 밀담 페이즈(D단계) · 폴백 대사 풀(D8) — **둘 다 통째로 없다. D8이 안전선이다.**

---

## 막힌 것

없음.

재발 대비로 남기는 것:
- **시크릿을 파이프로 넣을 때 값이 망가질 수 있다.** `tr -d '... \r\n'`을 홑따옴표 안에 쓰면
  이스케이프가 해석되지 않아 **키에서 문자 `r`과 `n`이 지워진다.** 넣은 뒤 길이로 확인할 것.
- **`wrangler tail`로 상류 오류 본문을 보는 것이 가장 빠른 진단이었다.** 워커는 본문을
  밖으로 내보내지 않으므로(설계 §3.3) 임시 `console.error`를 넣고 배포해서 본다. 확인 뒤 지운다.

---

## 검증 상태

| 항목 | 상태 |
|---|---|
| `npm run typecheck` / `worker:typecheck` | 통과 |
| `npm run build` | 통과 |
| 테스트 | **194/194** (신규 8: 워커 llm 5 + flow 5 중 일부) |
| 배포 (프론트) | `0bb4f30` Actions 성공 |
| 배포 (워커) | Sonnet 5 + AI Gateway |
| 배포 링크 실플레이 | 라운드 2까지. `/decide` 전부 200. 콘솔 에러 0 |

---

## 다음 세션 첫 명령

```bash
git switch main && git pull origin main
npm ci && npm run build && npx vitest run
curl https://perjury-proxy.perjury.workers.dev/health
```

---

## 팀에 전달

- **프론트 코드는 이제 진짜 LLM을 부른다.** 로컬 `npm run dev`에서도 배포된 워커를 부르므로
  개발 중에도 비용이 발생한다. `src/ai/proxy-url.ts`에서 `import.meta.env.DEV`로 갈린다.
- **워커를 고쳤으면 `npm run worker:typecheck`를 따로 돌린다.** `npm run typecheck`는 워커를 안 본다.
- **병합 후 반드시 `npx vitest run`을 돌린다.** 위 버그 2번이 병합 충돌 해결로 들어왔다.
