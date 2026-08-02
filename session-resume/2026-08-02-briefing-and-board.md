# 2026-08-02 — 브리핑 3막·직업 10종·게임판 재설계

> 일정: 마감까지 D-8
> 작업자: B
> 커밋: `bc45949` … `2660f52` (33개)

## 완료

### 표지 · 브리핑

- `src/components/Landing.tsx`, `src/styles/landing.css` — 표지를 경성 호외 조판으로 재설계.
  이전 `StartScreen` 인라인 컴포넌트를 걷어냈다(`game.css`의 `.start*` 규칙도 삭제).
- `src/components/CityBackdrop.tsx`, `src/styles/backdrop.css` — 경성 야경 배경.
  건물·창문·초롱·인영이 **하나의 SVG 좌표계** 안에 있다. 이게 이 파일의 핵심 제약이다 —
  이전 판본은 건물이 viewBox, 초롱이 HTML 퍼센트 좌표라 등이 허공에 떴다.
- `src/components/Briefing.tsx`, `src/styles/briefing.css` — 표지와 게임판 사이 3막.
  사건 선택(4종) → 용의자 여섯(訊問調書) → 신분 통보. 막 사이 320ms 페이드, 뒤로가기 3단계.
- **3막은 연출이 아니라 기능이다.** 범인 진영은 정답 3장을 알고 시작하는데(설계 §2)
  게임판에 그것을 보여줄 자리가 없었다.

### 콘텐츠

- `src/content/scenarios.ts` — 사건 4종에 **용의자 24명 프로필**(`who`/`doubt`)과 **도입 3문장**(`opening`) 추가.
  `doubt`는 여섯 명 모두에게 있다 — 범인은 시드로 정해지므로 한 명만 수상하게 쓰면 글이 판을 배신한다.
- `src/content/roles.ts` — **직업 10종**(시민 8 + 범인 2)과 `assignRoles(seed, players)`.
  `docs/decisions/002`의 추첨 규칙 그대로. 200판 스크립트로 진영 불일치 0·중복 0 확인.
- `src/content/labels.ts` — 카드 **표시 이름**만 시나리오를 따르게 하는 매핑.
  엔진은 건드리지 않았다(카드 id·장수 불변). 용의자 이름 6개는 고정, 수단 4·장소 5만 교체.
- `src/assets/roles/*.webp` — 직업 일러스트 10장. 원본 15MB PNG → 340px WebP 10장 합쳐 **240KB**.
  `src/content/role-art.ts`가 정적 import로 들고 있다(경로 문자열로 두면 `base: '/perjury/'`에서 404).

### 게임판

- `src/components/MyPlate.tsx` — 내 신분패(진영·직업·능력·손패, 범인이면 봉인된 정답).
  붉은 봉인선 + 「密」. **나만 보는 정보라는 것이 생김새로 드러나야 한다.**
- `src/components/Table.tsx` — 좌석을 3×2 격자에서 **원탁**으로. 내 자리는 아래 가운데,
  상 한가운데에 이번 제안이 놓인다.
- `src/components/Log.tsx` — 기록을 **증언 말풍선**으로. 반증 선언은 원래 대사다(설계 §1.4.1).
  내 말은 오른쪽 정렬, 제안·발각은 화자 없는 지문.
- `src/components/Verdict.tsx`, `src/styles/verdict.css` — **판결문**. 진범·수단·현장·고발 주체와
  **위증 횟수 막대**. 엔진의 `isPerjury`를 쓰지 않고 판이 끝나 손패가 공개된 뒤 선언과 대조해 다시 센다.
- `src/styles/game.css` — 3단 레이아웃(내 패 · 원탁 · 증언), `data-scenario`별 배경 4종
  (장지문 격자 / 세로 활자 줄 / 고인 연기 / 벨벳 주름), 글씨·여백 전반 확대.

### 흐름

- `src/components/GameScreen.tsx` — `Stage`(briefing/play), **매판 무작위 시드**(`newSeed()`),
  착석 컷 오버레이, 판결문 오버레이. 오버레이 둘은 `createPortal`로 `document.body`에 붙인다.
- `src/store/game.ts` — `reset()`(표지로 되돌아가기), `role()`(**내 직업만** 노출).

## 미완 · 다음 액션

**다음에 여기부터:** `src/components/GameScreen.tsx`의 `.parley` 자리 —
지금은 「아직 열리지 않았다」 안내문만 있다. 밀담이 들어갈 칸이다.

- [ ] **밀담 페이즈** (A) — 설계 §3의 한 라운드는 `공개 → 밀담`인데 밀담이 통째로 없다.
      게임판 아래 절반이 비어 보이는 구조적 이유이고, LLM이 붙어야 한다.
- [ ] **직업 능력 발동** (A) — 배정·표시까지만 됐다. 검시관이 손패를 까거나 밀정이 이의제기를
      무효화하려면 `src/engine/`이 직업을 알아야 한다.
- [ ] 용의자 6장·장소 20장·수단 16장 일러스트 — 꽂을 자리는 잡혀 있다
      (`SuspectCard`의 `dossier__portrait`, `handcard__art`).
- [ ] 범인 진영 브리핑 3막을 눈으로 확인한 것은 시드를 임시로 바꿔서였다.
      정식 경로(새 판 반복)로는 아직 안 봤다.
- [ ] **좁은 화면 미확인.** 게임판 3단 → `78rem` 이하 한 단 접힘, 브리핑 3막 2단 → `68rem` 이하 분기를
      코드에만 넣고 실제로 줄여보지 않았다.

## 막힌 것

없음. 아래 둘은 해결됐고 재발 대비로만 남긴다.

- **Vite HMR이 낡은 변환 결과를 붙들고 `ReferenceError`를 던졌다.**
  증상: 빌드·타입체크는 통과하는데 브라우저에서 버튼이 아무 반응 없음.
  원인: 실행 중인 모듈에 새 import를 추가할 때 핫 리로드가 꼬임.
  해결: 개발 서버 재시작. `node_modules/.vite` 삭제는 불필요했다.
- **오버레이가 게임판 아래 깔렸다.** `position: fixed` + `z-index: 20`인데도 좌석·추리표가 위로 올라왔다.
  해결: `createPortal(…, document.body)`. 조상 쌓임 맥락에 갇히지 않는 유일한 방법이다.

## 검증 상태

| 항목 | 상태 |
|---|---|
| `npm run typecheck` | 통과 |
| `npm run build` | 통과 (JS 78KB · CSS 9KB gzip) |
| 테스트 | 119/119 |
| 배포 | `2660f52` Actions 성공 (31s) — https://rhantj.github.io/perjury/ |

## 다음 세션 첫 명령

```bash
git pull origin main && npm run build && npx vitest run
```

## 팀에 전달

- **`assignRoles`를 `src/content/roles.ts`에 넣었다.** `docs/decisions/002`는 이 추첨을
  「A 구현 시 제약」으로 적어뒀는데, `src/engine/`을 건드리지 않으려고 콘텐츠 쪽 순수 함수로 만들었다.
  시드 파생 규칙(`${seed}:roles`)은 문서 그대로다. **엔진으로 옮길 거면 데이터와 함수를 그대로 쓸 수 있다.**
- **엔진은 이번 작업에서 한 줄도 바뀌지 않았다.** 카드 이름 교체도 표시 계층(`labels.ts`)에서만 했다.
  테스트 119개가 그대로 통과하는 것이 그 근거다.
- **`docs/image/`를 gitignore에 넣었다.** 일러스트 원본(1792×2400 PNG)은 각자 로컬에만 둔다.
  화면에 쓰는 것은 `src/assets/`의 340px WebP 사본이다.
- 프로젝트에 prettier 설정 파일이 없다. **그냥 `npx prettier --write`를 돌리면 기본값
  (쌍따옴표·세미콜론)으로 코드 스타일이 깨진다.** 돌려야 하면
  `--no-semi --single-quote --print-width 100`을 붙인다.
