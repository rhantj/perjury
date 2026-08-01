# 위증 (PERJURY) — 작업 규칙

NAN 2026 NHN Game × AI 해커톤 사전 과제. 2인 팀, 마감 2026-08-10.
설계 근거는 [docs/01-game-design.md](docs/01-game-design.md), [docs/02-tech-and-plan.md](docs/02-tech-and-plan.md)에 있다.
**둘과 충돌하는 구현은 코드가 아니라 문서를 먼저 고친다.**

---

## 절대 규칙

1. **API 키는 리포에 들어가지 않는다.** Anthropic 키는 Cloudflare Workers 환경변수에만 존재한다.
   프론트 번들·소스·문서·커밋 메시지 어디에도 쓰지 않는다. `.env*`, `.dev.vars`는 gitignore 되어 있다.
2. **룰 엔진은 순수 함수다.** `게임 상태 + 행동 → 새 상태`. LLM 호출·랜덤·시간·DOM 접근을 룰 엔진에 넣지 않는다.
   LLM은 "AI가 어떤 행동을 선택할지"만 결정하고, 그 행동은 룰 엔진을 그대로 통과한다. AI가 룰을 어길 수 없어야 한다.
3. **LLM 응답은 텍스트로만 렌더한다.** `dangerouslySetInnerHTML` 금지.
4. **폴백 경로를 깨지 않는다.** 프록시 장애·예산 소진 시 사전생성 대사 + 규칙 기반 결정으로 게임이 끝까지 진행돼야 한다.
   LLM 응답이 반드시 있어야만 동작하는 코드를 쓰지 않는다.
5. **`vite.config.ts`의 `base: '/perjury/'`를 지운다면 GitHub Pages가 흰 화면이 된다.** 건드리지 않는다.
6. `local/`은 개인 작업 공간이다(gitignore). 여기 있는 내용을 커밋 대상으로 삼지 않는다.

---

## 명령어

```bash
npm run dev        # 개발 서버
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + vite build
npm run preview    # 빌드 결과 확인
```

패키지 매니저는 **npm** 고정(`package-lock.json`). Node 22 (CI와 동일).
`main`에 푸시하면 `.github/workflows/deploy.yml`이 자동 배포한다 → https://rhantj.github.io/perjury/
**푸시 = 배포**이므로 빌드가 깨진 상태로 main에 올리지 않는다.

---

## 언어

- 문서·주석·커밋 메시지·UI 텍스트: **한국어**
- 식별자(변수·함수·타입·파일명·CSS 클래스): **영어**
- 게임 도메인 용어는 한국어 개념 ↔ 영어 식별자를 고정 매핑해서 쓴다:
  제안 `suggestion` / 반증 `refutation` / 거짓 반증·위증 `perjury` / 밀담 `parley` /
  최종 고발 `accusation` / 시민 `citizen` / 범인 `culprit` / 신뢰도 `trust` / 직업 `role`

---

## TypeScript

tsconfig가 이미 엄격하다. 아래는 그로부터 따라오는 실제 제약이다.

- `strict`, `noUnusedLocals`, `noUnusedParameters` — 미사용 변수는 빌드 실패다.
- `noUncheckedIndexedAccess` — 배열/인덱스 접근 결과는 `T | undefined`다. `!`로 뭉개지 말고 분기하거나 좁힌다.
- `verbatimModuleSyntax` — 타입만 가져올 때는 **반드시** `import type { X } from './x'`.
- `noFallthroughCasesInSwitch` — 페이즈 상태머신 `switch`는 각 case를 명시적으로 종료한다.
- `any` 금지. 외부 경계(LLM 응답·fetch)는 파싱 시점에 좁혀서 내부로 넘긴다.

## 코드 스타일

소스에서 이미 쓰이는 형태를 따른다.

- 세미콜론 없음, 홑따옴표, 들여쓰기 2칸
- 상태 갱신은 새 객체 반환(불변). 게임 상태를 제자리 변경하지 않는다.
- 컴포넌트는 함수 선언 + `export default function App()` 형태
- 파일은 기능 단위로 배치. 200~400줄 목표, 800줄 초과 금지

---

## React / UI

- 화면은 **단일 화면 + 패널 전환**. 라우터를 도입하지 않는다.
- 상태관리는 **Zustand 1종**만. 다른 상태 라이브러리를 추가하지 않는다.
- UI 프레임워크(Tailwind, MUI 등) 도입 금지. CSS 변수 + 자체 컴포넌트로 간다.
- 애니메이션은 `transform`·`opacity`만. 레이아웃을 움직이는 연출(width/height/top/margin)은 넣지 않는다.

## CSS

- 색·타이포·간격은 `src/styles/global.css`의 CSS 변수(`--color-*`, `--text-*`, `--space-*`)를 쓴다.
  값을 컴포넌트에 직접 박지 않는다. 새 토큰이 필요하면 `global.css`에 먼저 정의한다.
- 색상은 `oklch()`. 팔레트는 다크 기준(`color-scheme: dark`)이며 라이트 모드는 만들지 않는다.
- 클래스명은 `block__element` 형태의 kebab-case BEM (`boot__title`, `boot__kicker`).

---

## LLM 사용

- 기본 모델 `claude-opus-5`. 변경은 D5 비용 실측 후 대표 결정 사항이다. 임의로 바꾸지 않는다.
- 반증 판단·투표는 **스키마 강제 구조화 출력**으로 받는다. 자유 텍스트 파싱으로 게임 진행을 결정하지 않는다.
- 프롬프트는 **고정 프리픽스(룰·시나리오·캐릭터 설정) → 변동 정보(라운드·관측 로그)** 순서로 구성한다.
  프리픽스 캐싱이 비용 통제의 핵심이므로 이 순서를 뒤집지 않는다.
- 에이전트에게 **전지적 정보를 주지 않는다.** 각 에이전트 프롬프트에는 자기 손패·진영·성격·자기가 관측한 기록만 들어간다.
- 플레이어 입력은 **데이터로만** 취급한다. 시스템 프롬프트에 룰 변경 요구 무시를 명시하고, 입력 길이를 제한한다.
- Opus 5는 thinking이 기본 ON이고 `max_tokens`가 thinking+응답 합산 상한이다. `temperature`/`top_p`는 미지원 —
  에이전트 성격 차이는 프롬프트로 만든다.

---

## 테스트

- 룰 엔진(제안·반증·승패 판정)은 **Vitest 단위 테스트 필수**. 테스트 먼저 쓰고 구현한다.
- 룰 엔진 테스트는 LLM을 호출하지 않는다. 호출이 필요하면 그건 룰 엔진에 있으면 안 되는 로직이다.
- UI는 단위 테스트보다 실제 플레이 확인을 우선한다.

---

## Git

- 커밋 메시지: `<type>: <한국어 설명>` — `feat` `fix` `refactor` `docs` `test` `chore` `perf` `ci`
- 커밋 기록 유지가 **제출 요건**이다. 마지막에 몰아서 올리지 않고 매일 커밋한다.
- 커밋·푸시는 명시적 요청이 있을 때만 한다.
- `dist/`는 커밋하지 않는다(CI가 빌드한다).

---

## 작업 방식

- 한 번에 리뷰 가능한 크기(**300줄 / 5파일 이내**)로 쪼갠다. 여러 단계를 몰아서 완료 보고하지 않는다.
- 새 의존성은 추가하기 전에 이유와 대안을 먼저 말한다. 위 스택(React·TS·Vite·Zustand·Vitest) 밖으로 나가는 건 결정 사항이다.
- 아키텍처·데이터 모델·외부 연동이 바뀌면 `docs/decisions/`에 한 파일 한 결정으로 남긴다.
- 일정상 D3(LLM 없이 1판 완주)와 D8(폴백 풀 완성)이 안전선이다. 이 두 마일스톤을 위태롭게 하는 작업은 먼저 알린다.

---

## 개인 규칙

- 개인 작업 방식은 `local/CLAUDE.md`를 따른다. 확인 질문지는 `local/qna/`에 쌓인다.
- `local/`은 gitignore이므로 **각자의 로컬에만 존재한다.** 클론한 쪽에는 없을 수 있고, 없어도 프로젝트 작업에 지장이 없어야 한다.
- 이 파일(루트 `CLAUDE.md`)과 `local/CLAUDE.md`가 충돌하면 `local/`이 우선한다. 단 위 **절대 규칙 6개는 예외 없이 우선한다.**
- 팀이 공유해야 할 내용은 `local/`이 아니라 `docs/`에 쓴다.

---

## 세션 유지

작업 맥락은 대화가 끝나면 사라진다. 다음 세션과 **팀원**이 이어받을 수 있는 상태를 파일로 남긴다.

- 진행 상황은 `session-resume/YYYY-MM-DD-<주제>.md`에 쓴다. 형식은 `session-resume/CLAUDE.md`를 따른다.
- **작성 시점**: 하루 작업 종료 시, 컨텍스트 한계에 가까워졌을 때, 중간에 막혀서 세션을 끊을 때.
  하루에 여러 번 써도 되며 같은 날 파일은 주제로 구분한다.
- **반드시 담을 것**: 미완 항목과 **다음에 어디부터 손대는지**(파일·줄), 막힌 것의 증상과 시도한 것,
  그리고 그 시점의 검증 상태(typecheck / build / 테스트 / 배포).
- **담지 않을 것**: API 키·토큰, 대화 전문, diff 재서술.
  `session-resume/`는 커밋되므로 **public 리포에 올라간다**는 전제로 쓴다.
- 역할이 겹치지 않게 나눈다:

  | 남기는 곳 | 내용 | 수명 |
  |---|---|---|
  | `session-resume/` | 지금 어디까지 했고 다음에 뭘 하는가 | 그 시점 스냅샷 |
  | `docs/decisions/` | 왜 이 구조를 골랐는가 | 영구 |
  | `docs/0*.md` | 룰·아키텍처·일정 | 영구 |
  | `local/qna/` | 이해 확인 질문 (개인, 커밋 안 됨) | 개인 |

- `/save-session`·`/resume-session` 스킬이 쓰는 `~/.claude/session-data/`는 **리포 밖 개인 캐시**다.
  팀원에게 전달되지 않으므로, 팀이 알아야 할 내용은 반드시 `session-resume/`에 옮겨 적는다.
- 새 세션은 `session-resume/`의 **가장 최근 파일부터 읽고** 시작한다.