import { useState } from 'react'
import { CARDS, cardName } from '../engine/cards'
import type { CardId, CardKind } from '../engine/types'
import type { GameView } from '../engine/view'

const KIND_LABEL: Record<CardKind, string> = {
  suspect: '범인',
  weapon: '흉기',
  place: '장소',
}

type Mark = '' | 'o' | 'x' | '?'
const NEXT_MARK: Record<Mark, Mark> = { '': 'o', o: 'x', x: '?', '?': '' }

interface Props {
  view: GameView
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
export default function Notebook({ view, picking, picked, onPick }: Props) {
  const [marks, setMarks] = useState<Record<string, Mark>>({})

  const self = view.players.find((p) => p.isMe)
  const myHand = self?.hand ?? []

  const toggle = (cardId: CardId, playerId: string) => {
    const key = `${cardId}:${playerId}`
    setMarks((prev) => ({ ...prev, [key]: NEXT_MARK[prev[key] ?? ''] }))
  }

  let lastKind: CardKind | null = null

  return (
    <div className="nb">
      <table className="nb__table">
        <thead>
          <tr>
            <th className="nb__corner" />
            {view.players.map((p) => (
              <th key={p.id} className="nb__head" title={p.name}>
                <span className={p.isMe ? 'nb__head--me' : undefined}>{p.name.slice(1)}</span>
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
                      {card.name}
                    </button>
                  ) : (
                    card.name
                  )}
                </th>
                {view.players.map((player) => {
                  const known =
                    (player.isMe && myHand.includes(card.id)) || player.revealed.includes(card.id)
                  const mark = known ? 'o' : (marks[`${card.id}:${player.id}`] ?? '')

                  return (
                    <td key={player.id} className={isNewGroup ? 'nb__cell-top' : undefined}>
                      <button
                        type="button"
                        className={`nb__cell nb__cell--${mark || 'blank'}${known ? ' nb__cell--fixed' : ''}`}
                        disabled={known}
                        onClick={() => toggle(card.id, player.id)}
                        aria-label={`${cardName(card.id)} / ${player.name}`}
                      >
                        {mark === 'o' ? '●' : mark === 'x' ? '×' : mark}
                      </button>
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="nb__hint">
        {picking
          ? '카드 이름을 눌러 범인·흉기·장소를 하나씩 고른다.'
          : '칸을 눌러 ● 있음 → × 없음 → ? 의심 순으로 바꾼다. 확정된 칸은 잠긴다.'}
      </p>
    </div>
  )
}
