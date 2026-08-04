import { josa } from '../content/josa'
import { cardLabel, participantInitial, participantLabel } from '../content/labels'
import type { Scenario } from '../content/scenarios'
import type { CardId } from '../engine/types'
import type { GameView, RoundView } from '../engine/view'

interface Props {
  view: GameView
  scenario: Scenario
}

/**
 * 한 줄의 기록.
 *
 * 반증 선언은 원래 «대사»다 — 「없습니다」도 진술이고 그래서 위증이 될 수 있다(설계 §1.4.1).
 * 그러니 화자를 떼어내 말풍선으로 세운다. 사실 서술(제안·발각·공개)은 화자 없이 지문으로 둔다.
 */
interface Line {
  tone: string
  /** 있으면 말풍선, 없으면 지문. */
  who: string | null
  /** 말풍선 얼굴칸에 쓰는 글자. who와 짝이다. */
  face: string | null
  text: string
  /**
   * LLM이 쓴 대사. text를 «대체하지 않는다» — 대사가 카드 이름을 말하지 않을 수도 있어서
   * 대체하면 무엇으로 반증했는지가 기록에서 사라진다. 없으면 null이다(사람·규칙 기반·폴백).
   */
  quote: string | null
  mine: boolean
}

function nameOf(view: GameView, id: string): string {
  return participantLabel(view, id)
}

/**
 * 「누가」에 해당하는 말. 조사까지 붙여 돌려준다.
 *
 * 나 자신은 「나가」가 아니라 **「내가」**다 — 조사 규칙이 아니라 대명사가 통째로 바뀌는
 * 예외라서 josa()로는 못 만든다. 여기서 한 번만 갈라 둔다.
 */
function subject(view: GameView, id: string): string {
  const name = nameOf(view, id)
  return name === '나' ? '내가' : josa(name, 'i')
}

function lines(view: GameView, scenario: Scenario, round: RoundView): Line[] {
  const label = (id: CardId) => cardLabel(scenario, id)

  const out: Line[] = [
    {
      tone: 'suggest',
      who: null,
      face: null,
      quote: round.suggestionLine,
      mine: false,
      text: `${subject(view, round.suggesterId)} ${label(round.suggestion.suspect)} · ${label(
        round.suggestion.weapon,
      )} · ${josa(label(round.suggestion.place), 'eul')} 올렸다.`,
    },
  ]

  for (const d of round.declarations) {
    out.push(
      d.claim.kind === 'refute'
        ? {
            tone: 'refute',
            who: nameOf(view, d.playerId),
            face: participantInitial(view, d.playerId),
            quote: d.line,
            mine: d.playerId === view.viewerId,
            text: `${josa(label(d.claim.cardId), 'ro')} 반증합니다.`,
          }
        : {
            tone: 'pass',
            who: nameOf(view, d.playerId),
            face: participantInitial(view, d.playerId),
            quote: d.line,
            mine: d.playerId === view.viewerId,
            text: '없습니다.',
          },
    )
  }

  if (round.challenge) {
    const { challengerId, targetId, cardId, success, reveals, line } = round.challenge
    out.push({
      tone: success ? 'caught' : 'failed',
      who: null,
      face: null,
      quote: line,
      mine: false,
      text: success
        ? `${subject(view, challengerId)} ${nameOf(view, targetId)}의 위증을 잡았다 — ${josa(label(cardId), 'eun')} 자신이 갖고 있다.`
        : `${nameOf(view, challengerId)}의 이의제기가 실패했다.`,
    })
    for (const r of reveals) {
      out.push({
        tone: 'reveal',
        who: null,
        face: null,
        quote: null,
        mine: false,
        text: `${nameOf(view, r.playerId)}의 ${josa(label(r.cardId), 'i')} 공개됐다.`,
      })
    }
  }

  return out
}

/** 증언 기록. 이 게임에서 오가는 «말»이 전부 여기 쌓인다. */
export default function Log({ view, scenario }: Props) {
  const rounds = [...view.rounds].reverse()

  return (
    <ol className="log">
      {rounds.map((round) => (
        <li key={round.round} className="log__round">
          <span className="log__num">제{round.round}회 신문</span>
          <ul className="log__items">
            {lines(view, scenario, round).map((line, i) => (
              <li
                key={i}
                className={[
                  'say',
                  `say--${line.tone}`,
                  line.who ? '' : 'say--note',
                  line.mine ? 'say--mine' : '',
                ]
                  .join(' ')
                  .trim()}
              >
                {line.who ? (
                  <>
                    <span className="say__face">{line.face}</span>
                    <span className="say__body">
                      <span className="say__who">{line.who}</span>
                      <span className="say__bubble">{line.text}</span>
                      {/* 텍스트로만 그린다 — 모델이 만든 문자열이다(절대 규칙 3). */}
                      {line.quote && <span className="say__quote">“{line.quote}”</span>}
                    </span>
                  </>
                ) : (
                  <>
                    {line.text}
                    {line.quote && <span className="say__quote">“{line.quote}”</span>}
                  </>
                )}
              </li>
            ))}
          </ul>
        </li>
      ))}
      {rounds.length === 0 && <li className="log__empty">아직 아무도 입을 열지 않았다.</li>}
    </ol>
  )
}
