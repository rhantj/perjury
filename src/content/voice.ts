import type { CardId } from '../engine/types'

/**
 * 좌석 인물 여섯의 말투.
 *
 * 용의자 이름 6개는 시나리오와 무관하게 고정이므로(content/scenarios.ts) 말투도
 * 이름에 붙는다 — 사건이 바뀌어도 같은 사람은 같은 말투로 말한다.
 *
 * 이 표가 fallback-lines.ts와 따로 있는 이유는 쓰임이 다르기 때문이다. 그쪽은
 * LLM 대사가 «없을 때만» 채우는 자리고, 여기는 LLM이 무슨 말을 썼든 화면이 늘
 * 만들어야 하는 문장(제안 한 줄)이 쓴다. 폴백이 아니다.
 *
 * 갈래는 fallback-lines.ts의 여섯 말투와 같게 잡았다. 두 곳이 어긋나면
 * 한 좌석이 두 목소리로 말한다.
 */
export type Tone =
  /** 하오체. 나이 든 사내의 말. */
  | 'hao'
  /** 정중한 합쇼체. */
  | 'hapsyo'
  /** 조심스러운 합쇼체 — 말끝을 흐린다. */
  | 'timid'
  /** 하게체·반말. 거리낌이 없다. */
  | 'hage'
  /** 더듬는 존댓말. */
  | 'stammer'
  /** 짧게 끊어 말한다. */
  | 'blunt'

const TONES: Record<string, Tone> = {
  s1: 'hao',
  s2: 'hapsyo',
  s3: 'timid',
  s4: 'hage',
  s5: 'stammer',
  s6: 'blunt',
}

/** 표에 없는 인물은 가장 무난한 합쇼체로 떨어뜨린다 — 화면이 비지 않게. */
export function toneOf(characterId: CardId): Tone {
  return TONES[characterId] ?? 'hapsyo'
}

/** 말투별 대사 묶음. 같은 말투 안에서도 여러 줄을 두고 골라 쓴다. */
export type ToneLines = Readonly<Record<Tone, readonly string[]>>
