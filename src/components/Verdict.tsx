import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { cardLabel, participantLabel, suspectTitle } from '../content/labels'
import type { Scenario } from '../content/scenarios'
import type { CardId } from '../engine/types'
import type { GameView } from '../engine/view'
import '../styles/verdict.css'

interface Props {
  view: GameView
  scenario: Scenario
  /** 판 번호. 같은 값을 다시 넣으면 같은 배분이 나온다. */
  seed: string
  onRestart: () => void
}

interface Liar {
  name: string
  count: number
  culprit: boolean
}

/**
 * 판이 끝난 뒤 누가 몇 번 위증했는지 센다.
 *
 * 엔진의 `isPerjury`를 쓰지 않는 이유는 그것이 애초에 시야 밖이기 때문이다(view.ts 주석).
 * 대신 **판이 끝나 손패가 전부 공개된 뒤** 선언과 손패를 대조해 다시 센다 —
 * 종료 전에는 알 수 없고 종료 후에는 누구나 셀 수 있는 값이라 규칙을 어기지 않는다.
 *
 * 위증은 두 종류다. 없는데 «있다»고 한 것, 있는데 «없다»고 한 것.
 */
function countLies(view: GameView): Liar[] {
  const tally = new Map<string, number>()

  for (const round of view.rounds) {
    const asked = [round.suggestion.suspect, round.suggestion.weapon, round.suggestion.place]

    for (const declaration of round.declarations) {
      const hand = view.players.find((p) => p.id === declaration.playerId)?.hand
      if (!hand) continue

      // 거부는 의무를 면제받은 것이라 거짓말 횟수에 넣지 않는다(engine/round.ts의 isPerjury와 같다).
      const lied =
        declaration.claim.kind === 'refute'
          ? !hand.includes(declaration.claim.cardId)
          : declaration.claim.kind === 'refuse'
            ? false
            : asked.some((card) => hand.includes(card))

      if (lied) tally.set(declaration.playerId, (tally.get(declaration.playerId) ?? 0) + 1)
    }
  }

  return view.players
    .map((player) => ({
      name: player.name,
      count: tally.get(player.id) ?? 0,
      culprit: player.faction === 'culprit',
    }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count)
}

/**
 * 판결문. 12~15분을 굴린 판이 한 줄로 끝나면 아무것도 남지 않는다 —
 * 진범이 누구였고 누가 몇 번 거짓말했는지가 여기서 처음 드러난다.
 */
export default function Verdict({ view, scenario, seed, onRestart }: Props) {
  const outcome = view.outcome
  if (!outcome) return null

  const label = (id: CardId) => cardLabel(scenario, id)
  const culprit = view.players.find((p) => p.faction === 'culprit')
  const iAmCulprit = view.players.find((p) => p.isMe)?.faction === 'culprit'

  /*
   * «맞았다/틀렸다»와 «이겼다/졌다»는 진영에 따라 뒤집힌다 —
   * 범인은 고발을 틀리게 «유도»해서 이긴다(설계 §2.1).
   * 결과만 쓰면 «승리 · 고발이 빗나갔다»처럼 앞뒤가 어긋나 보인다.
   */
  const lede = iAmCulprit
    ? outcome.correct
      ? '고발이 정확했다. 끝내 당신의 이름이 불렸다.'
      : '고발은 엉뚱한 곳으로 갔다. 당신은 이름을 남기지 않았다.'
    : outcome.correct
      ? '고발이 맞았다. 사건은 여기서 닫힌다.'
      : '고발이 빗나갔다. 진범은 그대로 걸어 나갔다.'
  const title = culprit ? suspectTitle(scenario, culprit.characterId) : null
  const liars = countLies(view)

  const challenges = view.rounds.filter((r) => r.challenge)
  const caught = challenges.filter((r) => r.challenge?.success).length

  /** 대사를 남긴 표만. 사람이 고발한 판(accuser.kind === 'player')에는 표 자체가 없다. */
  const spokenVotes =
    outcome.accuser.kind === 'council'
      ? outcome.accuser.votes.filter((v) => v.line !== null)
      : []

  /* 게임판 밖(body)에 붙인다 — 안에 두면 쌓임 맥락에 갇혀 추리표가 판결문 위로 올라온다. */
  return createPortal(
    <div className={`verdict verdict--${outcome.viewerWon ? 'win' : 'lose'}`}>
      <article className="verdict__sheet">
        <header className="verdict__head">
          <span className="verdict__file">判決文</span>
          <span className="verdict__case">
            {scenario.hanja} · {scenario.title}
          </span>
        </header>

        <p className="verdict__result">{outcome.viewerWon ? '승리' : '패배'}</p>
        <p className="verdict__lede">{lede}</p>

        <dl className="verdict__facts">
          <div>
            <dt>진범</dt>
            <dd>
              {culprit?.name ?? '—'}
              {title && <em>{title}</em>}
              {culprit?.isMe && <em className="verdict__mine">당신</em>}
            </dd>
          </div>
          <div>
            <dt>수단 · 현장</dt>
            <dd>
              {label(outcome.solution.weapon)} · {label(outcome.solution.place)}
            </dd>
          </div>
          <div>
            <dt>고발</dt>
            <dd>
              {label(outcome.accusation.suspect)} · {label(outcome.accusation.weapon)} ·{' '}
              {label(outcome.accusation.place)}
              <em>{outcome.accuser.kind === 'council' ? 'AI 합의' : '본인'}</em>
            </dd>
          </div>
        </dl>

        <section className="verdict__lies">
          <h2 className="verdict__sub">위증 기록</h2>
          {liars.length === 0 ? (
            <p className="verdict__none">이 판에서는 아무도 거짓을 말하지 않았다.</p>
          ) : (
            <ul className="liars">
              {liars.map((liar) => (
                <li
                  key={liar.name}
                  className={`liars__row${liar.culprit ? ' liars__row--culprit' : ''}`}
                >
                  <span className="liars__name">{liar.name}</span>
                  {/* 막대 길이가 곧 «얼마나 뻔뻔했는가»다. 숫자만 있으면 비교가 안 된다. */}
                  <span className="liars__bar" style={{ '--n': liar.count } as CSSProperties} />
                  <span className="liars__count">{liar.count}회</span>
                </li>
              ))}
            </ul>
          )}
          <p className="verdict__tally">
            이의제기 {challenges.length}건 중 {caught}건 적중 · 전 {view.rounds.length}라운드
          </p>
        </section>

        {/*
          AI 시민들이 합의로 고발한 판에서만 나온다. 표가 어떻게 갈렸는지가 아니라
          «각자 무슨 말을 하며 그 표를 던졌는지»가 이 게임의 결말이다.
          대사 없는 표(폴백·규칙 기반)는 아예 걸러 낸다 — 빈 줄만 늘어난다.
        */}
        {spokenVotes.length > 0 && (
          <section className="verdict__votes">
            <h2 className="verdict__sub">합의 발언</h2>
            <ul className="votes">
              {spokenVotes.map((vote) => (
                <li key={vote.playerId} className="votes__row">
                  <span className="votes__who">{participantLabel(view, vote.playerId)}</span>
                  {/* 텍스트로만 그린다 — 모델이 만든 문자열이다(절대 규칙 3). */}
                  <span className="votes__line">“{vote.line}”</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="verdict__foot">
          <button type="button" className="btn btn--go" onClick={onRestart}>
            새 판
          </button>
          <span className="verdict__seed">判 第{seed}號</span>
          <span className="verdict__seal" aria-hidden="true">
            檢
          </span>
        </footer>
      </article>
    </div>,
    document.body,
  )
}
