import { useEffect, useRef, useState } from 'react'
import { participantLabel } from '../content/labels'
import { josa } from '../content/josa'
import { PARLEY_LIMIT, parleysUsedIn } from '../engine/parley'
import type { ParleyReply } from '../ai/decider'
import type { PlayerId } from '../engine/types'
import type { GameView } from '../engine/view'

/** 플레이어 입력 상한. 워커도 같은 값으로 막지만 **프론트는 위조 가능하므로 워커가 진짜 벽이다.** */
const ASK_MAX = 200

/**
 * 질문을 쓸 수 있는 시간.
 *
 * **재는 것은 «쓰는 동안»뿐이다.** 상대를 고르는 것도, 답을 기다리고 읽는 것도 시간 밖이다.
 * 응답 대기를 넣으면 LLM 지연이 플레이어 시간을 깎는다 — 회선이 느린 사람이 벌을 받고,
 * 폴백으로 떨어진 라운드는 더 이상해진다. 사람이 통제할 수 있는 구간만 잰다.
 *
 * 20초인 것은 실측이 아니라 어림이다. 한국어 한 문장이 10~15초라 **고민할 여유는 거의
 * 없는** 값이고, 그 압박이 이 자리의 의도다. 다만 처음 하는 사람은 예시 문구를 읽는 데만
 * 몇 초를 쓰므로 **외부 플레이테스트에서 다시 정해야 한다**(고도화 계획 게이트 0).
 */
const ASK_SECONDS = 20

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
  /**
   * 정보상 능력을 아직 쓸 수 있는가. 트리거가 이 자리에 있는 이유는 판정할 «말»이
   * 여기서 나오기 때문이다 — 능력 패널에서 미리 켜면 무엇을 가려낼지 모른 채 태운다.
   */
  detectReady: boolean
  /** 능력을 건다. 자리를 뜨기 «전»에 걸어야 이번 답이 판정 대상이 된다(engine/parley.ts의 detected). */
  onDetect: () => void
}

/** ①~④는 화면 상태다. 엔진은 ⑤에서 처음 불린다(설계 §8). */
type Step = 'pick' | 'write' | 'waiting' | 'read' | 'failed'

/**
 * 밀담 패널.
 *
 * **라운드마다 새로 마운트한다**(부르는 쪽이 key={view.round}를 준다). 그래야 지난 라운드의
 * 고른 상대·쓴 말이 남지 않는다. useEffect로 지우는 것보다 상태가 하나 적다.
 */
export default function Parley({
  view,
  open,
  onAsk,
  onDone,
  onSkip,
  detectReady,
  onDetect,
}: ParleyProps) {
  const [step, setStep] = useState<Step>('pick')
  const [targetId, setTargetId] = useState<PlayerId | null>(null)
  const [ask, setAsk] = useState('')
  const [reply, setReply] = useState('')
  /** 상대의 자기 신고. 화면에는 안 나온다 — 정보상만 결과로 받는다. */
  const [truthful, setTruthful] = useState<boolean | null>(null)
  const [remaining, setRemaining] = useState(ASK_SECONDS)
  /** 만료를 한 번만 처리한다. 렌더가 겹쳐도 onSkip이 두 번 불리면 안 된다. */
  const expired = useRef(false)

  /** 시간을 재는 구간. 질문을 쓰는 동안만이다. */
  const writing = open && step === 'write'

  /*
   * 쓰기에 들어갈 때마다 다시 30초를 준다. 상대를 바꾸면 질문도 새로 쓰는 것이라
   * 남은 시간을 물려받으면 두 번째 상대가 손해를 본다.
   */
  useEffect(() => {
    if (!writing) return
    expired.current = false
    setRemaining(ASK_SECONDS)
    const timer = window.setInterval(() => {
      setRemaining((left) => (left > 0 ? left - 1 : 0))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [writing])

  /*
   * 만료되면 밀담을 닫는다. **회선은 닳지 않는다** — 판당 8회는 엔진이 실제 밀담 기록에서
   * 세므로(engine/parley.ts), 시간을 넘겨도 잃는 것은 이번 라운드의 기회뿐이다.
   * 자동 전송하지 않는 이유는 쓰다 만 문장이 그대로 나가면 그게 더 큰 벌이기 때문이다.
   */
  useEffect(() => {
    if (!writing || remaining > 0 || expired.current) return
    expired.current = true
    onSkip()
  }, [writing, remaining, onSkip])

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
          {/*
            남은 시간. 막대는 scaleX로만 줄인다 — width를 건드리면 레이아웃이 매초 다시
            잡히고, 그건 이 프로젝트가 애니메이션에 두는 제약 밖이다.
            role="timer"에 aria-live를 걸지 않는 이유는 매초 읽어대면 입력을 방해해서다.
          */}
          <div
            className={remaining <= 10 ? 'parley__clock parley__clock--tight' : 'parley__clock'}
            role="timer"
          >
            <span className="parley__clock-num">{remaining}초</span>
            <span className="parley__clock-rail">
              <span
                className="parley__clock-bar"
                style={{ transform: `scaleX(${remaining / ASK_SECONDS})` }}
              />
            </span>
          </div>
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

      {/*
        「말을 고르는 중」은 상대가 무슨 말을 지어낼지 재고 있다는 뜻으로 읽혀서,
        아직 오지도 않은 답을 미리 의심하게 만든다. 지금 벌어지는 일은 그냥 대답이다.
      */}
      {step === 'waiting' && (
        <p className="parley__note" role="status">
          {josa(targetName, 'i')} 대답하는 중…
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
          <div className="parley__opts">
            {/*
              정보상의 발동 자리. 답을 «들은 뒤에» 걸게 두는 것이 요점이다 —
              밀담 한 번에 판당 한 번뿐인 능력을 붙이는 선택이라, 무슨 말이 나왔는지
              보고 나서 태울지 정해야 값이 된다.

              거는 것과 자리를 뜨는 것을 한 번에 한다. 엔진에서 판정이 나는 곳은
              parley()이고 그건 「자리를 뜬다」가 부르므로, 걸어만 두고 화면에 남으면
              이번 답이 아니라 다음 밀담에 걸린다.

              **결과는 여기 안 뜬다.** 알아낸 것은 「나만 보는 패」의 능력 칸에 쌓인다 —
              밀담 줄에 찍으면 상대가 보는 화면과 같은 자리라 정보가 새는 것처럼 읽힌다.
            */}
            {detectReady && (
              <button
                type="button"
                className="btn btn--go"
                title="판당 한 번뿐인 정보상 능력을 이 답에 쓴다 — 결과는 「나만 보는 패」에 남는다"
                onClick={() => {
                  onDetect()
                  onDone(targetId, ask.trim(), reply, truthful)
                }}
              >
                情 가려낸다
              </button>
            )}
            <button
              type="button"
              className={detectReady ? 'btn' : 'btn btn--go'}
              onClick={() => onDone(targetId, ask.trim(), reply, truthful)}
            >
              자리를 뜬다
            </button>
          </div>
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
