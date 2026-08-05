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
    power: '자기가 본 반증 1건을 전체에 공개한다.',
    flavor: '검열을 뚫는 특종. 공개하겠다는 «협박»이 본체다.',
    effect: null,
  },
  {
    id: 'lawyer',
    ko: '변호사',
    hanja: '辯護士',
    side: 'citizen',
    power: '반증 요구를 1회 거부한다.',
    flavor: '합법적 침묵. 거부하는 것 자체가 의심을 산다.',
    effect: null,
  },
  {
    id: 'broker',
    ko: '정보상',
    hanja: '情報商',
    side: 'citizen',
    power: '밀담 상대 발언의 참·거짓만 판정한다.',
    flavor: '명동 뒷골목의 거짓말 탐지기. 단 한 번뿐이다.',
    effect: null,
  },
  {
    id: 'operator',
    ko: '전화교환수',
    hanja: '電話交換手',
    side: 'citizen',
    power: '이번 라운드 밀담 1건을 엿듣는다.',
    flavor: '경성우편국. 모든 말이 이 사람을 지나간다.',
    effect: null,
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
    effect: null,
  },
  {
    id: 'trickster',
    ko: '협잡꾼',
    hanja: '挾雜꾼',
    side: 'culprit',
    power: '타인의 반증 1회를 조작한다.',
    flavor: '무고한 사람을 거짓말쟁이로 만든다.',
    effect: null,
  },
  {
    id: 'spy',
    ko: '밀정',
    hanja: '密偵',
    side: 'culprit',
    power: '자기 위증 1회는 이의제기를 당해도 실패 처리된다.',
    flavor: '뒤를 봐주는 자가 있다. 한 번은 빠져나간다.',
    effect: null,
  },
]

/**
 * 6명에게 6개를 배정한다. 10종 중 4종은 그 판에 등장하지 않는다.
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
  players: readonly { id: PlayerId; faction: Faction }[],
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

  let culpritTaken = 0
  let citizenTaken = 0
  const assigned: Record<PlayerId, Role> = {}

  for (const player of players) {
    const picked =
      player.faction === 'culprit' ? forCulprit[culpritTaken++] : forCitizen[citizenTaken++]
    if (!picked) throw new Error(`직업 풀이 모자란다: ${player.id}`)
    assigned[player.id] = picked
  }

  return assigned
}
