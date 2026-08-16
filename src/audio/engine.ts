/**
 * 소리를 «파일 없이» 만들기 위한 바닥. AudioContext 하나와 음 하나를 빚는 도구뿐이다.
 *
 * 효과음(synth.ts)과 배경음(drone.ts)이 같은 컨텍스트를 나눠 쓴다. 브라우저는 한 탭이
 * 열 수 있는 AudioContext 수를 제한하므로, 모듈마다 따로 만들면 판 중간에 소리가 통째로
 * 죽는다. 여기서 하나만 만들어 돌려 쓴다.
 *
 * **컨텍스트를 못 만들어도 정상 동작한다.** 구형 브라우저·오디오 장치 부재가 전부 여기로
 * 오는데, 어느 쪽이든 «소리가 안 난다»가 옳은 결과다(절대 규칙 4와 같은 태도).
 * 그래서 만드는 함수들은 던지지 않고 null을 준다.
 */

let ctx: AudioContext | null = null
let attempted = false

/** 없으면 만들고, 못 만들면 다시 시도하지 않는다 — 매번 생성자를 부르면 콘솔이 경고로 덮인다. */
function context(): AudioContext | null {
  if (ctx || attempted) return ctx
  attempted = true
  /* 사파리는 아직 접두사 붙은 이름만 준다. lib.dom에는 없는 이름이라 여기서 한 번 좁힌다. */
  const scope = window as unknown as {
    AudioContext?: new () => AudioContext
    webkitAudioContext?: new () => AudioContext
  }
  const Ctor = scope.AudioContext ?? scope.webkitAudioContext
  if (!Ctor) return null
  try {
    ctx = new Ctor()
  } catch {
    ctx = null
  }
  return ctx
}

let bus: DynamicsCompressorNode | null = null

/**
 * 모든 소리가 지나는 출구. 리미터를 한 겹 두는 이유는 한 효과음이 배음 대여섯 개를
 * 동시에 쌓기 때문이다 — 그냥 더하면 1.0을 넘겨 «지직»거리는 클리핑이 난다.
 */
export function output(): AudioNode | null {
  const c = context()
  if (!c) return null
  if (bus) return bus
  const comp = c.createDynamicsCompressor()
  const at = c.currentTime
  comp.threshold.setValueAtTime(-14, at)
  comp.knee.setValueAtTime(12, at)
  comp.ratio.setValueAtTime(8, at)
  comp.attack.setValueAtTime(0.003, at)
  comp.release.setValueAtTime(0.25, at)
  comp.connect(c.destination)
  bus = comp
  return comp
}

let sfx: GainNode | null = null

/**
 * 효과음 전용 손잡이. 레시피(synth.ts)는 «가장 큰 소리를 1로 봤을 때»의 비율만 적고,
 * 전체 음량은 여기서 한 번에 잡는다 — 레시피마다 곱셈을 넣으면 음량을 바꿀 때 열두 군데를 고쳐야 한다.
 */
function sfxBus(): GainNode | null {
  const c = context()
  const out = output()
  if (!c || !out) return null
  if (sfx) return sfx
  const node = c.createGain()
  node.gain.setValueAtTime(1, c.currentTime)
  node.connect(out)
  sfx = node
  return node
}

export function setSfxGain(value: number): void {
  const node = sfxBus()
  const c = context()
  if (!node || !c) return
  node.gain.setValueAtTime(Math.min(1, Math.max(0, value)), c.currentTime)
}

/** 지금 시각. 예약은 전부 이 값 기준의 «미래»로 잡는다. */
export function now(): number {
  return context()?.currentTime ?? 0
}

/**
 * 첫 사용자 조작에서 부른다. 브라우저는 사용자가 페이지를 건드리기 전에 만들어진
 * 컨텍스트를 suspended로 두므로, 깨우지 않으면 예약만 쌓이고 아무 소리도 나지 않는다.
 */
export function resume(): void {
  const c = context()
  if (!c || c.state !== 'suspended') return
  void c.resume().catch(() => {})
}

let noise: AudioBuffer | null = null

/** 백색잡음 2초. 타격·마찰음의 재료다. 매번 채우면 프레임이 끊기므로 한 번만 만든다. */
function noiseBuffer(c: AudioContext): AudioBuffer {
  if (noise) return noise
  const length = Math.floor(c.sampleRate * 2)
  const buffer = c.createBuffer(1, length, c.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1
  noise = buffer
  return buffer
}

/**
 * 볼륨 곡선. 어택은 직선, 감쇠는 지수다 — 사람 귀는 소리가 «잦아드는» 쪽을 지수로 듣는다.
 * 0에서 시작하지 않는 이유는 exponentialRamp가 0을 목표로도 출발점으로도 받지 않아서다.
 */
function shape(param: AudioParam, at: number, peak: number, attack: number, decay: number): void {
  param.setValueAtTime(0.0001, at)
  param.linearRampToValueAtTime(peak, at + attack)
  param.exponentialRampToValueAtTime(0.0001, at + attack + decay)
}

export interface ToneSpec {
  readonly type: OscillatorType
  /** 시작 주파수(Hz). */
  readonly from: number
  /** 끝 주파수. 주면 음이 미끄러진다 — 하강은 «무거움», 상승은 «긴장»으로 읽힌다. */
  readonly to?: number
  readonly gain: number
  readonly attack: number
  readonly decay: number
  /** 이 음만 늦게 낸다. 화음을 한 박자씩 굴릴 때 쓴다. */
  readonly delay?: number
  /**
   * 어디로 낼 것인가. 기본은 효과음 버스다.
   * 배경음의 간헐음은 자기 채널을 줘야 한다 — 안 그러면 효과음 음량에 끌려다닌다.
   */
  readonly target?: AudioNode
}

/** 음 하나. 오실레이터는 일회용이라 끝나면 버린다(재사용이 규격상 금지돼 있다). */
export function tone(at: number, spec: ToneSpec): void {
  const c = context()
  const out = spec.target ?? sfxBus()
  if (!c || !out) return

  const t0 = at + (spec.delay ?? 0)
  const end = t0 + spec.attack + spec.decay

  const osc = c.createOscillator()
  osc.type = spec.type
  osc.frequency.setValueAtTime(spec.from, t0)
  /* 0Hz로는 미끄러질 수 없다 — exponentialRamp가 던진다. */
  if (spec.to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, spec.to), end)

  const gain = c.createGain()
  shape(gain.gain, t0, spec.gain, spec.attack, spec.decay)

  osc.connect(gain).connect(out)
  osc.start(t0)
  /* 꼬리를 조금 남긴다. 곡선이 0.0001에 닿기 전에 끊으면 «툭» 하는 클릭이 들린다. */
  osc.stop(end + 0.05)
}

export interface BurstSpec {
  readonly gain: number
  readonly attack: number
  readonly decay: number
  readonly filter: BiquadFilterType
  readonly frequency: number
  readonly q?: number
  readonly delay?: number
  /** ToneSpec.target과 같다. */
  readonly target?: AudioNode
}

/** 잡음 한 덩이. 필터가 성격을 정한다 — 고역은 «날카로움», 저역은 «둔탁함». */
export function burst(at: number, spec: BurstSpec): void {
  const c = context()
  const out = spec.target ?? sfxBus()
  if (!c || !out) return

  const t0 = at + (spec.delay ?? 0)
  const end = t0 + spec.attack + spec.decay

  const src = c.createBufferSource()
  src.buffer = noiseBuffer(c)

  const filter = c.createBiquadFilter()
  filter.type = spec.filter
  filter.frequency.setValueAtTime(spec.frequency, t0)
  if (spec.q !== undefined) filter.Q.setValueAtTime(spec.q, t0)

  const gain = c.createGain()
  shape(gain.gain, t0, spec.gain, spec.attack, spec.decay)

  src.connect(filter).connect(gain).connect(out)
  /* 매번 다른 지점에서 읽는다. 같은 곳에서 뜨면 연타할 때 «기계가 도는» 소리로 들린다. */
  src.start(t0, Math.random() * 1.5)
  src.stop(end + 0.05)
}

/** 배경음이 자기 볼륨을 잡을 손잡이. 곡마다 하나씩 만들어 리미터 앞에 건다. */
export function channel(): GainNode | null {
  const c = context()
  const out = output()
  if (!c || !out) return null
  const node = c.createGain()
  node.gain.setValueAtTime(0, c.currentTime)
  node.connect(out)
  return node
}

/**
 * 끊기지 않고 계속 울리는 음. 배경음의 재료라 멈추는 손잡이를 돌려준다.
 * 켤 때 서서히 올리는 이유는 곧바로 최대로 켜면 곡이 «퍽» 하고 시작해서다.
 */
export function sustain(
  type: OscillatorType,
  frequency: number,
  gain: number,
  target: AudioNode,
): (() => void) | null {
  const c = context()
  if (!c) return null
  const at = c.currentTime

  const osc = c.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(frequency, at)

  const level = c.createGain()
  level.gain.setValueAtTime(0.0001, at)
  level.gain.linearRampToValueAtTime(gain, at + 1.6)

  osc.connect(level).connect(target)
  osc.start()

  return () => {
    try {
      osc.stop()
    } catch {
      /* 이미 멈춘 오실레이터를 또 멈추면 던진다. 멈춘 게 목적이므로 삼킨다. */
    }
    osc.disconnect()
    level.disconnect()
  }
}
