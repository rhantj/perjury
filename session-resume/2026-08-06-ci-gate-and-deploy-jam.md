# 2026-08-06 — CI가 워커를 보게 하고, 워커 미배포 3건을 복구했다

> 일정: 마감까지 D-4
> 작업자: A(rhantj)
> 커밋: `6c37bc5`(CI) · `db8c087`(리뷰 반영) · `8a6f371`(병합)

앞 스냅샷 [2026-08-06-worker-outage-and-merge.md](2026-08-06-worker-outage-and-merge.md)에서
「CI가 워커를 안 본다」를 미완으로 남겼다. 그것을 하러 들어갔다가 같은 사고를 두 번 더 만났다.

## 오늘 워커 미배포가 세 번 났다

**전부 같은 모양이다.** 시야(`GameView`)에 필드가 늘고, 워커 스키마는 화이트리스트라
모르는 키를 400으로 거절하고, 프론트만 배포돼서 판단 요청이 전부 폴백으로 떨어진다.

| 시각 | 필드 | 워커 코드 | 워커 배포 | 증상 |
|---|---|---|---|---|
| 오전 | `responderIds` | 없었음 | — | `허용되지 않은 필드 'responderIds'` |
| 오후 | `claim.cardId: null` | **고쳤음** | 안 함 | `cardId가 문자열이 아니다` |
| 저녁 | `eliminated` | **고쳤음** | 안 함 | `허용되지 않은 필드 'eliminated'` |

뒤 두 번은 워커 코드가 이미 올바랐다. 커밋 메시지에 「워커를 먼저 배포하고 프론트를
나중에 올리는 순서를 지키기 위한 창」이라고 직접 쓰여 있기까지 했다. **빠진 것은
`npm run worker:deploy` 한 줄이다.**

배포 뒤 실제 왕복으로 확인했다(HTTP 200 + 폴백 풀에 없는 모델 문장). 새 프론트 모양과
**라이브에 떠 있는 옛 프론트 모양** 양쪽 다 통과한다 — 관용 파싱이 제 몫을 했다.

중간에 상류 400이 몇 번 떴는데 **일시적이었다.** 코드가 아니라 Anthropic 쪽이고,
같은 요청이 곧 200으로 돌아왔다. 폴백이 받아낸 구간이다.

## CI가 워커와 테스트를 보게 했다

CI는 `npm run build`만 돌렸다. 그 tsc는 **루트 tsconfig만** 본다. `workers/`는 별도
tsconfig(다른 `lib`·`types`라 합칠 수도 없다)라 검사 밖이었고, 494개 테스트도 배포를
하나도 막지 않았다.

오전 장애 커밋을 worktree로 꺼내 돌려 확인했다:

```
514d8e5 $ tsc --noEmit -p workers/tsconfig.json
workers/src/schema.ts(410,5): error TS2322:
  Property 'responderIds' is missing in type '{...}' but required in type 'RoundView'.
```

**잡을 수 있었다.** CI가 그 명령을 안 돌려서 지나갔다.

- `deploy.yml` — 빌드 앞에 `worker:typecheck` + `test`. 깨진 것이 라이브로 못 나간다
- `verify.yml`(신규) — 같은 검사를 작업 브랜치에서 먼저. `main`은 빼서 두 번 안 돌린다

둘 다 실제로 초록을 확인했다(브랜치 1회, main 1회).

**한계를 분명히 적어둔다: 이 CI는 위 세 사고를 못 잡는다.** 코드는 맞고 *배포 상태*만
어긋난 것이라 정적 검사의 사정권 밖이다. CI가 막는 것은 「워커 코드를 안 고친 채 올리는
것」(오전 유형)이고, 「고쳤는데 배포를 안 하는 것」(오후·저녁 유형)은 여전히 사람이 본다.

## 막힌 것 — Pages 배포가 1시간째 안 올라간다

**증상**: 11:17 이후 배포가 한 번도 성공하지 못했다. 빌드 잡은 전부 통과하고,
실패는 전원 `actions/deploy-pages` 단계다. `deployment_queued`로 10분 대기 후 타임아웃이거나,
5초 만에 `Deployment cancelled`다.

```
11:17  success   ← 마지막 성공
11:28  cancelled     라운드 4바퀴(제안 24회)   ← 수치 변경이 라이브에 없다
11:32  cancelled     판결문 사건번호
11:34  failure       제안 강조 유지
11:46  failure       폴백 밀담 주장
11:47  cancelled     폴백 밀담 테스트
11:51  cancelled     다 쓴 직업 능력 표시
11:51  cancelled     CI 게이트
12:02  failure       조기 고발 사람 UI (3-C-1)
12:15  failure   ← 수동 재배포 2회도 실패
```

**시도한 것**: `gh run rerun --failed` 1회, `gh workflow run deploy.yml` 1회. 둘 다 5초 만에
`Deployment cancelled`.

**남은 가설**: `main`에 4~6분 간격으로 연달아 푸시하는 것 + `concurrency.cancel-in-progress: true`
조합이다. 새 푸시가 앞 배포를 취소하는데 Pages는 취소된 배포를 **커밋 SHA로** 물고 있어서,
같은 SHA로 다시 시도하면 즉시 취소된다(배포 ID가 SHA와 같다). 그래서 **새 커밋이라야 풀린다** —
이 파일이 그 새 SHA다.

## 미완 · 다음 액션

**다음에 여기부터:** 이 커밋으로 배포가 풀리는지 확인. 안 풀리면 `deploy.yml`의
`cancel-in-progress`를 끄는 것이 다음 수다.

- [ ] `cancel-in-progress: false` 검토 — 끄면 푸시마다 순서대로 배포돼 느리지만 확실하다.
      대신 연속 푸시 때 잠깐 옛 버전이 보인다. **대표 판단 대기 중**
- [ ] 2-B — 변호사·협잡꾼 대기(`round.ts`의 `declareAll`). 1-B가 들어왔으므로 이제 열렸다
- [ ] 결정 011 미결 #1 — 탈락 «전»에 걸어둔 순사·사진사 지목이 탈락 «후»에도 풀려야 하는가.
      지금은 풀린다(`engine/power.ts`)
- [ ] 워커 호출 캡 — `IP_DAILY_CALL_CAP=120` `DAILY_CALL_CAP=250`(둘 다 기본값).
      한 판이 약 96회, 라운드 24면 더 는다. **올리는 것은 API 비용 결정이다**

## 검증 상태

| 항목 | 상태 |
|---|---|
| `npm run typecheck` · `worker:typecheck` · `build` | 통과 |
| 테스트 | 497/497 |
| CI — `verify.yml` (브랜치) | 4단계 전부 초록 |
| CI — `deploy.yml` 빌드 잡 (main) | 4단계 전부 초록 |
| 배포 — 워커 | **정상.** 새·옛 프론트 모양 양쪽 HTTP 200 확인 |
| 배포 — 프론트 | **막힘.** 라이브가 11:17 코드에 멈춰 있다 |

## 다음 세션 첫 명령

```bash
git pull origin main && npm run worker:typecheck && npx vitest run
curl -s https://rhantj.github.io/perjury/ | grep -o 'index-[A-Za-z0-9_-]*\.js'
```

두 번째 줄은 라이브 번들 해시다. 로컬 `npm run build`의 `dist/assets/` 해시와 같아야
라이브가 최신이다. **다르면 배포가 또 막힌 것이다.**

## 팀에 전달 (B에게)

- **시야에 필드를 더하면 `npm run worker:deploy`까지 해야 끝이다.** 오늘 세 번 다 이것이
  빠졌다. 워커 코드는 두 번 다 올바랐다 — 배포만 안 됐다.
  확인은 배포 링크에서 한 판 돌려보고 좌석 대사가 폴백 문장인지 보면 된다.
- **`main`에 연타로 푸시하면 배포가 서로를 잡아먹는다.** 위 「막힌 것」이 그것이다.
  브랜치에 모아 한 번에 합치는 편이 안전하다.
- **CI가 늘었다.** 작업 브랜치를 푸시하면 `Verify`가 돈다(`worker:typecheck` → `test` → `build`).
  `main` 푸시는 `deploy.yml`이 같은 검사를 배포 앞에서 한다. 빨간불이면 배포가 안 나간다.
- **3-C는 B가 3-C-1(사람 UI)까지 가져갔다.** 남은 것은 AI의 고발 타이밍 판단이다.
  담당을 정해야 한다 — 룰 개편 문서 §5 표의 3-C 행이 아직 `rhantj / 미착수`다.
