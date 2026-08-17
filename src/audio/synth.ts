/**
 * 효과음 열두 종의 **배치표와 조립대**. 레시피 본문은 두 파일로 나뉘어 있다.
 *
 *   sfx-actions.ts  — 행동(제안·반증·위증·지목·차례·추첨). 자주 나므로 단순하고 짧다.
 *   sfx-outcomes.ts — 결과(개시·발각·오판·퇴출·승리·패배). 드물게 나므로 길고 풍부하다.
 *
 * 재료는 voices.ts가, 재료의 재료는 engine.ts가 만든다. 음원 파일이 하나도 없어도
 * 소리가 나게 하는 쪽이고, 진짜 음원이 생기면 audio.ts가 파일 쪽을 먼저 집으므로
 * 이 계통 전체는 그대로 둬도 된다.
 *
 * ---
 *
 * **소리는 «풍부해서» 알아듣는 게 아니라 «달라서» 알아듣는다.**
 *
 * 앞선 판본은 열두 개 전부에 잔해·웅성거림·쇳소리·FM을 똑같이 넣었다. 하나씩 들으면
 * 두꺼운데 이어서 들으면 구별이 안 됐다 — 풍부함을 균일하게 뿌리면 개성이 지워진다.
 *
 * 그래서 규칙을 뒤집었다.
 *
 * > **자주 나는 소리는 단순하게, 드물게 나는 소리는 풍부하게.**
 * > 그리고 각 소리는 **길이·음역·밀도·방향** 중 최소 두 축에서 나머지 전부와 달라야 한다.
 *
 * 아래가 그 배치다. 새 소리를 넣거나 고칠 때 이 표의 빈칸을 먼저 확인한다 —
 * 이미 찬 칸에 하나 더 넣으면 둘 다 흐려진다.
 *
 * | 소리     | 길이  | 음역        | 이것만 갖는 것                  | 어디에  |
 * |----------|-------|-------------|---------------------------------|---------|
 * | refute   | 0.35s | 2.5k~7k     | 저역이 없다 + 좌→우로 펼쳐진다  | actions |
 * | suggest  | 0.5s  | 34~300      | 서브 저역으로 눌러 찍는 단발    | actions |
 * | challenge| 0.6s  | 400→2k 상승 | 유일하게 올라간다               | actions |
 * | myTurn   | 1.1s  | 87~450      | 세 번 두드려 가운데로 모인다    | actions |
 * | wrongCall| 1.4s  | 40~260      | 버즈 → 늘어짐(농현 70센트)      | outcomes|
 * | draw     | 1.8s  | 210~4k      | 회전 주기 다섯 바퀴             | actions |
 * | perjury  | 2.5s  | 서브 + 숨   | 타격이 아예 없다                | actions |
 * | ousted   | 2.6s  | 30~600      | 경첩 삐걱 + 가장 어둡다         | outcomes|
 * | round    | 4s    | 종 110      | 종 + 개정 전 웅성거림           | outcomes|
 * | caught   | 4.5s  | 24~9k       | 공(gong) + 밝은 파편 + 방청석   | outcomes|
 * | win      | 5s    | 종 + 단3화음| 유일하게 닫힌다                 | outcomes|
 * | lose     | 5s    | 전부 하강   | 신음 + 저역 잔해                | outcomes|
 *
 * 재료를 아끼는 것도 규칙이다. **웅성거림은 round와 caught에만**(방청석이 반응할 만한
 * 자리는 그 둘뿐이다), **밝은 파편은 caught에만**, **쇳소리는 쇠가 있는 자리에만** 쓴다.
 *
 * **종(bell)과 공(gong)을 구별한다.** 종은 배음비가 정수에 가까워 음정이 잡히므로
 * 개시·승리처럼 «알리는» 자리의 것이고(round·win), 공은 비정수비라 음정이 안 잡히고
 * 낮게 번져 «큰일 났다»의 자리인 caught 전용이다. 서로 넘어가면 셋 다 흐려진다.
 *
 * gain은 «가장 큰 소리를 1로 봤을 때»의 비율이다. 전체 음량과 잔향은 engine의
 * 효과음 버스가 한 번에 잡으므로 레시피에서 다시 곱하지 않는다.
 */

import { now } from './engine'
import { challenge, draw, myTurn, perjury, refute, suggest } from './sfx-actions'
import { caught, lose, ousted, round, win, wrongCall } from './sfx-outcomes'

export type SfxName =
  /** 제안 접수 — 도장 */
  | 'suggest'
  /** 반증 제출 — 카드가 놓인다 */
  | 'refute'
  /** 내가 거짓 반증을 낸다 — 아직 아무도 모르는 한 수 */
  | 'perjury'
  /** 위증 의심 지목 */
  | 'challenge'
  /** 위증 발각 */
  | 'caught'
  /** 의심이 틀렸다 */
  | 'wrongCall'
  /** 제N회 신문 개시 */
  | 'round'
  /** 당신의 차례다 */
  | 'myTurn'
  /** 반증 추첨 */
  | 'draw'
  /** 고발 실패로 판에서 빠진다 */
  | 'ousted'
  | 'win'
  | 'lose'

type Recipe = (at: number) => void

/**
 * 이름 → 레시피. **Record라서 열두 개를 다 채우지 않으면 빌드가 깨진다** —
 * SfxName에 이름을 하나 더하면 여기가 즉시 알려 주므로, 소리 없는 이름이 생기지 않는다.
 */
const RECIPES: Record<SfxName, Recipe> = {
  suggest,
  refute,
  perjury,
  challenge,
  myTurn,
  draw,
  round,
  caught,
  wrongCall,
  ousted,
  win,
  lose,
}

/**
 * 효과음 한 방.
 *
 * 지금 시각보다 아주 조금 뒤로 예약한다 — 정확히 «지금»으로 잡으면 예약이 이미 지나간
 * 시각이 돼 첫 램프가 통째로 잘리고, 소리가 «틱» 하고 끊겨 들린다.
 */
export function playSynthSfx(name: SfxName): void {
  RECIPES[name](now() + 0.01)
}
