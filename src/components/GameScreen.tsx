import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { cardLabel, participantLabel } from '../content/labels'
import type { Scenario } from '../content/scenarios'
import type { CardId, CardKind, Suggestion } from '../engine/types'
import type { GameView } from '../engine/view'
import { useGame } from '../store/game'
import Briefing from './Briefing'
import Landing from './Landing'
import Log from './Log'
import MyPlate from './MyPlate'
import Notebook from './Notebook'
import Table from './Table'
import Verdict from './Verdict'
import '../styles/game.css'

type Picked = Partial<Record<CardKind, CardId>>

/**
 * 판 번호. 이 한 값이 진영·직업·카드 배분을 전부 결정하므로 **매판 새로 뽑아야 한다** —
 * 고정해 두면 표지에서 시작할 때마다 같은 진영·같은 직업이 나온다(설계 §2는 매판 무작위 배정이다).
 *
 * 난수는 여기서만 쓴다. 엔진은 이 문자열을 받아 결정론적으로 판을 만든다.
 */
function newSeed(): string {
  return Math.random().toString(36).slice(2, 8)
}

/** 판은 하나지만 화면은 둘이다 — 브리핑을 거친 뒤에 게임판이 열린다. */
type Stage = 'briefing' | 'play'

function toSuggestion(picked: Picked): Suggestion | null {
  const { suspect, weapon, place } = picked
  return suspect && weapon && place ? { suspect, weapon, place } : null
}

export default function GameScreen() {
  const store = useGame()
  const [picked, setPicked] = useState<Picked>({})
  const [seed, setSeed] = useState(newSeed)
  const [stage, setStage] = useState<Stage>('briefing')
  /** 브리핑에서 고른 사건. 카드 표시 이름과 좌석 직함이 여기서 나온다. */
  const [scenario, setScenario] = useState<Scenario | null>(null)
  /** 착석 직후 게임판 위에 얹히는 도입 세 문장. */
  const [opening, setOpening] = useState(false)
  const closeOpening = useCallback(() => setOpening(false), [])

  /**
   * 브리핑이 손패·진영을 보여주므로 판을 «먼저» 만들고 브리핑을 띄운다.
   * 순서를 뒤집으면 3막에서 보여줄 신분이 아직 없다.
   */
  const open = (next: string) => {
    setSeed(next)
    store.start(next)
    setStage('briefing')
  }

  if (!store.state) return <Landing seed={seed} onSeed={setSeed} onStart={() => open(newSeed())} />

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
          setOpening(true)
        }}
        onBack={store.reset}
      />
    )

  const picking = view.phase === 'suggest' || view.phase === 'accuse'
  /* 제안 순서가 나에게 왔을 때만 켠다 — 반증·이의제기는 순번이 아니라 동시/선착이라 여기 안 낀다. */
  const isMyTurn = view.phase === 'suggest' && view.players[view.turnIndex]?.isMe === true

  const submit = (action: (s: Suggestion) => void) => {
    const suggestion = toSuggestion(picked)
    if (!suggestion) return
    action(suggestion)
    setPicked({})
  }

  return (
    /*
     * 덮개 두 겹은 .screen «밖»에 둔다. 안에 넣으면 게임판이 쌓임 맥락을 만들어
     * position:fixed + z-index가 통째로 갇히고, 좌석·추리표가 그 위로 올라온다.
     */
    <>
      {opening && <Opening lines={scenario.opening} onDone={closeOpening} />}
      {view.outcome && (
        <Verdict view={view} scenario={scenario} seed={seed} onRestart={() => open(newSeed())} />
      )}

      {/* 라운드 1은 착석 컷이 이미 «시작» 신호를 준다 — 2라운드부터만 넘어감을 알린다. */}
      {view.round > 1 && (
        <div key={view.round} className="round-flash" aria-hidden="true">
          <span>제{view.round}회 신문</span>
        </div>
      )}

      <div
        className={`screen${opening ? ' screen--entering' : ''}${isMyTurn ? ' screen--my-turn' : ''}`}
        data-scenario={scenario.id}
      >
        <header className="bar">
          <span className="bar__round">
            라운드 <b>{view.round}</b> / {view.totalRounds}
          </span>
          <span key={view.phase} className="bar__phase">
            {PHASE_LABEL[view.phase]}
          </span>
          <span className="bar__case">
          {scenario.hanja} · {scenario.title}
        </span>
      </header>

        <main className="board">
          <MyPlate view={view} scenario={scenario} role={role} />

          <div className="stage">
            <Table view={view} scenario={scenario} />

            {/*
              밀담 자리. 아직 비었지만 «검은 여백»으로 두면 미완성으로 읽히고,
              자리를 잡아 두면 «여기 뭐가 온다»로 읽힌다.
            */}
            <section className="parley">
              <span className="parley__kicker">密談 · 밀담</span>
              <p className="parley__note">
                1:1 대화로 정보를 거래하고 알리바이를 압박하는 자리다. 아직 열리지 않았다.
              </p>
            </section>
          </div>

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
          {view.outcome ? null : view.phase === 'suggest' ? (
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
    </>
  )
}

/** 도입 문장이 머무는 시간. game.css의 opening-veil 키프레임과 맞춰야 한다. */
const OPENING_MS = 6400

/**
 * 착석 컷. 화면을 하나 더 만들지 않고 게임판 «위에» 얹었다 걷는다 —
 * 표지·사건·용의자·신분까지 이미 네 번 넘겼으므로 절차를 더 늘리지 않는다.
 */
function Opening({ lines, onDone }: { lines: readonly string[]; onDone: () => void }) {
  useEffect(() => {
    const id = window.setTimeout(onDone, OPENING_MS)
    return () => window.clearTimeout(id)
  }, [onDone])

  /*
   * body에 직접 붙인다. 게임판 안에 두면 그쪽 쌓임 맥락에 갇혀
   * position:fixed와 z-index가 통째로 무시되고 좌석·추리표가 위로 올라온다.
   */
  return createPortal(
    <div className="opening" onClick={onDone} role="presentation">
      <div className="opening__lines">
        {lines.map((line, i) => (
          <p key={line} className="opening__line" style={{ '--i': i } as CSSProperties}>
            {line}
          </p>
        ))}
      </div>
      <span className="opening__skip">아무 곳이나 눌러 넘긴다</span>
    </div>,
    document.body,
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
            {participantLabel(view, d.playerId)} 위증
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
