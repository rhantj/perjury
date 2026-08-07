import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  cardLabel,
  namesAnyCard,
  participantInitial,
  participantLabel,
  seatSlot,
  suggestionSentence,
  suspectTitle,
} from '../content/labels'
import { placeArtFor } from '../content/place-art'
import type { Scenario } from '../content/scenarios'
import { suspectArtFor } from '../content/suspect-art'
import { tableArtFor } from '../content/table-art'
import { weaponArtFor } from '../content/weapon-art'
import {
  caughtLine,
  challengeLine,
  clearedLine,
  passLine,
  refuteLine,
  suggestLine,
  wrongCallLine,
} from '../content/fallback-lines'
import { cardKind, cardName } from '../engine/cards'
import type { CardId, CardKind, PlayerId } from '../engine/types'
import type { ClaimView, GameView, PlayerView, RoundView } from '../engine/view'

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

/**
 * LLM 대사가 없을 때 좌석이 하는 말. 거부는 침묵과 갈라야 한다 —
 * 「없습니다」로 뭉치면 변호사가 무엇을 했는지 화면에서 사라진다.
 */
function declarationLine(
  claim: ClaimView,
  characterId: CardId,
  label: (id: CardId) => string,
  /** 라운드·좌석을 섞은 씨앗. 같은 자리는 언제 그려도 같은 말이어야 한다(fallback-lines.ts). */
  salt: string,
): string {
  switch (claim.kind) {
    /*
     * 카드가 안 보이면 이름 자리에 「하나」를 넣는다. 말투 표는 카드 이름을 받는 틀이라
     * 그대로 두면 「하나를 내가 갖고 있소」처럼 읽히고, 그게 사실 그대로다 —
     * 셋 중 하나를 쥐었으되 무엇인지는 제안자에게만 보였다.
     */
    case 'refute':
      return `“${refuteLine(characterId, claim.cardId === null ? '하나' : label(claim.cardId), salt)}”`
    case 'pass':
      return `“${passLine(characterId, salt)}”`
    case 'refuse':
      return '“답변을 거부하오.”'
  }
}

/** 좌석 하나가 스포트라이트를 받는 시간. 다섯 명이면 한 라운드 공개가 총 5×이만큼 걸린다. */
const REVEAL_STEP_MS = 700

interface Props {
  view: GameView
  scenario: Scenario
  /**
   * 아직 확정하지 않은 내 제안. 추리표에서 하나 누를 때마다 그 카드가 상 위에 올라간다.
   *
   * GameScreen의 picked를 그대로 받는다 — 여기서 상태를 따로 들면 두 벌이 어긋난다.
   */
  draft?: Partial<Record<CardKind, CardId>>
}

/** 상에 올라가는 순서. 확정 제안의 카드 순서(범인·수단·장소)와 같아야 «같은 자리»로 읽힌다. */
const DRAFT_SLOTS = [
  { kind: 'suspect', name: '범인' },
  { kind: 'weapon', name: '수단' },
  { kind: 'place', name: '장소' },
] as const

/**
 * 원탁. 격자로 늘어놓으면 «명단»이고, 둘러앉혀야 «자리»가 된다 —
 * 내가 저 다섯을 마주 보고 있다는 배치 자체가 이 게임의 구도다.
 */
export default function Table({ view, scenario, draft }: Props) {
  const record = view.rounds[view.rounds.length - 1]
  /*
   * 원탁 가운데는 «지금 걸려 있는 제안»의 자리다. 고발로 넘어가면 걸려 있는 제안이 없다.
   *
   * 라운드 번호만으로는 갈리지 않는다 — 마지막 라운드에서는 nextRound도 finish도 round를
   * 올리지 않고 페이즈만 바꾸므로(engine/progress.ts), 지난 라운드의 제안이 고발과 판결까지 남는다.
   * 최종 고발을 고르는 자리에 남의 지난 제안이 깔려 있으면 그것을 답으로 읽게 된다.
   *
   * over까지 함께 끊는다. 판결문이 덮긴 하지만 페이드인이 도는 동안 뒤로 비친다.
   */
  const settled = view.phase === 'accuse' || view.phase === 'over'
  const live = record?.round === view.round && !settled ? record : null
  /** 상이 비었을 때 뭐라고 적는가. 판결 중에는 아무것도 적지 않는다 — 판결문이 그 자리다. */
  const idle =
    view.phase === 'accuse'
      ? '상이 치워졌다 — 이제 이름을 대야 한다'
      : view.phase === 'over'
        ? null
        : '상 위에 아직 아무것도 오르지 않았다'
  const turnId = view.players[view.turnIndex]?.id
  const label = (id: CardId) => cardLabel(scenario, id)
  const tableArt = tableArtFor(scenario)

  const me = view.players.find((p) => p.isMe)
  const others = view.players.filter((p) => !p.isMe)

  const draftCount = DRAFT_SLOTS.filter(({ kind }) => draft?.[kind]).length

  /*
   * 반증은 동시 선언이라 엔진에는 한 번에 전부 도착한다(설계 §1.4.1) — 그걸 그대로
   * 뿌리면 다섯 명이 한꺼번에 입을 여는 꼴이라 극이 안 산다. 그래서 표시만 참가1부터
   * 시계방향으로(= others 배열 순서, seatSlot과 같은 순서다) 한 명씩 스포트라이트를 받게
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
      {/* 칸은 labels.ts에서 얻는다 — 추첨 명패가 날아갈 방향도 같은 함수를 쓴다. */}
      {others.map((player) => seat(player, seatSlot(view, player.id)))}

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
        ) : draftCount > 0 ? (
          /*
           * 확정 전 «올리는 중». live가 있으면 그쪽이 이긴다 — 남이 낸 제안이 상에 놓여
           * 있는데 내 미확정 패가 그 자리를 덮으면 지금 판이 뭘 묻고 있는지가 사라진다.
           * 제안 페이즈에는 이번 라운드 기록이 아직 없어서 live가 null이고, 그래서
           * 이 분기가 바로 «내가 고르는 동안»과 겹친다.
           */
          <div className="centre__claim centre__claim--draft">
            <span className="centre__by">올리는 중 · {draftCount}/3</span>
            <ul className="centre__cards">
              {DRAFT_SLOTS.map(({ kind, name }) => {
                const id = draft?.[kind]
                // 카드 id를 키에 넣어 고른 것을 «바꾸면» 새 카드로 갈리며 놓이는 연출이 다시 돈다.
                return id ? (
                  <CentreCard key={`${kind}:${id}`} art={revealArtFor(scenario, id)} name={label(id)} />
                ) : (
                  <li key={kind} className="centre-card centre-card--empty">
                    <span className="centre-card__slot">{name}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : (
          // 문구가 «상황이 바뀌었다»를 알리는 자리라 읽어 주게 한다. 화면의 다른 대기 문구와 같은 처리다.
          idle && (
            <span className="centre__idle" role="status">
              {idle}
            </span>
          )
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
  /** 이번 라운드 추첨에 뽑혔는가. 전체 공개다(engine/view.ts). */
  const isDrawn = live?.responderIds.includes(player.id) ?? false
  const caught = live?.challenge?.targetId === player.id && live.challenge.success
  /*
   * 사진사에게 잡힌 위증. 이의제기와 같은 «들켰다» 처리를 받되 배지가 따로다 —
   * 잡은 사람이 없기 때문이다. 발각은 전체 공개라 좌석마다 거를 것이 없다.
   */
  const shot = live?.exposed.includes(player.id) ?? false
  /*
   * 고발에 실패해 판에서 빠진 좌석. 탈락 경로는 이것 하나뿐이다(engine/progress.ts).
   *
   * live가 아니라 view에서 읽는다 — 라운드에 매인 상태(제안·추첨·발각)와 달리
   * 이건 판이 끝날 때까지 안 풀리므로, 라운드가 넘어가도 표시가 남아 있어야 한다.
   */
  const out = view.eliminated.includes(player.id)
  /*
   * 신문기자가 공개한 진위는 여기 그리지 않는다. 그가 새기는 곳은 «지난» 라운드이고
   * 이 좌석은 진행 중인 라운드(live)만 그리므로, 배지가 뜰 수 있는 순간이 없다.
   * 그 정보는 기록(Log)에 남는다.
   */

  /*
   * LLM 대사가 없을 때(사람·규칙 기반 판단자·폴백 — declaration.line 등이 늘 null인
   * 자리, 엔진 types.ts 주석)의 캐릭터별 고정 대사. 예전엔 사람 좌석만 갈음하고 나머지는
   * "~를 반증합니다"라는 로봇 문구 하나로 뭉뚱그렸는데, 로컬 워커가 죽어 전원이 폴백으로
   * 떨어지면 여섯 명이 전부 같은 말투가 돼 "대사가 초기화됐다"는 피드백으로 이어졌다.
   * isMe로 가르지 않고 characterId 하나로 모두 같은 표를 쓴다 — 사람이든 폴백 AI든
   * 같은 인물이면 같은 말투여야 한다. 이의제기 순간은 그 좌석의 반증/넘김 발언보다
   * 우선한다 — spoken의 challengeLine ?? … 순서와 같은 우선순위다.
   */
  /*
   * 이의제기 «판정»에 대한 반응. 지목(challengeLine)보다 뒤 박자이므로 이게 이긴다.
   *
   * 세 자리로 갈린다 — 들킨 쪽·누명을 벗은 쪽·헛짚은 쪽. 예전엔 판정이 난 뒤에도 각자
   * 직전 발언이 그대로 남아서, 위증이 들통난 사람이 방금 한 거짓말을 계속 말하고 있고
   * 헛짚은 사람은 여전히 「거짓을 고했소」라고 우겼다.
   *
   * 적중한 도전자만 지목 그대로 둔다 — 그 말이 옳았음이 방금 증명됐으므로 바꿀 이유가 없다.
   */
  const result = live?.challenge ?? null
  const reaction =
    result && result.targetId === player.id
      ? result.success
        ? caughtLine(player.characterId)
        : clearedLine(player.characterId)
      : result && result.challengerId === player.id && !result.success
        ? wrongCallLine(player.characterId, participantLabel(view, result.targetId))
        : null

  const say =
    // 판정 반응(main)이 맨 앞이고, 선언 문구는 declarationLine을 쓴다 —
    // 인라인으로 refute/pass만 가르면 변호사의 「거부」가 침묵으로 뭉개진다.
    reaction
      ? `“${reaction}”`
      : live?.challenge?.challengerId === player.id
        ? `“${challengeLine(player.characterId, participantLabel(view, live.challenge.targetId))}”`
        : isSuggester
          ? `“${suggestLine(player.characterId, `${live?.round}`)}”`
          : declaration
            ? revealed
              ? declarationLine(declaration.claim, player.characterId, label, `${live?.round}:${player.id}`)
              : '…'
            : null

  /*
   * LLM이 쓴 대사. 있으면 say 대신 이것만 렌더한다(아래 JSX) — 둘을 같이 띄우면 한 좌석에
   * 줄이 두 개 겹쳐 헷갈린다는 피드백 때문이다.
   *
   * 없으면 null이다(사람·규칙 기반 판단자·폴백). 그때는 say(고정 문구)로 대체한다 — 절대 규칙 4.
   * 반증 대사는 say와 같은 revealed 조건을 탄다. 순차 공개 중에 대사만 먼저 뜨면 순서가 깨진다.
   */
  const challengeLLMLine = live?.challenge?.challengerId === player.id ? live.challenge.line : null
  /*
   * 반증 대사에서 카드 이름이 새는 것을 막는다.
   *
   * 반증에 쓴 카드는 제안자에게만 보인다(engine/view.ts의 claimFor). 그런데 대사는
   * 모델이 쓴 자유 텍스트라 «넥타이는 내 손에 있소»처럼 그 카드를 소리내어 말해 버리고,
   * 그러면 엔진이 가린 것이 좌석 옆 한 줄로 통째로 새어 전원에게 읽힌다.
   * cardId가 null이라는 것이 곧 «이 시야는 카드를 볼 자격이 없다»이므로,
   * 그때 카드 이름이 섞인 대사는 버리고 고정 문구(say)로 떨어뜨린다.
   */
  const hiddenRefute = declaration?.claim.kind === 'refute' && declaration.claim.cardId === null
  const declarationLLMLine =
    declaration?.line && hiddenRefute && namesAnyCard(scenario, declaration.line)
      ? null
      : (declaration?.line ?? null)
  const spoken = reaction
    ? // 판정 반응이 있으면 LLM 대사를 덮는다 — 그쪽은 판정 «이전»에 쓰인 말이라,
      // 들통난 사람이 방금 한 거짓말을, 헛짚은 사람이 빗나간 지목을 계속 말하게 된다.
      null
    : (challengeLLMLine ??
      (isSuggester ? (live?.suggestionLine ?? null) : revealed ? declarationLLMLine : null))

  const art = suspectArtFor(player.characterId)
  /*
   * 카드는 스포트라이트가 지나가도 사라지지 않는다 — revealing(그 순간)이 아니라
   * revealed(공개된 뒤 쭉)에 건다. 사라지면 «나온다더니 없어졌다»는 피드백이 다시 나온다.
   */
  /*
   * 카드 실물은 «본 사람에게만» 뜬다. 비공개 반증이면 제안자 화면에만 나타난다 —
   * 감춰야 할 것을 그림으로 흘리지 않으려면 이름과 그림을 한 조건에 묶어야 한다.
   */
  const declaredCard =
    revealed && declaration?.claim.kind === 'refute' ? declaration.claim.cardId : null
  const revealCard = declaredCard
    ? { art: revealArtFor(scenario, declaredCard), name: label(declaredCard) }
    : null

  /*
   * 이의제기로 이번 라운드에 «새로» 열린 카드. 어떤 걸 왜 공개하는지 몰라 헷갈린다는
   * 피드백 — 이의제기 당사자(챌린저·타깃) 둘 중 이 좌석이 걸리면 카드와 사유를 함께 보여준다.
   */
  const challenge = live?.challenge
  const myChallengeCard = challenge?.reveals.find((r) => r.playerId === player.id) ?? null
  const challengeReveal = myChallengeCard
    ? {
        cardId: myChallengeCard.cardId,
        reason:
          player.id === challenge?.challengerId
            ? challenge.success
              ? '반증을 증명하려고 공개'
              : '잘못된 이의제기로 공개'
            : '위증이 들통나 공개',
      }
    : null

  return (
    <li
      className={[
        'seat',
        `seat--${slot}`,
        isTurn ? 'seat--turn' : '',
        player.isMe ? 'seat--me' : '',
        caught || shot ? 'seat--caught' : '',
        revealing ? 'seat--reveal' : '',
        isSuggester ? 'seat--suggester' : '',
        /* 제안자와 겹치지 않는다(제안자는 후보에서 빠진다). 그래도 순서상 뒤에 둬 색이 명확하다. */
        isDrawn ? 'seat--drawn' : '',
        /* 맨 뒤다 — 빠진 좌석이라는 사실이 그 라운드의 어떤 상태보다 위에서 읽혀야 한다. */
        out ? 'seat--out' : '',
      ]
        .join(' ')
        .trim()}
    >
      {/*
        사유 라벨을 붙이는 이유 — 옆의 대사(seat__line)는 LLM이 쓴 자유 텍스트라 엔진이
        기록한 claim.cardId와 다른 카드를 부를 수 있다(대사는 룰에 관여하지 않는다,
        engine/round.ts의 declareAll 주석). 실제로 «백나경 그 패, 내 손에 있다»처럼 제안에도 없는
        이름을 대는 사례가 나왔다. 좌석 이름과 용의자 카드 이름이 같아서(setup.ts:57)
        생기는 혼동이다. 이 카드가 엔진이 실제로 받은 유일한 사실이므로, 무엇인지
        말해 줘야 대사와 어긋날 때 플레이어가 어느 쪽을 믿을지 안다.
      */}
      {/*
        공개된 카드는 «묶어서» 좌석 안쪽에 둔다. 예전엔 반증 카드가 좌석 위(top:-0.6rem에
        translateY(-100%)), 이의제기 카드가 좌석 아래로 각자 삐져나가 있었는데, 좌석에는
        초상화를 자르려고 넣은 overflow:hidden이 걸려 있어 둘 다 통째로 잘려 화면에 뜬 적이 없다.
        안쪽에 두면 잘릴 일이 없고, 한 컨테이너에 흐르게 두면 둘이 동시에 떠도 겹치지 않는다.
      */}
      {(revealCard || challengeReveal) && (
        <span className="seat__reveals">
          {revealCard && (
            <span className="seat__reveal-card" tabIndex={0}>
              {revealCard.art && <img src={revealCard.art} alt="" />}
              <em>{revealCard.name}</em>
              <small>반증에 낸 카드</small>
            </span>
          )}
          {/* round로 키를 걸어 이의제기가 새로 벌어질 때마다 등장 연출이 다시 돈다. */}
          {challengeReveal && (
            <span
              key={`${live?.round}:${challengeReveal.cardId}`}
              className="seat__challenge-reveal"
              tabIndex={0}
            >
              {revealArtFor(scenario, challengeReveal.cardId) && (
                <img src={revealArtFor(scenario, challengeReveal.cardId)} alt="" />
              )}
              <em>{label(challengeReveal.cardId)}</em>
              <small>{challengeReveal.reason}</small>
            </span>
          )}
        </span>
      )}
      {/* 참가N/나로 익명화했더라도 얼굴은 있어야 «사람」으로 읽힌다 — 손패 노출과는 무관하다. */}
      {art && <img className="seat__art" src={art} alt="" />}
      <span className="seat__scrim" aria-hidden="true" />

      {/*
        번호와 상태 배지를 한 줄로 묶는다. 예전에는 셋이 각자 좌석 좌상단에 절대배치돼
        서로의 존재를 몰랐고, 그래서 「차례」·「제안」이 번호를 통째로 덮었다.
        묶어 두면 몇 개가 켜지든 나란히 흐르므로 겹칠 수가 없다.
      */}
      <span className="seat__tags">
        <span className="seat__face">{participantInitial(view, player.id)}</span>
        {isTurn && <span className="seat__turn-badge">차례</span>}
        {isSuggester && <span className="seat__suggest-badge">제안</span>}
        {/*
          추첨으로 반증 의무를 진 좌석. 이게 없으면 왜 다섯 중 둘만 입을 열었는지 읽히지
          않는다 — 「답할 자리였는데 넘겼다」와 「애초에 뽑히지 않았다」가 같은 침묵으로 보인다.

          **「반증」이라고 쓰지 않는다.** 이건 뽑혔다는 표시지 반증했다는 표시가 아닌데,
          카드를 낸 좌석과 「나는 그 패가 없구려」로 넘긴 좌석에 똑같이 붙는다. 08-07 플레이에서
          침묵한 좌석이 반증한 것으로 읽혀, 뱃지가 지우려던 그 혼동을 도로 만들었다.
        */}
        {isDrawn && (
          <span className="seat__draw-badge" title="추첨으로 답할 의무를 진 좌석">
            籤 호명
          </span>
        )}
        {shot && <span className="seat__shot-badge">寫 발각</span>}
        {/*
          「고발 실패로 빠졌고 반증만 한다」를 한 칸에 담는다. 뱃지 하나로 줄이는 이유는
          여기가 차례·제안·추첨과 같은 줄이라, 문장을 늘리면 다른 상태를 밀어내기 때문이다.
          나머지 설명은 커서를 올렸을 때 나온다.
        */}
        {out && (
          <span className="seat__out-badge" title="고발에 실패해 판에서 빠졌다 — 제안·고발·밀담·능력을 잃고 반증만 이어 간다">
            退 반증만
          </span>
        )}
      </span>

      <span className="seat__id">
        <span className="seat__name">{participantLabel(view, player.id)}</span>
        {/*
          누가 누군지 몰라 헷갈린다는 피드백 — 참가N은 그대로 두고(추리표·기록·이의제기가
          전부 이 번호로 부른다) 실명은 덧붙이기만 한다. 실명은 조서·진영 확인에서 이미
          공개했던 정보라 여기 다시 적어도 손패 소지와는 무관하다(둘은 원래 별개).
        */}
        {/*
          «서지혜»가 좌석 실명과 손패 카드 이름에 똑같이 맨 글자로 뜨면 같은 걸 가리키는 줄
          안다는 피드백 — 실명 앞에 "정체" 태그를 붙여 «이 사람의 진짜 정체는 X»라고
          읽히게 한다. 손패 카드는 그냥 카드 이름이라 태그가 없다는 점 자체가 구분 신호다.
        */}
        <span className="seat__title">
          <em>정체</em>
          <strong className="seat__title-name">{cardName(player.characterId)}</strong>
          <em>· 이 사건 속</em>
          {suspectTitle(scenario, player.characterId)}
        </span>
      </span>

      {/*
        고정 문구(say)와 LLM 대사(spoken)를 동시에 띄우면 한 좌석에 줄이 두 개 겹쳐 헷갈린다는
        피드백 — 대사가 있으면 그것만 보여주고, 없을 때(사람·규칙 기반 판단자·폴백)만 고정
        문구로 대체한다. 고정 문구 자체는 지우지 않는다 — 그게 절대 규칙 4의 폴백 표시다.
        key를 내용에 걸어 두면 발언이 바뀔 때마다 이 span이 새로 마운트돼 등장 애니메이션이
        다시 돈다 — 그냥 텍스트만 바꾸면 DOM 노드가 그대로라 아무 움직임도 안 보인다.
      */}
      {spoken ? (
        // 텍스트로만 그린다 — 이건 모델이 만든 문자열이다(절대 규칙 3).
        <span key={spoken} className="seat__line">
          “{spoken}”
        </span>
      ) : (
        <span key={say ?? 'silence'} className={`seat__say${say ? '' : ' seat__say--mute'}`}>
          {say ?? '…'}
        </span>
      )}

      {/*
        공개된 패는 «그 사람 자리에» 카드로 남는다.
        예전엔 「공개 넥타이 · 서재」처럼 한 줄 텍스트였는데, 이 판에서 카드는 전부 그림으로
        다뤄지므로(손패·제안·상 위) 여기만 글자면 같은 것이 다른 물건으로 읽힌다. 그리고
        이건 판이 끝날 때까지 남는 «증거»라, 대사처럼 흘러가는 줄과 같은 모양이면 안 된다.
      */}
      {player.revealed.length > 0 && (
        <ul className="seat__revealed">
          {/*
            중복을 걷어낸다. 엔진이 이의제기 성공 시 증명 카드를 «이미 공개된 것이어도»
            reveals에 다시 넣어서(engine/challenge.ts) revealed에 같은 id가 두 번 쌓일 수
            있다. 그대로 그리면 같은 카드가 두 장 보이고 key까지 충돌한다.
            근본 해결은 엔진 쪽이다 — 여기서는 화면이 깨지지 않게만 막는다.
          */}
          {[...new Set(player.revealed)].map((cardId) => (
            <li key={cardId} className="reveal-card" title={label(cardId)}>
              {revealArtFor(scenario, cardId) && (
                <img className="reveal-card__art" src={revealArtFor(scenario, cardId)} alt="" />
              )}
              <span className="reveal-card__name">{label(cardId)}</span>
            </li>
          ))}
        </ul>
      )}

      {/*
        제안 한 문장. 상 한가운데에 카드 석 장이 놓여 있어도 «누가 무엇을 주장했는가»로는
        읽히지 않는다 — 그림은 물건이고 주장은 문장이다. 제안자 좌석에 커서를 올리면
        그 석 장을 이어 붙인 말을 좌석 «안쪽»에 덮어 보여준다.

        밖으로 띄우는 말풍선이 아닌 이유는 .seat의 overflow:hidden이다. 밖으로 뻗으면
        통째로 잘려 화면에 뜨지 않는다 — 반증 카드가 예전에 그렇게 사라졌다(위 주석).
      */}
      {isSuggester && live && (
        <span className="seat__suggestion" tabIndex={0}>
          <em>이번 제안</em>
          {suggestionSentence(scenario, live.suggestion, player.characterId, `${live.round}`)}
        </span>
      )}

      {caught && <span className="seat__badge">위증</span>}
    </li>
  )
}
