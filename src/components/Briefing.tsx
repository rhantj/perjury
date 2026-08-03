import { useState } from 'react'
import type { CSSProperties } from 'react'
import { SCENARIOS, pickScenario } from '../content/scenarios'
import type { Scenario } from '../content/scenarios'
import { cardLabel, suspectNameAt, suspectTitleFull } from '../content/labels'
import type { Role } from '../content/roles'
import { ROLE_ART } from '../content/role-art'
import { placeArtFor } from '../content/place-art'
import { weaponArtFor } from '../content/weapon-art'
import { SCENARIO_ART } from '../content/scenario-art'
import { suspectArtFor } from '../content/suspect-art'
import { cardKind } from '../engine/cards'
import type { CardId, CardKind } from '../engine/types'
import type { GameView } from '../engine/view'
import SuspectCard, { NUMERALS } from './SuspectCard'
import '../styles/briefing.css'

interface Props {
  /** 「아무 사건이나」가 쓴다. 같은 시드는 항상 같은 사건이 된다. */
  seed: string
  view: GameView
  /** 내 직업. 남의 직업은 애초에 여기까지 오지 않는다(store.role 주석 참고). */
  role: Role
  onEnter: (scenario: Scenario) => void
  /** 1막에서 더 물러나면 표지다. 판을 버리게 되므로 여기서 처리하지 않고 위로 넘긴다. */
  onBack: () => void
}

type Act = 'pick' | 'suspects' | 'role'

/** 막이 물러나는 시간. briefing.css의 .briefing--out 트랜지션과 같아야 한다. */
const FADE_MS = 320

/**
 * 손패 한 장이 «무슨 뜻인가». 이름만 띄우면 처음 보는 사람은 마차고가 뭔지 알 수 없다.
 * 쥔 카드는 봉인될 수 없으므로 종류마다 지워지는 칸이 정해져 있다.
 */
const KIND: Record<CardKind, { label: string; hanja: string; fact: string; truth: string }> = {
  suspect: { label: '용의자', hanja: '容疑者', fact: '범인이 아니다', truth: '이자가 범인이다' },
  weapon: { label: '수단', hanja: '手段', fact: '쓰이지 않았다', truth: '이것이 쓰였다' },
  place: { label: '장소', hanja: '場所', fact: '현장이 아니다', truth: '여기가 현장이다' },
}

/**
 * 표지와 게임판 사이. 세 막으로 끊어 «판이 시작되는 절차»를 만든다.
 *
 *   사건 선택 → 용의자 여섯 → 신분 통보
 *
 * 3막은 연출이 아니라 기능이다. 범인 진영은 정답 3장을 알고 시작하는데(설계 §2)
 * 게임판에는 그것을 보여줄 자리가 없다. 여기가 그 자리다.
 */
export default function Briefing({ seed, view, role, onEnter, onBack }: Props) {
  const [act, setAct] = useState<Act>('pick')
  const [scenario, setScenario] = useState<Scenario | null>(null)
  const [leaving, setLeaving] = useState(false)
  /** 사건 카드를 훑는 동안만 쓴다 — 다른 막에서는 그냥 null. */
  const [hoveredScenario, setHoveredScenario] = useState<string | null>(null)

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
      {showing === 'pick' && <ScenarioBackdrop activeId={hoveredScenario} />}

      {/* key가 막마다 바뀌어야 등장 애니메이션이 다시 돈다 — 같은 요소를 재사용하면 한 번만 돈다. */}
      <div className="briefing__stage" key={showing}>
        {showing === 'pick' && (
          <PickAct
            seed={seed}
            onChoose={choose}
            onBack={() => leave(onBack)}
            onHover={setHoveredScenario}
          />
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
            role={role}
            culprit={culprit}
            onEnter={() => leave(() => onEnter(scenario))}
            onBack={() => advance(() => setAct('suspects'))}
          />
        )}
      </div>
    </main>
  )
}

/**
 * 사건 카드를 훑을 때 뒤로 까는 사진. 넷 다 한 자리에 겹쳐 두고 opacity만 바꾼다 —
 * src를 갈아끼우면 매번 새로 받아오느라 처음 호버할 때 사진이 늦게 뜬다.
 */
function ScenarioBackdrop({ activeId }: { activeId: string | null }) {
  return (
    <div className="briefing__backdrop" aria-hidden="true">
      {SCENARIOS.map((item) => (
        <img
          key={item.id}
          className={`briefing__backdrop-img${activeId === item.id ? ' briefing__backdrop-img--active' : ''}`}
          src={SCENARIO_ART[item.id]}
          alt=""
        />
      ))}
    </div>
  )
}

/** 1막. 사건 넷 중 하나를 고른다. */
function PickAct({
  seed,
  onChoose,
  onBack,
  onHover,
}: {
  seed: string
  onChoose: (s: Scenario) => void
  onBack: () => void
  onHover: (id: string | null) => void
}) {
  return (
    <>
      <header className="briefing__head">
        <span className="briefing__rule" />
        <p className="briefing__kicker">事件 選擇</p>
      </header>
      <h1 className="briefing__lede">어느 사건을 맡겠는가.</h1>

      <ul className="picker" onMouseLeave={() => onHover(null)}>
        {SCENARIOS.map((item, i) => (
          <li key={item.id} className="picker__item" style={{ '--i': i } as CSSProperties}>
            <button
              type="button"
              className="case"
              onClick={() => onChoose(item)}
              onMouseEnter={() => onHover(item.id)}
              onFocus={() => onHover(item.id)}
              onBlur={() => onHover(null)}
            >
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
  /** 지금 펼쳐 놓은 조서. 기본은 첫 장 — 빈 패널로 시작하면 여기에 뭐가 오는지 알 수 없다. */
  const [active, setActive] = useState(0)
  const shown = scenario.titles[active] ?? scenario.titles[0]

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
      <p className="briefing__note">
        그 자리에 있던 여섯. <b>이들이 곧 당신과 함께 앉을 사람들이다.</b> 조서를 짚으면 신원이 열린다.
      </p>

      <ul className="dossiers">
        {scenario.titles.map((title, i) => (
          <li
            key={title.hanja}
            className="dossiers__item"
            style={{ '--i': i } as CSSProperties}
            /* 셋 다 받는다 — 마우스·터치·키보드에서 조서를 넘기는 방법이 각각 다르다. */
            onMouseMove={() => setActive(i)}
            onClick={() => setActive(i)}
            onFocus={() => setActive(i)}
          >
            <SuspectCard title={title} index={i} active={i === active} />
          </li>
        ))}
      </ul>

      {/* key가 바뀌어야 조서를 «갈아 끼우는» 연출이 매번 돈다. */}
      <section className="record" key={active} aria-live="polite">
        <header className="record__head">
          <span className="record__file">訊問調書</span>
          <span className="record__no">第{NUMERALS[active] ?? active + 1}號</span>
        </header>

        {/* 이름이 여기서 열린다 — 2막 안내문이 «조서를 짚으면 신원이 열린다»고 약속한 자리다. */}
        <p className="record__name">
          {suspectNameAt(active) ?? shown.ko}
          <span className="record__title">{shown.ko}</span>
          <span className="record__hanja">{shown.hanja}</span>
        </p>
        <p className="record__who">{shown.who}</p>
        <p className="record__doubt">
          <span className="record__mark">疑</span>
          {shown.doubt}
        </p>

        {/* 검열 먹칠. 이 시대 조서에서 지워진 줄이 곧 «건드리면 안 되는 것»이다. */}
        <span className="record__redact" aria-hidden="true" />
        <span className="record__seal" aria-hidden="true">
          秘
        </span>
      </section>

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
  role,
  culprit,
  onEnter,
  onBack,
}: {
  scenario: Scenario
  view: GameView
  role: Role
  culprit: boolean
  onEnter: () => void
  onBack: () => void
}) {
  const hand = view.players.find((p) => p.isMe)?.hand ?? []
  const solution = view.solution

  return (
    /*
     * 두 단으로 가른다 — 왼쪽은 «듣는 말»(진영·지시), 오른쪽은 «쥐는 것»(직업패·손패).
     * 한 줄로 쌓으면 카드가 작아지고 화면 오른쪽 절반이 통째로 빈다.
     */
    <div className="role">
      <div className="role__say">
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

        <div className="briefing__foot">
          <button type="button" className="briefing__back" onClick={onBack}>
            ← 용의자 다시
          </button>
          <button type="button" className="briefing__go briefing__go--enter" onClick={onEnter}>
            <span>착석</span>
          </button>
        </div>
      </div>

      <div className="role__hold">
        <section className={`duty duty--${role.side}`} tabIndex={0}>
          <span className="duty__card">
            <img className="duty__art" src={ROLE_ART[role.id]} alt="" width={340} height={482} />
          </span>
          <span className="duty__body">
            <span className="duty__kicker">직업 · 職業</span>
            <span className="duty__name">
              {role.ko}
              <em className="duty__hanja">{role.hanja}</em>
            </span>
            <span className="duty__power">{role.power}</span>
            {/* 이야기는 눌러 두었다가 카드에 손이 닿을 때만 나온다. */}
            <span className="duty__flavor">{role.flavor}</span>
          </span>
          <span className="duty__once">壹回</span>
        </section>

        <section className="slip">
          <h2 className="slip__title">손패 — 당신만 아는 사실</h2>
          <ul className="slip__cards">
            {hand.map((id) => (
              <HandCard
                key={id}
                id={id}
                scenario={scenario}
                kind={cardKind(id)}
                name={cardLabel(scenario, id)}
              />
            ))}
          </ul>
          <p className="slip__note">
            쥐고 있으니 봉인될 수 없다 — 확정이다. 반증에 꺼내 쓸 수도, 없다고 잡아뗄 수도 있다.
          </p>
        </section>

        {solution && (
          <section className="slip slip--sealed">
            <h2 className="slip__title">봉인된 정답</h2>
            <ul className="slip__cards">
              {[solution.suspect, solution.weapon, solution.place].map((id) => (
                <HandCard
                  key={id}
                  id={id}
                  scenario={scenario}
                  kind={cardKind(id)}
                  name={cardLabel(scenario, id)}
                  sealed
                />
              ))}
            </ul>
            <p className="slip__note">당신만 안다. 지키는 것이 아니라 감추는 것이 목적이다.</p>
          </section>
        )}
      </div>
    </div>
  )
}

/**
 * 손패 한 장. 일러스트가 없어도 카드로 서게 조판으로 만든다 —
 * 종류 각인(위) · 이름(가운데) · 명패(아래)가 곧 카드의 삼단 구성이다.
 *
 * 그림이 들어오면 .handcard__art 자리에 얹으면 되고, 이 조판은 그대로 위에 남는다.
 */
function HandCard({
  id,
  scenario,
  kind,
  name,
  sealed = false,
}: {
  id: CardId
  scenario: Scenario
  kind: CardKind
  name: string
  sealed?: boolean
}) {
  const meta = KIND[kind]
  const art = suspectArtFor(id) ?? placeArtFor(scenario, id) ?? weaponArtFor(scenario, id)
  /** 이 인물이 그 자리에서 «무엇»이었나 — 이름만으론 안 열리는 정보라 호버에서 같이 보여준다. */
  const title = kind === 'suspect' ? suspectTitleFull(scenario, id) : null

  return (
    <li
      className={`handcard handcard--${kind}${sealed ? ' handcard--sealed' : ''}${art ? ' handcard--has-art' : ''}`}
      tabIndex={0}
    >
      {art ? (
        <img className="handcard__photo" src={art} alt="" width={340} height={456} />
      ) : (
        <span className="handcard__art" aria-hidden="true" />
      )}
      {/* 사진이 있으면 이름·명패는 평소엔 숨어 있다가 손 닿을 때만 이 스크림 위로 뜬다. */}
      {art && <span className="handcard__scrim" aria-hidden="true" />}
      <span className="handcard__kind">
        {meta.hanja}
        <em>{meta.label}</em>
      </span>
      <span className="handcard__body">
        <span className="handcard__name">{name}</span>
        {title && (
          <span className="handcard__title">
            {title.ko}
            <em>{title.hanja}</em>
          </span>
        )}
      </span>
      <span className="handcard__plate">{sealed ? meta.truth : meta.fact}</span>
    </li>
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
