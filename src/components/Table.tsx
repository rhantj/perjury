import { cardLabel, suspectTitle } from '../content/labels'
import type { Scenario } from '../content/scenarios'
import type { GameView } from '../engine/view'

interface Props {
  view: GameView
  scenario: Scenario
}

/**
 * 좌석 6개. 이번 라운드의 선언 현황을 좌석 위에 얹는다.
 * 목업에서는 이 영역 절반이 비어 있었다 — 판이 지금 어떤 상태인지가 여기 있어야 한다.
 */
export default function Table({ view, scenario }: Props) {
  const record = view.rounds[view.rounds.length - 1]
  const live = record?.round === view.round ? record : null
  const turnId = view.players[view.turnIndex]?.id
  const label = (id: string) => cardLabel(scenario, id)

  return (
    <div className="table">
      {live && (
        <p className="table__suggestion">
          <span className="table__by">
            {view.players.find((p) => p.id === live.suggesterId)?.name}의 제안
          </span>
          <b>{label(live.suggestion.suspect)}</b>
          <i>·</i>
          <b>{label(live.suggestion.weapon)}</b>
          <i>·</i>
          <b>{label(live.suggestion.place)}</b>
        </p>
      )}

      <ul className="seats">
        {view.players.map((player) => {
          const declaration = live?.declarations.find((d) => d.playerId === player.id)
          const isSuggester = live?.suggesterId === player.id
          const caught = live?.challenge?.targetId === player.id && live.challenge.success

          return (
            <li
              key={player.id}
              className={[
                'seat',
                player.id === turnId ? 'seat--turn' : '',
                player.isMe ? 'seat--me' : '',
                caught ? 'seat--caught' : '',
              ]
                .join(' ')
                .trim()}
            >
              <span className="seat__face">{player.name.slice(1, 2)}</span>
              <span className="seat__name">
                {player.name}
                {player.isMe && <em>나</em>}
              </span>
              {/* 직함은 사건마다 바뀐다 — 같은 사람이 저택에서는 장남이고 극장에서는 주연이다. */}
              <span className="seat__title">{suspectTitle(scenario, player.characterId)}</span>

              <span className="seat__say">
                {isSuggester
                  ? '제안'
                  : declaration
                    ? declaration.claim.kind === 'refute'
                      ? `"${label(declaration.claim.cardId)}"`
                      : '없습니다'
                    : '…'}
              </span>

              {player.revealed.length > 0 && (
                <span className="seat__revealed">
                  공개 {player.revealed.map((c) => label(c)).join(' · ')}
                </span>
              )}
              {caught && <span className="seat__badge">위증</span>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
