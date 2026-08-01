import { useState } from 'react'
import Notebook from './Notebook'
import { LOG, WHISPER } from './fixtures'

export type Tab = 'log' | 'whisper' | 'notebook'

const TABS: { id: Tab; label: string }[] = [
  { id: 'log', label: '기록' },
  { id: 'whisper', label: '밀담' },
  { id: 'notebook', label: '추리표' },
]

interface Props {
  tab: Tab
  onTab: (t: Tab) => void
}

export default function SidePanel({ tab, onTab }: Props) {
  return (
    <aside className="panel">
      <nav className="panel__tabs" aria-label="패널 전환">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`panel__tab${tab === t.id ? ' panel__tab--on' : ''}`}
            aria-current={tab === t.id}
            onClick={() => onTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="panel__body">
        {tab === 'log' && <LogView />}
        {tab === 'whisper' && <WhisperView />}
        {tab === 'notebook' && <Notebook />}
      </div>
    </aside>
  )
}

function LogView() {
  let lastRound = -1
  return (
    <ol className="log">
      {LOG.map((e, i) => {
        const showRound = e.round !== lastRound
        lastRound = e.round
        return (
          <li key={i} className={`log__item log__item--${e.tone}`}>
            {showRound && <span className="log__round">라운드 {e.round}</span>}
            <span className="log__actor">{e.actor}</span>
            <span className="log__text">{e.text}</span>
          </li>
        )
      })}
    </ol>
  )
}

function WhisperView() {
  const [draft, setDraft] = useState('')
  return (
    <div className="whisper">
      <p className="whisper__with">백나경과의 1:1 밀담 · 남은 시간 0:42</p>
      <div className="whisper__feed">
        {WHISPER.map((w, i) => (
          <p key={i} className={`whisper__line whisper__line--${w.from}`}>
            {w.text}
          </p>
        ))}
      </div>
      <form className="whisper__form" onSubmit={(e) => e.preventDefault()}>
        <input
          className="whisper__input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="자유롭게 입력 — 여기만 타이핑입니다"
          maxLength={200}
        />
        <button type="submit" className="whisper__send">
          보내기
        </button>
      </form>
    </div>
  )
}
