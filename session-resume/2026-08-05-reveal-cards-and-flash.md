# 2026-08-05 — 공개 카드·이의제기 연출: 「안 보인다」 다섯 건

> 일정: D6 / 마감까지 D-5
> 작업자: B (UI)
> 커밋: `a7238bc` … `8b4d659` (배포 3회: `2ab9a33`, `06b7ef9`, `8b4d659`)
> 같은 날 앞 기록: [2026-08-05-seat-badges-and-role-art.md](2026-08-05-seat-badges-and-role-art.md)

## 한 줄 요약

**증상은 다섯 번 다 「안 보인다」였는데 원인은 매번 달랐고, 매번 첫 가설이 틀렸다.**
typecheck·테스트는 전부 통과한 상태였다 — 배포본에서 숫자를 재야만 보이는 고장들이다.

---

## 완료

### 1. 공개 카드가 좌석 밖에서 잘리고 있었다 (`a7238bc`, merge `2ab9a33`)

반증 카드·이의제기 카드가 **한 번도 화면에 뜬 적이 없었다.**

- 첫 가설은 「렌더가 안 된다」였는데 `Table.tsx`를 읽어 보니 **렌더는 되고 있었다.**
- 진짜 원인: 반증 카드는 좌석 위로(`top: -0.6rem` + `translateY(-100%)`), 이의제기 카드는
  좌석 아래로 각자 삐져나가 있었는데, `.seat`에는 초상화를 자르려고 넣은 `overflow: hidden`이 있다.
- `git log -L`로 확인 — `overflow: hidden`(`7ea5204`)이 카드 추가(`7c53e0c`)보다 **먼저**다.
  즉 처음부터 한 번도 보인 적이 없다.

`src/components/Table.tsx` — 두 카드를 `.seat__reveals` 한 흐름 컨테이너로 묶어 **좌석 안쪽 오른쪽 위**로 들였다.
왼쪽 위는 `.seat__tags`(번호·차례·제안)가 쓰므로 오른쪽이다. 묶은 이유는 앞 기록의 배지 겹침과 같다 —
각자 절대배치하면 동시에 뜰 때 포개진다.

### 2. 호버 확대 규칙이 «적혀 있는데» 죽어 있었다 (같은 커밋)

`:hover { transform: scale(...) }`가 이미 있었는데 안 먹었다.

- 등장 연출이 `animation: … both`라 끝난 뒤에도 마지막 키프레임의 `transform`이 남고,
  **캐스케이드에서 애니메이션 값이 일반 선언보다 우선**하므로 `:hover`가 무시됐다.
- `src/styles/game.css` — 팝 애니메이션을 위치 중립(`scale`·`opacity`만)으로 바꾸고 fill을 `backwards`로 전환.
  `transform-origin: top right`로 좌석 안쪽(아래·왼쪽)으로만 자라게 해 커진 카드가 다시 잘리지 않게 했다.

### 3. 상대 오판 연출의 비대칭 (같은 커밋)

내가 이의제기할 때는 버튼 핸들러가 「누구를 지목했는지」를 먼저 띄우고 결과가 뒤따르는 2단인데,
**AI가 걸면 그 예고가 통째로 없어 결과만 툭 떨어졌다.** 같은 사건인데 남의 차례일 때만 밋밋했다.

- `src/components/GameScreen.tsx` — AI 경로에도 같은 예고를 붙였다(`isMe` 가드로 내가 걸 때 두 번 뜨는 것 방지)
- `wrongCall`용 충격 프레임 추가. 붉은색이 아니라 **차가운 백청색** — 「잡았다」가 아니라 「헛짚었다」로 읽히게
- 대기 문구 「다른 자리에서 답을 고르는 중」 → 「다른 사람 추측중」

### 4. 가로 스크롤바 — 덮는 것도 없는 장식 레이어가 범인 (`62d8e55`, merge `06b7ef9`)

**배포본 실측이 원인을 바로 특정했다.**

```
.stage  clientWidth 942  vs  scrollWidth 966   → 정확히 24px 초과
넘치는 일반 자식: 0개
.seats 좌/우 = 115 / 1051  ≡  .stage 좌/우 = 115 / 1051
```

`.seats--photo::before`의 `inset: -1.5rem`(=24px)이 유일한 원인이었다. 그런데 `.seats`는 `.stage`를
좌우로 이미 정확히 꽉 채우므로 **좌우 bleed는 덮는 게 아무것도 없다.** 왼쪽 넘침은 스크롤 대상이 아니라
그냥 잘리고 오른쪽만 스크롤이 되니, 이득 0 · 스크롤바 1인 상태였다.

- `inset: -1.5rem` → `inset: -1.5rem 0`. 위아래 bleed는 실제로 좌석 줄 바깥까지 사진을 넓히므로 유지
- 브라우저에서 이 규칙만 주입해 재측정 → `scrollWidth 942 === clientWidth 942`
- **`overflow-x: hidden`으로 덮지 않았다.** 그건 넘침을 가리는 것이지 없애는 게 아니다

### 5. 의심 → 오판 텀 (같은 커밋)

| | 이전 | 이후 |
|---|---|---|
| 「위증 의심!」 | 1200ms | 2000ms |
| 두 알림 사이 공백 | **0ms** | **520ms** |
| 「오판」 / 「위증 발각」 | 2200ms | 2800ms |

- **공백이 핵심.** 큐가 `ms`가 끝나자마자 다음을 띄워 「지목」을 읽는 도중 「판정」이 덮어썼다.
  `FlashEvent`에 `gapMs`를 추가해 `ms + gapMs` 뒤에 다음을 꺼낸다.
  모든 플래시 키프레임이 `opacity: 0`으로 끝나는 걸 확인했으므로 이 틈에 화면은 원탁으로 돌아온다
- **길이만 늘리면 «느리게 나타나 느리게 사라질» 뿐 읽을 시간은 안 는다.**
  `challenge-call-point` 등장·퇴장 비율을 30%/82% → 18%/88%로 줄여 1.4초를 정지 구간으로 만들었다
- `challengeCall`을 두 군데서 큐에 넣으므로 시간 상수 3개(`CHALLENGE_CALL_MS`·`CHALLENGE_BEAT_MS`·
  `CHALLENGE_RESULT_MS`)로 분리했다. 한쪽만 고쳐져 같은 사건이 사람마다 다른 속도로 흐르는 걸 막는다

### 6. 알림 설명 줄이 한 번도 안 떴다 (`fcecbe4`, merge `8b4d659`)

reduced-motion을 파다가 나온 **별개의 고장**이다. 배포본 실측:

| 종류 | `small` |
|---|---|
| `caught` / `wrongCall` / `challengeCall` | `animation: none`, `opacity: 0` → **한 번도 안 보임** |
| `myTurn` | `myturn-flicker` 2.6s → 정상 |

`.action-flash small`의 기본이 `opacity: 0`인데 애니메이션이 `myTurn`에만 붙어 있었다.
즉 「참가2는 위증이 아니었다 — 대신 참가4의 넥타이 카드가 열렸다」처럼 **그 판정을 이해하는 데
필요한 문장이 통째로 빠져 있었다.** `flash-sub-in` 키프레임을 추가해 세 종류에 붙였다.

### 7. reduced-motion이 알림을 «줄인» 게 아니라 «지웠다» (같은 커밋)

- 원인은 「대기가 길다」가 아니었다. `animation-duration: 0.01ms`인데 이 알림들의 키프레임은
  마지막이 `opacity: 0`이고 fill이 `forwards`라 **즉시 사라진 상태로 안착**한다.
  화면은 아무것도 없는데 큐는 `ms`만큼 그대로 기다려, 이의제기 한 건마다 5초 넘게 멈춰 있었다
- 길이는 두고 **`animation-name`만** `flash-hold`(opacity 전용)로 갈아끼웠다.
  `duration`·`fill-mode`는 각 종류가 단축 속성으로 정해 둔 값이 남으므로 큐의 `ms`와 어긋나지 않는다
- `::after`(충격 프레임)는 정보 없는 번쩍임이라 껐다. 기본이 `opacity: 0`이므로 애니메이션만 끄면 된다

---

## 미완 · 다음 액션

**다음에 여기부터:** `docs/01-game-design.md` §3 — 밀담 3회 제한을 문서에 먼저 쓴다.
루트 CLAUDE.md가 「문서 먼저」를 요구한다. (앞 기록에서 그대로 넘어온 항목이다)

- [ ] **밀담 3회 제한.** 새 상태 필드를 만들지 않고 `state.rounds.filter(r => r.parley).length`에서 파생시킨다.
      폴백 라운드는 밀담이 안 열리므로 횟수를 소모하지 않는다.
      순서: 문서(B) → `src/engine/parley.ts` 상한 + 테스트(A) → `src/engine/view.ts`에 잔여 횟수 노출(A) →
      `workers/src/schema.ts` 화이트리스트 동기화(A) → `GameScreen.tsx`에 「밀담 N/3」 표시(B)
- [ ] **A의 능력 시스템 육안 확인.** 이 세션 중간에 A가 10커밋(`13d946f`…`9723c86`)을 올렸다.
      리베이스 충돌 없었고 합친 상태에서 318/318 통과했지만 **B가 화면에서 확인한 범위가 아니다.**
- [ ] 직업 카드 톤 불일치(`coroner`·`operator`만 액자가 밝다)
- [ ] 첫 로딩 용량 764KB (폭 760→560px면 절반 이하)
- [ ] 2026-08-04 기록의 미완(전화교환수 능력과 밀담 격리 충돌, 간헐 폴백, 예산 카운터 오차)은 그대로

## 막힌 것

없음. 다섯 건 모두 원인 특정 후 수정·배포 완료.

## 검증 상태

| 항목 | 상태 |
|---|---|
| `npm run build` | 통과 |
| 테스트 | **318/318** (21파일 — A가 `power.test.ts`·`fallback-lines.test.ts` 추가) |
| 배포 | Actions 성공 3회 — `2ab9a33`, `06b7ef9`, `8b4d659` |
| 스크롤바 제거 | 배포본 실측 확인 (`scrollWidth === clientWidth`) |
| 설명 줄 표시 | 빌드 산출물 렌더 확인 (`flash-sub-in` / 2.8s / forwards, t=400ms opacity 1) |
| reduced-motion | 규칙 주입 후 확인 (전부 `flash-hold`, transform `none`, duration·fill 유지) |
| **실제 판 육안 확인** | **미확인** — 연출 체감(텀·설명 줄)은 배포본에서 한 판 돌려 봐야 한다 |

## 다음 세션 첫 명령

```bash
git pull origin main && npm run build && npx vitest run
```

## 팀에 전달

- **「안 보인다」의 원인을 렌더 누락으로 먼저 의심하지 않는다.** 이번 다섯 건 중 렌더가 실제로 빠진 건
  **하나도 없었다.** 전부 그려지고 있는데 잘리거나(overflow), 덮이거나(캐스케이드), `opacity: 0`이었다.
- **고치기 전에 브라우저에서 숫자를 잰다.** `scrollWidth` vs `clientWidth`, `getComputedStyle(...).animationName`,
  `getAnimations()`로 `currentTime` 직접 샘플링. 추측으로 갔으면 스크롤바는 `overflow-x: hidden`으로
  **가리고** 넘어갔을 것이다 — 원인은 그대로 남은 채로.
- **`animation`은 `:hover`를 이긴다.** `fill: forwards`/`both`면 애니메이션이 끝난 뒤에도 마지막 키프레임 값이
  남고, 캐스케이드에서 애니메이션 값이 일반 선언보다 우선한다. 호버가 «적혀 있는데 안 먹으면» 여기부터 본다.
- **`animation-name`만 덮어쓰면 `duration`·`fill-mode`는 단축 속성 값이 남는다.** 실측으로 확인했다.
  JS 타이머와 CSS 길이가 쌍인 곳(플래시 큐)에서 연출만 바꿀 때 이게 안전한 방법이다.
- **reduced-motion은 「움직임을 줄여라」지 「정보를 지워라」가 아니다.** `animation-duration: 0.01ms`로 뭉개면
  키프레임 마지막이 `opacity: 0`인 연출은 통째로 사라진다. 길이를 두고 키프레임만 바꾸는 게 맞다.
- **플래시 큐에 `gapMs`가 생겼다.** 두 알림이 한 사건의 두 박자일 때 쓴다 — 안 주면 앞의 것을 읽는 도중
  뒤의 것이 덮어쓴다. 값은 `src/components/GameScreen.tsx`의 시간 상수 3개와 `game.css`의
  `.action-flash--*` 애니메이션 길이가 **쌍이다.** 한쪽만 고치면 연출이 잘리거나 빈 화면이 남는다.
- 브랜치 `feat/ui-reveal-card-visible`·`fix/ui-stage-overflow-beat`·`fix/ui-flash-detail-motion`은 병합 후 삭제했다.
