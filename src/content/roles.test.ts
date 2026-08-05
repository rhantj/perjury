import { describe, expect, it } from 'vitest'
import { assignRoles } from './roles'
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
