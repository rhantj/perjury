import { useState } from 'react'
import SidePanel, { type Tab } from './SidePanel'
import { CARDS, CHARACTERS, KIND_LABEL, type CardKind } from './fixtures'
import './mock.css'

const TURN_ID = 's4' // 현재 차례: 백나경

export default function MockScreen() {
  const [tab, setTab] = useState<Tab>('log')
  const [composing, setComposing] = useState(false)
  const [pick, setPick] = useState<Record<CardKind, string | null>>({
    suspect: null,
    weapon: null,
    place: null,
  })

  const ready = pick.suspect && pick.weapon && pick.place

  return (
    <div className="screen">
      <header className="bar">
        <div className="bar__round">
          라운드 <b>3</b> <span>/ 8</span>
        </div>
        <p className="bar__case">사건 · 별관 심야 사망</p>
        <button
          type="button"
          className="bar__notebook"
          onClick={() => setTab('notebook')}
        >
          정답 추리표
        </button>
      </header>

      <main className="table" aria-label="테이블">
        <ul className="table__seats">
          {CHARACTERS.map((c) => (
            <li
              key={c.id}
              className={`seat${c.id === TURN_ID ? ' seat--turn' : ''}${c.isPlayer ? ' seat--me' : ''}`}
            >
              <span className="seat__face">{c.name.slice(1, 2)}</span>
              <span className="seat__name">{c.name}</span>
              <span className="seat__job">{c.job}</span>
              <span className="seat__trust" aria-label={`신뢰도 ${c.trust}`}>
                <i style={{ transform: `scaleX(${c.trust / 100})` }} />
              </span>
              {c.id === TURN_ID && <span className="seat__badge">차례</span>}
            </li>
          ))}
        </ul>
      </main>

      <SidePanel tab={tab} onTab={setTab} />

      <footer className="actions">
        {composing ? (
          <div className="compose">
            {(['suspect', 'weapon', 'place'] as CardKind[]).map((kind) => (
              <div key={kind} className="compose__row">
                <span className="compose__label">{KIND_LABEL[kind]}</span>
                <div className="compose__chips">
                  {CARDS.filter((c) => c.kind === kind).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`chip${pick[kind] === c.id ? ' chip--on' : ''}`}
                      onClick={() => setPick((p) => ({ ...p, [kind]: c.id }))}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div className="compose__submit">
              <button type="button" className="btn btn--ghost" onClick={() => setComposing(false)}>
                취소
              </button>
              <button type="button" className="btn btn--go" disabled={!ready}>
                제안 확정
              </button>
            </div>
          </div>
        ) : (
          <div className="actions__row">
            <button type="button" className="btn btn--go" onClick={() => setComposing(true)}>
              제안하기
            </button>
            <button type="button" className="btn">
              능력 사용 <small>검시관 · 1회</small>
            </button>
            <button type="button" className="btn" onClick={() => setTab('whisper')}>
              밀담
            </button>
            <button type="button" className="btn btn--danger">
              최종 고발
            </button>
          </div>
        )}
      </footer>
    </div>
  )
}
