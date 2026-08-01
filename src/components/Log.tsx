import { cardName } from '../engine/cards'
import type { GameView, RoundView } from '../engine/view'

interface Props {
  view: GameView
}

function nameOf(view: GameView, id: string): string {
  return view.players.find((p) => p.id === id)?.name ?? id
}

function lines(view: GameView, round: RoundView): { text: string; tone: string }[] {
  const out: { text: string; tone: string }[] = [
    {
      tone: 'suggest',
      text: `${nameOf(view, round.suggesterId)}가 ${cardName(round.suggestion.suspect)} · ${cardName(
        round.suggestion.weapon,
      )} · ${cardName(round.suggestion.place)}를 제안했다.`,
    },
  ]

  for (const d of round.declarations) {
    out.push(
      d.claim.kind === 'refute'
        ? {
            tone: 'refute',
            text: `${nameOf(view, d.playerId)}: "${cardName(d.claim.cardId)}로 반증합니다."`,
          }
        : { tone: 'pass', text: `${nameOf(view, d.playerId)}: "없습니다."` },
    )
  }

  if (round.challenge) {
    const { challengerId, targetId, cardId, success, reveals } = round.challenge
    out.push({
      tone: success ? 'caught' : 'failed',
      text: success
        ? `${nameOf(view, challengerId)}가 ${nameOf(view, targetId)}의 위증을 잡았다 — ${cardName(cardId)}는 자신이 갖고 있다.`
        : `${nameOf(view, challengerId)}의 이의제기가 실패했다.`,
    })
    for (const r of reveals) {
      out.push({
        tone: 'reveal',
        text: `${nameOf(view, r.playerId)}의 ${cardName(r.cardId)}가 공개됐다.`,
      })
    }
  }

  return out
}

export default function Log({ view }: Props) {
  const rounds = [...view.rounds].reverse()

  return (
    <ol className="log">
      {rounds.map((round) => (
        <li key={round.round} className="log__round">
          <span className="log__num">라운드 {round.round}</span>
          <ul className="log__items">
            {lines(view, round).map((line, i) => (
              <li key={i} className={`log__item log__item--${line.tone}`}>
                {line.text}
              </li>
            ))}
          </ul>
        </li>
      ))}
      {rounds.length === 0 && <li className="log__empty">아직 기록이 없다.</li>}
    </ol>
  )
}
