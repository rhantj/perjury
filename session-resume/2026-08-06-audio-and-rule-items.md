# 2026-08-06 — 테마음악과 룰 항목 넷

> 일정: 룰 개편 마무리 / 마감까지 D-4
> 작업자: jjssspark
> 커밋: `b06e836` … `385356d`

## 완료

**소리 (신규 계층)**

- `src/audio/audio.ts` — 배경음 2곡·효과음 3종. 의존성 0
- `src/components/MuteButton.tsx` — 우상단 `音`/`默`. 설정은 `localStorage`에 남는다

**음원 파일이 하나도 없어도 빌드·플레이가 정상이다.** 정적 import를 쓰면 파일이 없는
동안 빌드가 깨져 main이 막히므로 `import.meta.glob`으로 있는 것만 읽는다.
지금 배포본이 음원 0개 상태로 정상 동작하는 것이 그 증거다.

효과음은 `fireActionFlash`가 아니라 **`runFlashQueue`**에 걸었다. 큐에 넣을 때가 아니라
화면에 뜰 때 울려야 앞선 알림이 대기하는 사이 소리만 먼저 나가지 않고, AI 위증이 드러나는
`caught` 컷까지 같은 자리에서 잡힌다.

**라운드 4바퀴 (룰 개편 「수치」 중 라운드)**

- `engine/setup.ts` — `DEFAULT_ROUNDS` 8 → **24**
- `components/GameScreen.tsx` — `lapOf()`로 화면만 바퀴로 접는다

엔진은 제안 회차로 세고 화면만 접는다(문서 §4). 바퀴 단위로 바꾸면 사진사의
「다음 라운드」가 최대 6선언 뒤로 밀려 능력이 대폭 세진다.
신문 알림도 바퀴로 센다 — 회차마다 띄우면 23번이라 알림이 판을 덮는다.

테스트 18개가 깨졌다. 원인은 `8`을 리터럴로 박아둔 것이라, 24로 바꾸는 대신
**`DEFAULT_ROUNDS`를 참조하게** 고쳤다. `flow.test`의 루프 상한 60도 폭주 방지선임을
주석으로 밝히고 회차 기준(`DEFAULT_ROUNDS * 8`)으로 돌렸다.

**정보상이 실제로 판정하게**

- `ai/rule-decider.ts` — 폴백 밀담이 주장 한 문장을 붙이고 `truthful`을 채운다
- `ai/rule-decider.test.ts` — 완주 테스트로 안 잡히는 회귀라 직접 붙들었다

트리거는 원래 있었다(PowerPanel의 「능력 발동」). 진짜 원인은 폴백이 `truthful: null`을
내보내고 엔진이 `null`이면 판정을 건너뛰는 것이었다(`parley.ts:23`).
**워커가 미배포라 모든 밀담이 폴백**이므로 배포본에서 이 능력이 판 내내 아무것도 못 얻었다.
덤으로 판당 3회뿐인 밀담이 정보를 0으로 냈다.

주장은 **용의자 카드로만** 만든다. 용의자 6명은 사건과 무관하게 고정이라(결정 002)
시나리오 이름표 없이도 화면과 같은 이름을 부를 수 있다. 수단·장소로 하면 이름이 갈린다.

**조기 고발 — 사람 쪽 (3-C-1)**

- `engine/view.ts` — `GameView.eliminated` 추가. 탈락 좌석은 전체 공개, **손패는 안 싣는다**
- `workers/src/schema.ts` — 화이트리스트를 **먼저** 넓히고 관용 파싱(없으면 `[]`)
- `store/game.ts` — `accuseEarly` 액션
- `components/GameScreen.tsx` — 모드로 가른 고발 UI

화면을 모드로 가른 이유는 제안과 손가락이 겹쳐서다. 두 확정 버튼이 한 화면에 같이 있으면
되돌릴 수 없는 쪽을 잘못 누른다. 「범인을 지목한다」를 누르면 고르는 모드로 들어가고,
그 동안 나머지 조작은 감춘다.

**손패 공개 여부는 새로 정할 것이 없었다.** §2-5와 결정 011이 이미 「한꺼번에 공개하지
않는다」로 못 박아 뒀다 — 까면 남은 사람들이 2장을 한꺼번에 알게 되어 판이 즉시 끝난다.

**화면 잔손질**

- `Verdict.tsx` — `判 第ci2pwe號`가 시드 원문이었다. 4자리 사건번호로 접었다
- `MyPlate.tsx` — 능력을 쓰면 `壹回`가 `已使`가 되고 초상에서 색이 빠진다
- `GameScreen.tsx` — 확정한 제안이 반증 중에도 추리표에 남는다

## 미완 · 다음 액션

**다음에 여기부터:** 워커 배포. 이게 되기 전까지 아래 셋이 전부 막혀 있다.

- [ ] **워커 배포** — rhantj가 `npm run worker:deploy`. 지금 코드에 세 가지가 쌓여 있다:
      `cardId: null` 허용, 비공개 반증·덫 제안 프롬프트, `eliminated` 관용 파싱
- [ ] **3-C-2** 조기 고발 AI 판단 — `ai/flow.ts` `ai/rules.ts` `workers/src/prompt.ts` (rhantj)
- [ ] **밀담 6회** — `engine/parley.ts` (rhantj). 라운드만 올려 지금은 8제안당 1회다.
      한 판 돌려 보고 정한다
- [ ] **음원 파일** — `src/assets/audio/`에 아래 이름 그대로 넣으면 코드 수정 없이 잡힌다:
      `bgm_intro.mp3` `bgm_table.mp3`(각 60~90초 루프) ·
      `sfx_suggest.mp3` `sfx_refute.mp3`(각 0.5초 이내) · `sfx_perjury.mp3`(1.5~1.8초).
      볼륨은 `src/audio/audio.ts`의 `BGM_VOLUME`(0.32) `SFX_VOLUME`(0.55)
- [ ] **근거 없이 잡은 값 둘을 측정한다** — `ai/rules.ts`의 `TRAP_RATE`(0.35),
      `ai/rule-decider.ts`의 `LIE_RATE`(0.3). 문서 부록 B가 「규칙 기반 100판」이라고 해뒀다

## 막힌 것

**워커 호출 캡.** 라운드 24는 한 판이 약 120회인데 배포된 워커가 `IP_DAILY_CALL_CAP=120`이다.
심사자가 하루에 두 번째 판을 켜면 그때부터 폴백만 본다. 코드로는 못 푼다 —
Cloudflare 설정과 API 비용 결정이 필요하다.

**워커 배포 계정.** 이 컴퓨터는 jjssspark 개인 계정이고 라이브 워커는 rhantj 계정에 있다.
여기서 배포하면 라이브가 갱신되는 게 아니라 다른 주소로 새 워커가 하나 생긴다.
계정 소유자가 올리는 것이 정공법이다.

## 이번에 낸 사고 둘

기록해 두는 이유는 절차로 막을 수 있는 것들이라서다.

**빌드가 깨진 채로 main에 올라갔다**(`93408e0` → `2382b66`으로 수정).
`npm run build 2>&1 | grep -E "error|✓ built"`로 확인했는데 파이프의 종료 코드는 grep의 것이라
빌드가 실패해도 `&&` 체인이 그대로 진행됐다. **검증은 파이프 없이 종료 코드로 본다.**
원인 자체는 `speakInParley`가 `null`을 줄 수 있는데 테스트에서 안 좁힌 것이었다 —
**vitest는 타입을 보지 않으므로 테스트 497개가 통과해도 tsc가 막는다.**

**브랜치 없이 main에 직접 커밋했다**(`90e0281`). 급한 빌드 수정 뒤 main에 남아 있는 것을
놓쳤다. force push 금지라 되돌리지 않고 다음 것부터 다시 브랜치로 갔다.

## 검증 상태

| 항목 | 상태 |
|---|---|
| `npm run typecheck` | 통과 |
| `npx tsc --noEmit -p workers/tsconfig.json` | 통과 |
| `npm run build` | 통과 |
| 테스트 | 497/497 |
| 배포 (프론트) | **실패** — 아래 참고. 라이브는 `db38a51`에 멈춰 있다 |
| 배포 (워커) | **미배포** |

### 배포가 실패하고 있다 (08-06 12:14 기준)

`build` 잡은 21초에 통과하는데 `deploy` 잡의 `actions/deploy-pages@v4`가 죽는다.

```
Created deployment for 385356dcf8a850635d9a2c22006cc55e1df7ca70
Getting Pages deployment status...
##[error]Deployment cancelled.
```

배포가 `queued → in_progress → failure`를 18초 만에 반복한다. 재실행해도 같다.
**우리 코드 문제가 아니다** — 빌드 산출물은 매번 정상이고 Pages 설정도 정상이다
(`build_type: workflow`, source `main`).

짚이는 것: `deploy.yml`의 `concurrency.cancel-in-progress: true` 때문에 짧은 간격의
연속 푸시가 진행 중인 Pages 배포를 여러 번 끊었다(실행 목록에 `cancelled` 6건).
Pages 배포는 중간에 끊기면 환경에 잠금이 남을 수 있다.

**다음 사람이 할 것**: 시간을 좀 두고 `gh run list`로 다시 본다. 여전히 실패하면
빈 커밋으로 새 빌드를 태우거나(`git commit --allow-empty`), 리포 소유자(rhantj)가
Settings → Pages와 `github-pages` 환경의 걸린 배포를 확인한다.
**연속 푸시를 삼가는 것이 재발 방지다** — 한 번 올리고 끝날 때까지 기다린다.

## 다음 세션 첫 명령

```bash
git pull origin main && npm run build && npx vitest run
```

## 팀에 전달

- **워커를 배포해야 한다.** 스키마는 전부 관용 파싱이라 옛 프론트도 통과한다.
  **워커 먼저, 프론트 나중** — `responderIds` 때 겪은 순서다
- `GameView`에 `eliminated`가 늘었다. 탈락 좌석 목록이고 전체 공개다.
  손패는 싣지 않는다(§2-5, 결정 011)
- 문서 §5 담당표를 고쳤다 — 「수치」를 라운드/밀담으로 쪼개 라운드만 가져갔고,
  3-C를 3-C-1(완료)·3-C-2(미착수)로 쪼갰다
- **라운드 24가 호출 캡에 걸린다.** 올리려면 API 비용 결정이 필요하다
- CI에 워커 타입체크·테스트가 들어갔다(rhantj `8a6f371`). 로컬에서도 같이 돌리는 게 맞다
