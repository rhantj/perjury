import { cardLabel, participantInitial, participantLabel, suspectTitle } from '../content/labels'
import { placeArtFor } from '../content/place-art'
import type { Scenario } from '../content/scenarios'
import { suspectArtFor } from '../content/suspect-art'
import { weaponArtFor } from '../content/weapon-art'
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
      isTurn={player.id === turnId && view.phase === 'suggest'}
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
          // round로 키를 걸어 «새 제안이 올라올 때만» 카드가 탁자에 놓이는 연출이 돈다 —
          // 같은 라운드 안에서 반증이 쌓일 때마다 다시 놓이면 산만해진다.
          <div className="centre__claim" key={live.round}>
            <span className="centre__by">{participantLabel(view, live.suggesterId)}의 제안</span>
            <ul className="centre__cards">
              <CentreCard art={suspectArtFor(live.suggestion.suspect)} name={label(live.suggestion.suspect)} />
              <CentreCard
                art={weaponArtFor(scenario, live.suggestion.weapon)}
                name={label(live.suggestion.weapon)}
              />
              <CentreCard
                art={placeArtFor(scenario, live.suggestion.place)}
                name={label(live.suggestion.place)}
              />
            </ul>
          </div>
        ) : (
          <span className="centre__idle">상 위에 아직 아무것도 오르지 않았다</span>
        )}
      </li>

      {me && seat(me, 'me')}
    </ul>
  )
}

/** 제안 카드 한 장. 손패의 HandCard와 같은 3:4 비례를 써서 «같은 카드»로 읽히게 한다. */
function CentreCard({ art, name }: { art: string | undefined; name: string }) {
  return (
    <li className="centre-card">
      {art && <img className="centre-card__art" src={art} alt="" />}
      <span className="centre-card__name">{name}</span>
    </li>
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
        {/*
          직업(검시관·순사 등 마피아 능력)과 헷갈리기 쉽다 — 이건 능력이 아니라
          이 사건 속에서 이 좌석이 맡은 배역(장남·안주인 등)이다. 접두어로 구분한다.
        */}
        <span className="seat__title">
          <em>이 사건 속</em>
          {suspectTitle(scenario, player.characterId)}
        </span>
      </span>

      {/*
        말이 없으면 칸을 비우지 않고 «침묵»을 적는다 — 빈칸은 아직 안 물어본 것처럼 보인다.
        key를 내용에 걸어 두면 발언이 바뀔 때마다 이 span이 새로 마운트돼 등장 애니메이션이
        다시 돈다 — 그냥 텍스트만 바꾸면 DOM 노드가 그대로라 아무 움직임도 안 보인다.
      */}
      <span key={say ?? 'silence'} className={`seat__say${say ? '' : ' seat__say--mute'}`}>
        {say ?? '…'}
      </span>

      {player.revealed.length > 0 && (
        <span className="seat__revealed">
          공개 {player.revealed.map((c) => label(c)).join(' · ')}
        </span>
      )}
      {isTurn && <span className="seat__turn-badge">차례</span>}
      {caught && <span className="seat__badge">위증</span>}
    </li>
  )
}
