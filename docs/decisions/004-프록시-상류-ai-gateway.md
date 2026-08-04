# 워커에서 Anthropic을 직접 부르지 않고 Cloudflare AI Gateway를 거친다

- 날짜: 2026-08-03
- 관련 브랜치: `feat/proxy-anthropic-adapter`
- 선행 결정: [003 운영 LLM 모델](003-운영-llm-모델.md)

## 맥락

워커에서 Anthropic Messages API를 부르면 **403**이 돌아왔다.

```
{"error":{"type":"forbidden","message":"Request not allowed"}}
```

원인을 세 단계로 좁혔다.

| 확인한 것 | 결과 | 배제된 원인 |
|---|---|---|
| 워커 → `POST /v1/messages` | 403 | — |
| 내 머신 → **같은 본문** | 200 | 요청 모양·스키마·모델 |
| 워커 → `GET /v1/models` (본문 없음) | 403 | 본문·구조화 출력 |

키는 정상이었다(잘못된 키는 401이다). `User-Agent`, `anthropic-dangerous-direct-browser-access`,
`Referer`, `Sec-Fetch-Mode`를 바꿔도 403이었다.

**Anthropic이 Cloudflare Workers의 출구를 네트워크 수준에서 막는다.** 우리 코드로 우회할 수 있는 것이 아니다.

## 선택

**Cloudflare AI Gateway를 상류로 둔다.**

```
브라우저 → 워커(키 보관·예산·검증) → AI Gateway → Anthropic
```

게이트웨이 이름은 `perjury`, **인증 없음**으로 만들었다. 워커의 `LLM_BASE_URL`이 게이트웨이를 가리키고,
`llm.ts`는 거기에 `/messages`를 붙인다 — **코드 변경이 없다.**

### 게이트웨이 URL을 리포에 두지 않는 이유

리포가 public이고 게이트웨이가 인증 없음이라, URL이 공개되면 남이 자기 키로 우리 게이트웨이를
통과시켜 로그 한도를 축낼 수 있다. 그래서 `LLM_BASE_URL`을 **var가 아니라 시크릿**으로 넣었다.
Anthropic 키가 없으면 아무 요청도 성립하지 않으므로 URL 자체는 열쇠가 아니지만, 굳이 흘릴 이유가 없다.

## 버린 대안

- **인증 있는 게이트웨이 + `cf-aig-authorization`** — Cloudflare API 토큰을 하나 더 만들어
  워커 시크릿에 넣어야 한다. 보관할 비밀이 둘로 늘어난다. 나중에 조일 수 있는 여지로 남긴다.
- **Worker AI 바인딩** — 바인딩 경유 요청은 자동 인증된다. 가장 깔끔하지만
  `fetch` 호출을 `env.AI.gateway(...)` 형태로 다시 써야 한다. 이번 범위 밖이다.
- **프록시를 Vercel/Deno Deploy로 이전** — 확실히 뚫리지만 KV 예산 카운터를 옮기고
  배포 경로를 하나 더 만들어야 한다.

## 덤으로 얻은 것

게이트웨이가 요청 로그·토큰·비용을 집계한다. D5 비용 실측이 대시보드에서 그냥 보인다.

## 되돌리는 법

`wrangler secret delete LLM_BASE_URL` 하면 `index.ts`의 기본값(`https://api.anthropic.com/v1`)으로
돌아간다 — 그리고 다시 403이 난다. 되돌리려면 상류를 바꾸는 게 아니라 **호스트를 바꿔야 한다.**

## 확인된 결과

배포 링크에서 3라운드를 실제로 플레이했다. `/decide` **26건 중 25건 200, 1건 504**(타임아웃 1건은 폴백).
프리픽스 캐싱도 걸렸다 — 호출당 캐시 적중 약 1,250토큰.
