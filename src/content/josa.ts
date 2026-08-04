/**
 * 한국어 조사를 받침에 맞춰 붙인다.
 *
 * 화면 문구를 템플릿 문자열로 짜면 `${카드명}로`처럼 조사가 고정된다. 카드 이름은
 * 데이터라서 받침이 제각각이고, 그러면 「문태석로」·「옥상를」 같은 말이 그대로 나간다.
 * 실제로 배포본에 그렇게 나가 있었다.
 *
 * **순수 함수다.** 문자열 하나를 받아 문자열 하나를 돌려준다.
 */

/** 조사 쌍. 이름은 받침 없는 쪽 형태를 딴다. */
export type JosaKind = 'ro' | 'eul' | 'i' | 'eun' | 'wa'

const PAIRS: Record<JosaKind, readonly [withoutFinal: string, withFinal: string]> = {
  ro: ['로', '으로'],
  eul: ['를', '을'],
  i: ['가', '이'],
  eun: ['는', '은'],
  wa: ['와', '과'],
}

/** 한글 음절 영역. 이 밖의 글자는 받침을 계산할 수 없다. */
const SYLLABLE_START = 0xac00
const SYLLABLE_END = 0xd7a3
const FINALS = 28
/** 종성 인덱스 8번이 ㄹ이다. */
const RIEUL = 8

/**
 * 숫자로 끝나는 이름의 받침. **읽는 소리를 따른다** — 「참가1」은 「참가일」이라 ㄹ받침이다.
 * 글자 모양만 보면 숫자에는 받침이 없어 보여서 전부 「참가1가」가 된다.
 */
const DIGIT_FINALS: Record<string, number> = {
  '0': 21, // 영 — ㅇ
  '1': RIEUL, // 일
  '2': 0, // 이
  '3': 16, // 삼 — ㅁ
  '4': 0, // 사
  '5': 0, // 오
  '6': 1, // 육 — ㄱ
  '7': RIEUL, // 칠
  '8': RIEUL, // 팔
  '9': 0, // 구
}

/**
 * 마지막 글자의 종성 인덱스. 받침이 없거나 판단할 수 없으면 0이다.
 *
 * 한글도 숫자도 아니면(로마자 등) 0으로 떨어뜨린다. 근거가 없을 때는 받침 없는 쪽이 덜 어색하다.
 */
function finalOf(word: string): number {
  const last = word.at(-1)
  if (!last) return 0

  const digit = DIGIT_FINALS[last]
  if (digit !== undefined) return digit

  const code = last.charCodeAt(0)
  if (code < SYLLABLE_START || code > SYLLABLE_END) return 0
  return (code - SYLLABLE_START) % FINALS
}

/**
 * 조사를 붙인 말을 만든다.
 *
 * 로/으로만 ㄹ받침을 「받침 없음」처럼 다룬다(「응접실로」). 나머지 조사는 그러지 않는다
 * (「응접실을」·「응접실이」). 이 한 줄이 로/으로를 다른 조사와 갈라놓는 전부다.
 */
export function josa(word: string, kind: JosaKind): string {
  const final = finalOf(word)
  const hasFinal = kind === 'ro' ? final !== 0 && final !== RIEUL : final !== 0
  const pair = PAIRS[kind]
  return `${word}${hasFinal ? pair[1] : pair[0]}`
}
