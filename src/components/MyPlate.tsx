import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cardLabel } from '../content/labels'
import { placeArtFor } from '../content/place-art'
import { ROLE_ART, ROLE_ART_SIZE } from '../content/role-art'
import type { Role } from '../content/roles'
import type { Scenario } from '../content/scenarios'
import { suspectArtFor } from '../content/suspect-art'
import { weaponArtFor } from '../content/weapon-art'
import { cardKind } from '../engine/cards'
import { usableIn } from '../engine/power'
import type { CardId, CardKind } from '../engine/types'
import type { GameView } from '../engine/view'

/** 탭↔패널을 오갈 때 살짝 여유를 둬 끊기지 않게 한다. */
const CLOSE_DELAY_MS = 150

interface Props {
  view: GameView
  scenario: Scenario
  role: Role
  /**
   * 능력 발동 슬롯. MyPlate가 store를 알지 않게 GameScreen이 만들어 넣는다 —
   * 능력은 «나만 보는 패»에 붙어야 읽히지만, 이 컴포넌트는 그대로 표현 전용으로 둔다.
   */
  powerSlot?: ReactNode
  /**
   * 능력을 이미 썼는가. 판당 한 번뿐이라 «남았는가»가 계속 보여야 한다 —
   * 발동 패널은 조건이 안 맞으면 버튼이 사라지므로, 직업 카드 자체가 상태를 들고 있어야 한다.
   */
  powerUsed: boolean
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
export default function MyPlate({ view, scenario, role, powerSlot, powerUsed }: Props) {
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
  /*
   * 쓸 수 있는 능력이 남아 있는가. 「직업 능력을 못 썼다」는 피드백에서 나왔다 —
   * 발동은 이 탭을 열어야 나오는데 탭에는 아무 신호가 없어서, 판이 끝날 때까지
   * 능력이 있다는 사실 자체를 모르고 지나간다.
   *
   * 밀정·전화교환수는 뺀다. 둘은 «켜는» 능력이 아니라 저절로 도는 것이라
   * (engine/challenge.ts의 autoShield, 결정 007의 회선) 여기서 부르면
   * 「눌러야 할 것이 남았다」는 거짓 신호가 된다.
   */
  const powerReady =
    !powerUsed &&
    role.effect !== null &&
    role.effect !== 'shield' &&
    role.effect !== 'eavesdrop' &&
    usableIn(role.effect, view)

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
        className={`plate-flyout__tab${powerReady ? ' plate-flyout__tab--ready' : ''}`}
        aria-label={
          powerReady ? '나만 보는 패 열기 — 쓸 수 있는 직업 능력이 있다' : '나만 보는 패 열기'
        }
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

      {/*
        쓴 능력은 카드째로 물러난다. 「壹回」가 「已使」로 바뀌는 것만으로는 글자가 작아
        눈에 안 걸리므로, 초상과 글자에서 색을 빼 «다 쓴 패»로 읽히게 한다.
      */}
      <div className={`plate__who${powerUsed ? ' plate__who--spent' : ''}`}>
        <img
          className="plate__art"
          src={ROLE_ART[role.id]}
          alt=""
          width={ROLE_ART_SIZE[role.id]?.w}
          height={ROLE_ART_SIZE[role.id]?.h}
        />
        <span className="plate__duty">
          <span className="plate__role">
            {role.ko}
            <em>{role.hanja}</em>
          </span>
          <span className="plate__power">{role.power}</span>
          <span className="plate__once">{powerUsed ? '已使' : '壹回'}</span>
        </span>
      </div>

      {powerSlot}

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
