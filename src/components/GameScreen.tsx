import { useState } from 'react'
import { cardLabel } from '../content/labels'
import type { Scenario } from '../content/scenarios'
import type { CardId, CardKind, Suggestion } from '../engine/types'
import type { GameView } from '../engine/view'
import { useGame } from '../store/game'
import Briefing from './Briefing'
import Landing from './Landing'
import Log from './Log'
import Notebook from './Notebook'
import Table from './Table'
import '../styles/game.css'

type Picked = Partial<Record<CardKind, CardId>>

/** 판은 하나지만 화면은 둘이다 — 브리핑을 거친 뒤에 게임판이 열린다. */
type Stage = 'briefing' | 'play'

function toSuggestion(picked: Picked): Suggestion | null {
  const { suspect, weapon, place } = picked
  return suspect && weapon && place ? { suspect, weapon, place } : null
}

export default function GameScreen() {
  const store = useGame()
  const [picked, setPicked] = useState<Picked>({})
  const [seed, setSeed] = useState('nan2026')
  const [stage, setStage] = useState<Stage>('briefing')
  /** 브리핑에서 고른 사건. 카드 표시 이름과 좌석 직함이 여기서 나온다. */
  const [scenario, setScenario] = useState<Scenario | null>(null)

  /**
   * 브리핑이 손패·진영을 보여주므로 판을 «먼저» 만들고 브리핑을 띄운다.
   * 순서를 뒤집으면 3막에서 보여줄 신분이 아직 없다.
   */
  const open = (next: string) => {
    setSeed(next)
    store.start(next)
    setStage('briefing')
  }

  if (!store.state) return <Landing seed={seed} onSeed={setSeed} onStart={open} />

  const view = store.view()
  const role = store.role()
  if (stage === 'briefing' || !scenario)
    return (
      <Briefing
        seed={seed}
        view={view}
        role={role}
        onEnter={(chosen) => {
          setScenario(chosen)
          setStage('play')
        }}
        onBack={store.reset}
      />
    )

  const picking = view.phase === 'suggest' || view.phase === 'accuse'

  const submit = (action: (s: Suggestion) => void) => {
    const suggestion = toSuggestion(picked)
    if (!suggestion) return
    action(suggestion)
    setPicked({})
  }

  return (
    <div className="screen">
      <header className="bar">
        <span className="bar__round">
          라운드 <b>{view.round}</b> / {view.totalRounds}
        </span>
        <span className="bar__phase">{PHASE_LABEL[view.phase]}</span>
        <span className="bar__side">
          {view.solution ? '범인 진영' : '시민 진영'} · <b className="bar__role">{role.ko}</b> ·{' '}
          {(view.players.find((p) => p.isMe)?.hand ?? [])
            .map((c) => cardLabel(scenario, c))
            .join(' · ')}
        </span>
      </header>

      <main className="board">
        <Table view={view} scenario={scenario} />
        <Notebook
          view={view}
          scenario={scenario}
          picking={picking}
          picked={picked}
          onPick={(kind, cardId) => setPicked((p) => ({ ...p, [kind]: cardId }))}
        />
      </main>

      <aside className="side">
        <h2 className="side__title">기록</h2>
        <Log view={view} scenario={scenario} />
      </aside>

      <footer className="actions">
        {store.error && <p className="actions__error">{store.error}</p>}
        {view.outcome ? (
          <Result view={view} scenario={scenario} onRestart={() => open(seed + '-next')} />
        ) : view.phase === 'suggest' ? (
          <button
            type="button"
            className="btn btn--go"
            disabled={!toSuggestion(picked)}
            onClick={() => submit(store.suggest)}
          >
            제안 확정
          </button>
        ) : view.phase === 'refute' ? (
          <RefuteBar view={view} scenario={scenario} onRefute={store.declare} />
        ) : view.phase === 'challenge' ? (
          <ChallengeBar view={view} onChallenge={store.challenge} onPass={store.passChallenge} />
        ) : view.phase === 'accuse' ? (
          <button
            type="button"
            className="btn btn--danger"
            disabled={!toSuggestion(picked)}
            onClick={() => submit(store.accuse)}
          >
            최종 고발
          </button>
        ) : null}
      </footer>
    </div>
  )
}

const PHASE_LABEL: Record<GameView['phase'], string> = {
  suggest: '제안',
  refute: '반증 선언',
  challenge: '이의제기',
  whisper: '밀담',
  accuse: '최종 고발',
  over: '종료',
}

/** 반증 선언. 갖고 있지 않은 카드도 고를 수 있다 — 그것이 위증이다. */
function RefuteBar({
  view,
  scenario,
  onRefute,
}: {
  view: GameView
  scenario: Scenario
  onRefute: (claim: { kind: 'refute'; cardId: CardId } | { kind: 'pass' }) => void
}) {
  const record = view.rounds[view.rounds.length - 1]
  if (!record) return null

  const hand = view.players.find((p) => p.isMe)?.hand ?? []
  const cards = [record.suggestion.suspect, record.suggestion.weapon, record.suggestion.place]

  return (
    <div className="actions__row">
      {cards.map((cardId) => (
        <button
          key={cardId}
          type="button"
          className={`btn${hand.includes(cardId) ? ' btn--held' : ''}`}
          onClick={() => onRefute({ kind: 'refute', cardId })}
        >
          {cardLabel(scenario, cardId)}로 반증
          {hand.includes(cardId) && <small>보유</small>}
        </button>
      ))}
      <button type="button" className="btn btn--ghost" onClick={() => onRefute({ kind: 'pass' })}>
        없습니다
      </button>
    </div>
  )
}

/** 이의제기. 증명할 수 없으면 내 카드만 잃는다. */
function ChallengeBar({
  view,
  onChallenge,
  onPass,
}: {
  view: GameView
  onChallenge: (targetId: string) => void
  onPass: () => void
}) {
  const record = view.rounds[view.rounds.length - 1]
  const hand = view.players.find((p) => p.isMe)?.hand ?? []

  const targets = (record?.declarations ?? []).filter(
    (d) => d.claim.kind === 'refute' && d.playerId !== view.viewerId,
  )

  return (
    <div className="actions__row">
      {targets.map((d) => {
        const cardId = d.claim.kind === 'refute' ? d.claim.cardId : ''
        const provable = hand.includes(cardId)
        return (
          <button
            key={d.playerId}
            type="button"
            className={`btn${provable ? ' btn--held' : ''}`}
            onClick={() => onChallenge(d.playerId)}
          >
            {view.players.find((p) => p.id === d.playerId)?.name} 위증
            {provable && <small>증명 가능</small>}
          </button>
        )
      })}
      <button type="button" className="btn btn--go" onClick={onPass}>
        넘어가기
      </button>
    </div>
  )
}

function Result({
  view,
  scenario,
  onRestart,
}: {
  view: GameView
  scenario: Scenario
  onRestart: () => void
}) {
  const outcome = view.outcome
  if (!outcome) return null

  const label = (id: CardId) => cardLabel(scenario, id)

  return (
    <div className="result">
      <span className={`result__verdict result__verdict--${outcome.viewerWon ? 'win' : 'lose'}`}>
        {outcome.viewerWon ? '승리' : '패배'}
      </span>
      <span className="result__detail">
        정답 {label(outcome.solution.suspect)} · {label(outcome.solution.weapon)} ·{' '}
        {label(outcome.solution.place)}
        {' — 고발 '}
        {label(outcome.accusation.suspect)} · {label(outcome.accusation.weapon)} ·{' '}
        {label(outcome.accusation.place)}
        {outcome.accuser.kind === 'council' && ' (AI 합의)'}
      </span>
      <button type="button" className="btn btn--go" onClick={onRestart}>
        새 판
      </button>
    </div>
  )
}
