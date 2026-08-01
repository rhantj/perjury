import { useState } from 'react'
import { CARDS, CHARACTERS, KIND_LABEL, MY_HAND, type CardKind } from './fixtures'

type Mark = '' | 'o' | 'x' | '?'

const NEXT_MARK: Record<Mark, Mark> = { '': 'o', o: 'x', x: '?', '?': '' }

/**
 * 클루의 종이 추리표. 행=카드, 열=참가자.
 * 이 화면의 목적은 15장 × 6명 = 90칸이 패널에 들어가는지 확인하는 것이다.
 */
export default function Notebook() {
  const [marks, setMarks] = useState<Record<string, Mark>>({})

  const toggle = (cardId: string, charId: string) => {
    const key = `${cardId}:${charId}`
    setMarks((prev) => ({ ...prev, [key]: NEXT_MARK[prev[key] ?? ''] }))
  }

  let lastKind: CardKind | null = null

  return (
    <div className="nb">
      <table className="nb__table">
        <thead>
          <tr>
            <th className="nb__corner" />
            {CHARACTERS.map((c) => (
              <th key={c.id} className="nb__head" title={c.name}>
                <span className={c.isPlayer ? 'nb__head-me' : undefined}>
                  {c.name.slice(1)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {CARDS.map((card) => {
            const isNewGroup = card.kind !== lastKind
            lastKind = card.kind
            return (
              <tr key={card.id} className={isNewGroup ? 'nb__row--group' : undefined}>
                <th className="nb__label" scope="row">
                  {isNewGroup && <span className="nb__kind">{KIND_LABEL[card.kind]}</span>}
                  {card.name}
                </th>
                {CHARACTERS.map((char) => {
                  const held = char.isPlayer && MY_HAND.includes(card.id)
                  const mark = held ? 'o' : (marks[`${card.id}:${char.id}`] ?? '')
                  return (
                    <td key={char.id}>
                      <button
                        type="button"
                        className={`nb__cell nb__cell--${mark || 'blank'}${held ? ' nb__cell--fixed' : ''}`}
                        disabled={held}
                        onClick={() => toggle(card.id, char.id)}
                        aria-label={`${card.name} / ${char.name}`}
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
        칸을 눌러 <b>● 있음 → × 없음 → ? 의심</b> 순으로 바꾼다. 내 손패는 자동 확정.
      </p>
    </div>
  )
}
