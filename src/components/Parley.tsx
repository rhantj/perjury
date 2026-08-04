import { useState } from 'react'
import { participantLabel } from '../content/labels'
import { josa } from '../content/josa'
import type { PlayerId } from '../engine/types'
import type { GameView } from '../engine/view'

/** 플레이어 입력 상한. 워커도 같은 값으로 막지만 **프론트는 위조 가능하므로 워커가 진짜 벽이다.** */
const ASK_MAX = 200

interface ParleyProps {
  view: GameView
  /** 사람이 지금 밀담할 수 있는가. 밀담 페이즈이고 AI가 판단 중이 아닐 때만 true다. */
  open: boolean
  /** 이번 라운드가 규칙 기반 폴백인가. true면 처음부터 닫는다 — 자유 텍스트는 규칙으로 못 만든다. */
  blocked: boolean
  onAsk: (targetId: PlayerId, ask: string) => Promise<string | null>
  onDone: (targetId: PlayerId, ask: string, reply: string) => void
  onSkip: () => void
}

/** ①~④는 화면 상태다. 엔진은 ⑤에서 처음 불린다(설계 §8). */
type Step = 'pick' | 'write' | 'waiting' | 'read' | 'failed'

/**
 * 밀담 패널.
 *
 * **라운드마다 새로 마운트한다**(부르는 쪽이 key={view.round}를 준다). 그래야 지난 라운드의
 * 고른 상대·쓴 말이 남지 않는다. useEffect로 지우는 것보다 상태가 하나 적다.
 */
export default function Parley({ view, open, blocked, onAsk, onDone, onSkip }: ParleyProps) {
  const [step, setStep] = useState<Step>('pick')
  const [targetId, setTargetId] = useState<PlayerId | null>(null)
  const [ask, setAsk] = useState('')
  const [reply, setReply] = useState('')

  const others = view.players.filter((p) => !p.isMe)
  const targetName = targetId ? participantLabel(view, targetId) : ''

  /** 내 차례가 아니다. 자리만 잡아 둔다 — 나갈 문도 필요 없다. */
  if (!open) {
    return (
      <section className="parley">
        <span className="parley__kicker">密談 · 밀담</span>
        <p className="parley__note">
          1:1 대화로 정보를 거래하고 알리바이를 압박하는 자리다. 라운드 끝에 열린다.
        </p>
      </section>
    )
  }

  /*
   * 이번 라운드가 이미 폴백이면 **상대를 고르기 전에** 닫는다(설계 §9).
   * 규칙 기반 판단자는 밀담에 답하지 않으므로, 열어두면 상대를 고르고 200자를 쓰고
   * 기다린 뒤에야 «이뤄지지 않았다»를 보게 된다. 배포본에서 실제로 그렇게 나갔다.
   *
   * **닫아도 넘어가는 문은 남긴다.** 라운드를 넘기는 것은 밀담의 두 출구뿐이라,
   * 여기서 버튼을 빼면 판이 밀담에 갇힌다.
   */
  if (blocked) {
    return (
      <section className="parley">
        <span className="parley__kicker">密談 · 밀담</span>
        <p className="parley__note">연결이 끊겨 이번 라운드의 밀담은 열리지 않는다.</p>
        <div className="parley__opts">
          <button type="button" className="btn btn--ghost" onClick={onSkip}>
            넘어간다
          </button>
        </div>
      </section>
    )
  }

  const send = async () => {
    if (!targetId) return
    const said = ask.trim()
    if (said.length === 0) return
    setStep('waiting')
    const answer = await onAsk(targetId, said)
    if (answer === null) {
      setStep('failed')
      return
    }
    setReply(answer)
    setStep('read')
  }

  return (
    <section className="parley parley--open">
      <span className="parley__kicker">密談 · 밀담</span>

      {step === 'pick' && (
        <>
          <p className="parley__note">한 사람에게만 따로 말을 걸 수 있다. 이번 라운드에 한 번뿐이다.</p>
          <div className="parley__opts">
            {others.map((p) => (
              <button
                key={p.id}
                type="button"
                className="btn"
                onClick={() => {
                  setTargetId(p.id)
                  setStep('write')
                }}
              >
                {participantLabel(view, p.id)}
              </button>
            ))}
            <button type="button" className="btn btn--ghost" onClick={onSkip}>
              밀담 없이 넘어가기
            </button>
          </div>
        </>
      )}

      {step === 'write' && (
        <>
          <p className="parley__note">{josa(targetName, 'eul')} 불러 세웠다. 무슨 말을 하겠나.</p>
          <div className="parley__form">
            <input
              className="parley__input"
              value={ask}
              maxLength={ASK_MAX}
              autoFocus
              placeholder="예: 3라운드에 왜 아무 말도 하지 않았지"
              onChange={(e) => setAsk(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void send()
              }}
            />
            <span className="parley__count">
              {ask.length}/{ASK_MAX}
            </span>
            <button
              type="button"
              className="btn btn--go"
              disabled={ask.trim().length === 0}
              onClick={() => void send()}
            >
              말을 건다
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setStep('pick')}>
              상대를 바꾼다
            </button>
          </div>
        </>
      )}

      {step === 'waiting' && (
        <p className="parley__note" role="status">
          {josa(targetName, 'i')} 말을 고르는 중
        </p>
      )}

      {step === 'read' && targetId && (
        <>
          {/* 텍스트로만 그린다 — reply는 모델이 만든 문자열이다(절대 규칙 3). */}
          <p className="parley__said parley__said--mine">{ask.trim()}</p>
          <p className="parley__said parley__said--theirs">
            <b>{targetName}</b>
            {reply}
          </p>
          <button
            type="button"
            className="btn btn--go"
            onClick={() => onDone(targetId, ask.trim(), reply)}
          >
            자리를 뜬다
          </button>
        </>
      )}

      {step === 'failed' && (
        <>
          <p className="parley__note">밀담이 이뤄지지 않았다. 상대가 입을 열지 않는다.</p>
          <button type="button" className="btn btn--ghost" onClick={onSkip}>
            넘어간다
          </button>
        </>
      )}
    </section>
  )
}
