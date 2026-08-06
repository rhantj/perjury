# 2026-08-06 — 비공개 반증(1-B)과 추첨 연출

> 일정: 룰 개편 1단계 / 마감까지 D-4
> 작업자: jjssspark
> 커밋: `3cfd2eb` … `c9feee0`

## 완료

**룰 개편 1-A · 1-B (엔진)**

- `src/engine/round.ts` — `drawResponders()`. 제안자를 뺀 다섯 중 시드로 둘을 뽑는다.
  `${seed}:draw:${round}`로 네임스페이스를 갈라 다른 난수와 섞이지 않게 했다
- `src/engine/types.ts` — `RoundRecord.responderIds`. 재계산이 아니라 **기록**한다.
  뽑기 규칙을 바꿔도 지난 라운드가 소급해 달라지지 않아야 한다
- `src/engine/view.ts` — `ClaimView` 도입. `refute`의 `cardId`가 `CardId | null`이 됐다.
  카드를 보는 사람은 **제안자·선언한 본인·판이 끝난 뒤의 전원** 셋뿐이다
- `src/engine/testing.ts` — `suggestAll()`. 추첨을 끄는 테스트 전용 헬퍼. 기존 테스트
  60여 개가 「p3이 위증한다」식 배치를 세우고 시작해서, 검증 대상과 무관한 이유로 깨진
  것을 이걸로 살렸다

`cardId`를 지우지 않고 `null`을 담은 것이 설계의 핵심이다. 옵셔널이면 읽는 쪽이 조용히
`undefined`를 흘려보내지만, `null`이면 컴파일러가 소비처를 **빌드 실패로** 전부 끌어낸다.
실제로 8곳이 잡혔다 — `Log` `Table` `Verdict` `GameScreen` `ai/rules`(2곳)
`workers/schema` `workers/prompt`.

**덫 제안**

마스킹만 넣었더니 완주 테스트에서 이의제기가 0회가 됐다. 위증은 계속 일어나는데 아무도
잡지 못했다. 카드를 보는 사람이 제안자뿐인데 AI는 자기가 쥔 카드를 절대 제안하지 않아서
(소거를 진행시키려면 당연한 설계였다), 볼 수 있는 유일한 사람이 판정에 필요한 카드를
결코 쥐고 있지 않았다.

- `src/ai/rules.ts` — `TRAP_RATE = 0.35`. 세 칸 중 하나를 자기 손패로 바꿔 단다
- `src/ai/rules.test.ts` — 이 회귀는 완주 테스트로 안 잡힌다(판은 여전히 끝까지 굴러간다).
  직접 붙드는 테스트를 따로 뒀다
- `workers/src/prompt.ts` — `[규칙]`에 비공개 반증 두 줄, `[전략]`에 덫 제안 세 줄.
  둘 다 고정 프리픽스에 넣었다(변동 정보 쪽에 두면 캐시가 깨진다)

**추첨 연출**

- `src/components/DrawCut.tsx` — 3.6초 컷. 통이 흔들리고 명패 둘이 솟아 뒤집힌다.
  기존 플래시 큐에 태워 「제안」·「제N회 신문」과 겹치지 않게 직렬화했다
- `src/assets/textures/` — 나뭇결·놋쇠·한지 4장(합 40KB, WebP). **CSS에서 자산을 쓰는 첫 사례**
- `src/content/labels.ts` — `seatSlot()`. 좌석 칸 배정이 `Table`의 `SLOTS`와
  `participantLabel`에 같은 규칙으로 두 번 적혀 있었고, 명패 흩어짐 방향까지
  필요해지면서 세 번째가 될 뻔해 하나로 합쳤다
- 반증자 좌석에 냉색 테두리. 제안자(사건색)와 같은 무게, 다른 색이다

## 미완 · 다음 액션

**다음에 여기부터:** 워커 배포를 받아야 나머지가 풀린다(아래 「막힌 것」).

- [ ] **워커 배포** — rhantj가 `npm run worker:deploy`. 이게 되기 전까지 배포본은 폴백만 돈다
- [ ] **수치** (라운드 24 · 밀담 6) — 문서 §5에서 1-B에 종속으로 묶어둔 항목. 이제 풀렸다.
      `engine/setup.ts` `engine/parley.ts`
- [ ] **2-B** 변호사·협잡꾼 대기 — `engine/round.ts`의 `declareAll`
- [ ] **3-C** 조기 고발 시야·워커 — 1-B와 파일이 겹쳐 기다리던 것. 이제 안 겹친다
- [ ] `TRAP_RATE = 0.35`는 근거 없이 잡은 값이다. 문서 부록 B가 「규칙 기반으로 100판 돌려
      측정한다」고 해둔 대로 재야 한다. 수치 조정과 같이 하는 게 낫다
- [ ] 이의제기가 제안자에게만 실질적으로 열린 상태다. 문서 §3-3(제안자 전용)이 이 압력에서
      나온 것이므로 그때 같이 정리한다

## 막힌 것

**증상** — `npm run worker:deploy`가 실패한다.

```
✘ ERROR  Wrangler could not automatically register "perjury"
         as your workers.dev subdomain because the name is unavailable.
```

**시도** — `wrangler whoami`로 확인했더니 이 컴퓨터는 jjssspark 개인 계정에 로그인돼 있다.
라이브 워커는 `perjury-proxy.perjury.workers.dev`로 rhantj 계정에 있다. 여기서 배포를
강행하면 라이브가 갱신되는 게 아니라 **다른 주소로 새 워커가 하나 생긴다.**

**남은 가설** — 없다. 계정 소유자가 배포하는 것이 정공법이다. rhantj가 올리면 코드 수정
없이 정상으로 돌아온다.

**그 사이 배포본 상태** — 프론트가 `cardId: null`을 보내는데 떠 있는 워커가 거절한다.
판단 요청이 400을 맞고 폴백으로 떨어진다. 판은 끝까지 굴러가고(절대 규칙 4) 인물별 말투도
살아 있지만, LLM이 상황에 맞춰 쓴 대사는 아니다. **고장이 아니라 배포 대기 상태다.**

## 검증 상태

| 항목 | 상태 |
|---|---|
| `npm run typecheck` | 통과 |
| `npx tsc --noEmit -p workers` | 통과 |
| `npm run build` | 통과 |
| 테스트 | 494/494 |
| 배포 (프론트) | `c9feee0` 정상 |
| 배포 (워커) | **미배포** — 위 「막힌 것」 |

## 다음 세션 첫 명령

```bash
git pull origin main && npm run build && npx vitest run
```

## 팀에 전달

- **워커를 배포해야 한다.** 변경은 둘 — `workers/src/schema.ts`가 `cardId: null`을 받게
  넓힌 것(넓히는 방향이라 옛 프론트도 통과한다), `workers/src/prompt.ts`에 비공개 반증
  규칙과 덫 제안 전략을 넣은 것. **워커 먼저, 프론트 나중**은 `responderIds` 때 겪은
  사고 그대로다
- `DeclarationView.claim`의 타입이 `Claim`에서 `ClaimView`로 바뀌었다. `cardId`가
  `null`일 수 있으므로 새로 읽는 곳은 분기해야 한다. 컴파일러가 잡아준다
- 좌석 칸은 이제 `seatSlot(view, playerId)` 하나에서만 나온다. `Table`에 배열로 적지 말 것 —
  어긋나면 「참가3」의 명패가 엉뚱한 자리로 날아가는데, 화면은 멀쩡해 보이고 뜻만 틀린다
- 룰 개편 문서 §5 담당표에 1-B를 jjssspark로 적어 뒀다(`e5607a2`). 3-C는 1-B와 파일이
  겹치므로 시작 전에 1-B가 main에 있는지 확인할 것 — 지금은 올라가 있다
