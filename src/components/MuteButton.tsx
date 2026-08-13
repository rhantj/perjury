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
      {/*
        표지의 檢, 추첨통의 籤과 같은 계열로 맞춘다 — 이모지는 이 화면의 활자와 붙지 않는다.

        한자를 여기 텍스트로 두지 않고 CSS(global.css의 `.mute__mark::before`)로 그리는 이유는
        **WCAG 2.5.3 「이름 속 레이블」** 때문이다. 눈에 보이는 글자는 접근명(aria-label) 안에
        들어 있어야 하는데, 음성 제어 사용자가 「音」이라고 말할 일은 없다.
        `aria-hidden`으로는 해결되지 않는다 — 그건 보조기술에서만 숨길 뿐 화면에는 그대로 보이고,
        검사 도구도 «보이는 글자»로 센다. DOM 텍스트에서 빼는 것이 유일한 해법이다.
      */}
      <span className="mute__mark" aria-hidden="true" />
      {/*
        한자 한 글자만 두었더니 «이게 뭐냐»는 물음이 나왔다 — 장치인지 장식인지 안 읽힌 것이다.
        title은 커서를 올려 기다려야 뜨므로 처음 보는 사람에게는 없는 것과 같다.

        이 글자는 텍스트로 남긴다. 보이는 「소리」가 접근명 「소리 끄기」 안에 들어 있어
        음성 제어로 「소리」라고 말하면 눌린다.
      */}
      <span className="mute__cap" aria-hidden="true">{muted ? '무음' : '소리'}</span>
    </button>
  )
}
