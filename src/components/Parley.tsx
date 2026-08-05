import { useState } from 'react'
import { participantLabel } from '../content/labels'
import { josa } from '../content/josa'
import { PARLEY_LIMIT, parleysUsedIn } from '../engine/parley'
import type { ParleyReply } from '../ai/decider'
import type { PlayerId } from '../engine/types'
import type { GameView } from '../engine/view'

/** 플레이어 입력 상한. 워커도 같은 값으로 막지만 **프론트는 위조 가능하므로 워커가 진짜 벽이다.** */
const ASK_MAX = 200

interface ParleyProps {
  view: GameView
  /** 사람이 지금 밀담할 수 있는가. 밀담 페이즈이고 AI가 판단 중이 아닐 때만 true다. */
  open: boolean
  onAsk: (targetId: PlayerId, ask: string) => Promise<ParleyReply | null>
  /**
   * truthful은 «상대가 자기 입으로 신고한» 참·거짓이다. 화면은 이 값을 그리지 않고
   * 그대로 넘기기만 한다 — 정보상이 걸어뒀을 때만 엔진이 능력 결과로 바꾼다.
   */
  onDone: (targetId: PlayerId, ask: string, reply: string, truthful: boolean | null) => void
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
export default function Parley({ view, open, onAsk, onDone, onSkip }: ParleyProps) {
  const [step, setStep] = useState<Step>('pick')
  const [targetId, setTargetId] = useState<PlayerId | null>(null)
  const [ask, setAsk] = useState('')
  const [reply, setReply] = useState('')
  /** 상대의 자기 신고. 화면에는 안 나온다 — 정보상만 결과로 받는다. */
  const [truthful, setTruthful] = useState<boolean | null>(null)

  /*
   * 이번 라운드에 이미 이야기한 상대는 뺀다. 엔진이 거부하는 선택인데(engine/parley.ts)
   * 목록에 남겨두면 고를 수 있고, 답까지 받은 뒤 마지막에 던져 나갈 문이 사라진다.
   * 회선이 하나뿐일 때는 두 번째 선택 자체가 없어서 드러나지 않던 자리다.
   */
  const live = view.rounds[view.rounds.length - 1]
  const spoken = live?.round === view.round ? live.parleys : []
  const others = view.players.filter(
    (p) => !p.isMe && !spoken.some((done) => done.targetId === p.id),
  )
  const targetName = targetId ? participantLabel(view, targetId) : ''

  /*
   * 남은 횟수는 기록에서 센다 — 엔진과 같은 함수를 쓴다(decisions/009).
   * 사람 시야에는 자기 밀담이 전부 실리므로(view.ts) 이 집계가 정확하다.
   */
  const left = PARLEY_LIMIT - parleysUsedIn(view.rounds)
  const quota = (
    <span className="parley__quota">
      밀담 <b>{Math.max(0, left)}</b>/{PARLEY_LIMIT}
    </span>
  )

  /** 내 차례가 아니다. 자리만 잡아 둔다 — 나갈 문도 필요 없다. */
  if (!open) {
    return (
      <section className="parley">
        <span className="parley__kicker">密談 · 밀담</span>
        {quota}
        <p className="parley__note">
          1:1 대화로 정보를 거래하고 알리바이를 압박하는 자리다. 라운드 끝에 열린다.
        </p>
      </section>
    )
  }

  /** 답이 오지 않으면 'failed'로 간다 — 폴백 라운드라고 미리 닫지는 않는다. */
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
    setReply(answer.line)
    setTruthful(answer.truthful)
    setStep('read')
  }

  return (
    <section className="parley parley--open">
      <span className="parley__kicker">密談 · 밀담</span>
      {quota}

      {step === 'pick' && (
        <>
          <p className="parley__note">
            {left > 0
              ? `한 사람에게만 따로 말을 걸 수 있다. 판을 통틀어 ${PARLEY_LIMIT}번뿐이니 아껴 쓴다.`
              : `밀담을 ${PARLEY_LIMIT}번 다 썼다. 이제는 판 위의 말로만 겨룬다.`}
          </p>
          <div className="parley__opts">
            {/* 한도를 다 쓰면 상대를 고를 수 없다. 나가는 문은 남겨 둔다 — 막으면 페이즈가 갇힌다. */}
            {left > 0 &&
              others.map((p) => (
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
              {left > 0 ? '밀담 없이 넘어가기' : '넘어간다'}
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
            onClick={() => onDone(targetId, ask.trim(), reply, truthful)}
          >
            자리를 뜬다
          </button>
        </>
      )}

      {step === 'failed' && (
        <>
          <p className="parley__note">밀담이 이뤄지지 않았다. 상대가 입을 열지 않는다.</p>
          {/*
            회선이 남았으면 다른 상대를 고를 길을 준다. 넘어가기만 두면 한 번의 통신 실패가
            아직 써보지도 않은 회선까지 함께 버린다(전화교환수는 라운드당 둘이다).
          */}
          {/* 회선이 남아도 판당 예산이 마르면 걸 수 없다. 엔진이 거절하는 선택을 내주지 않는다. */}
          {others.length > 0 && left > 0 && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                setTargetId(null)
                setAsk('')
                setReply('')
                setTruthful(null)
                setStep('pick')
              }}
            >
              다른 사람에게
            </button>
          )}
          <button type="button" className="btn btn--ghost" onClick={onSkip}>
            넘어간다
          </button>
        </>
      )}
    </section>
  )
}
