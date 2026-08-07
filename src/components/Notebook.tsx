import { Fragment, useEffect, useState } from 'react'
import { cardLabel, participantLabel } from '../content/labels'
import { josa } from '../content/josa'
import type { Scenario } from '../content/scenarios'
import { CARDS } from '../engine/cards'
import { HAND_SIZE } from '../engine/setup'
import type { CardId, CardKind } from '../engine/types'
import type { GameView } from '../engine/view'

/* 코드상 kind는 weapon이지만 살인이 아닌 사건도 있어 화면에는 «수단»으로 적는다. */
const KIND_LABEL: Record<CardKind, string> = {
  suspect: '범인',
  weapon: '수단',
  place: '장소',
}

type Mark = '' | 'o' | 'x' | '?'
const NEXT_MARK: Record<Mark, Mark> = { '': 'o', o: 'x', x: '?', '?': '' }

/*
 * ●/×/? 세 기호만으로는 눌러보기 전엔 무슨 뜻인지 안 읽힌다는 피드백 — 글자 대신
 * 뜻이 바로 보이는 아이콘으로 바꾸고, 클래스명도 CSS 선택자에 못 쓰는 «?» 대신
 * 안전한 영문 접미사(suspect)를 쓴다.
 */
const MARK_INFO: Record<Mark, { glyph: string; className: string; title: string }> = {
  '': { glyph: '', className: 'blank', title: '미확인 — 눌러서 «있음»으로 표시한다' },
  o: {
    glyph: '✓',
    className: 'o',
    title: '있음 — 이 사람이 이 카드를 쥐고 있다는 표시다. 눌러서 «없음»으로 바뀐다',
  },
  x: {
    glyph: '✕',
    className: 'x',
    title: '없음 — 이 사람에게 이 카드가 없다는 표시다. 눌러서 «의심»으로 바뀐다',
  },
  '?': {
    glyph: '?',
    className: 'suspect',
    title: '의심 — 확실친 않지만 의심된다는 표시다. 눌러서 지운다',
  },
}

interface Props {
  view: GameView
  scenario: Scenario
  /** 제안·고발처럼 카드를 골라야 하는 상황인가. */
  picking: boolean
  picked: Partial<Record<CardKind, CardId>>
  onPick: (kind: CardKind, cardId: CardId) => void
}

/**
 * 클루의 종이 추리표. 행=카드, 열=참가자.
 *
 * 제안과 고발도 여기서 한다. 별도 패널을 띄우면 고를 때 정작 표가 가려진다 —
 * 목업에서 실제로 그랬다.
 */
export default function Notebook({ view, scenario, picking, picked, onPick }: Props) {
  const [marks, setMarks] = useState<Record<string, Mark>>({})
  const [warning, setWarning] = useState<string | null>(null)
  const label = (id: CardId) => cardLabel(scenario, id)

  const self = view.players.find((p) => p.isMe)
  const myHand = self?.hand ?? []

  /*
   * 봉인된 정답. **범인 진영에게만 채워져 있다**(engine/view.ts) — 시민에게는 null이라
   * 아래 표시가 통째로 사라진다. 화면에서 진영을 따로 묻지 않는 이유가 이것이다.
   *
   * 내 패 패널에도 같은 정보가 있지만, 추리하는 동안 눈이 머무는 곳은 이 표다.
   * 매번 패널을 열어 대조하게 두면 「무엇을 감춰야 하는가」가 손에 잡히지 않는다.
   */
  const solution = view.solution
  const isSolution = (cardId: CardId): boolean =>
    solution !== null &&
    (solution.suspect === cardId || solution.weapon === cardId || solution.place === cardId)

  /* 세 칸을 한 번에 안내하지 않고 지금 뭘 골라야 하는지 한 단계씩만 짚어준다. */
  const pickGuide = !picked.suspect
    ? '범인을 선택하세요'
    : !picked.weapon
      ? '이제 수단을 선택하세요'
      : !picked.place
        ? '이제 장소를 선택하세요'
        : '다 골랐다 — 아래 버튼을 눌러 제출한다'

  useEffect(() => {
    if (!warning) return
    const id = window.setTimeout(() => setWarning(null), 2600)
    return () => window.clearTimeout(id)
  }, [warning])

  /** 실제로 보유가 «확인된» 카드인가. 내 손패와 공개된 패 둘뿐이다. */
  const isKnown = (cardId: CardId, player: GameView['players'][number]): boolean =>
    (player.isMe && myHand.includes(cardId)) || player.revealed.includes(cardId)

  /** 이 사람 몫으로 잡혀 있는가. 확인된 것과 손으로 찍은 ✓를 함께 센다. */
  const holds = (cardId: CardId, player: GameView['players'][number]): boolean =>
    isKnown(cardId, player) || marks[`${cardId}:${player.id}`] === 'o'

  /** 카드 한 장은 한 사람만 쥔다 — 이 행에 이미 «있음»으로 잡힌 다른 사람이 있는가. */
  const heldElsewhere = (cardId: CardId, exceptPlayerId: string): boolean =>
    view.players.some((player) => player.id !== exceptPlayerId && holds(cardId, player))

  /*
   * 손패는 정확히 HAND_SIZE장이다. ✓가 그만큼 차면 그 사람의 «나머지 칸»은 더 볼 것 없이 ✕다 —
   * 소거법의 절반이 여기서 공짜로 나온다. 눈으로 세지 않아도 되게 표가 대신 닫아준다.
   *
   * state에 ✕를 써넣지 않고 그릴 때 «파생»시킨다. 되돌릴 수 있어야 하기 때문이다 —
   * ✓ 하나를 잘못 찍었다가 지우면 잠겼던 칸이 원래 표시 그대로 돌아와야 한다.
   */
  const sealed = new Set(
    view.players
      .filter((player) => CARDS.filter((card) => holds(card.id, player)).length >= HAND_SIZE)
      .map((player) => player.id),
  )

  const toggle = (cardId: CardId, playerId: string) => {
    const key = `${cardId}:${playerId}`
    const next = NEXT_MARK[marks[key] ?? '']

    if (next === 'o' && heldElsewhere(cardId, playerId)) {
      setWarning(`${josa(label(cardId), 'eun')} 이미 다른 사람 몫으로 표시돼 있다 — 한 장은 한 사람만 쥔다.`)
      return
    }

    setWarning(null)
    setMarks((prev) => ({ ...prev, [key]: next }))
  }

  let lastKind: CardKind | null = null

  return (
    <div className="nb">
      <table className="nb__table">
        <thead>
          <tr>
            <th className="nb__corner" />
            {view.players.map((p) => (
              <th key={p.id} className="nb__head">
                <span className={p.isMe ? 'nb__head--me' : undefined}>
                  {participantLabel(view, p.id)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {CARDS.map((card) => {
            const isNewGroup = card.kind !== lastKind
            lastKind = card.kind
            const isPicked = picked[card.kind] === card.id
            const sealedAnswer = isSolution(card.id)

            return (
              <Fragment key={card.id}>
                {/*
                  종류 이름은 «머리 줄»로 따로 세운다. 첫 카드 칸 안에 넣으면
                  「범인 강도윤」처럼 한 줄에 붙어, 그 줄만 다른 줄보다 넓어지거나
                  종류가 카드 이름의 일부처럼 읽힌다 — 둘 다 신고된 증상이다.
                  줄을 나누면 카드 이름이 종류 «아래»로 가고 데이터 줄 높이는 전부 같아진다.
                */}
                {isNewGroup && (
                  <tr className="nb__group">
                    <th
                      className="nb__group-label"
                      colSpan={1 + view.players.length}
                      scope="colgroup"
                    >
                      {KIND_LABEL[card.kind]}
                    </th>
                  </tr>
                )}
              {/*
               * 고른 줄은 «칸»이 아니라 «줄»로 표시한다. 이름 칸에만 색을 물리면
               * 표가 빽빽해서 지금 뭘 골랐는지 눈으로 찾아야 한다 — 셋을 다 고르는
               * 동안 시선은 원탁에 가 있으므로, 돌아왔을 때 바로 걸려야 한다.
               */}
              <tr
                className={[isPicked ? 'nb__row--picked' : '', sealedAnswer ? 'nb__row--answer' : '']
                  .join(' ')
                  .trim() || undefined}
              >
                <th className="nb__label" scope="row">
                  {/* 봉인 인장. 범인에게만 뜬다 — 시민 시야에는 solution이 없다. */}
                  {sealedAnswer && (
                    <span className="nb__answer" title="봉인된 정답 — 나만 안다">
                      封
                    </span>
                  )}
                  {picking ? (
                    <button
                      type="button"
                      className={`nb__pick${isPicked ? ' nb__pick--on' : ''}`}
                      aria-pressed={isPicked}
                      onClick={() => onPick(card.kind, card.id)}
                    >
                      {label(card.id)}
                    </button>
                  ) : (
                    label(card.id)
                  )}
                </th>
                {view.players.map((player) => {
                  const known = isKnown(card.id, player)
                  const mine = holds(card.id, player)
                  /* 손패가 다 찬 사람의 «나머지» 칸. 여기는 논리적으로 ✕가 확정이다. */
                  const isSealed = sealed.has(player.id) && !mine
                  const mark: Mark = mine ? 'o' : isSealed ? 'x' : (marks[`${card.id}:${player.id}`] ?? '')
                  const info = MARK_INFO[mark]
                  const title = known
                    ? '확정됨 — 실제로 보유가 확인된 카드다. 바꿀 수 없다'
                    : isSealed
                      ? `손패 ${HAND_SIZE}장이 다 찼다 — 이 사람에게 남은 카드는 없다`
                      : info.title

                  return (
                    <td key={player.id}>
                      <button
                        type="button"
                        className={`nb__cell nb__cell--${info.className}${known ? ' nb__cell--fixed' : ''}${isSealed ? ' nb__cell--sealed' : ''}`}
                        disabled={known || isSealed}
                        onClick={() => toggle(card.id, player.id)}
                        title={title}
                        aria-label={`${label(card.id)} / ${participantLabel(view, player.id)} — ${title}`}
                      >
                        {info.glyph}
                      </button>
                    </td>
                  )
                })}
              </tr>
              </Fragment>
            )
          })}
        </tbody>
      </table>
      {warning && (
        <p className="nb__warning" key={warning} role="alert">
          {warning}
        </p>
      )}
      <p key={pickGuide} className="nb__hint">
        {picking
          ? pickGuide
          : `칸을 눌러 ✓ 있음 → ✕ 없음 → ? 의심 순으로 바꾼다. 칸에 커서를 올리면 뜻이 뜬다. 확정된 칸은 잠기고, 한 사람의 ✓가 ${HAND_SIZE}개가 되면 그 사람의 남은 칸은 자동으로 닫힌다.`}
      </p>
    </div>
  )
}
