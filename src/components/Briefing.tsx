import { useState } from 'react'
import type { CSSProperties } from 'react'
import { SCENARIOS, pickScenario } from '../content/scenarios'
import type { Scenario } from '../content/scenarios'
import { cardLabel } from '../content/labels'
import type { GameView } from '../engine/view'
import SuspectCard from './SuspectCard'
import '../styles/briefing.css'

interface Props {
  /** 「아무 사건이나」가 쓴다. 같은 시드는 항상 같은 사건이 된다. */
  seed: string
  view: GameView
  onEnter: (scenario: Scenario) => void
  /** 1막에서 더 물러나면 표지다. 판을 버리게 되므로 여기서 처리하지 않고 위로 넘긴다. */
  onBack: () => void
}

type Act = 'pick' | 'suspects' | 'role'

/** 막이 물러나는 시간. briefing.css의 .briefing--out 트랜지션과 같아야 한다. */
const FADE_MS = 320

/**
 * 표지와 게임판 사이. 세 막으로 끊어 «판이 시작되는 절차»를 만든다.
 *
 *   사건 선택 → 용의자 여섯 → 신분 통보
 *
 * 3막은 연출이 아니라 기능이다. 범인 진영은 정답 3장을 알고 시작하는데(설계 §2)
 * 게임판에는 그것을 보여줄 자리가 없다. 여기가 그 자리다.
 */
export default function Briefing({ seed, view, onEnter, onBack }: Props) {
  const [act, setAct] = useState<Act>('pick')
  const [scenario, setScenario] = useState<Scenario | null>(null)
  const [leaving, setLeaving] = useState(false)

  /**
   * 막을 넘기기 전에 먼저 물러나게 한다. 바로 갈아끼우면 화면이 «띡» 하고 튄다.
   * 넘어간 뒤 leaving을 되돌려야 다음 막이 등장 애니메이션을 처음부터 탄다.
   */
  const advance = (step: () => void) => {
    if (leaving) return
    setLeaving(true)
    window.setTimeout(() => {
      step()
      setLeaving(false)
    }, FADE_MS)
  }

  const choose = (picked: Scenario) =>
    advance(() => {
      setScenario(picked)
      setAct('suspects')
    })

  /* 화면을 떠나는 길. 되돌아오지 않으므로 leaving을 풀지 않는다 — 물러난 채로 자리를 넘긴다. */
  const leave = (hand: () => void) => {
    if (leaving) return
    setLeaving(true)
    window.setTimeout(hand, FADE_MS)
  }

  const me = view.players.find((p) => p.isMe)
  const culprit = me?.faction === 'culprit'
  const showing: Act = scenario ? act : 'pick'
  const tone = showing === 'role' ? (culprit ? ' briefing--culprit' : ' briefing--citizen') : ''

  return (
    <main className={`briefing${tone}${leaving ? ' briefing--out' : ''}`}>
      {/* key가 막마다 바뀌어야 등장 애니메이션이 다시 돈다 — 같은 요소를 재사용하면 한 번만 돈다. */}
      <div className="briefing__stage" key={showing}>
        {showing === 'pick' && (
          <PickAct seed={seed} onChoose={choose} onBack={() => leave(onBack)} />
        )}

        {showing === 'suspects' && scenario && (
          <SuspectsAct
            scenario={scenario}
            onNext={() => advance(() => setAct('role'))}
            onBack={() => advance(() => setAct('pick'))}
          />
        )}

        {showing === 'role' && scenario && (
          <RoleAct
            scenario={scenario}
            view={view}
            culprit={culprit}
            onEnter={() => leave(() => onEnter(scenario))}
            onBack={() => advance(() => setAct('suspects'))}
          />
        )}
      </div>
    </main>
  )
}

/** 1막. 사건 넷 중 하나를 고른다. */
function PickAct({
  seed,
  onChoose,
  onBack,
}: {
  seed: string
  onChoose: (s: Scenario) => void
  onBack: () => void
}) {
  return (
    <>
      <header className="briefing__head">
        <span className="briefing__rule" />
        <p className="briefing__kicker">事件 選擇</p>
      </header>
      <h1 className="briefing__lede">어느 사건을 맡겠는가.</h1>

      <ul className="picker">
        {SCENARIOS.map((item, i) => (
          <li key={item.id} className="picker__item" style={{ '--i': i } as CSSProperties}>
            <button type="button" className="case" onClick={() => onChoose(item)}>
              <span className="case__hanja">{item.hanja}</span>
              <span className="case__body">
                <span className="case__title">{item.title}</span>
                <span className="case__intro">{item.intro}</span>
              </span>
              <span className="case__meta">
                용의자 6 · 수단 4 · 장소 5<b className="case__go">열람</b>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className="briefing__ghosts">
        <button type="button" className="briefing__back" onClick={onBack}>
          ← 표지로
        </button>
        <button
          type="button"
          className="briefing__ghost"
          onClick={() => onChoose(pickScenario(seed))}
        >
          아무 사건이나
        </button>
      </div>
    </>
  )
}

/** 2막. 용의자 여섯의 조서가 책상에 놓인다. */
function SuspectsAct({
  scenario,
  onNext,
  onBack,
}: {
  scenario: Scenario
  onNext: () => void
  onBack: () => void
}) {
  return (
    <>
      <header className="briefing__head">
        <span className="briefing__rule" />
        <p className="briefing__kicker">
          {scenario.hanja} · {scenario.title}
        </p>
      </header>
      <h1 className="briefing__lede">
        <Typed text={scenario.intro} />
      </h1>
      <p className="briefing__note">그 자리에 있던 여섯. 이름은 아직 조서에 오르지 않았다.</p>

      <ul className="dossiers">
        {scenario.titles.map((title, i) => (
          <li key={title.hanja} className="dossiers__item" style={{ '--i': i } as CSSProperties}>
            <SuspectCard title={title} index={i} />
          </li>
        ))}
      </ul>

      <div className="briefing__foot">
        <button type="button" className="briefing__back" onClick={onBack}>
          ← 사건 다시
        </button>
        <button type="button" className="briefing__go" onClick={onNext}>
          <span>내 진영 확인</span>
        </button>
      </div>
    </>
  )
}

/** 3막. 범인에게만 정답 3장이 열린다 — 시민 시야에서는 view.solution이 애초에 null이다. */
function RoleAct({
  scenario,
  view,
  culprit,
  onEnter,
  onBack,
}: {
  scenario: Scenario
  view: GameView
  culprit: boolean
  onEnter: () => void
  onBack: () => void
}) {
  const hand = view.players.find((p) => p.isMe)?.hand ?? []
  const solution = view.solution

  return (
    <>
      <header className="briefing__head">
        <span className="briefing__rule" />
        <p className="briefing__kicker">身元 通報</p>
      </header>

      <p className="role__label">당신은</p>
      <h1 className="role__faction">{culprit ? '범인' : '시민'}</h1>
      <p className="role__desc">
        {culprit
          ? '고발을 틀리게 만들어라. 세 칸 중 하나만 오염시키면 이긴다.'
          : '정답 세 장을 특정하라. 다섯 중 누군가는 선서하고도 거짓을 말한다.'}
      </p>

      <section className="slip">
        <h2 className="slip__title">손패</h2>
        <ul className="slip__cards">
          {hand.map((id) => (
            <li key={id} className="chip">
              {cardLabel(scenario, id)}
            </li>
          ))}
        </ul>
        <p className="slip__note">이 두 장은 정답이 아니다. 반증에 쓸 수도, 없다고 잡아뗄 수도 있다.</p>
      </section>

      {solution && (
        <section className="slip slip--sealed">
          <h2 className="slip__title">봉인된 정답</h2>
          <ul className="slip__cards">
            {[solution.suspect, solution.weapon, solution.place].map((id) => (
              <li key={id} className="chip chip--sealed">
                {cardLabel(scenario, id)}
              </li>
            ))}
          </ul>
          <p className="slip__note">당신만 안다. 지키는 것이 아니라 감추는 것이 목적이다.</p>
        </section>
      )}

      <div className="briefing__foot">
        <button type="button" className="briefing__back" onClick={onBack}>
          ← 용의자 다시
        </button>
        <button type="button" className="briefing__go briefing__go--enter" onClick={onEnter}>
          <span>착석</span>
        </button>
      </div>
    </>
  )
}

/**
 * 한 글자씩 찍히는 문장. 타이머가 아니라 글자마다 지연을 준 CSS 애니메이션이라
 * 렌더 중 상태가 바뀌지 않고, reduced-motion에서 통째로 꺼진다.
 */
function Typed({ text }: { text: string }) {
  return (
    <span className="typed" aria-label={text}>
      {[...text].map((ch, i) => (
        <span
          key={i}
          className="typed__ch"
          style={{ '--i': i } as CSSProperties}
          aria-hidden="true"
        >
          {ch}
        </span>
      ))}
    </span>
  )
}
