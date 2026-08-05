import { useState } from 'react'
import { cardLabel, participantLabel } from '../content/labels'
import { cardsOfKind } from '../engine/cards'
import { needsOf, usableIn } from '../engine/power'
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
  /*
   * 반증 요구 거부는 반증 줄의 버튼으로 쓴다 — 쓰는 순간이 곧 선언하는 순간이라
   * 패널에서 미리 켜두면 두 번 조작하게 된다. 쓴 뒤의 표시는 여기 남긴다.
   */
  if (role.effect === 'refuse-demand' && !used) return null

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
          /* 알려줄 것이 없는 능력이 여기 머문다 — 답이 나중에 오거나(순사), 원래 없거나(밀정). */
          <p className="power__waiting">{SPENT[role.effect] ?? '결과를 기다린다'}</p>
        )}
      </div>
    )
  }

  if (!picking) {
    // 지금 눌러도 엔진이 거부하는 능력이 있다(순사는 선언 뒤에 지목해봐야 답이 없다).
    // 눌렀다가 오류를 보게 두는 대신 미리 잠근다 — 판정은 엔진 것을 그대로 쓴다.
    const inTime = usableIn(role.effect, view)
    // 고를 것이 없는 능력은 고르는 단계를 건너뛴다. 빈 목록을 보여줄 이유가 없다.
    const noTarget = needsOf(role.effect) === 'none'
    return (
      <div className="power">
        <button
          type="button"
          className="power__fire"
          disabled={!enabled || !inTime}
          onClick={() => (noTarget ? onUse({}) : setPicking(true))}
        >
          능력 발동
        </button>
        {!inTime && <span className="power__late">이번 라운드는 때를 놓쳤다</span>}
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
  'verify-claim': '누구의 반증을 확인할 것인가',
  photograph: '누구를 촬영할 것인가',
  publish: '누구의 지난 선언을 신문에 실을 것인가',
  frame: '누구의 반증을 조작할 것인가',
}

/** 알려줄 사실이 «원래» 없는 능력. 기다린다고 쓰면 오지 않을 답을 기다리게 된다. */
const SPENT: Partial<Record<NonNullable<Role['effect']>, string>> = {
  shield: '뒤를 봐주는 자가 붙었다',
  // 결과는 좌석 배지로 전체에 뜬다. 여기서 다시 알려줄 것이 없다.
  photograph: '촬영해 두었다 — 다음 라운드에 거짓을 말하면 드러난다',
  // 결과는 기록에 남아 전원이 읽는다. 여기서 다시 알려줄 것이 없다.
  publish: '신문에 실었다 — 기록에서 읽을 수 있다',
  // 이쪽은 패널이 아니라 반증 줄의 「답변 거부」 버튼으로 쓴다.
  'refuse-demand': '이번 반증 요구에 답하지 않는다',
  // 결과는 그 좌석의 기록에 그대로 나타난다. 여기서 다시 알려주면 조작한 쪽이 드러난다.
  frame: '이번 라운드 그의 반증에 손을 써두었다',
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
