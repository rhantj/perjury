import type { PlayerId } from './types'
import type { GameView } from './view'

/**
 * 「이 사람의 말을 믿어도 되는가」를 지난 기록에서 뽑아낸다.
 *
 * **상태로 두지 않는 것이 핵심이다.** 근거가 될 사건은 전부 이미 기록에 남아 있으므로
 * (이의제기 결과·사진사 발각·신문기자 공개·능력 통보) GameState에 필드를 더할 이유가 없다.
 * 저장하면 기록과 어긋날 수 있고, 「누구 기준의 신뢰도인가」를 따로 관리해야 한다.
 *
 * 입력이 GameView인 것이 그 「누구 기준」을 공짜로 해결한다 — viewFor가 이미 걸러 놓았으므로
 * 남이 볼 수 없는 근거는 애초에 이 함수에 도달하지 않는다. 순사가 나한테만 통보한 사실은
 * 내 계산에만 들어간다.
 *
 * **판단하지 않고 세기만 한다.** 이것을 어떻게 쓸지는 부르는 쪽이 정한다.
 */

/**
 * 위증이 «증명»됐을 때의 무게. 참으로 드러났을 때보다 훨씬 무겁다.
 *
 * 비대칭이 의도다. 한 번 참이었다고 정직한 사람이 되는 것은 아니지만,
 * 한 번 거짓이면 «거짓말을 할 수 있는 사람»이라는 사실이 확정된다.
 * 대칭으로 두면 위증자가 참 선언 몇 번으로 이력을 지울 수 있다.
 */
export const PROVEN_LIE = -3
export const PROVEN_TRUTH = 1

/**
 * 신뢰를 움직인 사건 하나. **점수만 두지 않는 이유가 이것이다** —
 * 숫자 하나는 화면에서 설명이 안 되고 프롬프트에서도 설득력이 없다.
 * 「3회차에 위증이 증명됐다」가 있어야 사람도 에이전트도 그 값을 쓸 수 있다.
 */
export type TrustEventKind =
  /** 이의제기로 증명된 위증. 전원이 봤다. */
  | 'perjury-proven'
  /** 사진사에게 발각. 이의제기를 거치지 않고 전원이 봤다. */
  | 'exposed'
  | 'published-false'
  | 'published-true'
  /** 순사 통보. 나만 안다. */
  | 'verified-false'
  | 'verified-true'
  /** 정보상 판정. 나만 안다. */
  | 'parley-false'
  | 'parley-true'

export interface TrustEvent {
  readonly round: number
  readonly kind: TrustEventKind
  readonly delta: number
  /**
   * 나만 아는 근거인가. 공개 근거와 확실성은 같지만 **쓸 수 있는 방식이 다르다** —
   * 이걸 남에게 말하면 능력을 썼다는 사실이 드러난다. 화면과 프롬프트가 그것을 갈라야 한다.
   */
  readonly isPrivate: boolean
}

export interface TrustRecord {
  readonly playerId: PlayerId
  /** 누적치. 순서를 매기거나 프롬프트에 실을 때 쓴다. */
  readonly score: number
  /** 왜 그 점수인지. 라운드 순이다. */
  readonly events: readonly TrustEvent[]
}

interface Entry extends TrustEvent {
  readonly playerId: PlayerId
}

/**
 * 아무 일도 없었던 좌석은 **넣지 않는다.** 0점으로 채워 두면 「중립」과 「모름」이 같은 값이
 * 되는데, 이 게임에서 그 둘은 다르다 — 아직 아무 근거도 없는 상태다.
 * 부르는 쪽이 undefined를 보고 판단하게 둔다.
 *
 * 조기 고발 실패(view.eliminated)는 여기 넣지 않는다. 그것은 «판단이 틀렸다»이지
 * «거짓말했다»가 아니라 축이 다르다. 한 점수에 섞으면 그 점수의 뜻이 흐려진다.
 */
export function trustFrom(view: GameView): ReadonlyMap<PlayerId, TrustRecord> {
  const entries: Entry[] = []

  for (const record of view.rounds) {
    const challenge = record.challenge
    /*
     * 실패한 이의제기는 아무것도 증명하지 않는다. 고발자가 그 카드를 안 쥐고 있었다는
     * 뜻일 뿐, 대상이 정직했다는 뜻이 아니다 — 증명 불가능한 카드로 위증했을 수 있다.
     */
    if (challenge?.success) {
      entries.push({
        round: record.round,
        playerId: challenge.targetId,
        kind: 'perjury-proven',
        delta: PROVEN_LIE,
        isPrivate: false,
      })
    }

    for (const playerId of record.exposed) {
      entries.push({
        round: record.round,
        playerId,
        kind: 'exposed',
        delta: PROVEN_LIE,
        isPrivate: false,
      })
    }

    for (const item of record.published) {
      entries.push({
        round: record.round,
        playerId: item.playerId,
        kind: item.truthful ? 'published-true' : 'published-false',
        delta: item.truthful ? PROVEN_TRUTH : PROVEN_LIE,
        isPrivate: false,
      })
    }
  }

  for (const grant of view.findings) {
    const finding = grant.finding
    /* 카드를 알게 된 것(hand·weapon)은 신뢰와 무관하다. 진위를 말하는 둘만 본다. */
    if (finding.kind !== 'claim' && finding.kind !== 'parley') continue

    const inParley = finding.kind === 'parley'
    entries.push({
      round: grant.round,
      playerId: finding.targetId,
      kind: finding.truthful
        ? inParley
          ? 'parley-true'
          : 'verified-true'
        : inParley
          ? 'parley-false'
          : 'verified-false',
      delta: finding.truthful ? PROVEN_TRUTH : PROVEN_LIE,
      isPrivate: true,
    })
  }

  /* 공개 기록과 능력 통보를 한 줄로 세운다. 시간순이라야 「언제부터 못 믿었나」가 읽힌다. */
  entries.sort((a, b) => a.round - b.round)

  const table = new Map<PlayerId, TrustRecord>()
  for (const entry of entries) {
    const previous = table.get(entry.playerId)
    const event: TrustEvent = {
      round: entry.round,
      kind: entry.kind,
      delta: entry.delta,
      isPrivate: entry.isPrivate,
    }
    table.set(entry.playerId, {
      playerId: entry.playerId,
      score: (previous?.score ?? 0) + entry.delta,
      events: [...(previous?.events ?? []), event],
    })
  }
  return table
}

/**
 * 이 좌석의 «선언»을 계산에서 빼야 하는가.
 *
 * **점수 문턱이 아니라 이력을 본다.** 점수로 자르면 참 선언 세 번이 위증 한 번을 상쇄해
 * 되믿게 되는데, 증명된 거짓말은 그렇게 씻기는 것이 아니다. 한 번 걸린 사람은 그 판이
 * 끝날 때까지 걸린 사람이다 — 위증을 «영구적 부채»로 만드는 것이 이 게임의 코어다.
 *
 * 점수와 이 함수가 갈리는 이유이기도 하다. 점수는 「얼마나 의심스러운가」의 눈금이라
 * 프롬프트와 화면이 쓰고, 이쪽은 소거 계산이 쓰는 이분 판단이다.
 */
export function isDiscredited(record: TrustRecord | undefined): boolean {
  if (!record) return false
  return record.events.some((e) => e.delta < 0)
}
