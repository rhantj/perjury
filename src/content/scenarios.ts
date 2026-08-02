import { createRng } from '../engine/rng'

/**
 * 사건 시나리오. 세계관은 경성 하나로 고정이고 사건만 바뀐다.
 *
 * 용의자 «이름» 6개는 시나리오와 무관하게 고정이다 (engine/cards.ts).
 * 여기서 바뀌는 것은 직함·수단·장소뿐이라 폴백 대사 풀을 한 벌로 유지할 수 있다.
 * 결정 근거는 docs/decisions/002-직업-풀과-시나리오.md.
 */

export interface Title {
  ko: string
  hanja: string
}

export interface Scenario {
  id: string
  /** 사건 이름. 랜딩 부제로 쓴다. */
  title: string
  hanja: string
  /** 한 문장 도입. 랜딩에서 한 글자씩 찍힌다. */
  intro: string
  /** 용의자 6명의 직함. cardsOfKind('suspect') 순서와 1:1로 맞춘다. */
  titles: readonly [Title, Title, Title, Title, Title, Title]
  /** 수단 4장. 코드상 kind는 'weapon'이지만 살인사건이 아닌 판도 있어 «수단»으로 읽는다. */
  means: readonly [string, string, string, string]
  places: readonly [string, string, string, string, string]
}

export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'mansion',
    title: '자하동 저택 살인사건',
    hanja: '紫霞洞',
    intro: '문은 안에서 잠겨 있었다.',
    titles: [
      { ko: '장남', hanja: '長男' },
      { ko: '안주인', hanja: '內堂' },
      { ko: '집사', hanja: '執事' },
      { ko: '기생', hanja: '妓生' },
      { ko: '서생', hanja: '書生' },
      { ko: '유모', hanja: '乳母' },
    ],
    means: ['대리석 문진', '명주 목도리', '아편팅크', '계단'],
    places: ['서재', '응접실', '옥상', '마차고', '별관 복도'],
  },
  {
    id: 'informer',
    title: '밀고자 색출',
    hanja: '密告者',
    intro: '그 자리를 아는 사람은 여섯뿐이었다.',
    titles: [
      { ko: '연락책', hanja: '連絡' },
      { ko: '자금책', hanja: '資金' },
      { ko: '인쇄공', hanja: '印刷工' },
      { ko: '전달책', hanja: '傳達' },
      { ko: '필경사', hanja: '筆耕士' },
      { ko: '문지기', hanja: '門直' },
    ],
    means: ['전보', '밀서', '암호책', '사진'],
    places: ['인쇄실', '뒷방', '지하 창고', '골목 어귀', '우물가'],
  },
  {
    id: 'opium',
    title: '아편굴 변사사건',
    hanja: '阿片窟',
    intro: '아무도 그를 모른다고 한다.',
    titles: [
      { ko: '굴주인', hanja: '窟主' },
      { ko: '중개인', hanja: '仲介' },
      { ko: '단골', hanja: '常客' },
      { ko: '심부름꾼', hanja: '使童' },
      { ko: '의생', hanja: '醫生' },
      { ko: '순찰', hanja: '巡察' },
    ],
    means: ['아편대', '주사기', '술병', '노끈'],
    places: ['골방', '부엌', '뒷문', '다락', '우물'],
  },
  {
    id: 'theater',
    title: '극장 분장실 사건',
    hanja: '劇場',
    intro: '막이 오르기 직전이었다.',
    titles: [
      { ko: '주연', hanja: '主演' },
      { ko: '조연', hanja: '助演' },
      { ko: '변사', hanja: '辯士' },
      { ko: '악사', hanja: '樂士' },
      { ko: '의상계', hanja: '衣裳係' },
      { ko: '무대감독', hanja: '舞臺監督' },
    ],
    means: ['분장용 백분', '조명줄', '무대칼', '축배잔'],
    places: ['분장실', '무대 뒤', '객석', '지하 연습실', '매표소'],
  },
]

/**
 * 시드로 사건을 고른다. 같은 판 번호는 항상 같은 사건이 된다.
 *
 * 시드를 `:scenario`로 파생시키는 이유는 격리다. createGame의 rng를 같이 쓰면
 * 여기서 난수를 한 번 더 뽑는 순간 기존 시드의 카드 배분이 전부 달라진다.
 */
export function pickScenario(seed: string): Scenario {
  const rng = createRng(`${seed}:scenario`)
  const picked = SCENARIOS[Math.floor(rng() * SCENARIOS.length)]
  if (!picked) throw new Error('시나리오 목록이 비어 있다')
  return picked
}
