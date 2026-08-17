/**
 * 버튼과 소리를 잇는 곳. 소리를 «만들지»는 않고(그건 sfx-ui.ts), 어떤 버튼이 어떤 소리를
 * 낼지만 정한다.
 *
 * **왜 버튼마다 onClick에 넣지 않았나.** 버튼이 아홉 개 파일에 서른여덟 개 흩어져 있다.
 * 거기에 하나씩 다는 것은 서른여덟 번의 수정이고, 앞으로 버튼을 새로 만들 때마다
 * 잊어버릴 수 있는 서른아홉 번째 자리를 만드는 일이다. 문서에 «버튼을 만들면 소리도
 * 붙이세요»라고 적어 두는 방식은 대체로 지켜지지 않는다.
 *
 * 그래서 **document에서 클릭을 한 번만 받아** 눌린 버튼의 성격을 읽는다. 새 버튼은
 * 아무것도 안 해도 소리가 나고, 성격이 다르면 그때만 data-sfx를 적는다.
 *
 * **성격을 클래스명에서 읽는 이유.** 이 프로젝트는 클래스명이 `block__element` BEM이라
 * 이미 뜻을 담고 있다(`briefing__back`, `btn--go`, `power__cancel`). 없는 규칙을
 * 새로 만드는 것보다 있는 규칙을 읽는 쪽이 어긋날 자리가 적다. 다만 클래스명은 화면을
 * 고치다 바뀔 수 있으므로, **틀리면 `data-sfx`로 덮어쓴다** — 그쪽이 언제나 이긴다.
 */

import { playSfx, sincePlaySfx } from './audio'
import type { SfxName } from './synth'

/** data-sfx에 적는 값 → 실제 소리. `none`은 «소리 내지 않음»이라 여기 없다. */
const NAMED: Record<string, SfxName> = {
  tap: 'uiTap',
  heavy: 'uiHeavy',
  confirm: 'uiConfirm',
  back: 'uiBack',
  toggleOn: 'uiToggleOn',
  toggleOff: 'uiToggleOff',
}

/**
 * 되돌리는 쪽. `ghost`가 여기 있는 것은 이 프로젝트에서 `btn--ghost`가 언제나
 * 패스·건너뛰기·물러남이기 때문이다 — 「강조하지 않은 버튼」이 아니라 「무르는 버튼」이다.
 */
const BACKWARD = /(^|[_-])(back|cancel|close|ghost|dismiss)/

/** 넘어가는 쪽. 화면이 바뀌거나 판이 한 칸 나아간다. */
const FORWARD = /(^|[_-])(go|enter|start|submit|accuse)/

/**
 * 게임 효과음이 방금 났으면 조작음을 겹치지 않는다.
 *
 * 제안·반증·지목 버튼은 이미 자기 소리가 있다. 거기에 «톡»을 하나 더 얹으면
 * 도장 소리의 앞머리가 지저분해질 뿐 아무것도 알려 주지 않는다. 버튼마다 예외를
 * 적어 두는 대신 **소리 쪽에서 겹침을 보고 판단**하게 했다 — 새 행동을 추가해도
 * 여기 손댈 일이 없다.
 *
 * 이 때문에 리스너를 **거품 단계**(React onClick 다음)에서 받는다. 잡기 단계에서 받으면
 * 게임 소리가 나기 «전»이라 방금 났는지 알 수 없다.
 */
const OVERLAP_MS = 160

function pick(el: HTMLButtonElement): SfxName | null {
  const named = el.dataset.sfx
  if (named === 'none') return null
  if (named !== undefined) return NAMED[named] ?? 'uiTap'

  const cls = el.className
  if (BACKWARD.test(cls)) return 'uiBack'
  if (FORWARD.test(cls)) return 'uiConfirm'
  return 'uiTap'
}

/**
 * 모든 버튼에 조작음을 붙인다. 해제 함수를 돌려준다.
 *
 * `closest('button')`을 쓰는 이유는 버튼 안의 글자나 아이콘을 눌러도 event.target이
 * 그 자식이 되기 때문이다. 버튼 자신을 찾아 올라가지 않으면 절반은 소리가 안 난다.
 */
export function bindButtonSfx(): () => void {
  const onClick = (event: MouseEvent) => {
    const target = event.target
    if (!(target instanceof Element)) return
    const button = target.closest('button')
    if (!button || button.disabled) return
    if (sincePlaySfx() < OVERLAP_MS) return
    const name = pick(button)
    if (name) playSfx(name)
  }
  document.addEventListener('click', onClick)
  return () => document.removeEventListener('click', onClick)
}

/**
 * 페이지의 첫 조작을 한 번만 잡아 준다. 해제 함수를 돌려준다.
 *
 * **표지에서 배경음이 안 나던 이유가 여기 있다.** 브라우저는 사용자가 페이지를 한 번
 * 건드리기 전까지 재생을 거부한다. 정책이라 우회할 수 없고, 우회를 시도하면 콘솔 경고만
 * 쌓이고 소리는 나지 않는다. 그래서 «화면에 들어오면 튼다»는 불가능하고,
 * **«화면에서 처음 무엇이든 하면 튼다»**가 할 수 있는 최선이다.
 *
 * 예전에는 그 지점이 [게임 시작] 버튼 하나였다. 표지를 둘러보는 동안은 아무 소리도
 * 나지 않았고, 그래서 «홈에는 배경음이 없다»가 됐다. 여기서 문턱을 화면 전체로 넓힌다 —
 * 씨앗 칸을 누르든 키를 치든 그 순간 곡이 올라온다.
 *
 * pointerdown·keydown·touchstart 셋을 다 보는 것은 입력 장치마다 첫 사건이 다르기
 * 때문이다. 어느 쪽이 먼저 오든 한 번만 실행되고 나머지는 그 자리에서 떨어져 나간다.
 */
export function bindFirstGesture(run: () => void): () => void {
  const events = ['pointerdown', 'keydown', 'touchstart'] as const
  let done = false

  const detach = () => {
    for (const type of events) document.removeEventListener(type, fire)
  }
  function fire(): void {
    if (done) return
    done = true
    detach()
    run()
  }

  for (const type of events) document.addEventListener(type, fire)
  return detach
}
