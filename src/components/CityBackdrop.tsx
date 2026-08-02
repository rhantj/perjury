import type { CSSProperties } from 'react'
import '../styles/backdrop.css'

/**
 * 경성 밤골목 배경.
 *
 * 핵심 제약: **창문·남포등·인영은 건물과 같은 SVG 좌표계 안에 있어야 한다.**
 * 이전 판본은 건물이 viewBox 좌표, 창문·등이 HTML 퍼센트 좌표에 있어서
 * 창이 벽을 벗어나고 등이 허공에 떴다. 두 좌표계는 절대 맞출 수 없다.
 * 그래서 여기 있는 것은 전부 근경 SVG의 자식이고, 각 창문은 자기가 붙은
 * 건물의 x·y·w에서 계산해 뽑는다.
 *
 * 움직이는 것은 transform·opacity뿐이라 레이아웃을 다시 계산하지 않는다.
 * 랜딩과 게임 화면이 같이 쓰므로 props를 받지 않는다.
 */

interface Roof {
  x: number
  w: number
  y: number
}

/** 원경·중경 지붕선. 멀어서 뭉개지므로 처마가 처지는 곡선 하나면 족하다. */
function roofline(roofs: readonly Roof[], base: number, sag: number): string {
  return roofs
    .map((r) => `M${r.x} ${r.y}Q${r.x + r.w / 2} ${r.y + sag} ${r.x + r.w} ${r.y}V${base}H${r.x}Z`)
    .join('')
}

const FAR: readonly Roof[] = [
  { x: -40, w: 170, y: 152 },
  { x: 120, w: 130, y: 138 },
  { x: 240, w: 175, y: 158 },
  { x: 405, w: 140, y: 132 },
  { x: 535, w: 190, y: 150 },
  { x: 715, w: 125, y: 140 },
  { x: 830, w: 165, y: 156 },
  { x: 985, w: 145, y: 136 },
  { x: 1120, w: 170, y: 150 },
]

const MID: readonly Roof[] = [
  { x: -60, w: 250, y: 146 },
  { x: 175, w: 190, y: 116 },
  { x: 350, w: 255, y: 152 },
  { x: 590, w: 205, y: 122 },
  { x: 780, w: 240, y: 148 },
  { x: 1005, w: 200, y: 118 },
  { x: 1190, w: 240, y: 144 },
]

/**
 * 근경 블록. 경성은 한옥만 있는 도시가 아니라 «섞인» 도시라서
 * 낮게 깔린 기와지붕 사이에 2~3층 벽돌 양옥이 불쑥 솟는다.
 */
interface Block {
  x: number
  w: number
  /** 건물 «꼭대기» y. 작을수록 높은 건물이다. */
  y: number
  kind: 'hanok' | 'brick'
}

/*
 * 순서가 곧 앞뒤다 — 뒤에 오는 블록이 앞을 덮는다.
 * 지붕이 서로 «겹쳐야» 옛 골목이다. 간격을 띄워 나란히 세우면 교외 주택가가 된다.
 */
const NEAR: readonly Block[] = [
  { x: -70, w: 196, y: 148, kind: 'hanok' },
  { x: 92, w: 158, y: 116, kind: 'hanok' },
  { x: 134, w: 122, y: 44, kind: 'brick' },
  { x: 228, w: 182, y: 158, kind: 'hanok' },
  { x: 344, w: 146, y: 124, kind: 'hanok' },
  { x: 428, w: 156, y: 22, kind: 'brick' },
  { x: 546, w: 174, y: 152, kind: 'hanok' },
  { x: 656, w: 138, y: 118, kind: 'hanok' },
  { x: 752, w: 128, y: 56, kind: 'brick' },
  { x: 846, w: 192, y: 162, kind: 'hanok' },
  { x: 958, w: 150, y: 126, kind: 'hanok' },
  { x: 1062, w: 150, y: 34, kind: 'brick' },
  { x: 1160, w: 184, y: 156, kind: 'hanok' },
]

const BASE = 300
/** 처마가 내려앉는 깊이. 이 값이 0이면 지붕이 아니라 삼각형이 된다. */
const EAVE_DROP = 26

/**
 * 한옥 팔작지붕. 용마루에서 처마로 «오목하게» 내려오다 끝에서 위로 들린다 —
 * 이 버선코가 한옥의 전부다. 아래로만 처지면 천막으로 읽힌다.
 */
function hanok(b: Block): string {
  const eave = b.y + EAVE_DROP
  const tip = eave - 9
  const mid = b.x + b.w / 2
  return (
    `M${b.x - 14} ${tip}` +
    `Q${b.x + b.w * 0.2} ${eave + 5} ${mid} ${b.y}` +
    `Q${b.x + b.w * 0.8} ${eave + 5} ${b.x + b.w + 14} ${tip}` +
    `L${b.x + b.w + 14} ${BASE}L${b.x - 14} ${BASE}Z` +
    // 용마루. 꼭대기를 가로지르는 마루기와가 실루엣에서 한 단 튀어나온다.
    `M${mid - b.w * 0.2} ${b.y - 7}h${b.w * 0.4}v9h-${b.w * 0.4}Z` +
    // 세로 간판. 경성 상점가의 인상은 처마보다 이 돌출 간판에서 나온다.
    `M${b.x + b.w * 0.22} ${eave + 8}h13v44h-13Z`
  )
}

/** 벽돌 양옥. 평지붕에 난간턱이 얹히고 굴뚝이 선다 — 한옥에는 굴뚝을 얹지 않는다. */
function brick(b: Block): string {
  const cx = b.x + b.w * 0.66
  return (
    `M${b.x - 7} ${b.y}h${b.w + 14}v11h-7V${BASE}H${b.x}V${b.y + 11}h-7Z` +
    `M${cx} ${b.y - 34}h15v34h-15Z`
  )
}

const blockPath = (b: Block) => (b.kind === 'hanok' ? hanok(b) : brick(b))

/** 창 한 짝. 좌표는 전부 자기가 붙은 건물에서 나오므로 벽을 벗어날 수 없다. */
interface Win {
  x: number
  y: number
  w: number
  h: number
  /** 불이 꺼진 창. 전부 켜져 있으면 «사람이 사는 집»이 아니라 전광판이 된다. */
  lit: boolean
  /** 인영이 지나가는 창. 지연을 크게 벌려 두 창이 동시에 움직이지 않게 한다. */
  figure: number | null
}

/**
 * 건물마다 창을 배치한다. 양옥은 층·칸 격자, 한옥은 처마 밑 창호 두 짝이다.
 * 배치 규칙을 건물 치수에서 끌어내므로 건물을 옮기면 창도 따라 움직인다.
 */
function windowsFor(b: Block, i: number): Win[] {
  const out: Win[] = []

  if (b.kind === 'brick') {
    const cols = Math.max(2, Math.floor(b.w / 46))
    const step = b.w / (cols + 1)
    const top = b.y + 34
    for (let r = 0; r < 4; r += 1) {
      const y = top + r * 48
      if (y + 26 > BASE - 20) break
      for (let c = 0; c < cols; c += 1) {
        const n = i * 11 + r * 5 + c * 3
        out.push({
          x: b.x + step * (c + 1) - 11,
          y,
          w: 22,
          h: 27,
          // 넷 중 하나만 켠다. 다 켜면 사람 사는 골목이 아니라 전광판이 된다.
          lit: n % 4 === 0,
          figure: n % 7 === 0 ? -(n % 40) : null,
        })
      }
    }
    return out
  }

  // 한옥. 처마 바로 밑에 창호가 나란히 붙는다 — 층을 쌓지 않는다.
  const y = b.y + EAVE_DROP + 16
  for (let c = 0; c < 2; c += 1) {
    const n = i * 11 + c * 3
    out.push({
      x: b.x + b.w * (0.44 + c * 0.22),
      y,
      w: 30,
      h: 22,
      lit: n % 3 === 0,
      figure: n % 6 === 0 ? -(n % 40) : null,
    })
  }
  return out
}

/**
 * 인영. 관절로 나눈 보행 리그다 — 머리·몸통·팔 둘·다리 둘.
 * 통짜 실루엣을 옆으로 밀면 사람이 아니라 «덩어리가 미끄러지는» 것으로 보인다.
 * 사람으로 읽히게 만드는 건 형태가 아니라 팔다리가 서로 반대로 움직이는 위상차다.
 *
 * 좌표는 발바닥이 원점(0,0)인 로컬 공간이고 키가 100이다.
 * 창 크기에 맞춰 scale만 바꿔 끼운다.
 */
const JOINT = { shoulder: -74, hip: -36, head: -90 }

function Walker({ w, index }: { w: Win; index: number }) {
  // 창 높이의 94%. 꽉 채우면 방이 아니라 상자에 갇힌 사람이 된다.
  const scale = (w.h * 0.94) / 100

  return (
    <g clipPath={`url(#pane-${index})`}>
      <g
        className="walker"
        style={
          {
            '--fd': `${w.figure}s`,
            '--from': `${-w.w * 0.9}px`,
            '--to': `${w.w * 1.5}px`,
          } as CSSProperties
        }
      >
        {/* 배치는 attribute transform으로 한다 — CSS transform과 같은 요소에 두면 덮어써진다. */}
        <g transform={`translate(${w.x + w.w / 2} ${w.y + w.h}) scale(${scale})`}>
          <g className="walker__bob">
            {/* 먼 쪽 팔다리가 먼저. 흐리게 깔아야 앞뒤가 갈린다. */}
            <rect className="walker__limb walker__limb--far" x="-5" y={JOINT.hip} width="10" height="38" />
            <rect className="walker__limb walker__limb--far walker__limb--b" x="-3" y={JOINT.shoulder} width="6" height="34" />

            <rect className="walker__torso" x="-9" y="-78" width="18" height="44" />
            <circle className="walker__head" cx="0" cy={JOINT.head} r="11" />

            <rect className="walker__limb walker__limb--b" x="-5" y={JOINT.hip} width="10" height="38" />
            <rect className="walker__limb" x="-3" y={JOINT.shoulder} width="6" height="34" />
          </g>
        </g>
      </g>
    </g>
  )
}

const NEAR_WINDOWS = NEAR.flatMap((b, i) => windowsFor(b, i))

/**
 * 남포등. 건물 벽에서 뻗은 «브래킷»에 걸린다 — 이게 없으면 허공에 뜬 공이 된다.
 * 좌표가 건물에서 나오므로 건물을 옮기면 등도 따라간다.
 */
interface Lamp {
  x: number
  /** 매달린 지점 y. 처마 곡선 «위»의 실제 좌표다. */
  y: number
  s: number
  d: number
}

/**
 * 처마선의 y. hanok()이 그리는 2차 베지에와 같은 식이라 곡선 위 한 점을 정확히 준다.
 * 이 값을 쓰지 않고 눈대중으로 y를 넣으면 등이 처마에서 떨어진다.
 */
function eaveY(b: Block, t: number): number {
  const eave = b.y + EAVE_DROP
  const tip = eave - 9
  // 지붕은 좌우 대칭이라 오른쪽 절반은 왼쪽을 뒤집어 쓴다.
  const u = (t < 0.5 ? t : 1 - t) / 0.5
  return (1 - u) ** 2 * tip + 2 * (1 - u) * u * (eave + 5) + u ** 2 * b.y
}

/**
 * 그 x에서 «맨 앞» 건물의 지붕선 y. 뒤에서부터 찾는 이유는 그리는 순서가 곧 앞뒤라서다.
 *
 * 자기 건물의 처마에 매달면 그 처마가 앞 건물에 덮인 자리에서 등이 실루엣 속에 묻히고,
 * 보이는 건 줄 없이 뜬 등뿐이다. 반드시 «보이는» 윤곽에 매달아야 한다.
 */
function frontRoofY(x: number): number | null {
  for (let i = NEAR.length - 1; i >= 0; i -= 1) {
    const b = NEAR[i]
    if (!b || x < b.x - 12 || x > b.x + b.w + 12) continue
    if (b.kind === 'brick') return b.y + 11
    const t = Math.min(Math.max((x - b.x) / b.w, 0), 1)
    return eaveY(b, t)
  }
  return null
}

/*
 * 초롱은 처마 «밑»에 바로 달린다. 긴 팔에 매달면 골목 초롱이 아니라 가로등이 된다.
 * 후보 자리는 한옥에서 뽑되 매다는 높이는 최전면 윤곽에서 가져온다.
 */
const LAMP_T = [0.17, 0.83]
const LAMPS: readonly Lamp[] = NEAR.flatMap((b, i) =>
  b.kind !== 'hanok'
    ? []
    : LAMP_T.flatMap((t, j) => {
        const x = b.x + b.w * t
        const y = frontRoofY(x)
        if (y === null) return []
        return [{ x, y: y + 1, s: 0.78 + ((i + j) % 3) * 0.1, d: -(i * 1.3 + j * 0.7) }]
      }),
)

/** 줄 길이. 처마 바로 아래라 짧다 — 길면 매달린 게 아니라 늘어뜨린 게 된다. */
const CORD = 9

/** 화면 위쪽을 덮는 앞 처마. 골목 안에서 올려다보는 시점을 만든다. */
const EAVE_LEFT = 'M0 0H470C356 44 208 82 0 108Z'
const EAVE_RIGHT = 'M1200 0H730C844 44 992 82 1200 108Z'

/**
 * 전봇대. 경성이 «근대»라는 기호이자 화면을 세로로 끊는 유일한 직선이다.
 * 지붕선이 전부 곡선이라 이 수직선이 없으면 화면이 물결처럼 읽힌다.
 */
const POLES = [
  { x: 96, y: 74 },
  { x: 404, y: 62 },
  { x: 712, y: 80 },
  { x: 1044, y: 66 },
]

/** 전깃줄. 기둥 사이에서 처지는 곡선이 «늘어진» 인상을 만든다. */
const WIRES = [
  'M-40 78Q28 102 96 90Q250 124 404 78Q558 116 712 96Q878 128 1044 82Q1140 96 1240 88',
  'M-40 100Q28 126 96 114Q250 148 404 102Q558 140 712 120Q878 152 1044 106Q1140 120 1240 112',
]

/** 흩날리는 재. 화면에 공기가 있다는 인상만 주면 되므로 수를 늘리지 않는다. */
const ASH = [
  { x: 9, s: 1, dur: 19, d: 0 },
  { x: 24, s: 0.7, dur: 26, d: -7 },
  { x: 38, s: 1.2, dur: 22, d: -13 },
  { x: 53, s: 0.8, dur: 30, d: -4 },
  { x: 67, s: 1.1, dur: 24, d: -18 },
  { x: 81, s: 0.65, dur: 28, d: -10 },
  { x: 94, s: 0.9, dur: 21, d: -22 },
]

export default function CityBackdrop() {
  return (
    <div className="backdrop" aria-hidden="true">
      <div className="backdrop__sky" />
      <div className="backdrop__chill" />
      <div className="backdrop__afterglow" />
      <div className="backdrop__cloud" />

      {/*
        preserveAspectRatio는 반드시 none이다. slice로 두면 뷰박스와 렌더 박스의
        비율 차만큼 확대돼 지붕 하나가 화면을 덮고 «언덕»으로 읽힌다.
      */}
      <svg className="backdrop__far" viewBox="0 0 1200 220" preserveAspectRatio="none">
        {/* sag가 크다 — none이 세로를 눌러서, 원래 값이면 처마가 평평해진다. */}
        <path d={roofline(FAR, 220, 34)} />
      </svg>

      <svg className="backdrop__mid" viewBox="0 0 1200 280" preserveAspectRatio="none">
        <path d={roofline(MID, 280, 52)} />
      </svg>

      <svg className="backdrop__poles" viewBox="0 0 1200 300" preserveAspectRatio="none">
        {WIRES.map((d) => (
          <path key={d} className="wire" d={d} />
        ))}
        {POLES.map((p) => (
          <g key={p.x}>
            <rect x={p.x - 3} y={p.y} width="6" height={BASE - p.y} />
            {/* 가로대는 얇아야 «판자»가 아니라 완목으로 읽힌다. */}
            <rect x={p.x - 26} y={p.y + 13} width="52" height="3.5" />
            <rect x={p.x - 18} y={p.y + 37} width="36" height="3" />
            {/* 애자. 전선이 얹히는 자리에 혹이 있어야 전봇대다. */}
            {[-20, -10, 10, 20].map((o) => (
              <rect key={o} x={p.x + o - 2} y={p.y + 8} width="4" height="5.5" />
            ))}
          </g>
        ))}
      </svg>

      {/* 근경 + 창 + 등. 한 좌표계 안에 있어야 서로 어긋나지 않는다. */}
      <svg className="backdrop__near" viewBox="0 0 1200 300" preserveAspectRatio="none">
        <defs>
          <radialGradient id="pane">
            <stop offset="0%" stopColor="oklch(74% 0.11 74)" />
            <stop offset="100%" stopColor="oklch(48% 0.11 52)" />
          </radialGradient>
          <radialGradient id="bulb">
            <stop offset="0%" stopColor="oklch(95% 0.1 80)" />
            <stop offset="55%" stopColor="oklch(80% 0.15 70)" />
            <stop offset="100%" stopColor="oklch(54% 0.16 44)" />
          </radialGradient>
          <radialGradient id="glow">
            <stop offset="0%" stopColor="oklch(76% 0.15 66)" stopOpacity="0.15" />
            <stop offset="100%" stopColor="oklch(76% 0.15 66)" stopOpacity="0" />
          </radialGradient>
          {NEAR_WINDOWS.map((w, i) =>
            w.figure === null ? null : (
              <clipPath key={i} id={`pane-${i}`}>
                <rect x={w.x} y={w.y} width={w.w} height={w.h} />
              </clipPath>
            ),
          )}
        </defs>

        <path className="near__mass" d={NEAR.map(blockPath).join('')} />

        {NEAR_WINDOWS.map((w, i) => (
          <g key={i} className={w.lit ? 'pane' : 'pane pane--dark'} style={{ '--d': `${-i * 0.9}s` } as CSSProperties}>
            {w.lit && (
              <circle className="pane__glow" cx={w.x + w.w / 2} cy={w.y + w.h / 2} r={w.w * 1.9} fill="url(#glow)" />
            )}
            <rect x={w.x} y={w.y} width={w.w} height={w.h} fill={w.lit ? 'url(#pane)' : 'oklch(13% 0.02 60)'} />
            {w.figure !== null && <Walker w={w} index={i} />}
            {/* 격자 살. 한지 창호의 조형은 이 두 줄에서 나온다. */}
            <path
              className="pane__mullion"
              d={`M${w.x + w.w / 2} ${w.y}V${w.y + w.h}M${w.x} ${w.y + w.h / 2}H${w.x + w.w}`}
            />
          </g>
        ))}

        {LAMPS.map((l, i) => {
          const top = l.y + CORD
          const rx = 7.5 * l.s
          const ry = 9.5 * l.s
          const cy = top + ry
          return (
            /*
              회전축이 처마 위의 매단 점(l.x, l.y)이고 줄·등이 한 그룹이다.
              줄 끝(top)에서 등 꼭대기가 시작하므로 어떤 각도에서도 떨어지지 않는다.
            */
            <g
              key={i}
              className="lamp__hang"
              style={{ '--d': `${l.d}s`, transformOrigin: `${l.x}px ${l.y}px` } as CSSProperties}
            >
              <circle className="lamp__glow" cx={l.x} cy={cy} r={34 * l.s} fill="url(#glow)" />
              <path className="lamp__cord" d={`M${l.x} ${l.y}V${top}`} />
              <ellipse className="lamp__bulb" cx={l.x} cy={cy} rx={rx} ry={ry} fill="url(#bulb)" />
              {/* 갓과 술. 이 둘이 없으면 초롱이 아니라 «알»이 매달린다. */}
              <path
                className="lamp__trim"
                d={
                  `M${l.x - rx * 0.8} ${top + 1.5}h${rx * 1.6}l${-rx * 0.36} -4h${-rx * 0.88}Z` +
                  `M${l.x - 1.7} ${cy + ry - 1}h3.4v5h-3.4Z`
                }
              />
            </g>
          )
        })}
      </svg>

      <svg className="backdrop__eaves" viewBox="0 0 1200 300" preserveAspectRatio="none">
        <path d={EAVE_LEFT} />
        <path d={EAVE_RIGHT} />
      </svg>

      {/* 새 한 마리가 가끔 지나간다. 계속 날면 배경이 아니라 주인공이 된다. */}
      <svg className="backdrop__crow" viewBox="0 0 40 20" aria-hidden="true">
        <path d="M2 12C7 4 11 3 20 10c9-7 13-6 18 2-6-4-11-2-18 4-7-6-12-8-18-4z" />
      </svg>

      <div className="backdrop__haze" />

      <ul className="backdrop__ash">
        {ASH.map((a) => (
          <li
            key={a.x}
            className="ash"
            style={
              {
                '--x': `${a.x}%`,
                '--s': a.s,
                '--dur': `${a.dur}s`,
                '--d': `${a.d}s`,
              } as CSSProperties
            }
          />
        ))}
      </ul>

      {/* 골목 바닥을 기는 안개. 화면 «앞»이라 건물보다 뒤에 두면 효과가 죽는다. */}
      <div className="backdrop__mist" />

      <div className="backdrop__scrim" />
      {/* 전기가 한 번씩 나간다. 예고 없이 어두워지는 순간이 서늘함의 대부분이다. */}
      <div className="backdrop__flicker" />
      <div className="backdrop__grain" />
    </div>
  )
}
