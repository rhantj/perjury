import { describe, expect, it } from 'vitest'
import { powerLookup } from './power-brief'
import { ROLES } from '../content/roles'
import type { Role } from '../content/roles'

function roleNamed(id: string): Role {
  const found = ROLES.find((r) => r.id === id)
  if (!found) throw new Error(`없는 직업: ${id}`)
  return found
}

describe('powerLookup — 좌석의 능력 개요', () => {
  it('능력 문구와 고를 것을 함께 준다', () => {
    const lookup = powerLookup({ p0: roleNamed('coroner') })

    expect(lookup('p0')).toEqual({ text: roleNamed('coroner').power, needs: 'player' })
  })

  it('수단을 고르는 능력은 needs가 weapon이다', () => {
    const lookup = powerLookup({ p0: roleNamed('apothecary') })

    expect(lookup('p0')?.needs).toBe('weapon')
  })

  /**
   * 발동이 구현되지 않은 직업. 프롬프트에 능력 이야기가 아예 안 나가야 한다.
   *
   * 실제 직업을 골라 쓰지 않는다 — 구현이 끝나면 그 직업의 effect가 채워져
   * 테스트가 «구현했다는 이유로» 깨지기 때문이다.
   */
  it('effect가 없는 직업은 null이다', () => {
    const lookup = powerLookup({ p0: { ...roleNamed('spy'), effect: null } })

    expect(lookup('p0')).toBeNull()
  })

  it('모르는 좌석은 null이다', () => {
    expect(powerLookup({})('p9')).toBeNull()
  })

  /**
   * 직업 이름도 능력 종류도 내보내지 않는다 — 워커가 알면 룰이 두 군데로 갈린다.
   * 이 테스트가 깨지면 그 경계가 무너진 것이다.
   */
  it('직업 이름이나 능력 종류는 나가지 않는다', () => {
    const brief = powerLookup({ p0: roleNamed('coroner') })('p0')

    expect(Object.keys(brief ?? {}).sort()).toEqual(['needs', 'text'])
  })
})
