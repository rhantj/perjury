import { useState } from 'react'
import { cardLabel, participantLabel } from '../content/labels'
import { cardsOfKind } from '../engine/cards'
import type { Scenario } from '../content/scenarios'
import type { Role } from '../content/roles'
import type { PowerIntent } from '../engine/power'
import type { Grant } from '../engine/types'
import type { GameView } from '../engine/view'

interface PowerPanelProps {
  view: GameView
  scenario: Scenario
  role: Role
  /** 이미 썼는가. 능력은 한 판에 한 번뿐이다. */
  used: boolean
  /** 능력으로 확인한 것. 쓰기 전에는 비어 있다. */
  findings: readonly Grant[]
  /** 사람이 조작할 수 있는 때인가. AI가 판단 중이면 false다. */
  enabled: boolean
  onUse: (intent: PowerIntent) => void
}

/**
 * 직업 능력 발동.
 *
 * **종류를 화면이 정하지 않는다.** 고르는 것은 «대상»뿐이고, 무슨 능력인지는
 * 좌석에 배정된 직업에서 나온다(store.usePower). 화면 버그가 룰 위반이 되지 않게 하는 지점이다.
 *
 * `role.effect`가 null이면 아직 발동이 구현되지 않은 직업이다 — 아무것도 그리지 않는다.
 * 그 직업도 배정에는 나오므로 손패 화면의 능력 «문구»는 그대로 남는다.
 */
export default function PowerPanel({
  view,
  scenario,
  role,
  used,
  findings,
  enabled,
  onUse,
}: PowerPanelProps) {
  const [picking, setPicking] = useState(false)

  if (role.effect === null) return null

  if (used) {
    return (
      <div className="power power--spent">
        <span className="power__mark">已 능력 소진</span>
        {findings.length > 0 ? (
          <ul className="power__found">
            {findings.map((grant) => (
              <li key={`${grant.round}:${grant.finding.kind}`}>
                {describe(scenario, view, grant)}
              </li>
            ))}
          </ul>
        ) : (
          /* 지목만 하고 답은 나중에 나오는 능력(순사·사진사 등)이 여기 머문다. */
          <p className="power__waiting">결과를 기다린다</p>
        )}
      </div>
    )
  }

  if (!picking) {
    return (
      <div className="power">
        <button
          type="button"
          className="power__fire"
          disabled={!enabled}
          onClick={() => setPicking(true)}
        >
          능력 발동
        </button>
      </div>
    )
  }

  const choose = (intent: PowerIntent) => {
    setPicking(false)
    onUse(intent)
  }

  return (
    <div className="power power--picking">
      <span className="power__ask">{ASK[role.effect] ?? '대상을 고르시오'}</span>
      <ul className="power__opts">
        {role.effect === 'check-weapon'
          ? cardsOfKind('weapon').map((card) => (
              <li key={card.id}>
                <button
                  type="button"
                  className="power__pick"
                  onClick={() => choose({ cardId: card.id })}
                >
                  {cardLabel(scenario, card.id)}
                </button>
              </li>
            ))
          : view.players
              .filter((player) => !player.isMe)
              .map((player) => (
                <li key={player.id}>
                  <button
                    type="button"
                    className="power__pick"
                    onClick={() => choose({ targetId: player.id })}
                  >
                    {participantLabel(view, player.id)}
                  </button>
                </li>
              ))}
      </ul>
      <button type="button" className="power__cancel" onClick={() => setPicking(false)}>
        무른다
      </button>
    </div>
  )
}

/** 능력마다 무엇을 고르는지가 다르다. 문구는 직업이 아니라 «고를 것»을 가리킨다. */
const ASK: Partial<Record<NonNullable<Role['effect']>, string>> = {
  'inspect-hand': '누구의 손패를 볼 것인가',
  'check-weapon': '어느 수단을 확인할 것인가',
}

/**
 * 확인한 것을 한 줄로 옮긴다.
 *
 * «능력으로 확인했다»가 문장에 남아야 한다 — 추리표의 추측과 같은 무게로 읽히면
 * 이 능력이 준 확실성이 사라진다.
 */
function describe(scenario: Scenario, view: GameView, grant: Grant): string {
  const finding = grant.finding
  switch (finding.kind) {
    case 'hand':
      return `${participantLabel(view, finding.targetId)}는 «${cardLabel(scenario, finding.cardId)}»를 쥐고 있다`
    case 'weapon':
      return `«${cardLabel(scenario, finding.cardId)}»는 사건의 수단이 ${finding.isSolution ? '맞다' : '아니다'}`
    case 'claim':
      return `${participantLabel(view, finding.targetId)}의 반증은 ${finding.truthful ? '참이었다' : '거짓이었다'}`
  }
}
