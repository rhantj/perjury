// 화면 검증용 가짜 데이터. D2에서 진짜 타입이 나오면 통째로 버린다.
// 여기 타입을 엔진에 재사용하지 않는다 — 화면에 필요한 모양일 뿐이다.

export type CardKind = 'suspect' | 'weapon' | 'place'

export interface Card {
  id: string
  kind: CardKind
  name: string
}

export interface Character {
  id: string
  name: string
  job: string
  trust: number // 0~100, 플레이어에 대한 신뢰도
  isPlayer: boolean
}

export const KIND_LABEL: Record<CardKind, string> = {
  suspect: '범인',
  weapon: '흉기',
  place: '장소',
}

// 임시 구성: 6 / 4 / 5 = 15장. 정답 3장 봉인 후 12장을 6명이 2장씩.
export const CARDS: Card[] = [
  { id: 's1', kind: 'suspect', name: '강도윤' },
  { id: 's2', kind: 'suspect', name: '서지혜' },
  { id: 's3', kind: 'suspect', name: '문태석' },
  { id: 's4', kind: 'suspect', name: '백나경' },
  { id: 's5', kind: 'suspect', name: '오현우' },
  { id: 's6', kind: 'suspect', name: '임세라' },

  { id: 'w1', kind: 'weapon', name: '대리석 문진' },
  { id: 'w2', kind: 'weapon', name: '넥타이' },
  { id: 'w3', kind: 'weapon', name: '수면제' },
  { id: 'w4', kind: 'weapon', name: '계단' },

  { id: 'p1', kind: 'place', name: '서재' },
  { id: 'p2', kind: 'place', name: '응접실' },
  { id: 'p3', kind: 'place', name: '옥상' },
  { id: 'p4', kind: 'place', name: '지하주차장' },
  { id: 'p5', kind: 'place', name: '별관 복도' },
]

export const CHARACTERS: Character[] = [
  { id: 's6', name: '임세라', job: '검시관', trust: 100, isPlayer: true },
  { id: 's1', name: '강도윤', job: '변호사', trust: 74, isPlayer: false },
  { id: 's2', name: '서지혜', job: '기자', trust: 41, isPlayer: false },
  { id: 's3', name: '문태석', job: '???', trust: 88, isPlayer: false },
  { id: 's4', name: '백나경', job: '정보상', trust: 12, isPlayer: false },
  { id: 's5', name: '오현우', job: '???', trust: 63, isPlayer: false },
]

// 플레이어 손패 — 추리표에서 자동으로 확정 표시되는 근거
export const MY_HAND = ['w2', 'p3']

export interface LogEntry {
  round: number
  actor: string
  text: string
  tone: 'suggest' | 'refute' | 'silent' | 'perjury'
}

export const LOG: LogEntry[] = [
  { round: 3, actor: '백나경', tone: 'suggest', text: '강도윤 · 수면제 · 서재를 제안했다.' },
  { round: 3, actor: '오현우', tone: 'silent', text: '반증하지 못했다.' },
  { round: 3, actor: '임세라', tone: 'silent', text: '반증하지 못했다.' },
  { round: 3, actor: '강도윤', tone: 'refute', text: '백나경에게 카드 1장을 보여주었다. (내용 비공개)' },
  { round: 2, actor: '서지혜', tone: 'perjury', text: '"옥상 카드 있습니다" — 내 손에도 옥상이 있다. 위증 확정.' },
  { round: 2, actor: '임세라', tone: 'suggest', text: '문태석 · 넥타이 · 옥상을 제안했다.' },
  { round: 1, actor: '문태석', tone: 'refute', text: '서지혜에게 카드 1장을 보여주었다. (내용 비공개)' },
  { round: 1, actor: '서지혜', tone: 'suggest', text: '백나경 · 대리석 문진 · 응접실을 제안했다.' },
]

export interface WhisperLine {
  from: 'me' | 'them'
  text: string
}

export const WHISPER: WhisperLine[] = [
  { from: 'them', text: '3라운드에 왜 반증 안 했죠? 손패가 비었을 리 없는데.' },
  { from: 'me', text: '그 조합이랑 겹치는 게 없었을 뿐입니다.' },
  { from: 'them', text: '증명해보세요. 장소 카드 하나만 말해주면 이번 판은 당신 안 지목합니다.' },
  { from: 'me', text: '옥상은 내가 갖고 있습니다. 대신 서지혜가 2라운드에 뭘 보여줬는지 알려주세요.' },
  { from: 'them', text: '...거래 성립. 근데 서지혜는 이미 위증 걸렸잖아요. 그 정보 값이 있나?' },
]
