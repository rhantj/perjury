import type { CSSProperties } from 'react'
import type { Title } from '../content/scenarios'
import '../styles/suspect-card.css'

/** 용의자 번호. 6장을 넘으면 아라비아 숫자로 떨어진다. */
const NUMERALS = ['壹', '貳', '參', '肆', '伍', '陸'] as const

interface Props {
  title: Title
  index: number
}

/**
 * 용의자 조서. 책상에 흩어 놓은 서류처럼 한 장씩 다르게 기울어 있다.
 *
 * 이름은 일부러 띄우지 않는다 — 판이 시작되기 전에는 신원 미상이어야 한다.
 * 기울기는 안쪽 .dossier가 맡고 등장 연출은 바깥 <li>가 맡는다.
 * 한 요소에 transform을 둘 다 걸면 서로 덮어쓴다.
 */
export default function SuspectCard({ title, index }: Props) {
  const numeral = NUMERALS[index] ?? String(index + 1)

  return (
    <article className="dossier" style={{ '--i': index } as CSSProperties}>
      <span className="dossier__tick dossier__tick--tl" />
      <span className="dossier__tick dossier__tick--br" />

      <header className="dossier__head">
        <span className="dossier__no">{numeral}</span>
        <span className="dossier__file">第{numeral}號</span>
      </header>

      {/* 창살 낀 장지문 너머로 사람을 보는 구도. 격자가 경성 인테리어의 핵심 조형이다. */}
      <span className="dossier__portrait">
        <svg viewBox="0 0 100 120" aria-hidden="true" focusable="false">
          <circle className="dossier__head-shape" cx="50" cy="44" r="21" />
          <path className="dossier__body-shape" d="M10 120c0-25 18-42 40-42s40 17 40 42z" />
        </svg>
        <span className="dossier__hanja">{title.hanja}</span>
        <span className="dossier__lattice" />
        <span className="dossier__scan" />
      </span>

      <footer className="dossier__foot">
        <span className="dossier__title">{title.ko}</span>
        <span className="dossier__status">身元 未詳</span>
      </footer>

      <span className="dossier__stamp">未訊問</span>
    </article>
  )
}
