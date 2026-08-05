# 2026-08-05 — 좌석 배지 겹침 해소·직업 카드 일러스트 교체

> 일정: D6 / 마감까지 D-5
> 작업자: B (UI·content)
> 커밋: `0f5ff78` … `94b1f0e`
> 직전 기록: [2026-08-04-parley-shipped.md](2026-08-04-parley-shipped.md)

## 한 줄 요약

**화면에서만 드러나는 고장 세 건을 닫았다.** 셋 다 typecheck·테스트가 통과한 상태에서 배포본을 눈으로 봐야 보였다.

---

## 완료

### 1. 좌석 좌상단 겹침 (`0f5ff78` → `d1718cd`, merge `73b4447`)

참가 번호 위에 「차례」·「제안」 배지가 겹쳐 그려졌다. 원인은 **세 요소가 각자 독립적으로 같은 모서리에 `position: absolute`** 였던 것이다.

| 요소 | 옛 좌표 |
|---|---|
| `.seat__face` (번호) | `top: 0.55rem; left: 0.65rem; width: 1.75rem` |
| `.seat__turn-badge` | `top: 0.5rem; left: 0.6rem` |
| `.seat__suggest-badge` | `top: 0.5rem; left: 0.6rem` |

- `src/components/Table.tsx` — 셋을 `.seat__tags` 한 요소로 묶었다
- `src/styles/game.css` `.seat__tags` — 묶음만 절대배치하고 안쪽은 `display: flex; gap: 0.3rem`. 배지가 몇 개 켜지든 나란히 흐른다
- 두 배지에서 `position: absolute; top; left`를 제거. 계산으로 만든 매직 넘버(`2.65rem`)도 사라졌다

**1차 수정(`0f5ff78`)은 실패했다.** 「제안」 배지 좌표만 옮겨 증상 하나만 없앴고, 같은 자리에 있던 「차례」가 그대로 겹쳤다.

### 2. 「차례」 배지 크기 (`6301430`, merge `6e242cf`)

배지를 한 줄로 묶고 나니 「차례」가 옆 번호칸보다 눈에 띄게 작았다.

- `src/styles/game.css` `.seat__turn-badge` — `font-size` 0.6rem → 0.8rem, `align-self: stretch`
- **높이에 숫자를 다시 박지 않았다.** `stretch`가 같은 flex 줄의 번호칸 높이를 따라가므로, 번호칸이 바뀌면 배지도 따라온다. 1번 항목의 원인이 «좌표를 각자 적어둔 것»이었으므로 여기서 또 박으면 같은 종류의 중복이 생긴다

### 3. 직업 카드 일러스트 10장 교체 (`f56b12b`, merge `94b1f0e`)

옛 그림은 `constable`·`coroner`·`reporter` **세 장의 파일이 명패 글자 중간에서 끝나** 이름이 반쯤 잘려 보였다. 아래 픽셀이 파일에 없어 CSS로는 복구가 불가능했다.

- 중간 조치로 명패 영역을 가렸다가(`bd38d18`), 명패가 온전한 새 그림을 받아 그 가림을 걷어냈다
- 원본 PNG는 1792×2400에 장당 6~7MB(합계 66MB) → **폭 760px WebP로 변환, 합계 764KB.** 카드는 화면에서 최대 448px로 그려진다
- 파일명을 기존 role id에 맞춰 넣어 `src/content/role-art.ts`의 import는 손대지 않았다
- `src/styles/briefing.css` `.duty__card` — `aspect-ratio`를 **뺐다.** 높이는 그림이 정한다. `game.css`의 `.plate__art`도 같다
- `src/content/role-art.ts` — `ROLE_ART_SIZE` 추가. `<img>`의 `width`·`height`를 장별 실측값으로 넣어 로딩 중 카드가 튀지 않게 했다

**비율이 장마다 같지 않다.** `reporter`만 760×882, 나머지 9장은 760×1018이다. 그래서 상자 비율을 하나로 박을 수 없다 — 박으면 `cover`가 아래를 잘라 다시 명패를 먹거나 `contain`이 빈 띠를 남긴다.

---

## 미완 · 다음 액션

**다음에 여기부터:** `docs/01-game-design.md` §3 — 밀담 3회 제한을 문서에 먼저 쓴다. 루트 CLAUDE.md가 «문서 먼저»를 요구한다.

- [ ] **밀담 3회 제한.** 방향은 정해져 있다 — 새 상태 필드를 만들지 않고 `state.rounds.filter(r => r.parley).length`에서 파생시킨다. 폴백 라운드는 밀담이 안 열리므로 횟수를 소모하지 않는다.
      순서: 문서(B) → `src/engine/parley.ts` 상한 + 테스트(A) → `src/engine/view.ts`에 잔여 횟수 노출(A) → `workers/src/schema.ts` 화이트리스트 동기화(A) → `GameScreen.tsx`에 「밀담 N/3」 표시(B)
- [ ] **직업 카드 톤 불일치.** `coroner`(검시관)·`operator`(전화교환수)는 액자 자체가 밝은 색이라 나머지 8장과 결이 다르다. 거슬리면 그 둘만 다시 뽑는다
- [ ] **첫 로딩 용량.** 직업 카드 합계 764KB. 체감이 거슬리면 폭 760→560px로 절반 이하가 된다
- [ ] 2026-08-04 기록의 미완 항목(전화교환수 능력과 밀담 격리 충돌, 간헐 폴백, 예산 카운터 오차, 폴백 대사 풀)은 그대로 남아 있다

## 막힌 것

없음. 세 건 모두 배포본에서 확인 완료.

## 검증 상태

| 항목 | 상태 |
|---|---|
| `npm run typecheck` | 통과 |
| `npm run build` | 통과 |
| 테스트 | **262/262** (18파일) |
| 배포 | Actions 성공 — `94b1f0e` |
| 배포본 육안 확인 | 세 건 모두 완료 (⌘⇧R 강제 새로고침) |

## 다음 세션 첫 명령

```bash
git pull origin main && npm run build && npx vitest run
```

## 팀에 전달

- **절대배치 요소가 같은 모서리를 공유하면 좌표를 옮기지 말고 흐름 컨테이너로 묶는다.** 좌표 이동은 증상 하나만 없앤다 — 이번에 그래서 두 번 고쳤다. `.seat__tags`가 그 형태다.
- **`grep`의 "결과 없음"을 "안 쓰임"으로 읽지 않는다.** `seat__badge`로 검색하면 `seat__turn-badge`는 안 잡힌다. 이 오독으로 살아 있는 CSS를 죽은 것으로 판단했다.
- **직업 카드 그림을 갈아끼울 때는 명패가 프레임 안에 온전한지 먼저 본다.** 아래가 잘린 파일이면 CSS로 손쓸 방법이 없다. 크기가 바뀌면 `src/content/role-art.ts`의 `ROLE_ART_SIZE`도 함께 고친다 — 안 고치면 로딩 중 카드 높이가 튄다.
- **레이아웃 겹침·잘림은 typecheck도 테스트도 안 잡는다.** 이번 세 건이 전부 그랬다. 배포본 클릭만이 잡는다.
