import { useState } from 'react'
import { isMuted, setMuted } from '../audio/audio'

/**
 * 소리 스위치. 화면 모서리에 상시 떠 있다.
 *
 * 끌 수 있어야 하는 이유는 이게 읽는 시간이 긴 추리물이라서다 — 계속 깔리는 소리가
 * 방해가 될 수 있고, 심사자가 소리를 꺼두고 볼 수도 있다. 설정은 다음 방문까지 남는다.
 *
 * 상태를 여기 로컬로 드는 것은 이 버튼이 소리 설정을 보여주는 **유일한 화면**이기 때문이다.
 * 두 곳에서 읽게 되면 그때 store로 올린다.
 */
export default function MuteButton() {
  const [muted, setLocal] = useState(isMuted)

  const toggle = () => {
    const next = !muted
    setLocal(next)
    setMuted(next)
  }

  return (
    <button
      type="button"
      className={`mute${muted ? ' mute--off' : ''}`}
      onClick={toggle}
      aria-pressed={muted}
      aria-label={muted ? '소리 켜기' : '소리 끄기'}
      title={muted ? '소리 켜기' : '소리 끄기'}
    >
      {/* 표지의 檢, 추첨통의 籤과 같은 계열로 맞춘다 — 이모지는 이 화면의 활자와 붙지 않는다. */}
      <span aria-hidden="true">{muted ? '默' : '音'}</span>
    </button>
  )
}
