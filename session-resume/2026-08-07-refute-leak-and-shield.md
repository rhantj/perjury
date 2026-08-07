# 2026-08-07 — 반증 누출 차단 · 밀정 자동 발동 · 연출 무게 조정

플레이 피드백 6건을 반영했다. 프론트는 배포까지 끝났고, **워커는 배포하지 못했다**(아래 «막힌 것»).

## 한 것

| # | 피드백 | 손본 곳 |
|---|---|---|
| 1 | 제안 호버 문장이 좌석 글씨와 겹친다 | `styles/game.css`의 `.seat__suggestion` |
| 2 | 밀정 능력도 이의제기당하면 자동 발동 + 소진 표시 | `engine/challenge.ts` · `content/roles.ts` · `ai/power-brief.ts` · `ai/flow.ts` · `store/game.ts` · `components/PowerPanel.tsx` |
| 3 | 범인 시야에 남의 반증 카드가 보인다 | `content/labels.ts` · `components/Table.tsx` · `components/Log.tsx` · `workers/src/prompt.ts` |
| 4 | 범인이면 정답을 추리표에도 표시 | `components/Notebook.tsx` · `styles/game.css` |
| 5 | 밀담이 AI 판단에 반영되지 않는다 | `workers/src/prompt.ts` |
| 6 | 위증 연출이 너무 크다 / 발각이 작다 | `components/GameScreen.tsx` · `styles/game.css` |

커밋 4개 → `main` 병합(`6d801e9`).

### 3번은 엔진 문제가 아니었다

먼저 «범인 시야에서 남의 반증 카드가 새는지»를 스크래치 테스트로 확인했다 — **엔진은 이미 가리고 있다.**
`viewFor`의 `claimFor`가 제안자·본인·종료 후에만 `cardId`를 채우고, 범인이라는 사실은 아무 영향이 없다.

새던 곳은 **모델이 쓴 좌석 대사**였다. 워커 프롬프트가 "line에서 카드를 언급한다면 네가 고른 카드만 말한다"고
시키고 있어서, AI가 「넥타이는 내 손에 있소」라고 말하면 엔진이 가린 것이 좌석 옆 한 줄로 전원에게 읽혔다.

두 겹으로 막았다.

- **프론트(즉시 유효)** — `namesAnyCard()`로 검사해, `cardId`가 null인 시야에서 카드 이름이 섞인
  반증 대사는 버리고 고정 문구로 떨어뜨린다. 좌석·기록 둘 다.
- **워커(배포 필요)** — 반증 선언의 `line`에 카드 이름을 쓰지 말라고 명시.

프론트 쪽을 «한 겹 더»가 아니라 **주 방어**로 둔 이유는, 프롬프트는 모델이 지키기를 «바라는» 것이지
보장이 아니기 때문이다. 그래서 워커가 옛 버전이어도 지금 새지 않는다.

### 2번 — 밀정만 발동을 고르지 않는다

나머지 아홉은 「언제 쓸까」가 능력의 절반인데 밀정은 지목당하는 시점을 고를 수 없다.
미리 켜면 대개 아무 일 없는 라운드에서 타 버리고 정작 잡히는 순간엔 남아 있지 않다 — 판단이 아니라 운이었다.

`challenge()`가 `autoShield: ReadonlySet<PlayerId>`를 선택 인자로 받는다. 자격 판단을 엔진에 넣지 않은 이유는
직업이 콘텐츠이기 때문이다(content → engine 한 방향). `content/roles.ts`의 `autoShieldSeats()`가 만들어 넘긴다.

- **잡혔을 때만** 소진된다. 헛짚은 이의제기까지 삼키면 판당 1회짜리가 아무것도 막지 않고 사라진다.
- 미리 켠 보호(`pending`)가 있으면 그쪽이 먼저 나간다 — 한 사건에 값을 두 번 치르지 않는다.
- 소진되면 `powersUsed`에 찍혀 내 패 카드가 `已使`로 물러나는 기존 경로를 그대로 탄다.
- 사람 화면(`PowerPanel`)과 AI 프롬프트(`power-brief`) 양쪽에서 발동 버튼을 거뒀다.

결정 근거는 `docs/decisions/002-직업-풀과-시나리오.md`에 항목을 더해 두었다.

## 막힌 것 — 워커를 배포할 수 없다

`npm run worker:deploy`가 실패한다.

```
▲ [WARNING] You need to register a workers.dev subdomain before publishing to workers.dev
✘ [ERROR] Wrangler could not automatically register "perjury" as your workers.dev subdomain
          because the name is unavailable.
```

**원인**: 지금 로그인된 Cloudflare 계정에 `perjury-proxy` 워커가 **없다.**

```
$ npx wrangler deployments list --config workers/wrangler.toml
✘ This Worker does not exist on your account. [code: 10007]
```

배포본 프론트가 부르는 주소는 `https://perjury-proxy.perjury.workers.dev`(`src/ai/proxy-url.ts`)이고,
그 `perjury` 서브도메인은 **다른 계정** 소유다. `wrangler.toml`에 `account_id`를 적지 않는 설계라
(팀원이 각자 자기 계정으로 배포하게) 로그인한 계정에서 추론되는데, 이 자리에서는 그 계정이 아니었다.

**여기서 멈춘 이유**: 이 계정으로 배포하면 «다른 URL의 새 워커»가 생긴다. 배포본 프론트는 그걸 부르지 않으므로
아무것도 나아지지 않고, 시크릿도 새로 넣어야 한다. 추측으로 프로덕션을 건드리지 않았다.

**다음에 할 일** — 셋 중 하나다.

1. `perjury` 서브도메인을 가진 계정으로 `npx wrangler login` 한 뒤 `npm run worker:deploy` (가장 곧은 길)
2. 그 계정을 가진 팀원(분업표상 `proxy` 담당 A)이 배포
3. 계정을 옮기기로 한다면 `src/ai/proxy-url.ts`의 주소와 워커 시크릿·CORS 허용 오리진을 함께 옮겨야 한다 — 결정 사항이다

**배포될 때까지의 상태**: 3번은 프론트 방어가 이미 막고 있어 문제없다. **5번(밀담이 AI 판단에 실리는 것)은
워커가 올라가야 든다** — 지금 배포본에서는 밀담이 여전히 라운드 기록에 묻힌 옛 프롬프트로 나간다.

## 검증

| 항목 | 결과 |
|---|---|
| `npm run typecheck` | 통과 |
| `npm run worker:typecheck` | 통과 |
| `npx vitest run` | 536 passed / 26 files |
| `npm run build` | 통과 |
| GitHub Pages 배포 | 성공(45초), `main` `6d801e9` |
| 배포본 번들 확인 | 로컬 빌드와 해시 일치. CSS에 `.nb__row--answer`·`backdrop-filter:blur(6px)`·`flash-text-perjury 3.4s`, JS에 새 밀정 문구가 실려 있다 |
| 워커 배포 | **실패 — 위 «막힌 것»** |

배포본에서 **아직 눈으로 안 본 것**: 호버 겹침이 실제로 사라졌는지, 밀정으로 이의제기를 당해 자동 발동이
도는지, 발각 연출이 커졌는지. 문자열·규칙이 번들에 실린 것까지만 확인했다. 한 판 돌려 보는 것이 남았다.

## 다음에 손댈 곳

- 워커 배포(위)
- `namesAnyCard`에 단위 테스트가 없다. 누출 방어라 값이 있는데 `content/`에 테스트 파일을 새로
  만들지 않으려고 미뤘다 — `src/content/labels.test.ts`가 될 자리다.
