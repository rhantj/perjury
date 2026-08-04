import { useEffect, useState } from 'react'
import { cardLabel, participantLabel } from '../content/labels'
import { josa } from '../content/josa'
import type { Scenario } from '../content/scenarios'
import { CARDS } from '../engine/cards'
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

  /** 카드 한 장은 한 사람만 쥔다 — 이 행에 이미 «있음»으로 잡힌 다른 사람이 있는가. */
  const heldElsewhere = (cardId: CardId, exceptPlayerId: string): boolean =>
    view.players.some((player) => {
      if (player.id === exceptPlayerId) return false
      const known = (player.isMe && myHand.includes(cardId)) || player.revealed.includes(cardId)
      return known || marks[`${cardId}:${player.id}`] === 'o'
    })

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

            return (
              <tr key={card.id}>
                <th className="nb__label" scope="row">
                  {isNewGroup && <span className="nb__kind">{KIND_LABEL[card.kind]}</span>}
                  {picking ? (
                    <button
                      type="button"
                      className={`nb__pick${isPicked ? ' nb__pick--on' : ''}`}
                      onClick={() => onPick(card.kind, card.id)}
                    >
                      {label(card.id)}
                    </button>
                  ) : (
                    label(card.id)
                  )}
                </th>
                {view.players.map((player) => {
                  const known =
                    (player.isMe && myHand.includes(card.id)) || player.revealed.includes(card.id)
                  const mark = known ? 'o' : (marks[`${card.id}:${player.id}`] ?? '')
                  const info = MARK_INFO[mark]
                  const title = known
                    ? '확정됨 — 실제로 보유가 확인된 카드다. 바꿀 수 없다'
                    : info.title

                  return (
                    <td key={player.id} className={isNewGroup ? 'nb__cell-top' : undefined}>
                      <button
                        type="button"
                        className={`nb__cell nb__cell--${info.className}${known ? ' nb__cell--fixed' : ''}`}
                        disabled={known}
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
          : '칸을 눌러 ✓ 있음 → ✕ 없음 → ? 의심 순으로 바꾼다. 칸에 커서를 올리면 뜻이 뜬다. 확정된 칸은 잠긴다.'}
      </p>
    </div>
  )
}
