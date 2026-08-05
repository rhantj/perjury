import { createRng, shuffle } from '../engine/rng'
import type { Faction, PlayerId, PowerUse } from '../engine/types'

/**
 * 직업 10종. 시대가 고정이므로 풀은 **전 시나리오 공용**이다.
 * 능력은 전부 1회용 — 강할 필요는 없고 «나만 아는 것»이 생기면 된다.
 *
 * 정의와 추첨 규칙은 docs/decisions/002-직업-풀과-시나리오.md.
 *
 * 엔진에 넣지 않은 이유: 직업은 룰이 아니라 콘텐츠다. 배정은 시드에서 파생되는 순수 함수라
 * engine/setup.ts를 건드리지 않고도 결정론이 유지된다(기존 시드의 카드 배분도 그대로다).
 *
 * 발동은 엔진이 한다(engine/power.ts). 이 파일은 «어느 직업이 어느 능력인가»만 대응시키고,
 * 엔진은 직업 이름을 모른 채 종류만 받는다 — content → engine 한 방향 의존을 지키기 위해서다.
 */

export interface Role {
  /** 일러스트 파일명과 맞추는 식별자. */
  id: string
  ko: string
  hanja: string
  /** 이 직업이 갈 수 있는 진영. 범인 전용 2종은 범인에게만 간다. */
  side: Faction
  /** 능력 한 줄. 1회용. */
  power: string
  /** 이 직업이 만드는 이야기 — 밀담에서 쓸 거리다. */
  flavor: string
  /**
   * 발동할 능력의 종류. **아직 구현되지 않았으면 null이다.**
   *
   * `power`(사람이 읽는 문구)와 나누는 이유는 문구가 콘텐츠이고 종류가 룰이기 때문이다.
   * 문구를 다듬어도 룰이 흔들리지 않아야 한다.
   *
   * null인 직업도 배정에는 그대로 나온다. 풀에서 빼면 assignRoles가 시민 5종을 못 채워
   * 판이 시작되지 않는다 — 능력만 없고 이야기 소재로는 그대로 쓴다.
   */
  effect: PowerUse['kind'] | null
  /**
   * **사람 좌석에만 배정된다.** 없으면 누구에게나 간다.
   *
   * 능력이 「밀담 상대의 말」을 다루는 직업이 여기 걸린다. 밀담은 언제나 사람이 걸므로
   * 그런 능력이 AI에게 가면 판정 대상이 «사람이 타이핑한 자유 텍스트»가 되는데,
   * 엔진은 텍스트를 읽지 않고 AI 시야에는 사람의 손패가 없어서 어느 쪽도 판정할 수 없다.
   * 손패를 넣어주면 그 좌석이 판을 꿰뚫어 보게 되므로 그것도 답이 아니다.
   */
  humanOnly?: true
}

export const ROLES: readonly Role[] = [
  {
    id: 'coroner',
    ko: '검시관',
    hanja: '檢屍官',
    side: 'citizen',
    power: '한 명의 손패 1장을 확인한다.',
    flavor: '총독부의원 부검의. 확정 정보가 곧 밀담의 협상력이다.',
    effect: 'inspect-hand',
  },
  {
    id: 'constable',
    ko: '순사',
    hanja: '巡査',
    side: 'citizen',
    power: '한 명의 이번 라운드 반증이 참인지 통보받는다.',
    flavor: '조선인 순사. 동족을 잡는 자리라 아무도 그를 믿지 않는다.',
    effect: 'verify-claim',
  },
  {
    id: 'reporter',
    ko: '신문기자',
    hanja: '新聞記者',
    side: 'citizen',
    /*
     * 원래 문구는 「자기가 본 반증 1건을 전체에 공개한다」였다.
     * 반증 선언 자체는 이미 전원이 들은 공개 정보라, 공개할 것이 없어 능력이 비어 보였다.
     * 감춰져 있던 것은 그것이 참이었나뿐이다.
     */
    power: '한 명의 지난 선언 1건, 그 진위를 전체에 공개한다.',
    flavor: '검열을 뚫는 특종. 공개하겠다는 «협박»이 본체다.',
    effect: 'publish',
  },
  {
    id: 'lawyer',
    ko: '변호사',
    hanja: '辯護士',
    side: 'citizen',
    power: '반증 요구를 1회 거부한다.',
    flavor: '합법적 침묵. 거부하는 것 자체가 의심을 산다.',
    effect: 'refuse-demand',
  },
  {
    id: 'broker',
    ko: '정보상',
    hanja: '情報商',
    side: 'citizen',
    power: '밀담 상대 발언의 참·거짓만 판정한다.',
    flavor: '명동 뒷골목의 거짓말 탐지기. 단 한 번뿐이다.',
    effect: 'detect-lie',
    humanOnly: true,
  },
  {
    id: 'operator',
    ko: '전화교환수',
    hanja: '電話交換手',
    side: 'citizen',
    /*
     * 사람이 쥐면 엿들을 것이 없다 — 사람은 이미 모든 밀담에 끼어 있다.
     * 그래서 사람에게는 회선이 하나 늘고, AI에게는 남의 밀담이 보인다(결정 007).
     */
    power: '밀담 회선이 하나 는다 — 남의 자리에서는 남의 밀담을 엿듣는다.',
    flavor: '경성우편국. 모든 말이 이 사람을 지나간다.',
    effect: 'eavesdrop',
  },
  {
    id: 'apothecary',
    ko: '약제사',
    hanja: '藥劑師',
    side: 'citizen',
    power: '수단 카드 1장을 지정해 정답 여부를 확인한다.',
    flavor: '독을 아는 자. 추리표의 칸 하나를 확실히 지운다.',
    effect: 'check-weapon',
  },
  {
    id: 'photographer',
    ko: '사진사',
    hanja: '寫眞師',
    side: 'citizen',
    power: '한 명을 촬영한다 — 그가 다음 라운드에 위증하면 즉시 발각된다.',
    flavor: '증거는 남는다. 쓰는 순간부터 억지력이 된다.',
    effect: 'photograph',
  },
  {
    id: 'trickster',
    ko: '협잡꾼',
    hanja: '挾雜꾼',
    side: 'culprit',
    power: '타인의 반증 1회를 조작한다.',
    flavor: '무고한 사람을 거짓말쟁이로 만든다.',
    effect: 'frame',
  },
  {
    id: 'spy',
    ko: '밀정',
    hanja: '密偵',
    side: 'culprit',
    power: '자기 위증 1회는 이의제기를 당해도 실패 처리된다.',
    flavor: '뒤를 봐주는 자가 있다. 한 번은 빠져나간다.',
    effect: 'shield',
  },
]

/**
 * 6명에게 6개를 배정한다. 10종 중 4종은 그 판에 등장하지 않는다.
 *
 * 사람 전용 직업(humanOnly)은 AI 좌석을 만나면 건너뛴다. 사람이 그 진영이 아니면
 * 그 판에는 아예 등장하지 않는다 — 풀에 남은 채 아무도 뽑지 않는 것이 정상 상태다.
 *
 * 시드를 `:roles`로 파생시키는 이유는 격리다. createGame의 rng를 같이 쓰면
 * 여기서 난수를 뽑는 순간 기존 시드의 카드 배분이 전부 달라진다 —
 * scenarios.ts의 `:scenario`와 같은 사안이다.
 *
 * **누구에게 무엇이 갔는지는 비밀이다.** 범인 전용 2종이 섞여 있으므로
 * 남의 직업을 알면 범인이 드러난다. 이 결과 전체를 화면에 넘기지 않는다.
 */
export function assignRoles(
  seed: string,
  players: readonly { id: PlayerId; faction: Faction; isHuman?: boolean }[],
): Record<PlayerId, Role> {
  const rng = createRng(`${seed}:roles`)
  const forCulprit = shuffle(
    ROLES.filter((r) => r.side === 'culprit'),
    rng,
  )
  const forCitizen = shuffle(
    ROLES.filter((r) => r.side === 'citizen'),
    rng,
  )

  const assigned: Record<PlayerId, Role> = {}
  const used = new Set<string>()

  /*
   * **사람이 먼저 뽑는다.** 좌석 순서대로 돌면서 AI가 사람 전용 직업을 건너뛰게 하면,
   * 건너뛴 그 직업은 사람 차례가 오기 전에 지나가 버려 아무에게도 가지 않는다.
   * 사람을 앞에 세우면 사람 전용 직업이 다른 직업과 똑같은 확률로 사람에게 온다.
   */
  const order = [...players.filter((p) => p.isHuman), ...players.filter((p) => !p.isHuman)]

  for (const player of order) {
    const pool = player.faction === 'culprit' ? forCulprit : forCitizen
    const picked = pool.find(
      (role) => !used.has(role.id) && (player.isHuman || !role.humanOnly),
    )
    if (!picked) throw new Error(`직업 풀이 모자란다: ${player.id}`)
    used.add(picked.id)
    assigned[player.id] = picked
  }

  return assigned
}
