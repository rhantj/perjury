import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cardLabel } from '../content/labels'
import { placeArtFor } from '../content/place-art'
import { ROLE_ART } from '../content/role-art'
import type { Role } from '../content/roles'
import type { Scenario } from '../content/scenarios'
import { suspectArtFor } from '../content/suspect-art'
import { weaponArtFor } from '../content/weapon-art'
import { cardKind } from '../engine/cards'
import type { CardId, CardKind } from '../engine/types'
import type { GameView } from '../engine/view'

/** 탭↔패널을 오갈 때 살짝 여유를 둬 끊기지 않게 한다. */
const CLOSE_DELAY_MS = 150

interface Props {
  view: GameView
  scenario: Scenario
  role: Role
}

const KIND_LABEL: Record<CardKind, string> = {
  suspect: '용의자',
  weapon: '수단',
  place: '장소',
}

/** 손패 카드 사진. Briefing의 HandCard와 같은 소스를 쓴다 — 게임 내내 같은 카드로 읽혀야 한다. */
function artFor(scenario: Scenario, id: CardId): string | undefined {
  return suspectArtFor(id) ?? placeArtFor(scenario, id) ?? weaponArtFor(scenario, id)
}

/**
 * 내 패. **나만 보는 정보라는 것이 생김새로 드러나야 한다** —
 * 좌석·추리표와 같은 판때기에 얹으면 남들도 보는 것처럼 읽힌다.
 * 그래서 붉은 봉인선을 두르고 「密」을 찍는다.
 *
 * 범인 진영에게는 봉인된 정답도 여기 붙는다. 브리핑에서 한 번 보여주고 마는 것이 아니라
 * 판이 도는 내내 손 닿는 곳에 있어야 «감추는 쪽»의 플레이가 가능하다.
 */
export default function MyPlate({ view, scenario, role }: Props) {
  const me = view.players.find((p) => p.isMe)
  const culprit = me?.faction === 'culprit'
  const hand = me?.hand ?? []
  const solution = view.solution
  const label = (id: CardId) => cardLabel(scenario, id)

  /*
   * 상시 폭을 먹던 판때기를 탭 하나로 줄이고, 호버·포커스에서만 패널을 띄운다 —
   * 그만큼 원탁·추리표가 커진다.
   *
   * 패널은 body로 포탈한다. .board > *에 z-index:1이 걸려 있어, 포탈하지 않으면
   * .plate-flyout(그 규칙을 물려받는 MyPlate의 뿌리)이 독립된 쌓임 맥락을 만들고,
   * 그 안에 있는 position:fixed 패널은 z-index를 아무리 올려도 그 맥락 밖으로
   *못 나간다 — DOM 순서상 뒤에 오는 원탁·추리표(둘 다 z-index:1)에 가려
   * 완전히 안 보이게 된다. Opening·Verdict·LogDrawer와 같은 이유의 같은 처방이다.
   *
   * 포탈하면 CSS만으로 :hover가 안 이어지므로(패널이 더 이상 탭의 DOM 자손이
   * 아니다) 호버 상태를 JS로 들고, 탭↔패널 사이를 오갈 때 끊기지 않게 살짝
   * 닫힘을 지연시킨다.
   */
  const [open, setOpen] = useState(false)
  const closeTimer = useRef<number | null>(null)

  const cancelClose = () => {
    if (closeTimer.current === null) return
    window.clearTimeout(closeTimer.current)
    closeTimer.current = null
  }
  const openNow = () => {
    cancelClose()
    setOpen(true)
  }
  const scheduleClose = () => {
    cancelClose()
    closeTimer.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY_MS)
  }

  return (
    <div className="plate-flyout">
      <button
        type="button"
        className="plate-flyout__tab"
        aria-label="나만 보는 패 열기"
        onMouseEnter={openNow}
        onMouseLeave={scheduleClose}
        onFocus={openNow}
        onBlur={scheduleClose}
        onClick={() => setOpen((v) => !v)}
      >
        <span>密 나만 보는 패</span>
      </button>

      {open &&
        createPortal(
          <aside
            className={`plate plate-flyout__panel plate--${culprit ? 'culprit' : 'citizen'}`}
            onMouseEnter={openNow}
            onMouseLeave={scheduleClose}
          >
      <header className="plate__head">
        <span className="plate__kicker">密 · 나만 보는 패</span>
        <span className="plate__faction">{culprit ? '범인' : '시민'}</span>
      </header>

      <div className="plate__who">
        <img className="plate__art" src={ROLE_ART[role.id]} alt="" width={340} height={482} />
        <span className="plate__duty">
          <span className="plate__role">
            {role.ko}
            <em>{role.hanja}</em>
          </span>
          <span className="plate__power">{role.power}</span>
          <span className="plate__once">壹回</span>
        </span>
      </div>

      <section className="plate__cards">
        <h2 className="plate__label">손패</h2>
        <ul>
          {hand.map((id) => {
            const art = artFor(scenario, id)
            /*
             * 이의제기에 걸려 위증이 확정되면 이 카드가 강제로 열린다 — 그 순간의 화면 전체
             * 연출(action-flash--caught)이 지나간 뒤에도 «내가 뭘 잃었는지»가 손패에 계속
             * 남아 있어야 한다는 피드백. me.revealed에 있으면 여기서 계속 도장을 찍어 둔다.
             */
            const revealed = me?.revealed.includes(id) ?? false
            return (
              <li
                key={id}
                className={`held held--${cardKind(id)}${art ? ' held--has-art' : ''}${revealed ? ' held--revealed' : ''}`}
              >
                {art && <img className="held__art" src={art} alt="" />}
                <span className="held__scrim" aria-hidden="true" />
                <span className="held__kind">{KIND_LABEL[cardKind(id)]}</span>
                <span className="held__name">{label(id)}</span>
                {revealed && <span className="held__revealed-stamp">公開 공개됨</span>}
              </li>
            )
          })}
        </ul>
      </section>

      {solution && (
        <section className="plate__cards plate__cards--sealed">
          <h2 className="plate__label">봉인된 정답</h2>
          <ul>
            {[solution.suspect, solution.weapon, solution.place].map((id) => {
              const art = artFor(scenario, id)
              return (
                <li key={id} className={`held held--sealed${art ? ' held--has-art' : ''}`}>
                  {art && <img className="held__art" src={art} alt="" />}
                  <span className="held__scrim" aria-hidden="true" />
                  <span className="held__kind">{KIND_LABEL[cardKind(id)]}</span>
                  <span className="held__name">{label(id)}</span>
                </li>
              )
            })}
          </ul>
        </section>
      )}
          </aside>,
          document.body,
        )}
    </div>
  )
}
