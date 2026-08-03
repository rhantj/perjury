import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { llmDeciderForRound } from '../ai/llm-decider'
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

/** 화면 전체 알림 한 건. round는 라운드가 넘어갈 때, 나머지는 제안·반증 제출 때 큐에 들어간다. */
interface FlashEvent {
  kind: 'round' | 'suggest' | 'refute' | 'perjury'
  text: string
  /** CSS 애니메이션 길이와 맞춘다 — 다 안 끝났는데 다음 알림이 겹쳐 뜨는 걸 이걸로 막는다. */
  ms: number
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
  /** 기록은 상시 옆에 두지 않는다 — 그 폭을 보드·추리표·내 패에 돌려주고, 필요할 때만 연다. */
  const [logOpen, setLogOpen] = useState(false)

  /*
   * 화면 전체 알림(라운드 전환·제안·반증·위증)을 한 큐로 세운다. 예전엔 라운드 전환과
   * 제출 알림이 각자 따로 뜨는 레이어라, 타이밍이 겹치면 두 문구가 한 화면에 포개졌다 —
   * 큐에 쌓았다가 이전 알림의 CSS 애니메이션이 끝난 뒤에만 다음 걸 마운트한다.
   */
  const [activeFlash, setActiveFlash] = useState<{ id: number; event: FlashEvent } | null>(null)
  const flashQueueRef = useRef<FlashEvent[]>([])
  const flashBusyRef = useRef(false)
  const flashSeqRef = useRef(0)
  const runFlashQueue = useCallback(() => {
    if (flashBusyRef.current) return
    const next = flashQueueRef.current.shift()
    if (!next) return
    flashBusyRef.current = true
    flashSeqRef.current += 1
    setActiveFlash({ id: flashSeqRef.current, event: next })
    window.setTimeout(() => {
      flashBusyRef.current = false
      runFlashQueue()
    }, next.ms)
  }, [])
  const enqueueFlash = useCallback(
    (event: FlashEvent) => {
      flashQueueRef.current.push(event)
      runFlashQueue()
    },
    [runFlashQueue],
  )

  /*
   * 제안·반증을 제출하는 순간의 화면 전체 신호. «위증」은 남의 위증 여부를 화면이
   * 대신 판정해 보여주면 안 된다(엔진 view.ts 주석 — isPerjury는 시야 밖이다) —
   * 하지만 «내가 지금 내 손패에 없는 카드로 반증한다»는 나 스스로 이미 아는 사실이라,
   * 그것만 감지해서 극적으로 띄운다. 남의 반증에는 이 판정을 절대 쓰지 않는다.
   */
  const fireActionFlash = (kind: 'suggest' | 'refute' | 'perjury') => {
    const byKind: Record<typeof kind, FlashEvent> = {
      suggest: { kind: 'suggest', text: '제안', ms: 1000 },
      refute: { kind: 'refute', text: '반증합니다', ms: 900 },
      perjury: { kind: 'perjury', text: '위증!!!', ms: 1900 },
    }
    enqueueFlash(byKind[kind])
  }

  /**
   * 브리핑이 손패·진영을 보여주므로 판을 «먼저» 만들고 브리핑을 띄운다.
   * 순서를 뒤집으면 3막에서 보여줄 신분이 아직 없다.
   *
   * **어떤 판단자를 쓸지도 여기서 정한다.** store 기본값은 규칙 기반이라 단위 테스트가
   * 네트워크를 타지 않고, 프록시가 실패하면 store가 감싸는 폴백이 같은 시드로 받아낸다.
   */
  const open = (next: string) => {
    setSeed(next)
    store.start(next, 0, () => llmDeciderForRound())
    setStage('briefing')
  }

  /*
   * store.state가 있을 때만 view가 존재한다 — 훅은 항상 같은 순서로 불러야 하므로
   * (Rules of Hooks) «없으면 여기서 바로 return」을 이 지점보다 앞에 두지 않는다.
   * 아래 라운드 전환 감지 useEffect가 이 view를 참조하기 때문이다.
   */
  const view = store.state ? store.view() : null

  /* 라운드가 바뀔 때마다 큐에 신문 알림을 넣는다. 1라운드는 착석 컷이 이미 시작을 알린다. */
  const lastRoundRef = useRef(0)
  useEffect(() => {
    if (!view || view.round === lastRoundRef.current) return
    lastRoundRef.current = view.round
    if (view.round > 1) {
      enqueueFlash({ kind: 'round', text: `제${view.round}회 신문`, ms: 1400 })
    }
  }, [view?.round, enqueueFlash])

  if (!store.state || !view)
    return <Landing seed={seed} onSeed={setSeed} onStart={() => open(newSeed())} />

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

  /** 반증 제출. 내 손패와 대조해 «지금 내가 거짓을 말하는지» 그 자리에서 판정한다 — 이건 남이 아니라 나만의 사실이다. */
  const handleRefute = (claim: { kind: 'refute'; cardId: CardId } | { kind: 'pass' }) => {
    const hand = view.players.find((p) => p.isMe)?.hand ?? []
    const record = view.rounds[view.rounds.length - 1]
    const suggested = record
      ? [record.suggestion.suspect, record.suggestion.weapon, record.suggestion.place]
      : []
    const lying =
      claim.kind === 'refute' ? !hand.includes(claim.cardId) : suggested.some((c) => hand.includes(c))
    fireActionFlash(lying ? 'perjury' : 'refute')
    store.declare(claim)
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

      {activeFlash && (
        <div
          key={activeFlash.id}
          className={`action-flash action-flash--${activeFlash.event.kind}`}
          aria-hidden="true"
        >
          <span>{activeFlash.event.text}</span>
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
          {view.phase === 'suggest' && (
            <span
              key={view.turnIndex}
              className={`bar__turn${isMyTurn ? ' bar__turn--mine' : ''}`}
            >
              {isMyTurn ? '당신의 차례' : `${participantLabel(view, view.players[view.turnIndex]?.id ?? '')}의 차례`}
            </span>
          )}
          <span className="bar__case">
            {scenario.hanja} · {scenario.title}
          </span>
          <button type="button" className="bar__log-toggle" onClick={() => setLogOpen(true)}>
            記 기록
            {view.rounds.length > 0 && <em>{view.rounds.length}</em>}
          </button>
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

        <footer className="actions">
          {store.error && <p className="actions__error">{store.error}</p>}
          {view.outcome ? null : view.phase === 'suggest' ? (
            <button
              type="button"
              className="btn btn--go"
              disabled={!toSuggestion(picked)}
              onClick={() => {
                fireActionFlash('suggest')
                submit(store.suggest)
              }}
            >
              제안 확정
            </button>
          ) : view.phase === 'refute' ? (
            <RefuteBar view={view} scenario={scenario} onRefute={handleRefute} />
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

      {logOpen && <LogDrawer view={view} scenario={scenario} onClose={() => setLogOpen(false)} />}
    </>
  )
}

/**
 * 기록 팝업. 상시 옆에 붙은 패널이 아니라 눌러야 열리는 창으로 바꿨다 —
 * 폭을 상시 점유하지 않아야 보드·추리표·내 패가 그만큼 커질 수 있다.
 * body에 직접 붙이는 이유는 Opening·Verdict와 같다: .screen 안에 두면 쌓임 맥락에 갇힌다.
 */
function LogDrawer({
  view,
  scenario,
  onClose,
}: {
  view: GameView
  scenario: Scenario
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div className="log-drawer" role="dialog" aria-label="기록">
      <button
        type="button"
        className="log-drawer__backdrop"
        onClick={onClose}
        aria-label="기록 닫기"
      />
      <div className="log-drawer__panel">
        <header className="log-drawer__head">
          <h2>기록</h2>
          <button type="button" className="log-drawer__close" onClick={onClose}>
            ✕
          </button>
        </header>
        <Log view={view} scenario={scenario} />
      </div>
    </div>,
    document.body,
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
