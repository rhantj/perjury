import { useState } from 'react'
import CityBackdrop from './CityBackdrop'
import '../styles/landing.css'

interface Props {
  seed: string
  /** 시드 입력은 표지에서 뺐다(정체불명 입력칸이 표지를 망친다). 설정 화면이 생기면 그쪽이 쓴다. */
  onSeed: (seed: string) => void
  onStart: (seed: string) => void
}

/** 표지가 물러나는 시간. landing.css의 퇴장 트랜지션과 맞춰야 한다. */
const LEAVE_MS = 620

/**
 * 표지. 게임의 «얼굴»이라 사건·용의자 같은 세부는 올리지 않는다 —
 * 그건 [게임 시작] 다음의 사건 브리핑이 맡는다.
 *
 * 조판은 중앙 정렬이 아니라 좌측 호외(號外) 편집이다. 가운데로 모으면
 * 배경의 골목이 좌우로 잘려 «어느 도시인지»가 사라진다.
 */
export default function Landing({ seed, onStart }: Props) {
  const [leaving, setLeaving] = useState(false)

  const start = () => {
    if (leaving) return
    setLeaving(true)
    window.setTimeout(() => onStart(seed || 'nan2026'), LEAVE_MS)
  }

  return (
    <main className={`landing${leaving ? ' landing--leaving' : ''}`}>
      <CityBackdrop />

      <div className="landing__stage">
        <header className="landing__masthead">
          <span className="landing__rule" />
          <p className="landing__meta">京城府 · 一九三五 · 六人</p>
        </header>

        <div className="landing__plate">
          {/* 세로쓰기 한자. 제목의 «판본»이지 장식이 아니라서 읽히는 크기로 둔다. */}
          <p className="landing__hanja" aria-hidden="true">
            僞證
          </p>

          <h1 className="landing__title">
            <span className="landing__title-ko" data-text="위증">
              위증
            </span>
            <span className="landing__title-en">PERJURY</span>
          </h1>
        </div>

        <div className="landing__brief">
          <p className="landing__lede">
            여섯이 한 자리에 앉는다.
            <br />
            그중 하나가 범인이다.
          </p>
          <p className="landing__note">
            <b>반증은 선서다.</b> 그리고 선서한 자리에서도 거짓은 나온다.
          </p>
        </div>

        <div className="landing__foot">
          <button type="button" className="landing__enter" onClick={start}>
            <span className="landing__enter-label">게임 시작</span>
          </button>
        </div>
      </div>

      {/* 인장은 지면(stage) 밖이다 — 조판 위에 «나중에» 찍힌 것이라 화면 모서리에 앉는다. */}
      <span className="landing__seal" aria-hidden="true">
        檢
      </span>
    </main>
  )
}
