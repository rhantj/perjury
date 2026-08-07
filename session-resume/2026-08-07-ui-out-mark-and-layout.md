# 2026-08-07 — 탈락 표시·직업 능력 상실·판 세로 정리

> 일정: 마감까지 D-3
> 작업자: B
> 커밋: `2436bbe` … `42c13ff` (작업 4 + 병합 4)

## 완료

피드백 6건. 브랜치 넷으로 쪼개 각각 빌드·테스트 통과 후 `--no-ff` 병합.

- `fix/ui-mute-position` — 소리 스위치(`.mute`)와 「記 기록」이 우상단에서 겹쳤다.
  스위치는 표지·브리핑·게임판을 한 요소가 덮는 앱 레벨 고정 요소라 **어느 모서리로 옮겨도
  인장·상단 바·하단 버튼 중 하나와 부딪힌다.** 그래서 옮기지 않고 상단 바가 비켜 앉게 했다.
  - `src/styles/global.css` — `:root`에 `--mute-slot: 6.5rem`.
    **`.mute`가 아니라 `:root`다** — 스위치는 게임판의 형제라 그쪽에 두면 변수가 바에 안 내려간다.
  - `src/styles/game.css` — `.bar { padding-right: var(--mute-slot) }`

- `fix/ui-out-loses-power` — 탈락자가 직업 능력을 잃는 것이 화면에 없었다(엔진은 이미 막고 있었다,
  `src/engine/power.ts:195`).
  - `src/components/MyPlate.tsx` · `PowerPanel.tsx` — Props에 `out: boolean` 추가. 호출자는 `GameScreen` 하나.
  - 카드 회색 처리 + 뱃지 `失效`, 패널은 「失 능력 상실」. **`out`이 `常時`·`待機`보다 앞에 온다** —
    뒤에 두면 판에서 나갔는데 아직 쓸 것이 있다고 말한다.
  - 이미 쓴 능력은 그대로 둔다 — 무엇을 알아냈는지는 빠진 뒤에도 봐야 한다.

- `feat/ui-eliminated-mark` — 고발 실패가 화면에서 조용히 지나갔다.
  - `src/components/GameScreen.tsx` — 플래시 종류 `ousted`(3200ms) + `view.eliminated` 증가 감지 훅.
    **탈락 경로는 `engine/progress.ts:119` 하나뿐**(틀린 조기 고발)이라 사유를 따로 안 들고 다닌다.
    첫 렌더에서 비교 기준만 잡고 빠진다 — 안 그러면 판을 이어받을 때 지난 탈락이 한꺼번에 쌓인다.
  - `src/components/Table.tsx` — `seat--out`(점선 테두리 + 초상만 회색) + 「退 반증만」 뱃지.
    **글자는 안 흐린다** — 탈락자도 반증은 계속하므로 발언을 읽어야 한다.
  - `src/styles/game.css` — `ousted-stamp` 키프레임(도장 찍히는 모양), 인장색.
    발각(caught)의 금빛과 갈랐다 — 저쪽은 구경하는 사건, 이쪽은 당하는 사건이다.

- `fix/ui-notebook-layout` — 추리표 종류 라벨과 세로 스크롤.
  - `src/components/Notebook.tsx` — 「범인 강도윤」처럼 한 줄에 붙던 것을 **그룹 머리 줄**(`nb__group`,
    `colSpan`)로 분리. 카드 이름이 종류 아래로 가고 데이터 줄 높이가 전부 같아진다.
    `Fragment` import 추가. 고아가 된 `.nb__kind` · `.nb__cell-top` · `.nb__label--top` 제거.
  - `src/styles/game.css` — `.actions`를 grid → **flex**. 「범인을 지목한다」와 「제안 확정」이
    세로로 쌓여 이 줄만 109px를 먹고 있었다. `.nb__cell` 1.95→1.7rem, `.board`/`.nb` 패딩 축소.

## 검증

**배포본(https://rhantj.github.io/perjury/)에서 실측했다.** 번들 해시가 로컬 빌드와 일치
(`index-CpS6E_Ux.js` / `index-CsmTGpCG.css`).

| 항목 | 실측 |
|---|---|
| 기록 버튼 ↔ 스위치 | `logBtn.right=1595 < mute.x=1611` → 겹침 없음 |
| 하단 조작 줄 | `display:flex`, 109px → **56px**, 두 버튼 같은 y |
| 판 최소 필요 높이 | **826px → 743px** (13인치 브라우저 ≈760px에서 스크롤 사라짐) |
| 추리표 머리 줄 | `.nb__group` 3개 — 범인 / 수단 / 장소 |
| 탈락 좌석 | `seat--out` 1개, 점선, 뱃지 「退 반증만」 |
| 직업 카드 | `plate__once--lost` = 「失效」, `plate__who--spent`, 패널 「失 능력 상실」 |
| 고발 실패 컷 | `action-flash--ousted` 마운트 확인 |

`npm run build` · `npm run worker:typecheck` · **554 tests / 26 files** 통과.

### 확인하다 걸린 함정 둘 (다음 사람용)

1. **브라우저 캐시.** 배포 직후 열면 옛 CSS가 걸린 채로 새 HTML이 뜬다.
   `getComputedStyle(document.documentElement).getPropertyValue('--mute-slot')`가 빈 문자열이면 그 상황이다.
   쿼리스트링을 붙여 다시 연다.
2. **플래시 관찰은 `addedNodes`로 한다.** 콜백 시점에 `document.querySelector('.action-flash')`를
   읽는 방식은 배치 안에서 뜨고 사라진 컷을 놓친다. 이것 때문에 `ousted`가 «안 뜬다»고
   한 번 잘못 판단했다 — 실제로는 뜨고 있었다.

## 미완 · 다음 액션

**다음에 여기부터:** `src/components/GameScreen.tsx:339` — `draw`와 `ousted`의 큐 순서

- [ ] **고발 실패 컷이 4.0초 늦게 뜬다.** 「반증 추첨」 컷(leadMs 900 + 3600ms)이 먼저 큐에 들어가
      그 뒤를 잇는다(실측: draw 마운트 62893 → ousted 66891). 룰상 틀린 건 아니지만
      「극적으로」라는 요구에는 어긋난다. 탈락 컷을 큐 앞으로 끼워 넣을지 결정 필요 — 대표 판단 사항.
- [ ] **워커 배포가 여전히 막혀 있다.** `npm run worker:deploy`가
      `This Worker does not exist on your account. [code: 10007]`로 실패한다.
      `perjury` workers.dev 서브도메인이 지금 로그인 계정에 없다. 그 계정으로 `npx wrangler login`
      하거나 `proxy` 담당(A)이 배포해야 한다. **그때까지 밀담→AI 판단 연동은 라이브에 없다.**
- [ ] 병합된 로컬 브랜치 넷 정리(`fix/ui-mute-position`, `fix/ui-out-loses-power`,
      `feat/ui-eliminated-mark`, `fix/ui-notebook-layout`). 원격에 올린 적 없어 로컬 삭제만 하면 된다.

## 확인했지만 손대지 않은 것

「직업별 능력 미구현을 싹 다 구현하라」는 요청이 다시 왔으나 **미구현은 없다.**
10종 전부 `effect`가 있고(`src/content/roles.ts`), 엔진이 10종을 모두 처리하며
(`src/engine/power.ts`), 정보상 `detect-lie`도 `PowerPanel` → `engine/parley.ts:24`까지 배선돼 있다.
`src/content/roles.test.ts`의 「직업 — 열 종이 모두 살아 있는가」 5건이 이걸 지킨다.
실제 구멍은 «탈락자가 능력을 쓸 수 있는 것처럼 보이는 것»이었고 그건 위에서 고쳤다.
