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

  return (
    /*
     * 상시 폭을 먹던 판때기를 탭 하나로 줄이고, 호버·포커스에서만 패널로 펼친다 —
     * 그만큼 원탁·추리표가 커진다. 탭과 패널이 같은 wrapper의 자식이라
     * 순수 CSS :hover/:focus-within만으로 열고 닫힌다(둘 사이를 오갈 때 끊기지 않는다).
     */
    <div className="plate-flyout">
      <button type="button" className="plate-flyout__tab" aria-label="나만 보는 패 열기">
        <span>密 나만 보는 패</span>
      </button>

      <aside className={`plate plate-flyout__panel plate--${culprit ? 'culprit' : 'citizen'}`}>
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
            return (
              <li key={id} className={`held held--${cardKind(id)}${art ? ' held--has-art' : ''}`}>
                {art && <img className="held__art" src={art} alt="" />}
                <span className="held__scrim" aria-hidden="true" />
                <span className="held__kind">{KIND_LABEL[cardKind(id)]}</span>
                <span className="held__name">{label(id)}</span>
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
      </aside>
    </div>
  )
}
