import { cardLabel, participantInitial, participantLabel, suspectTitle } from '../content/labels'
import type { Scenario } from '../content/scenarios'
import type { CardId } from '../engine/types'
import type { GameView, PlayerView, RoundView } from '../engine/view'

interface Props {
  view: GameView
  scenario: Scenario
}

/** 좌석이 놓이는 자리. 다섯을 위·좌우로 두르고 내 자리는 아래 가운데다. */
const SLOTS = ['p1', 'p2', 'p3', 'p4', 'p5'] as const

/**
 * 원탁. 격자로 늘어놓으면 «명단»이고, 둘러앉혀야 «자리»가 된다 —
 * 내가 저 다섯을 마주 보고 있다는 배치 자체가 이 게임의 구도다.
 */
export default function Table({ view, scenario }: Props) {
  const record = view.rounds[view.rounds.length - 1]
  const live = record?.round === view.round ? record : null
  const turnId = view.players[view.turnIndex]?.id
  const label = (id: CardId) => cardLabel(scenario, id)

  const me = view.players.find((p) => p.isMe)
  const others = view.players.filter((p) => !p.isMe)

  const seat = (player: PlayerView, slot: string) => (
    <Seat
      key={player.id}
      view={view}
      player={player}
      slot={slot}
      live={live}
      isTurn={player.id === turnId}
      scenario={scenario}
      label={label}
    />
  )

  return (
    <ul className="seats">
      {others.map((player, i) => seat(player, SLOTS[i] ?? 'p5'))}

      {/* 상 한가운데. 이번 라운드에 올라온 제안이 여기 놓인다. */}
      <li className="seats__centre">
        {live ? (
          <>
            <span className="centre__by">{participantLabel(view, live.suggesterId)}의 제안</span>
            <span className="centre__claim">
              <b>{label(live.suggestion.suspect)}</b>
              <i>·</i>
              <b>{label(live.suggestion.weapon)}</b>
              <i>·</i>
              <b>{label(live.suggestion.place)}</b>
            </span>
          </>
        ) : (
          <span className="centre__idle">상 위에 아직 아무것도 오르지 않았다</span>
        )}
      </li>

      {me && seat(me, 'me')}
    </ul>
  )
}

function Seat({
  view,
  player,
  slot,
  live,
  isTurn,
  scenario,
  label,
}: {
  view: GameView
  player: PlayerView
  slot: string
  live: RoundView | null
  isTurn: boolean
  scenario: Scenario
  label: (id: CardId) => string
}) {
  const declaration = live?.declarations.find((d) => d.playerId === player.id)
  const isSuggester = live?.suggesterId === player.id
  const caught = live?.challenge?.targetId === player.id && live.challenge.success

  const say = isSuggester
    ? '제안했다'
    : declaration
      ? declaration.claim.kind === 'refute'
        ? `“${label(declaration.claim.cardId)}로 반증합니다”`
        : '“없습니다”'
      : null

  return (
    <li
      className={[
        'seat',
        `seat--${slot}`,
        isTurn ? 'seat--turn' : '',
        player.isMe ? 'seat--me' : '',
        caught ? 'seat--caught' : '',
      ]
        .join(' ')
        .trim()}
    >
      <span className="seat__face">{participantInitial(view, player.id)}</span>

      <span className="seat__id">
        <span className="seat__name">{participantLabel(view, player.id)}</span>
        <span className="seat__title">{suspectTitle(scenario, player.characterId)}</span>
      </span>

      {/* 말이 없으면 칸을 비우지 않고 «침묵»을 적는다 — 빈칸은 아직 안 물어본 것처럼 보인다. */}
      <span className={`seat__say${say ? '' : ' seat__say--mute'}`}>{say ?? '…'}</span>

      {player.revealed.length > 0 && (
        <span className="seat__revealed">
          공개 {player.revealed.map((c) => label(c)).join(' · ')}
        </span>
      )}
      {caught && <span className="seat__badge">위증</span>}
    </li>
  )
}
