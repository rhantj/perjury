import { describe, expect, it } from 'vitest'
import { ROLES, assignRoles, autoShieldSeats } from './roles'
import { cardsOfKind } from '../engine/cards'
import { buildPowerUse, needsOf } from '../engine/power'
import type { Role } from './roles'
import type { Faction } from '../engine/types'

describe('assignRoles — 사람 전용 직업', () => {
  function seats(humanIndex: number) {
    return Array.from({ length: 6 }, (_, i) => ({
      id: `p${i}`,
      faction: (i === 5 ? 'culprit' : 'citizen') as Faction,
      isHuman: i === humanIndex,
    }))
  }

  /** 정보상은 밀담 상대의 말을 판정한다. AI가 쥐면 판정 대상이 사람의 자유 텍스트가 되어 성립하지 않는다. */
  it('정보상은 AI 좌석에 배정되지 않는다', () => {
    for (let i = 0; i < 200; i += 1) {
      const assigned = assignRoles(`broker-${i}`, seats(0))
      for (const [id, role] of Object.entries(assigned)) {
        if (role.id === 'broker') expect(id).toBe('p0')
      }
    }
  })

  it('사람이 시민이면 정보상이 나올 수 있다', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 200; i += 1) {
      const mine = assignRoles(`broker-${i}`, seats(0))['p0']
      if (mine) seen.add(mine.id)
    }

    expect(seen.has('broker')).toBe(true)
  })

  /** 사람이 범인이면 정보상은 그 판에 아예 등장하지 않는다. */
  it('사람이 범인이면 정보상이 등장하지 않는다', () => {
    for (let i = 0; i < 200; i += 1) {
      const assigned = assignRoles(`broker-c-${i}`, seats(5))
      for (const role of Object.values(assigned)) {
        expect(role.id).not.toBe('broker')
      }
    }
  })

  it('여섯 좌석 전원이 서로 다른 직업을 받는다', () => {
    const assigned = assignRoles('broker-unique', seats(0))
    const ids = Object.values(assigned).map((r) => r.id)

    expect(new Set(ids).size).toBe(6)
  })
})

describe('assignRoles — 배정 자체', () => {
  const seats = Array.from({ length: 6 }, (_, i) => ({
    id: `p${i}`,
    faction: (i === 5 ? 'culprit' : 'citizen') as Faction,
    isHuman: i === 0,
  }))

  it('같은 시드는 같은 배정을 준다', () => {
    expect(assignRoles('same', seats)).toEqual(assignRoles('same', seats))
  })

  it('진영 전용 직업은 그 진영에만 간다', () => {
    for (let i = 0; i < 100; i += 1) {
      const assigned = assignRoles(`side-${i}`, seats)
      for (const seat of seats) {
        expect(assigned[seat.id]?.side).toBe(seat.faction)
      }
    }
  })

  /** 사람 전용 직업이 사람에게 오는 빈도가 다른 직업과 크게 다르면 안 된다. */
  it('정보상이 사람에게 오기는 한다 — 드물게라도 사라지지 않는다', () => {
    let count = 0
    for (let i = 0; i < 400; i += 1) {
      if (assignRoles(`rate-${i}`, seats)['p0']?.id === 'broker') count += 1
    }

    expect(count).toBeGreaterThan(10)
  })
})

/**
 * **직업 전수 점검.** 「어느 직업 능력이 구현이 안 된 것 같다」는 피드백에서 나왔다.
 *
 * 개별 능력의 «동작»은 각 엔진 테스트가 이미 본다(power/round/parley/challenge.test.ts).
 * 여기서 지키는 것은 그 앞단이다 — **직업이 조용히 죽는 것**. 지금 구조에서 그 일은
 * 세 가지 모양으로 일어나고, 셋 다 아무 테스트도 실패시키지 않은 채 지나간다:
 *
 *   1. `effect: null`로 두면 PowerPanel이 아무것도 그리지 않는다(그 파일 주석) —
 *      직업은 배정되고 능력 «문구»도 보이는데 발동만 없다.
 *   2. 새 능력 종류를 PowerUse에 더하고 어느 직업에도 안 붙이면, 엔진에는 있는데
 *      판에는 영영 안 나온다.
 *   3. `needsOf`와 `buildPowerUse`가 어긋나면 화면이 «맞게» 고른 대상으로도 null이 나와
 *      store.usePower가 조용히 무시한다(그 함수 주석 — 던지지 않는다).
 */
describe('직업 — 열 종이 모두 살아 있는가', () => {
  /**
   * 모든 능력 종류. **Record로 두는 것이 핵심이다** — PowerUse에 종류가 하나 늘면
   * 이 객체가 컴파일 오류를 낸다. 배열로 두면 빠뜨려도 조용히 통과한다.
   */
  const ALL_KINDS: Record<NonNullable<Role['effect']>, true> = {
    'inspect-hand': true,
    'check-weapon': true,
    'verify-claim': true,
    photograph: true,
    publish: true,
    shield: true,
    'refuse-demand': true,
    frame: true,
    eavesdrop: true,
    'detect-lie': true,
  }

  it('발동이 비어 있는 직업이 없다', () => {
    const dead = ROLES.filter((role) => role.effect === null).map((role) => role.ko)
    expect(dead, `발동이 없는 직업: ${dead.join(', ')}`).toEqual([])
  })

  it('쓰이지 않는 능력 종류가 없다', () => {
    const claimed = new Set(ROLES.map((role) => role.effect))
    const orphan = Object.keys(ALL_KINDS).filter((kind) => !claimed.has(kind as never))
    expect(orphan, `어느 직업도 갖지 않은 능력: ${orphan.join(', ')}`).toEqual([])
  })

  /**
   * 화면이 고르는 것과 엔진이 받는 것이 맞물리는가.
   *
   * PowerPanel은 needsOf로 «무엇을 고를지»를 정하고, store.usePower는 그 결과를
   * buildPowerUse에 넘긴다. 둘이 어긋나면 null이 나오고 그 자리에서 조용히 삼켜진다 —
   * 사람 눈에는 「눌렀는데 아무 일도 안 일어남」으로 보인다. 정확히 그 신고가 있었다.
   */
  it('직업마다 화면이 고를 수 있는 것으로 발동이 만들어진다', () => {
    for (const role of ROLES) {
      if (role.effect === null) continue
      const intent =
        needsOf(role.effect) === 'player'
          ? { targetId: 'p1' }
          : needsOf(role.effect) === 'weapon'
            ? { cardId: cardsOfKind('weapon')[0]?.id }
            : {}

      const use = buildPowerUse(role.effect, intent)
      expect(use, `${role.ko}(${role.effect})의 발동이 만들어지지 않는다`).not.toBeNull()
      expect(use?.kind).toBe(role.effect)
    }
  })

  /**
   * 열 종이 실제로 판에 등장하는가. 배정은 시드에서 파생되므로, 한 종이라도 영영
   * 안 나오는 조합이 있으면 그 직업은 «구현됐지만 만날 수 없는» 상태다.
   *
   * 사람 진영을 둘 다 돌린다 — 범인 전용 2종은 사람이 범인인 판에서만 사람에게 오고,
   * 정보상은 사람이 시민일 때만 등장한다(humanOnly).
   */
  it('열 종이 모두 어느 판에선가 실제로 배정된다', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 300; i += 1) {
      for (const culpritSeat of [0, 5]) {
        const players = Array.from({ length: 6 }, (_, seat) => ({
          id: `p${seat}`,
          faction: (seat === culpritSeat ? 'culprit' : 'citizen') as Faction,
          isHuman: seat === 0,
        }))
        for (const role of Object.values(assignRoles(`audit-${i}`, players))) seen.add(role.id)
      }
    }

    const missing = ROLES.filter((role) => !seen.has(role.id)).map((role) => role.ko)
    expect(missing, `600판을 돌려도 안 나온 직업: ${missing.join(', ')}`).toEqual([])
  })

  /**
   * 밀정만은 «발동»이 아니라 지목당하는 순간 저절로 나간다(engine/challenge.ts).
   * 그래서 이 대응이 끊기면 밀정은 버튼도 없고 자동 발동도 없는 유일한 직업이 된다 —
   * 다른 아홉과 달리 위 buildPowerUse 검사만으로는 살아 있는지 알 수 없다.
   */
  it('밀정 자리는 자동 보호 대상으로 잡힌다', () => {
    const players = Array.from({ length: 6 }, (_, seat) => ({
      id: `p${seat}`,
      faction: (seat === 5 ? 'culprit' : 'citizen') as Faction,
      isHuman: seat === 0,
    }))

    for (let i = 0; i < 60; i += 1) {
      const seed = `shield-${i}`
      const roles = assignRoles(seed, players)
      const spy = Object.entries(roles).find(([, role]) => role.id === 'spy')?.[0]
      const shielded = autoShieldSeats(seed, players)

      if (spy) expect(shielded).toContain(spy)
      else expect(shielded.size).toBe(0)
    }
  })
})
