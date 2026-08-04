import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { cardLabel, participantInitial, participantLabel, suspectTitle } from '../content/labels'
import { placeArtFor } from '../content/place-art'
import type { Scenario } from '../content/scenarios'
import { suspectArtFor } from '../content/suspect-art'
import { tableArtFor } from '../content/table-art'
import { weaponArtFor } from '../content/weapon-art'
import { cardKind, cardName } from '../engine/cards'
import type { CardId, PlayerId } from '../engine/types'
import type { GameView, PlayerView, RoundView } from '../engine/view'

/** 반증 카드의 종류에 맞는 그림을 고른다 — 범인·수단·장소 중 어느 것이든 나올 수 있다. */
function revealArtFor(scenario: Scenario, cardId: CardId): string | undefined {
  switch (cardKind(cardId)) {
    case 'suspect':
      return suspectArtFor(cardId)
    case 'weapon':
      return weaponArtFor(scenario, cardId)
    case 'place':
      return placeArtFor(scenario, cardId)
  }
}

/** 좌석 하나가 스포트라이트를 받는 시간. 다섯 명이면 한 라운드 공개가 총 5×이만큼 걸린다. */
const REVEAL_STEP_MS = 1150

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
  const tableArt = tableArtFor(scenario)

  const me = view.players.find((p) => p.isMe)
  const others = view.players.filter((p) => !p.isMe)

  /*
   * 반증은 동시 선언이라 엔진에는 한 번에 전부 도착한다(설계 §1.4.1) — 그걸 그대로
   * 뿌리면 다섯 명이 한꺼번에 입을 여는 꼴이라 극이 안 산다. 그래서 표시만 참가1부터
   * 시계방향으로(= others 배열 순서, SLOTS와 같은 순서다) 한 명씩 스포트라이트를 받게
   * 미뤄서 보여준다 — 판정은 이미 끝나 있고 여기는 «어떻게 보여줄지»만 다룬다.
   */
  const [revealedIds, setRevealedIds] = useState<ReadonlySet<PlayerId>>(new Set())
  const [activeRevealId, setActiveRevealId] = useState<PlayerId | null>(null)
  const revealedRoundRef = useRef<number | null>(null)

  useEffect(() => {
    if (!live || live.declarations.length === 0) return
    if (revealedRoundRef.current === live.round) return
    revealedRoundRef.current = live.round

    const order = others
      .filter((p) => live.declarations.some((d) => d.playerId === p.id))
      .map((p) => p.id)

    setRevealedIds(new Set())
    setActiveRevealId(order[0] ?? null)

    const timers = order.map((id, i) =>
      window.setTimeout(
        () => {
          setRevealedIds((prev) => new Set(prev).add(id))
          setActiveRevealId(order[i + 1] ?? null)
        },
        REVEAL_STEP_MS * (i + 1),
      ),
    )

    return () => timers.forEach((t) => window.clearTimeout(t))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- live.round/declarations.length가 바뀔 때만 새로 돌면 된다
  }, [live?.round, live?.declarations.length])

  const seat = (player: PlayerView, slot: string) => {
    const hasDeclaration = !player.isMe && (live?.declarations.some((d) => d.playerId === player.id) ?? false)
    return (
      <Seat
        key={player.id}
        view={view}
        player={player}
        slot={slot}
        live={live}
        isTurn={player.id === turnId && view.phase === 'suggest'}
        scenario={scenario}
        label={label}
        revealed={!hasDeclaration || revealedIds.has(player.id)}
        revealing={activeRevealId === player.id}
      />
    )
  }

  return (
    <ul
      className={`seats${tableArt ? ' seats--photo' : ''}`}
      style={tableArt ? ({ '--table-art': `url(${tableArt})` } as CSSProperties) : undefined}
    >
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
  revealed,
  revealing,
}: {
  view: GameView
  player: PlayerView
  slot: string
  live: RoundView | null
  isTurn: boolean
  scenario: Scenario
  label: (id: CardId) => string
  /** 이 좌석의 이번 라운드 발언을 아직 감춰야 하는가 — 스포트라이트 차례가 오기 전이면 false. */
  revealed: boolean
  /** 지금 이 좌석이 스포트라이트를 받는 차례인가. */
  revealing: boolean
}) {
  const declaration = live?.declarations.find((d) => d.playerId === player.id)
  const isSuggester = live?.suggesterId === player.id
  const caught = live?.challenge?.targetId === player.id && live.challenge.success

  const say = isSuggester
    ? '제안했다'
    : declaration
      ? revealed
        ? declaration.claim.kind === 'refute'
          ? `“${label(declaration.claim.cardId)}로 반증합니다”`
          : '“없습니다”'
        : '…'
      : null

  /*
   * LLM이 쓴 대사. 위의 say를 «대체하지 않고» 밑에 덧붙인다 —
   * 대사는 카드 이름을 말하지 않을 수도 있어서, 대체하면 무엇으로 반증했는지가 화면에서 사라진다.
   *
   * 없으면 null이다(사람·규칙 기반 판단자·폴백). 그때는 위의 고정 문구만 남는다 — 절대 규칙 4.
   * 반증 대사는 say와 같은 revealed 조건을 탄다. 순차 공개 중에 대사만 먼저 뜨면 순서가 깨진다.
   */
  const challengeLine = live?.challenge?.challengerId === player.id ? live.challenge.line : null
  const spoken =
    challengeLine ?? (isSuggester ? (live?.suggestionLine ?? null) : revealed ? declaration?.line ?? null : null)

  const art = suspectArtFor(player.characterId)
  /*
   * 카드는 스포트라이트가 지나가도 사라지지 않는다 — revealing(그 순간)이 아니라
   * revealed(공개된 뒤 쭉)에 건다. 사라지면 «나온다더니 없어졌다»는 피드백이 다시 나온다.
   */
  const revealCard =
    revealed && declaration?.claim.kind === 'refute'
      ? { art: revealArtFor(scenario, declaration.claim.cardId), name: label(declaration.claim.cardId) }
      : null

  return (
    <li
      className={[
        'seat',
        `seat--${slot}`,
        isTurn ? 'seat--turn' : '',
        player.isMe ? 'seat--me' : '',
        caught ? 'seat--caught' : '',
        revealing ? 'seat--reveal' : '',
        isSuggester ? 'seat--suggester' : '',
      ]
        .join(' ')
        .trim()}
    >
      {revealCard && (
        <span className="seat__reveal-card">
          {revealCard.art && <img src={revealCard.art} alt="" />}
          <em>{revealCard.name}</em>
        </span>
      )}
      {/* 참가N/나로 익명화했더라도 얼굴은 있어야 «사람」으로 읽힌다 — 손패 노출과는 무관하다. */}
      {art && <img className="seat__art" src={art} alt="" />}
      <span className="seat__scrim" aria-hidden="true" />

      <span className="seat__face">{participantInitial(view, player.id)}</span>

      <span className="seat__id">
        <span className="seat__name">{participantLabel(view, player.id)}</span>
        {/*
          누가 누군지 몰라 헷갈린다는 피드백 — 참가N은 그대로 두고(추리표·기록·이의제기가
          전부 이 번호로 부른다) 실명은 덧붙이기만 한다. 실명은 조서·진영 확인에서 이미
          공개했던 정보라 여기 다시 적어도 손패 소지와는 무관하다(둘은 원래 별개).
        */}
        <span className="seat__title">
          <strong className="seat__title-name">{cardName(player.characterId)}</strong>
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

      {/* 텍스트로만 그린다 — 이건 모델이 만든 문자열이다(절대 규칙 3). */}
      {spoken && (
        <span key={spoken} className="seat__line">
          “{spoken}”
        </span>
      )}

      {player.revealed.length > 0 && (
        <span className="seat__revealed">
          공개 {player.revealed.map((c) => label(c)).join(' · ')}
        </span>
      )}
      {isTurn && <span className="seat__turn-badge">차례</span>}
      {isSuggester && <span className="seat__suggest-badge">제안</span>}
      {caught && <span className="seat__badge">위증</span>}
    </li>
  )
}
