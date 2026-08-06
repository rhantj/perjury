import { createPortal } from 'react-dom'
import type { CSSProperties } from 'react'
import type { PlayerId } from '../engine/types'

/** 추첨통에 들어간 명패 하나. 제안자를 뺀 후보 전원이 좌석 순서대로 들어온다. */
export interface Plate {
  readonly id: PlayerId
  readonly name: string
  readonly drawn: boolean
}

/**
 * 이 컷이 화면에 머무는 시간. **game.css의 draw-cut-* 키프레임 총길이와 쌍이다.**
 * 한쪽만 고치면 연출이 끝나기 전에 잘리거나, 끝난 뒤에도 빈 화면이 남는다.
 */
export const DRAW_CUT_MS = 3600

/**
 * 반증 추첨 컷. 「누가 뽑혔는가」를 배지로만 알리던 것을 뽑는 «과정»으로 보여준다.
 *
 * **읽기 전용 연출이다.** 뽑기는 엔진이 시드로 이미 끝냈고(engine/round.ts drawResponders),
 * 여기서는 그 결과를 받아 그리기만 한다. 화면이 뽑으면 같은 시드가 다른 판이 된다.
 *
 * body에 직접 붙이는 이유는 Opening·LogDrawer와 같다 — .screen 안에 두면
 * 게임판이 만드는 쌓임 맥락에 갇혀 position:fixed와 z-index가 통째로 무시된다.
 */
export default function DrawCut({ plates }: { plates: readonly Plate[] }) {
  /*
   * 뽑힌 명패가 설 자리 번호. 좌석 순서(--i)와 별개로 매긴다 —
   * 좌석 번호로 자리를 잡으면 p1·p2가 뽑힌 판과 p1·p5가 뽑힌 판의 간격이 달라진다.
   */
  let slot = -1
  const drawnNames = plates.filter((p) => p.drawn).map((p) => p.name)

  return createPortal(
    <div className="draw-cut" role="status" aria-label={`반증 추첨 — ${drawnNames.join(', ')}`}>
      <div className="draw-cut__stage" aria-hidden="true">
        <p className="draw-cut__title">반증 추첨</p>
        {/* 명패를 추첨통 «안»에 두는 건 배치를 위해서다 — 통 입구가 곧 좌표 원점이라
            명패가 어디서 솟는지 CSS에서 계산 없이 정해진다. */}
        <div className="draw-cut__drum">
          <span className="draw-cut__drum-mark">籤</span>
          <ul className="draw-cut__plates">
            {plates.map((plate, i) => {
              if (plate.drawn) slot += 1
              return (
                <li
                  key={plate.id}
                  className={`draw-cut__plate${plate.drawn ? ' draw-cut__plate--drawn' : ''}`}
                  style={{ '--i': i, '--slot': plate.drawn ? slot : 0 } as CSSProperties}
                >
                  <span className="draw-cut__plate-back">籤</span>
                  <span className="draw-cut__plate-face">{plate.name}</span>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>,
    document.body,
  )
}
