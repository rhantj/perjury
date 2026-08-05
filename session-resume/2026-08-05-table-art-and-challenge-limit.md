# 2026-08-05 — 원탁 배경 넉 장, 카드 연출, 이의제기 밸런스

> 일정: D6 / 마감까지 D-5
> 작업자: B (UI·content) + 룰 변경 1건
> 커밋: `e2878bd` … `f2a2f43` (배포 5회: `3583f0f`, `f76a6a8`, `0774449`, `97c6b04`, `f2a2f43`)
> 같은 날 앞 기록: [2026-08-05-reveal-cards-and-flash.md](2026-08-05-reveal-cards-and-flash.md)

## 한 줄 요약

**「카드가 안 보인다」 다음은 「카드가 텍스트로만 보인다」였다.**
상 위·좌석 위 정보를 전부 카드 그림으로 바꾸고, 그 과정에서 이의제기가 3회째부터 공짜였다는
밸런스 구멍을 찾아 룰을 고쳤다(decisions/008).

---

## 완료

### 1. 나머지 세 사건 원탁 배경 (`d281bc7`, merge `3583f0f`)

저택만 상이 있고 밀정·아편굴·극장은 추상 타원이었다. Gemini용 프롬프트를 사건별로 써서
사용자가 이미지를 받아 왔고, 그걸 넣었다.

- `src/assets/tables/{mansion,informer,opium,theater}.webp` — 넉 장 다 **1200×670**
- `src/content/table-art.ts` — 네 사건 전부 매핑됨. 이제 추상 타원 폴백 경로로 빠지지 않는다

**받은 파일이 확장자만 `.webp`인 PNG였다**(2752×1536, 8~10 MB). `file`과 매직바이트
(`89504e47`)로 확인하고 `cwebp -q 80 -resize 1200 670`으로 변환했다. 다음에 이미지를 받으면
**확장자를 믿지 말고 `file`로 먼저 확인한다.**

### 2. 워터마크 제거 (같은 커밋)

넉 장 모두 오른쪽 아래에 Gemini의 ✦ 표식이 있었다. 스크래치패드에 일회용 스크립트를 써서 지웠다
(커밋하지 않음).

- 처음엔 「ROI 중앙에서 가장 가까운 밝은 덩어리」로 찾았는데 **밀정 이미지에서 종이 뭉치를 잡아**
  진짜 표식은 남기고 멀쩡한 픽셀을 뭉갰다. → 잘 된 세 장에서 좌표를 재서 **고정 앵커**
  `(0.9124, 0.8430)`로 바꿨다. Gemini는 항상 같은 상대 위치에 찍는다.
- 지운 자리를 확산(diffusion)으로 메우니 매끈해서 오히려 티가 났다. 필름 그레인을 얹었는데
  **채널별로 노이즈를 주니 색 얼룩**이 생겼다. → 흑백 노이즈 한 장을 세 채널에 같이 얹어 해결.

### 3. 제안 짜는 동안 고른 카드가 상에 올라간다 (`bfb6d15`, merge `f76a6a8`)

범인·수단·장소를 누를 때마다 그 카드가 상 가운데에 놓인다. 안 고른 칸은 점선 빈 슬롯.

- `src/components/Table.tsx` — `draft` prop, `DRAFT_SLOTS`
- 카드를 바꾸면 리마운트되도록 key를 `종류:카드id`로 잡아, 바꿀 때마다 놓이는 애니메이션이 다시 돈다

### 4. 확정 순간 카드가 사라지던 것 + 밀담 겹침 (`5304144`, merge `0774449`)

**첫 가설(「확정하면 live로 넘어가는데 렌더 분기가 없다」)이 틀렸다.** 분기는 있었다.

진짜 원인은 `src/store/game.ts:146` — `apply`가 `await transition()`과 `await advanceToHuman()`을
**둘 다 끝낸 뒤 한 번만** 상태를 쓴다. `submit`이 `picked`를 동기로 비우고 있어서, 그 사이엔
draft도 없고 live도 없는 빈 창이 생겼다. LLM이 느릴수록 그 창이 길어진다.
→ `GameScreen.tsx`의 `submit`을 `await action(...)` 후에 비우도록 바꿨다.

밀담 겹침은 `.seats--photo::before`의 아래쪽 bleed(`inset: -1.5rem 0`)가 다음 패널 윗선을 덮고
있던 것. `inset: -1.5rem 0 0`으로 아래만 잘랐다.

### 5. 공개된 패를 카드 그림으로, 판정 대사를 인물별로 (`992222e`, merge `97c6b04`)

- 좌석의 `revealed`가 텍스트 나열 → `.reveal-card` 카드 리스트. 호버하면 커진다.
  - **호버 확대가 왼쪽에서 잘렸다** — `transform-origin: bottom center`인데 `.seat`에
    `overflow: hidden`이 있다(앞 기록 1번과 같은 뿌리). `bottom left`로 바꿔 남는 쪽으로 자라게 했다.
  - 공개 목록에서 중복을 걷어냈다 — 같은 카드가 두 장 그려지던 결함 방어(아래 6번)
- `src/content/fallback-lines.ts` — `caughtLine` / `clearedLine` / `wrongCallLine` 3종 추가.
  6인물 × 3상황. 「들켰다」·「결백했다」·「내가 헛짚었다」를 인물 말투로 나눈다.
- `Table.tsx`의 대사 우선순위: **판정 반응 > LLM 대사 > 기존 폴백**. 판정이 난 순간엔
  LLM이 뭘 말했든 상황에 맞는 반응이 이긴다.

### 6. 이의제기 횟수 제한·자격 조건 (`30eed46`, merge `f2a2f43`) — **룰 변경**

사용자 질문 「오판 2번하면 패 2개 다 까는 거야? 밸런스가 안 맞지 않나?」에서 시작해
**엔진을 읽어 보니 반대 방향의 구멍**이었다.

- `HAND_SIZE = 2`. 이의제기는 이기든 지든 내 패 1장을 소모한다.
- 그런데 3회째부터는 낼 패가 없어 **페널티가 아예 없다.** 공짜 행동이다.
- 패는 이의제기 말고도 비는 길이 있다(위증하다 걸리면 내 패가 열린다). 그래서 횟수 제한만으로는
  부족하다 — **횟수는 「양」을, 자격은 「값」을 보장한다.**

→ `CHALLENGE_LIMIT = 2` + 「공개 안 된 손패가 없으면 이의제기 불가」. 근거는
[docs/decisions/008-이의제기-횟수와-자격.md](../docs/decisions/008-이의제기-횟수와-자격.md).

TDD로 갔다. RED에서 중복 공개 결함이 실측으로 잡혔다:
`AssertionError: expected [ 'p1', 'p1' ] to have a length of 1 but got 2`.

**GameView에 「남은 횟수」 필드를 더하지 않았다.** 그 뷰는 그대로 워커로 전송되고
`workers/src/schema.ts`가 화이트리스트로 키를 검사하기 때문에, 필드가 하나 늘면
**배포 안 된 워커에서 모든 LLM 호출이 400으로 거절된다.** 대신 기록 배열만 받는
`challengesUsedIn(rounds, playerId)`를 뺐다.

`src/ai/flow.ts`의 지역 가드에도 같은 규칙을 걸었다. 거기 주석이 이미 경고하고 있다 —
「그 예외를 여기서 막지 않으면 라운드가 그 자리에 멈춘다」. 배포본에서 한 번 겪은 사고다.

### 7. 브랜치 정리

병합된 작업 브랜치들을 지웠다. `feat/engine-role-abilities`·`feat/ui-challenge-drama`는
**병합되지 않은 상태였고** — 내가 「병합 끝났다」고 잘못 말했다가 `git branch --no-merged`로
확인하고 정정했다. 내용이 main에서 대체된 것(`ability.ts` → `power.ts`, 이의제기 연출은 이미 있음)을
확인하고 `-D`로 지웠다. 되돌릴 수 있게 로컬 백업 ref를 남겨 뒀다:

```
refs/backup/feat-engine-role-abilities  fe72b93
refs/backup/feat-ui-challenge-drama     3fe885c
```

필요 없어지면 `git update-ref -d refs/backup/<name>`. (로컬 전용이라 클론한 쪽에는 없다.)

---

## 미완 · 다음 액션

### A에게 넘긴 것 — 워커 배포 (막혀 있음)

**`feat/agent-scenario-words` 브랜치(`7e540a7`, origin에 있음)를 A가 배포해야 한다.**

증상: 참가자가 분장실 카드를 들고 있는데 AI가 「서재라, 그 패는 내가 쥐고 있소이다」라고 말한다.
명주 목도리를 넥타이라고 부른다.

원인은 `workers/src/prompt.ts`의 카드 이름표가 `src/engine/cards.ts`의 기본 표
(저택 기준: `p1: '서재'`, `w2: '넥타이'`)를 읽는 것.
**프런트는 깨끗하다** — 모든 렌더 경로가 `cardLabel(scenario, …)`을 쓴다. LLM만 잘못 말한다.

브랜치는 워커에 `scenarioId`를 실어 보내고 사건별 이름표를 쓰게 한다.

내가 배포하지 못한 이유: `npm run worker:deploy`가
`You need to register a workers.dev subdomain`으로 실패한다. `wrangler whoami`는 내 계정인데
살아 있는 워커와 KV는 **다른 계정 소유**다. 다른 서브도메인을 등록하면 공개 URL이 바뀌므로
하지 않았다.

**A가 할 것:**

```bash
git switch feat/agent-scenario-words
git pull --rebase origin main    # f76a6a8 기준이라 main보다 뒤처져 있다
npm run build
npm run worker:deploy            # 워커 먼저
git switch main && git merge --no-ff feat/agent-scenario-words
```

워커 변경은 **하위 호환**이다(`scenarioId`가 없으면 엔진 기본 이름으로 폴백). 워커만 먼저
배포해도 지금 라이브가 깨지지 않는다.

### 확인 못 한 것

- **「이의제기 2/2」 표시와 버튼 비활성** — 배포본에서 못 봤다. 이의제기 페이즈까지 한 판을
  돌려야 보인다. 다음에 배포 링크에서 한 판 완주하며 확인할 것.

### 남은 잔가지

- `src/engine/cards.ts`의 기본 이름이 저택 말투다. 파일 주석 자체가 「이름은 임시다 — 세계관
  확정(D7) 때 교체한다」고 적고 있다. 중립적으로(예: `수단2`) 바꾸면 앞으로 이런 누수가
  **그럴듯하게 틀린 단어가 아니라 눈에 띄는 표식**으로 나온다. A 영역이라 제안만 해 뒀다.
- 이전 세션 이월: 전화교환수 능력 vs 밀담 격리, 간헐적 폴백, 동시 호출 시 예산 카운터 과소집계,
  D8 폴백 대사 풀, 직업 카드 말투(`coroner`·`operator`), 역할 카드 첫 로드 764 KB.

---

## 막힌 것

해결 못 한 것은 위 「A에게 넘긴 것」 하나뿐이다. 계정 권한 문제라 내 쪽에서 뚫을 수 없다.

---

## 검증 상태

| 항목 | 상태 |
|---|---|
| `npm run typecheck` | 통과 |
| `npm run build` | 통과 |
| 테스트 | 329/329 |
| 배포 | 5회 전부 success. https://rhantj.github.io/perjury/ 정상 |
| 이의제기 횟수 UI | **미확인** — 이의제기 페이즈까지 못 가 봄 |
| 워커 | **옛 버전** — `feat/agent-scenario-words` 미배포 |

## 다음 세션 첫 명령

```bash
git pull && npm run build && npx vitest run
```

## 팀에 전달

- **룰이 바뀌었다.** 이의제기는 판당 2회, 그리고 공개 안 된 손패가 있어야만 가능하다.
  근거는 `docs/decisions/008`, 규칙표는 `docs/01-game-design.md` §1.6·§7에 반영했다.
- 이의제기 횟수는 **상태로 들지 않는다.** `state.rounds`에서 센다(`challengesUsedIn`).
  화면에 남은 횟수를 쓰고 싶으면 이 함수를 쓰고, **`GameView`에 필드를 더하지 마라** —
  워커 스키마가 화이트리스트라 모든 LLM 호출이 400난다.
- 원탁 배경은 넉 장 다 1200×670 전제다. 다른 비율로 갈아끼우면 상이 화면 밖으로 밀린다
  (`.seats--photo::before`가 cover로 깔고 위아래로만 bleed).
- A: 위 「A에게 넘긴 것」 절이 요청 내용이다.
