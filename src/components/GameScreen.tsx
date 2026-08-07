import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { FallbackReason } from '../ai/decider'
import { llmDeciderForRound } from '../ai/llm-decider'
import { playBgm, playSfx, unlock } from '../audio/audio'
import type { SfxName } from '../audio/audio'
import { cardLabel, cardNames, participantLabel, seatSlot } from '../content/labels'
import { josa } from '../content/josa'
import { placeArtFor } from '../content/place-art'
import type { Scenario } from '../content/scenarios'
import { suspectArtFor } from '../content/suspect-art'
import { weaponArtFor } from '../content/weapon-art'
import { CHALLENGE_LIMIT, challengesUsedIn } from '../engine/challenge'
import type { CardId, CardKind, Suggestion } from '../engine/types'
import type { GameView } from '../engine/view'
import { useGame } from '../store/game'
import Briefing from './Briefing'
import DrawCut, { DRAW_CUT_MS } from './DrawCut'
import type { Plate } from './DrawCut'
import Landing from './Landing'
import Log from './Log'
import MyPlate from './MyPlate'
import Notebook from './Notebook'
import Parley from './Parley'
import PowerPanel from './PowerPanel'
import Table from './Table'
import Verdict from './Verdict'
import '../styles/game.css'

type Picked = Partial<Record<CardKind, CardId>>

/**
 * 판 번호. 이 한 값이 진영·직업·카드 배분을 전부 결정하므로 **매판 새로 뽑아야 한다** —
 * 고정해 두면 표지에서 시작할 때마다 같은 진영·같은 직업이 나온다(설계 §2는 매판 무작위 배정이다).
 *
 * 난수는 여기서만 쓴다. 엔진은 이 문자열을 받아 결정론적으로 판을 만든다.
 */
function newSeed(): string {
  return Math.random().toString(36).slice(2, 8)
}

/** 판은 하나지만 화면은 둘이다 — 브리핑을 거친 뒤에 게임판이 열린다. */
type Stage = 'briefing' | 'play'

function toSuggestion(picked: Picked): Suggestion | null {
  const { suspect, weapon, place } = picked
  return suspect && weapon && place ? { suspect, weapon, place } : null
}

/** 화면 전체 알림 한 건. round는 라운드가 넘어갈 때, myTurn은 내 제안 차례가 될 때 큐에 들어간다. */
interface FlashEvent {
  kind:
    | 'round'
    | 'suggest'
    | 'refute'
    | 'perjury'
    | 'myTurn'
    | 'caught'
    | 'challengeCall'
    | 'wrongCall'
    | 'draw'
  text: string
  /** 주 문구 아래 작게 붙는 보조 문구. */
  detail?: string
  /**
   * 추첨 명패. draw 전용 — 제안자를 뺀 후보 전원이 좌석 순서대로 들어간다.
   *
   * 큐에 «넣는 시점»의 값을 굳혀 담는다. 렌더 때 view에서 다시 읽으면
   * 앞선 알림이 큐에서 대기하는 사이 라운드가 넘어가 다음 판의 추첨이 그려진다.
   */
  plates?: readonly Plate[]
  /** 이의제기로 공개된 카드 그림. caught·wrongCall 전용 — 있으면 문구와 함께 카드 실물을 크게 띄운다. */
  art?: string
  /** CSS 애니메이션 길이와 맞춘다 — 다 안 끝났는데 다음 알림이 겹쳐 뜨는 걸 이걸로 막는다. */
  ms: number
  /**
   * 이 알림이 사라진 뒤 다음 알림까지 비워 두는 시간.
   *
   * 「의심 → 오판이 너무 빨리 넘어간다」는 피드백 — 두 알림이 한 사건의 두 박자인데
   * 끝나자마자 곧바로 다음 게 뜨니 «지목»을 읽는 도중에 «판정»이 덮어썼다. 모든 플래시
   * 키프레임이 opacity 0으로 끝나므로, 이 틈 동안 화면은 원탁으로 잠깐 돌아온다 —
   * 그 한 박자가 있어야 둘이 별개의 사건으로 읽힌다.
   */
  gapMs?: number
  /**
   * 이 알림이 «뜨기 전에» 비워 두는 시간. gapMs의 반대쪽이다.
   *
   * 「제안하자마자 추첨이 튄다」는 피드백 — 제안 확정과 추첨 컷이 한 박자로 붙어,
   * 내가 무엇을 제안했는지 원탁에서 확인하기도 전에 화면이 추첨통으로 덮였다.
   *
   * gapMs로는 안 된다. 그건 «앞 알림»에 다는 값이라 앞이 이미 끝나 큐가 비어 있으면
   * 아무 효과가 없는데, 제안 뒤 상태 갱신이 AI 판단을 기다리느라 늦게 오면 정확히
   * 그 상황이 된다. 늦게 오든 빨리 오든 같은 뜸을 주려면 «뒤 알림»이 들고 있어야 한다.
   */
  leadMs?: number
}

/*
 * 이의제기 연출의 두 박자 길이. 상수로 빼는 건 challengeCall을 «내가 걸 때»와
 * «AI가 걸 때» 두 군데서 각각 큐에 넣기 때문이다 — 숫자를 양쪽에 적어 두면 한쪽만
 * 고쳐져 같은 사건이 사람마다 다른 속도로 흐른다.
 * 셋 다 game.css의 .action-flash--challengeCall / --caught / --wrongCall
 * 애니메이션 길이와 쌍이다. 한쪽만 고치면 연출이 끝나기 전에 잘리거나, 끝난 뒤에도
 * 빈 화면이 남는다.
 */
/**
 * 어떤 알림에 어떤 효과음을 붙이는가.
 *
 * 큐에 «넣을 때»가 아니라 화면에 «뜰 때» 울려야 한다 — 앞선 알림이 대기 중이면
 * 소리만 몇 초 먼저 나가 엉뚱한 장면에 얹힌다. 그래서 runFlashQueue가 이걸 읽는다.
 *
 * caught에 위증 효과음을 같이 매는 이유는 그 컷이 «남의 위증이 드러나는» 순간이라서다.
 * perjury는 내가 거짓 반증을 낼 때만 뜨므로, 이것만 걸면 AI가 걸리는 쪽에는 소리가 없다.
 */
const SFX_FOR_FLASH: Partial<Record<FlashEvent['kind'], SfxName>> = {
  suggest: 'suggest',
  refute: 'refute',
  perjury: 'perjury',
  caught: 'perjury',
}

/**
 * 제안이 접수되고 추첨 컷이 뜨기까지의 뜸.
 *
 * 이 사이에 화면은 원탁으로 돌아간다 — 내가 무엇을 제안했는지 좌석 위에서 한 번 읽고
 * 넘어가라는 자리다. 붙여 두면 제안과 추첨이 한 사건으로 뭉쳐 읽힌다.
 */
const DRAW_LEAD_MS = 900

const CHALLENGE_CALL_MS = 2000
const CHALLENGE_BEAT_MS = 520
const CHALLENGE_RESULT_MS = 2800
/**
 * 발각만 따로 길다. 위증을 «내는» 순간(perjury)이 아니라 그것이 «들통나는» 순간이
 * 판을 뒤집는 사건이라, 두 컷의 무게를 여기서 뒤집었다 — perjury는 900ms로 줄였다.
 * game.css의 .action-flash--caught 애니메이션 길이와 쌍이다.
 */
const CHALLENGE_CAUGHT_MS = 3400

/**
 * 제안 회차를 «바퀴»로 접는다. 여섯이 한 번씩 돌면 1라운드다(룰 개편 §3-1).
 *
 * 엔진은 회차로 세고(engine/setup.ts의 DEFAULT_ROUNDS = 24) 화면만 바퀴로 보여준다.
 * 엔진을 바퀴 단위로 바꾸면 사진사의 「다음 라운드」가 최대 6선언 뒤로 밀려
 * 능력이 대폭 세진다 — 그래서 회차를 남기고 표시만 접는 쪽으로 정했다(룰 개편 §4).
 *
 * 좌석 수를 인자로 받는 것은 6을 두 번 적지 않기 위해서다. 판이 6인 고정이라도
 * 숫자를 화면에 박으면 엔진과 화면이 서로 다른 바퀴를 세는 날이 온다.
 */
function lapOf(round: number, seats: number): number {
  return Math.ceil(round / seats)
}

/** 손패 카드 사진. MyPlate.artFor와 같은 소스 — id 접두사가 종류별로 갈려 하나만 걸린다. */
function cardArtFor(scenario: Scenario, id: CardId): string | undefined {
  return suspectArtFor(id) ?? placeArtFor(scenario, id) ?? weaponArtFor(scenario, id)
}

export default function GameScreen() {
  const store = useGame()
  const [picked, setPicked] = useState<Picked>({})
  /**
   * 조기 고발을 «고르는 중»인가.
   *
   * 제안과 손가락이 겹치기 때문에 모드로 가른다 — 둘 다 카드 석 장을 고르는 일이라,
   * 같은 화면에서 버튼만 둘로 두면 「제안 확정」과 「고발」을 잘못 누른 순간 판이 끝난다.
   * 고발은 되돌릴 수 없으므로 «지금 고발을 고르는 중»이라는 상태가 화면에 남아야 한다.
   */
  const [accusing, setAccusing] = useState(false)
  const [seed, setSeed] = useState(newSeed)
  const [stage, setStage] = useState<Stage>('briefing')
  /** 브리핑에서 고른 사건. 카드 표시 이름과 좌석 직함이 여기서 나온다. */
  const [scenario, setScenario] = useState<Scenario | null>(null)
  /*
   * 같은 사건을 판단자에게도 보여주는 통로.
   *
   * state를 그대로 못 쓰는 이유는 판단자가 **판을 만들 때 한 번** 만들어지기 때문이다.
   * 그 시점의 클로저는 아직 null인 state를 붙잡고 영영 놓지 않는다(stale closure).
   * ref는 같은 상자를 계속 들여다보므로 나중에 정해진 사건이 그대로 보인다.
   */
  const scenarioRef = useRef<Scenario | null>(null)
  const chooseScenario = (chosen: Scenario | null) => {
    scenarioRef.current = chosen
    setScenario(chosen)
  }
  /** 착석 직후 게임판 위에 얹히는 도입 세 문장. */
  const [opening, setOpening] = useState(false)
  const closeOpening = useCallback(() => setOpening(false), [])
  /** 기록은 상시 옆에 두지 않는다 — 그 폭을 보드·추리표·내 패에 돌려주고, 필요할 때만 연다. */
  const [logOpen, setLogOpen] = useState(false)

  /*
   * 화면 전체 알림(라운드 전환·제안·반증·위증)을 한 큐로 세운다. 예전엔 라운드 전환과
   * 제출 알림이 각자 따로 뜨는 레이어라, 타이밍이 겹치면 두 문구가 한 화면에 포개졌다 —
   * 큐에 쌓았다가 이전 알림의 CSS 애니메이션이 끝난 뒤에만 다음 걸 마운트한다.
   */
  const [activeFlash, setActiveFlash] = useState<{ id: number; event: FlashEvent } | null>(null)
  const flashQueueRef = useRef<FlashEvent[]>([])
  const flashBusyRef = useRef(false)
  const flashSeqRef = useRef(0)
  const runFlashQueue = useCallback(() => {
    if (flashBusyRef.current) return
    const next = flashQueueRef.current.shift()
    if (!next) return
    // 뜸을 들이는 동안에도 큐는 «바쁘다» — 여기서 풀면 뒤엣것이 먼저 끼어들어 순서가 뒤집힌다.
    flashBusyRef.current = true
    const show = () => {
      flashSeqRef.current += 1
      setActiveFlash({ id: flashSeqRef.current, event: next })
      // 소리는 «뜰 때» 울린다 — 뜸 들이는 동안 먼저 나가면 빈 화면에 소리만 얹힌다.
      const sfx = SFX_FOR_FLASH[next.kind]
      if (sfx) playSfx(sfx)
      window.setTimeout(() => {
        flashBusyRef.current = false
        runFlashQueue()
      }, next.ms + (next.gapMs ?? 0))
    }
    if (next.leadMs) window.setTimeout(show, next.leadMs)
    else show()
  }, [])
  const enqueueFlash = useCallback(
    (event: FlashEvent) => {
      flashQueueRef.current.push(event)
      runFlashQueue()
    },
    [runFlashQueue],
  )

  /*
   * 제안·반증을 제출하는 순간의 화면 전체 신호. «위증」은 남의 위증 여부를 화면이
   * 대신 판정해 보여주면 안 된다(엔진 view.ts 주석 — isPerjury는 시야 밖이다) —
   * 하지만 «내가 지금 내 손패에 없는 카드로 반증한다»는 나 스스로 이미 아는 사실이라,
   * 그것만 감지해서 극적으로 띄운다. 남의 반증에는 이 판정을 절대 쓰지 않는다.
   */
  const fireActionFlash = (kind: 'suggest' | 'refute' | 'perjury') => {
    const byKind: Record<typeof kind, FlashEvent> = {
      suggest: { kind: 'suggest', text: '제안', ms: 700 },
      refute: { kind: 'refute', text: '반증합니다', ms: 650 },
      /*
       * 잠잠하게 둔다. 이건 «아직 아무도 모르는» 한 수라, 화면을 터뜨리면 판에서 가장
       * 큰 사건처럼 읽힌다. 정말 큰일이 나는 자리는 이게 들통나는 caught 쪽이다.
       */
      perjury: { kind: 'perjury', text: '위증', ms: 900 },
    }
    enqueueFlash(byKind[kind])
  }

  /**
   * 브리핑이 손패·진영을 보여주므로 판을 «먼저» 만들고 브리핑을 띄운다.
   * 순서를 뒤집으면 3막에서 보여줄 신분이 아직 없다.
   *
   * **어떤 판단자를 쓸지도 여기서 정한다.** store 기본값은 규칙 기반이라 단위 테스트가
   * 네트워크를 타지 않고, 프록시가 실패하면 store가 감싸는 폴백이 같은 시드로 받아낸다.
   */
  const open = (next: string) => {
    /*
     * 표지의 [게임 시작]이 이 판의 첫 클릭이다. 브라우저는 사용자가 페이지를 한 번
     * 건드리기 전까지 재생을 거부하므로, 소리를 여는 지점이 여기 말고는 없다.
     */
    unlock()
    playBgm('intro')
    setSeed(next)
    chooseScenario(null)
    /*
     * 카드 이름표는 «지금» 넘기지 않고 읽는 방법만 넘긴다. 사건은 다음 화면인 브리핑에서
     * 골라지므로 여기서 값으로 굳히면 아직 없는 사건으로 고정된다 — 화면은 고른 사건을
     * 그리는데 모델은 다른 사건의 수단·장소 이름을 부르게 된다.
     */
    store.start(next, 0, (_seed, powerOf) =>
      llmDeciderForRound(powerOf, () => {
        const chosen = scenarioRef.current
        return chosen ? cardNames(chosen) : {}
      }),
    )
    setStage('briefing')
  }

  /*
   * store.state가 있을 때만 view가 존재한다 — 훅은 항상 같은 순서로 불러야 하므로
   * (Rules of Hooks) «없으면 여기서 바로 return」을 이 지점보다 앞에 두지 않는다.
   * 아래 라운드 전환 감지 useEffect가 이 view를 참조하기 때문이다.
   */
  const view = store.state ? store.view() : null

  /*
   * 바퀴가 바뀔 때마다 큐에 신문 알림을 넣는다. 1라운드는 착석 컷이 이미 시작을 알린다.
   *
   * **회차가 아니라 바퀴로 센다.** 회차마다 띄우면 24제안 = 23번이라 알림이 판을 덮는다.
   * 바퀴로 접으면 세 번(2·3·4라운드)만 뜨고, 그 세 번이 실제로 국면이 바뀌는 지점이다.
   */
  const lastLapRef = useRef(0)
  useEffect(() => {
    if (!view) return
    const lap = lapOf(view.round, view.players.length)
    if (lap === lastLapRef.current) return
    lastLapRef.current = lap
    if (lap > 1) {
      enqueueFlash({ kind: 'round', text: `제${lap}회 신문`, ms: 1000 })
    }
  }, [view?.round, view?.players.length, enqueueFlash])

  /*
   * 제안이 나오면 반증 추첨 컷을 큐에 넣는다.
   *
   * 라운드가 아니라 «라운드 기록이 생겼는가»로 감지한다 — 기록은 제안이 접수돼야
   * 만들어지므로(engine/round.ts suggest), 라운드가 넘어간 직후 아직 아무도 제안하지
   * 않은 순간에 빈 추첨통이 뜨는 걸 이걸로 막는다.
   *
   * stage·opening으로 막는 이유는 아래 myTurn 훅과 같다: 판이 이미 굴러가는 동안
   * 브리핑·착석 컷이 화면을 덮고 있어서, 그대로 두면 게임판에 들어오기도 전에
   * 1라운드 추첨이 혼자 끝난다. 여기서 걸러도 opening이 걷히면 훅이 다시 돌아 뜬다.
   */
  const lastDrawRoundRef = useRef(0)
  useEffect(() => {
    if (!view || stage !== 'play' || opening) return
    const record = view.rounds[view.rounds.length - 1]
    if (!record || record.round !== view.round) return
    if (lastDrawRoundRef.current === record.round) return
    lastDrawRoundRef.current = record.round

    const plates: Plate[] = view.players
      .filter((p) => p.id !== record.suggesterId)
      .map((p) => ({
        id: p.id,
        name: participantLabel(view, p.id),
        drawn: record.responderIds.includes(p.id),
        slot: seatSlot(view, p.id),
      }))

    enqueueFlash({ kind: 'draw', text: '반증 추첨', plates, ms: DRAW_CUT_MS, leadMs: DRAW_LEAD_MS })
  }, [view, stage, opening, enqueueFlash])

  /*
   * 이의제기 결과(성공·실패 둘 다)를 화면 전체로 띄운다. 이전에는 성공(위증 확정)만
   * 다뤘는데, 실패했을 때(내가 위증을 의심했지만 틀려서 내 패가 대신 열리는 순간)의
   * 연출은 좌석 위 작은 팝업뿐이라 «누가 누구를 왜 의심했다가 무슨 카드를 잃었는지»가
   * 안 보인다는 피드백 — 성공은 발각(금빛·확정), 실패는 오판(냉랭한 톤)으로 갈라 보여준다.
   * AI끼리의 이의제기도 대상이라 view.round가 아니라 view.phase로 감지한다(같은 라운드
   * 안에서 벌어지는 일이라 round 값 자체는 안 바뀐다).
   *
   * reveals에는 성공 시 증거로 쓰인 카드(challenge.cardId)와, 무작위로 추가 공개된
   * 패널티 카드가 섞여 있다 — cardId와 다른 것만 패널티다(실패 시엔 패널티 하나뿐이다).
   * 패널티가 없을 수도 있다(공개할 패가 없을 때).
   */
  const lastCaughtRoundRef = useRef<number | null>(null)
  useEffect(() => {
    if (!view || !scenario) return
    const record = view.rounds[view.rounds.length - 1]
    const challenge = record?.round === view.round ? record.challenge : null
    if (!challenge) return
    if (lastCaughtRoundRef.current === view.round) return
    lastCaughtRoundRef.current = view.round

    const penalty = challenge.reveals.find((r) => r.cardId !== challenge.cardId) ?? null
    const challenger = participantLabel(view, challenge.challengerId)
    const target = participantLabel(view, challenge.targetId)

    /*
     * 예고 한 박자를 AI가 건 이의제기에도 붙인다. 내가 걸 때는 버튼 핸들러가 «누구를
     * 위증으로 지목했는지»를 먼저 띄우고 결과가 뒤따르는 2단인데, AI가 걸면 그 앞이
     * 통째로 없어서 결과만 툭 떨어졌다 — 같은 사건인데 남의 차례일 때만 밋밋했다.
     * 내가 건 경우에는 핸들러가 이미 넣었으므로 여기서 또 넣으면 두 번 뜬다.
     */
    if (view.players.find((p) => p.isMe)?.id !== challenge.challengerId) {
      enqueueFlash({
        kind: 'challengeCall',
        text: `${challenger} → ${target} 위증 의심!`,
        detail: '이의를 제기했다',
        ms: CHALLENGE_CALL_MS,
        gapMs: CHALLENGE_BEAT_MS,
      })
    }

    if (challenge.success) {
      enqueueFlash({
        kind: 'caught',
        text: `${target} 위증 발각!`,
        detail: penalty ? `${challenger}이(가) 밝힌 ${cardLabel(scenario, penalty.cardId)} 카드가 열렸다` : '더 밝힐 패가 없다',
        art: penalty ? cardArtFor(scenario, penalty.cardId) : undefined,
        ms: CHALLENGE_CAUGHT_MS,
      })
    } else {
      enqueueFlash({
        kind: 'wrongCall',
        text: `${challenger}의 오판`,
        detail: penalty
          ? `${target}은(는) 위증이 아니었다 — 대신 ${challenger}의 ${cardLabel(scenario, penalty.cardId)} 카드가 열렸다`
          : `${target}은(는) 위증이 아니었다`,
        art: penalty ? cardArtFor(scenario, penalty.cardId) : undefined,
        ms: CHALLENGE_RESULT_MS,
      })
    }
  }, [view?.phase, view?.round, scenario, enqueueFlash])

  /*
   * 내 제안 차례가 될 때마다 큐에 안내를 넣는다. stage/opening으로 막는 이유 —
   * 훅은 Briefing 화면일 때도 이미 돌고 있어서, 판 시작 즉시(1라운드는 항상 내 차례다)
   * 게임판 진입 전에 애니메이션이 다 끝나버릴 수 있다. 실제로 화면에 뜨는 시점까지 미룬다.
   */
  const lastMyTurnKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (!view || stage !== 'play' || opening) return
    if (view.phase !== 'suggest') return
    if (view.players[view.turnIndex]?.isMe !== true) return

    const key = `${view.round}:${view.turnIndex}`
    if (lastMyTurnKeyRef.current === key) return
    lastMyTurnKeyRef.current = key

    enqueueFlash({
      kind: 'myTurn',
      text: '당신의 차례다',
      detail: '범인 · 수단 · 장소 — 하나씩 지목하라',
      ms: 1800,
    })
  }, [view, stage, opening, enqueueFlash])

  if (!store.state || !view)
    return <Landing seed={seed} onSeed={setSeed} onStart={() => open(newSeed())} />

  const role = store.role()
  if (stage === 'briefing' || !scenario)
    return (
      <Briefing
        seed={seed}
        view={view}
        role={role}
        onEnter={(chosen) => {
          chooseScenario(chosen)
          playBgm('table')
          setStage('play')
          setOpening(true)
        }}
        onBack={() => {
          playBgm('intro')
          store.reset()
        }}
      />
    )

  /**
   * 사람이 지금 조작할 수 있는가. AI가 판단 중이면 false다.
   *
   * store는 이미 이 값을 내주고 있었지만 화면이 읽지 않아서, 유일한 잠금이
   * store `apply`의 «조용히 삼키는» 가드뿐이었다. 눌러도 아무 일이 없으니
   * 멈춘 것처럼 보이고, 판단이 끝나 버튼이 갈리는 순간 클릭이 엉뚱한 곳에 떨어졌다.
   */
  const myMove = store.awaitingHuman()
  // 이번 라운드에 이미 건 밀담 수. 회선이 둘인 좌석에서 패널을 다시 열 때 쓴다.
  const liveParleys = view.rounds[view.rounds.length - 1]?.parleys.length ?? 0

  /*
   * 조기 고발은 «내 차례»를 기다리지 않는다 — 라운드 중간에 언제든 외칠 수 있다(룰 개편 §2-5).
   * 막는 것은 셋뿐이다: 이미 탈락했거나, 판이 끝났거나, 최종 고발 페이즈이거나.
   *
   * 마지막이 중요하다. 거기서도 받으면 «같은 오답»이 부르는 함수에 따라
   * 「판 종료·범인 승」과 「나만 탈락·판 계속」으로 갈려, 룰이 화면 배선에 따라 정해진다.
   * 엔진도 같은 이유로 막는다(engine/progress.ts의 accuseEarly).
   */
  const iAmOut = view.eliminated.includes(view.viewerId)
  const canAccuseEarly = !iAmOut && !view.outcome && view.phase !== 'accuse' && view.phase !== 'over'

  const picking = ((view.phase === 'suggest' || view.phase === 'accuse') && myMove) || accusing

  /*
   * 추리표에서 강조할 석 장.
   *
   * 고르는 동안은 내가 누른 것을, **확정한 뒤에는 상에 올라간 제안을** 계속 표시한다.
   * 확정하면서 picked를 비우기 때문에(submit) 예전에는 그 순간 강조가 사라졌는데,
   * 남들이 반증하는 시간이 정작 「내가 뭘 걸었더라」를 봐야 하는 시간이다.
   *
   * 남의 제안도 같은 자리에 표시한다. 상 한가운데 놓인 카드 석 장과 추리표의 세 줄이
   * 같이 켜져야 «지금 묻고 있는 것»과 «내가 아는 것»을 한눈에 맞춰 볼 수 있다.
   */
  const onTable = (() => {
    const record = view.rounds[view.rounds.length - 1]
    return record?.round === view.round ? record.suggestion : null
  })()
  const marked: Picked = picking ? picked : (onTable ?? {})
  /* 제안 순서가 나에게 왔을 때만 켠다 — 반증·이의제기는 순번이 아니라 동시/선착이라 여기 안 낀다. */
  const isMyTurn = view.phase === 'suggest' && view.players[view.turnIndex]?.isMe === true

  /*
   * 제출이 «끝난 뒤에» 고른 것을 비운다.
   *
   * 곧바로 비웠더니 확정하는 순간 상 위 카드가 사라졌다 — store의 apply는 AI 반증까지
   * 다 끝난 뒤 한 번만 상태를 쓰는데(store/game.ts), picked를 먼저 지우면 그 사이엔
   * draft도 없고 live도 없어 「아직 아무것도 오르지 않았다」로 떨어진다. LLM이 느릴수록
   * 그 빈 시간이 길어진다. 기다렸다 비우면 카드가 상에 놓인 채로 판정으로 이어진다.
   */
  /*
   * 조기 고발 확정. 모드를 «먼저» 닫는 이유는 이 한 번으로 판이 끝나거나(정답)
   * 내가 빠지거나(오답) 하기 때문이다 — 응답을 기다리는 사이 다시 눌리면 안 된다.
   */
  const callEarly = async () => {
    const accusation = toSuggestion(picked)
    if (!accusation) return
    setAccusing(false)
    await store.accuseEarly(accusation)
    setPicked({})
  }

  const submit = async (action: (s: Suggestion) => Promise<void>) => {
    const suggestion = toSuggestion(picked)
    if (!suggestion) return
    await action(suggestion)
    setPicked({})
  }

  /** 반증 제출. 내 손패와 대조해 «지금 내가 거짓을 말하는지» 그 자리에서 판정한다 — 이건 남이 아니라 나만의 사실이다. */
  const handleRefute = (claim: { kind: 'refute'; cardId: CardId } | { kind: 'pass' }) => {
    const hand = view.players.find((p) => p.isMe)?.hand ?? []
    const record = view.rounds[view.rounds.length - 1]
    const suggested = record
      ? [record.suggestion.suspect, record.suggestion.weapon, record.suggestion.place]
      : []
    const lying =
      claim.kind === 'refute' ? !hand.includes(claim.cardId) : suggested.some((c) => hand.includes(c))
    fireActionFlash(lying ? 'perjury' : 'refute')
    store.declare(claim)
  }

  /**
   * 변호사의 답변 거부. 능력을 켠 뒤 선언한다 — 무엇을 내든 엔진이 거부로 바꾼다.
   *
   * 「거부」를 반증 버튼 옆에 그냥 두지 않는 이유는, 그러면 변호사가 아닌 좌석에도
   * 눌러지는 버튼이 생기기 때문이다. 이 버튼은 능력을 통과하므로 직업이 곧 자격이다.
   */
  const handleRefuse = () => {
    store.usePower({})
    /*
     * 능력이 실제로 걸렸을 때만 선언한다. 걸리지 않았는데 그냥 선언하면 침묵이 되고,
     * 카드를 쥐고 있었다면 «위증이 되지 않는다»고 적힌 버튼이 위증을 만든다.
     */
    if (!store.powerUsed()) return
    store.declare({ kind: 'pass' })
  }

  return (
    /*
     * 덮개 두 겹은 .screen «밖»에 둔다. 안에 넣으면 게임판이 쌓임 맥락을 만들어
     * position:fixed + z-index가 통째로 갇히고, 좌석·추리표가 그 위로 올라온다.
     */
    <>
      {opening && <Opening lines={scenario.opening} onDone={closeOpening} />}
      {view.outcome && (
        <Verdict view={view} scenario={scenario} seed={seed} onRestart={() => open(newSeed())} />
      )}

      {/* 추첨만 문구가 아니라 별도 연출이라 같은 큐를 쓰되 렌더만 갈라진다. */}
      {activeFlash?.event.kind === 'draw' && (
        <DrawCut key={activeFlash.id} plates={activeFlash.event.plates ?? []} />
      )}

      {activeFlash && activeFlash.event.kind !== 'draw' && (
        <div
          key={activeFlash.id}
          className={`action-flash action-flash--${activeFlash.event.kind}`}
          aria-hidden="true"
        >
          {activeFlash.event.art && (
            <img className="action-flash__art" src={activeFlash.event.art} alt="" />
          )}
          <span>{activeFlash.event.text}</span>
          {activeFlash.event.detail && <small>{activeFlash.event.detail}</small>}
        </div>
      )}

      <div
        className={`screen${opening ? ' screen--entering' : ''}${isMyTurn ? ' screen--my-turn' : ''}`}
        data-scenario={scenario.id}
      >
        <header className="bar">
          <span className="bar__round">
            라운드 <b>{lapOf(view.round, view.players.length)}</b> /{' '}
            {lapOf(view.totalRounds, view.players.length)}
          </span>
          <span key={view.phase} className="bar__phase">
            {PHASE_LABEL[view.phase]}
          </span>
          {view.phase === 'suggest' && (
            <span
              key={view.turnIndex}
              className={`bar__turn${isMyTurn ? ' bar__turn--mine' : ''}`}
            >
              {isMyTurn ? '당신의 차례' : `${participantLabel(view, view.players[view.turnIndex]?.id ?? '')}의 차례`}
            </span>
          )}
          <span className="bar__case">
            {scenario.hanja} · {scenario.title}
          </span>
          {store.fallbackRound && <FallbackMark reason={store.fallbackReason} />}
          <button type="button" className="bar__log-toggle" onClick={() => setLogOpen(true)}>
            記 기록
            {view.rounds.length > 0 && <em>{view.rounds.length}</em>}
          </button>
        </header>

        <main className="board">
          <MyPlate
            view={view}
            scenario={scenario}
            role={role}
            powerUsed={store.powerUsed()}
            powerWaiting={store.powerWaiting()}
            out={iAmOut}
            powerSlot={
              <PowerPanel
                view={view}
                scenario={scenario}
                role={role}
                used={store.powerUsed()}
                findings={view.findings}
                enabled={myMove}
                out={iAmOut}
                onUse={store.usePower}
              />
            }
          />

          <div className="stage">
            {/* picked를 그대로 넘겨 «고르는 즉시» 그 카드가 상에 올라가게 한다. */}
            <Table view={view} scenario={scenario} draft={picked} />

            {/*
              라운드마다, 그리고 밀담 한 건이 끝날 때마다 새로 마운트한다 —
              지난 밀담에 고른 상대·쓴 말이 남으면 두 번째 회선이 첫 번째를 되풀이한다.
            */}
            <Parley
              key={`${view.round}:${liveParleys}`}
              view={view}
              open={view.phase === 'whisper' && myMove}
              onAsk={store.askParley}
              onDone={store.parley}
              onSkip={store.skipParley}
            />
          </div>

          <Notebook
            view={view}
            scenario={scenario}
            picking={picking}
            picked={marked}
            onPick={(kind, cardId) => setPicked((p) => ({ ...p, [kind]: cardId }))}
          />
        </main>

        <footer className="actions">
          {store.error && <p className="actions__error">{store.error}</p>}
          {/*
            고발을 고르는 동안은 나머지 조작을 감춘다. 제안과 손가락이 겹치므로
            두 확정 버튼이 한 화면에 같이 있으면 되돌릴 수 없는 쪽을 잘못 누른다.
          */}
          {accusing ? (
            <div className="accuse-early">
              <span className="accuse-early__ask" role="status">
                정답 석 장을 짚으시오 — 틀리면 이 판에서 빠진다
              </span>
              <button
                type="button"
                className="btn btn--danger"
                disabled={!toSuggestion(picked)}
                onClick={callEarly}
              >
                고발한다
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  setAccusing(false)
                  setPicked({})
                }}
              >
                무른다
              </button>
            </div>
          ) : iAmOut ? (
            /* 탈락자는 반증만 계속한다 — 제안·고발·밀담·능력을 잃는다(룰 개편 §2-5). */
            <p className="actions__waiting" role="status">
              판에서 빠졌다 — 반증만 이어 간다
            </p>
          ) : null}
          {!accusing && canAccuseEarly && (
            <button
              type="button"
              className="btn btn--ghost accuse-early__open"
              onClick={() => {
                setAccusing(true)
                setPicked({})
              }}
            >
              범인을 지목한다
            </button>
          )}
          {/*
            탈락자에게도 «반증 페이즈만» 이 줄을 연다. 잃는 것은 제안·고발·밀담·능력이고
            반증은 그대로이기 때문이다(룰 개편 §2-5). iAmOut으로 통째로 닫으면
            엔진은 그 사람의 선언을 계속 기다리는데(ai/flow.ts needsHuman) 낼 버튼이
            없어서 반증 페이즈에서 판이 영영 멈춘다 — 화면만의 소프트락이었다.
          */}
          {accusing || (iAmOut && view.phase !== 'refute') ? null : view.outcome ? null : !myMove ? (
            <Waiting />
          ) : view.phase === 'suggest' ? (
            <button
              type="button"
              className="btn btn--go"
              disabled={!toSuggestion(picked)}
              onClick={() => {
                fireActionFlash('suggest')
                submit(store.suggest)
              }}
            >
              제안 확정
            </button>
          ) : view.phase === 'refute' ? (
            <RefuteBar
              view={view}
              scenario={scenario}
              onRefute={handleRefute}
              /* 탈락자는 능력을 잃는다 — 누르면 엔진이 던진다(engine/power.ts). 버튼부터 거둔다. */
              onRefuse={
                !iAmOut && role.effect === 'refuse-demand' && !store.powerUsed()
                  ? handleRefuse
                  : null
              }
            />
          ) : view.phase === 'challenge' ? (
            <ChallengeBar
              view={view}
              onChallenge={(targetId) => {
                /*
                 * 결과(caught 플래시)는 판정이 끝나야 뜬다 — 그 전에 «내가 지금 누구를
                 * 위증으로 지목했는지»부터 먼저 보여 달라는 피드백. 큐에 먼저 넣어 두면
                 * 결과 플래시보다 앞서 뜨고, 뒤이어 결과가 자연스레 이어진다.
                 */
                enqueueFlash({
                  kind: 'challengeCall',
                  text: `${participantLabel(view, targetId)} 위증 의심!`,
                  detail: '이의를 제기한다',
                  ms: CHALLENGE_CALL_MS,
                  gapMs: CHALLENGE_BEAT_MS,
                })
                store.challenge(targetId)
              }}
              onPass={store.passChallenge}
            />
          ) : view.phase === 'accuse' ? (
            <button
              type="button"
              className="btn btn--danger"
              disabled={!toSuggestion(picked)}
              onClick={() => submit(store.accuse)}
            >
              최종 고발
            </button>
          ) : view.phase === 'whisper' ? (
            <p className="actions__waiting" role="status">
              밀담 자리에서 한 사람을 고른다
            </p>
          ) : null}
        </footer>
      </div>

      {logOpen && <LogDrawer view={view} scenario={scenario} onClose={() => setLogOpen(false)} />}
    </>
  )
}

/**
 * 기록 팝업. 상시 옆에 붙은 패널이 아니라 눌러야 열리는 창으로 바꿨다 —
 * 폭을 상시 점유하지 않아야 보드·추리표·내 패가 그만큼 커질 수 있다.
 * body에 직접 붙이는 이유는 Opening·Verdict와 같다: .screen 안에 두면 쌓임 맥락에 갇힌다.
 */
function LogDrawer({
  view,
  scenario,
  onClose,
}: {
  view: GameView
  scenario: Scenario
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div className="log-drawer" role="dialog" aria-label="기록">
      <button
        type="button"
        className="log-drawer__backdrop"
        onClick={onClose}
        aria-label="기록 닫기"
      />
      <div className="log-drawer__panel">
        <header className="log-drawer__head">
          <h2>기록</h2>
          <button type="button" className="log-drawer__close" onClick={onClose}>
            ✕
          </button>
        </header>
        <Log view={view} scenario={scenario} />
      </div>
    </div>,
    document.body,
  )
}

/** 도입 문장이 머무는 시간. game.css의 opening-veil 키프레임과 맞춰야 한다. */
const OPENING_MS = 6400

/**
 * 착석 컷. 화면을 하나 더 만들지 않고 게임판 «위에» 얹었다 걷는다 —
 * 표지·사건·용의자·신분까지 이미 네 번 넘겼으므로 절차를 더 늘리지 않는다.
 */
function Opening({ lines, onDone }: { lines: readonly string[]; onDone: () => void }) {
  useEffect(() => {
    const id = window.setTimeout(onDone, OPENING_MS)
    return () => window.clearTimeout(id)
  }, [onDone])

  /*
   * body에 직접 붙인다. 게임판 안에 두면 그쪽 쌓임 맥락에 갇혀
   * position:fixed와 z-index가 통째로 무시되고 좌석·추리표가 위로 올라온다.
   */
  return createPortal(
    <div className="opening" onClick={onDone} role="presentation">
      <div className="opening__lines">
        {lines.map((line, i) => (
          <p key={line} className="opening__line" style={{ '--i': i } as CSSProperties}>
            {line}
          </p>
        ))}
      </div>
      <span className="opening__skip">아무 곳이나 눌러 넘긴다</span>
    </div>,
    document.body,
  )
}

const PHASE_LABEL: Record<GameView['phase'], string> = {
  suggest: '제안',
  refute: '반증 선언',
  challenge: '이의제기',
  whisper: '밀담',
  accuse: '최종 고발',
  over: '종료',
}

/**
 * AI가 판단하는 동안의 대기 표시.
 *
 * **페이즈별 문구를 쓰지 않는다.** 대기 중에는 상태가 아직 안 바뀌어 view가 «옛» 페이즈를
 * 들고 있다 — 제안을 낸 직후에도 phase는 여전히 'suggest'다. 페이즈로 문구를 고르면
 * 실제로 벌어지는 일과 다른 말을 하게 된다. 어느 상황에서도 참인 한 문장만 쓴다.
 *
 * role="status"로 두어 화면을 못 보는 사람에게도 «지금 기다리는 중»이 전달되게 한다.
 */
/**
 * 이번 라운드가 규칙 기반 폴백으로 떨어졌다는 표시.
 *
 * **이건 편의 기능이 아니라 진단 장치다.** 폴백이 조용하면 LLM이 죽어도 판이 그대로
 * 굴러가서 아무도 모른다 — 실제로 워커가 요청을 거부하던 동안 판은 멀쩡히 끝났고,
 * 화면만 봐서는 «대사가 안 뜬다»로만 보였다.
 *
 * 문구를 사유로 가르는 이유는 **복구 가능성이 다르기** 때문이다.
 * error는 다음 라운드에 나을 수 있지만 budget은 그날 안에 낫지 않는다.
 */
function FallbackMark({ reason }: { reason: FallbackReason | null }) {
  return (
    <span className="bar__fallback" role="status">
      <b>代</b>
      {reason === 'budget' ? '예산 소진 — 오늘은 규칙으로 진행' : '연결 끊김 — 규칙으로 진행'}
    </span>
  )
}

function Waiting() {
  return (
    <p className="actions__waiting" role="status">
      다른 사람 추측중
      {[0, 1, 2].map((i) => (
        <i key={i} style={{ '--i': i } as CSSProperties} aria-hidden="true" />
      ))}
    </p>
  )
}

/** 반증 선언. 갖고 있지 않은 카드도 고를 수 있다 — 그것이 위증이다. */
function RefuteBar({
  view,
  scenario,
  onRefute,
  onRefuse,
}: {
  view: GameView
  scenario: Scenario
  onRefute: (claim: { kind: 'refute'; cardId: CardId } | { kind: 'pass' }) => void
  /** 변호사만 받는다. 그 외 좌석에는 null이라 버튼 자체가 없다. */
  onRefuse: (() => void) | null
}) {
  const record = view.rounds[view.rounds.length - 1]
  if (!record) return null

  const hand = view.players.find((p) => p.isMe)?.hand ?? []
  const cards = [record.suggestion.suspect, record.suggestion.weapon, record.suggestion.place]

  return (
    <div className="actions__row">
      {cards.map((cardId) => (
        <button
          key={cardId}
          type="button"
          className={`btn${hand.includes(cardId) ? ' btn--held' : ''}`}
          onClick={() => onRefute({ kind: 'refute', cardId })}
        >
          {josa(cardLabel(scenario, cardId), 'ro')} 반증
          {hand.includes(cardId) && <small>보유</small>}
        </button>
      ))}
      <button type="button" className="btn btn--ghost" onClick={() => onRefute({ kind: 'pass' })}>
        없습니다
      </button>
      {onRefuse && (
        <button type="button" className="btn btn--refuse" onClick={onRefuse}>
          답변 거부
          <small>위증이 되지 않는다</small>
        </button>
      )}
    </div>
  )
}

/** 이의제기. 증명할 수 없으면 내 카드만 잃는다. */
function ChallengeBar({
  view,
  onChallenge,
  onPass,
}: {
  view: GameView
  onChallenge: (targetId: string) => void
  onPass: () => void
}) {
  const record = view.rounds[view.rounds.length - 1]
  const me = view.players.find((p) => p.isMe)
  const hand = me?.hand ?? []

  /*
   * 남은 이의제기 (decisions/008). 이의제기는 이기든 지든 내 패 1장을 소모하므로
   * 판당 2회가 상한이고, 공개되지 않은 패가 없으면 아예 걸 수 없다.
   * 규칙이 있는데 안 보이면 없는 것과 같아서 숫자로 내건다 — 그리고 엔진이 거절하기
   * «전에» 눌리지 않아야 한다. 세는 방법은 엔진 한 곳에서 가져온다.
   */
  const left = CHALLENGE_LIMIT - challengesUsedIn(view.rounds, view.viewerId)
  const hidden = hand.filter((c) => !(me?.revealed ?? []).includes(c))
  const blocked =
    left <= 0 ? `판당 ${CHALLENGE_LIMIT}회를 다 썼다` : hidden.length === 0 ? '낼 수 있는 패가 없다' : null

  const targets = (record?.declarations ?? []).filter(
    (d) => d.claim.kind === 'refute' && d.playerId !== view.viewerId,
  )

  return (
    <div className="actions__row">
      <span className="actions__quota">
        이의제기 <b>{Math.max(0, left)}</b>/{CHALLENGE_LIMIT}
        {blocked && <em>{blocked}</em>}
      </span>
      {targets.map((d) => {
        /*
         * 「증명 가능」은 «그자가 낸 카드를 내가 쥐고 있다»는 뜻이라 카드가 보여야 뜬다.
         * 비공개 반증(1-B)이면 제안자에게만 보이는데, **이 줄이 서는 것도 제안자뿐이다**
         * (룰 개편 §2-4). 그래서 이 표시는 언제나 값을 한다 — 예전에는 나머지 좌석에서
         * 영영 안 떴고, 그 자리에서 이의제기가 눈감고 거는 일이었다.
         */
        const cardId = d.claim.kind === 'refute' ? d.claim.cardId : null
        const provable = cardId !== null && hand.includes(cardId)
        return (
          <button
            key={d.playerId}
            type="button"
            className={`btn${provable ? ' btn--held' : ''}`}
            disabled={blocked !== null}
            title={blocked ?? undefined}
            onClick={() => onChallenge(d.playerId)}
          >
            {participantLabel(view, d.playerId)} 위증
            {provable && <small>증명 가능</small>}
          </button>
        )
      })}
      <button type="button" className="btn btn--go" onClick={onPass}>
        넘어가기
      </button>
    </div>
  )
}
