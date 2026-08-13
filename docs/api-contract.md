# 프록시 API 계약

Cloudflare Workers 프록시(`workers/src/index.ts`)가 프론트에 제공하는 계약이다.
**이 문서는 코드에서 뽑아 썼다.** 어긋나면 코드가 아니라 이 문서를 먼저 고친다(작업 규칙).

이 프록시가 있는 이유는 하나다 — GitHub Pages는 정적 호스팅이라 API 키를 둘 곳이 없고,
심사자에게 키를 요구할 수도 없다. 키 격리·레이트리밋·예산 캡을 여기 한곳에서 한다.

| | |
|---|---|
| 소스 | `workers/src/index.ts` (라우팅·에러) · `workers/src/schema.ts` (검증) · `workers/src/llm.ts` (상류 호출) |
| 계약 테스트 | `workers/src/proxy-contract.test.ts` · `workers/src/schema.test.ts` (워커 94개 중) |
| 인증 | **없다.** 오리진 허용 목록 + IP별 일일 캡으로 막는다 |
| Content-Type | 언제나 `application/json; charset=utf-8` · `Cache-Control: no-store` |

---

## 엔드포인트

| 메서드 | 경로 | 오리진 검사 | 용도 |
|---|---|---|---|
| `GET` | `/health` | **안 한다** | 배포 확인 + 남은 예산 조회 |
| `POST` | `/decide` | 한다 | 에이전트 판단 1건 |
| `OPTIONS` | (전부) | 한다 | CORS preflight. 허용 오리진이면 `204`, 아니면 `403` |
| — | 그 외 | — | `404 not_found` |

`/health`가 오리진을 안 따지는 것은 의도다 — 키를 쓰지 않으므로 공개돼도 무해하고,
배포가 살아 있는지 확인하려면 브라우저 주소창에서 바로 열려야 한다.

---

## `GET /health`

```json
{ "ok": true, "budget": { "remaining": 397 } }
```

`remaining`은 **오늘 남은 전체 호출 수**다. 호출을 태우지 않고 읽기만 한다(`peekRemaining`).

---

## `POST /decide`

### 요청

```jsonc
{
  "v": 1,                    // 고정. 다른 값이면 400
  "kind": "refute",          // suggest | refute | challenge | accuse | parley
  "sessionId": "s-example",  // 로그 상관관계 전용
  "ask": null,               // parley일 때만 문자열, 그 외에는 반드시 null
  "view": { /* GameView */ },
  "power": null,             // 이 좌석이 아직 쓸 수 있는 능력. 없으면 null
  "names": { "w3": "명주 목도리" }  // 카드 id → 이 사건의 표시 이름
}
```

**`sessionId`는 신뢰하지 않는다.** 클라이언트가 보내는 값이라 위조 가능하다.
레이트리밋은 `sessionId`가 아니라 Cloudflare가 붙이는 `CF-Connecting-IP`로 건다
(`X-Forwarded-For`는 클라이언트가 조작할 수 있다). 로컬 dev에는 이 헤더가 없어 `local`로 묶인다.

**`names`가 `view` 밖에 있는 것도 의도다.** `view`는 시야 격리 계약이 걸린 자료라
"이 좌석이 알아도 되는 것"만 담는다. 표시 이름은 그 계약과 무관하므로 형제 필드로 뺐다.

**`power`에 능력 *종류*는 없다.** 워커는 직업 이름도 능력 종류도 모른다 —
프롬프트에 붙일 문구와 "무엇을 고르게 할 것인가"만 받는다. 종류까지 알면 룰이 프론트와 워커
두 군데로 갈린다.

### 입력 상한 (`LIMITS`, `workers/src/schema.ts`)

플레이어 자유 입력이 LLM에 닿는 통로가 하나뿐이라(`ask`), 벽도 거기 세운다.

| 항목 | 상한 | 왜 |
|---|---|---|
| 본문 전체 | 32 KB | 정상 `GameView`는 몇 KB다 |
| `players` | **정확히 6** | 게임 규칙상 고정. 많아도 적어도 400 |
| `rounds` | 12 | 최대 라운드보다 넉넉히 |
| `names` | 32개 | 카드는 15장 |
| 일반 문자열 | 200자 | 이름·카드 id 등 |
| 대사(`line`) | 80자 | **프롬프트로 되돌아가는 값**이라 더 짧다 |
| `ask`·밀담 기록 | 200자 | 두어 문장이 자연스러운 자리 |

프론트도 대사를 60자로 자르지만(`src/ai/llm-decider.ts`), **프론트는 위조 가능하므로
여기가 진짜 벽이다.** 알 수 없는 키가 섞여 있으면 통과시키지 않고 400으로 끊는다(`onlyKeys`).

### 성공 응답 — `200`

```jsonc
{
  "ok": true,
  "kind": "refute",
  "decision": { /* kind별 구조. 밀담은 고를 것이 없어 line만 쓴다 */ },
  "line": "흠, 내겐 그 패가 없구려",
  "usePowerOn": null,      // 능력을 쓸 대상. 안 쓰면 null
  "truthful": null,        // 밀담에서 화자의 자기 신고. 그 외에는 null
  "accuseNow": false,      // 조기 고발 의사. 제안 판단에서만 읽는다
  "budget": { "remaining": 396 }
}
```

응답 헤더에 토큰 사용량이 실린다. 프리픽스 캐싱이 실제로 도는지 보는 창이다.

```
X-Upstream-Tokens: <입력>/<출력>/<캐시적중>
```

---

## 에러

**모든 실패는 `{ "ok": false, "code": …, "message": … }` 한 가지 모양이다.**
프론트는 `code`만 보고 폴백 여부를 정한다.

| `code` | HTTP | 언제 | 프론트 동작 |
|---|---|---|---|
| `invalid_request` | 400 | 스키마 위반 — 상한 초과, 모르는 키, `players ≠ 6` | 폴백 |
| `forbidden_origin` | 403 | 허용 목록에 없는 오리진 | 폴백 |
| `rate_limited` | 429 | IP 일일 캡 초과 (`IP_DAILY_CALL_CAP`) | 폴백 (`error`) |
| `budget_exhausted` | 503 | 전체 일일 캡 소진 (`DAILY_CALL_CAP`) | 폴백 (**`budget`**) |
| `not_configured` | 503 | `LLM_API_KEY` 시크릿 없음 | 폴백 |
| `upstream_error` | 503 | 상류가 실패 | 폴백 |
| `upstream_timeout` | 504 | 상류가 15초 안에 안 옴 | 폴백 |
| `invalid_upstream` | 502 | 상류 응답이 스키마에 안 맞음 | 폴백 |
| `not_found` | 404 | 없는 경로 | — |

`429`·`503(budget)`에는 `Retry-After` 헤더가 붙는다.

### `budget`과 `error`를 나누는 이유

**복구 가능성이 다르다.** `error`는 다음 라운드에 나을 수 있지만 `budget`은 그날 안에 낫지 않는다.
그래서 화면 안내 문구가 갈린다(`FallbackReason`, `src/ai/decider.ts`).

### `not_configured`가 503인 이유

키가 없을 때 **조용히 성공하지 않고 끊는다.** 프론트가 폴백으로 넘어가므로 게임은 계속 돌지만,
시크릿을 안 넣은 배포가 여기서 드러난다. 잘못 배포해도 판이 죽지 않으면서 실수는 보이게 하려는 것이다.

---

## 상태 코드를 어떻게 읽어야 하는가

**초기 구현은 실패도 `200`으로 내보내고 본문에 `ok:false`만 실었다.**
그 결과 LLM이 완전히 죽었는데 네트워크 탭은 전부 `200`이라 장애가 「대사만 안 뜨는 것」으로 보였다
([트러블슈팅 2번](troubleshooting.md)).

지금은 **HTTP 상태 코드와 `ok` 필드가 항상 일치한다.** 그래도 프론트는 `code`를 읽는다 —
같은 `503`이라도 `budget_exhausted`와 `not_configured`는 사용자에게 다른 말을 해야 하기 때문이다.

---

## 예산과 레이트리밋

| 설정 | 코드 기본값 | `wrangler.toml` 실제값 |
|---|---|---|
| `DAILY_CALL_CAP` | 250 | **400** |
| `IP_DAILY_CALL_CAP` | 120 | **250** |
| `LLM_MAX_TOKENS` | 700 | (기본값 사용) |
| `LLM_MODEL` | `claude-opus-5` | **`claude-sonnet-5`** |
| 상류 타임아웃 | 15초 | (고정) |

**코드 기본 모델과 운영 모델이 다르다.** 운영값은 `wrangler.toml`의 `LLM_MODEL`이며
2026-08-03 실측 후 Sonnet 5로 정했다([`decisions/003-운영-llm-모델.md`](decisions/003-운영-llm-모델.md)).
코드 기본값은 환경변수가 통째로 빠졌을 때의 최후 값이라 그대로 뒀다.

타임아웃 15초는 실측에서 나온 값이다 — 정상 응답이 4~8초, 가장 느린 정상 응답이 7.7초였다.
25초는 필요 이상으로 넉넉했다([`decisions/010-상류-대기-시간.md`](decisions/010-상류-대기-시간.md)).

### 카운터의 알려진 한계

`chargeCall`은 KV에 **읽고 → 쓰는** 구조라 동시 호출에서 경합이 난다. 실측 누수 80%까지 봤다.
지금은 호출 구조를 바꿔 동시 호출이 없어져 드러나지 않을 뿐, **구조를 바꾸면 재발한다.**
근본 해결은 Durable Objects 같은 직렬화 지점을 두는 것이다([트러블슈팅 1번](troubleshooting.md)).

---

## CORS

허용 오리진은 `ALLOWED_ORIGINS`(쉼표 구분)로 준다. 비면 배포용 기본값만 쓴다.
허용 목록에 없으면 `OPTIONS`는 `403`(본문 없음), `POST`는 `403 forbidden_origin`이다.

배포본 프론트는 `*.workers.dev`를 부르고 로컬은 `http://localhost:8787`을 부른다
(`src/ai/proxy-url.ts`, `import.meta.env.DEV`로 갈린다). **로컬에서 되고 배포에서 안 되는
문제는 대부분 이 두 줄과 허용 오리진 목록에서 난다.**
