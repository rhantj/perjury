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

/** 효과음이 방에 젖는 정도. 배경음보다 낮다 — 도장·카드까지 흐려지면 조작감이 사라진다. */
const SFX_ROOM = 0.32

/**
 * 부드러운 포화 곡선. 큰 신호만 눌러 배음을 더한다.
 *
 * x - 0.28x³ 은 작은 값에서는 기울기가 1이라 조용한 소리를 건드리지 않고,
 * 1에 가까워질수록 눌려 3차 배음이 생긴다. 타격의 «쨍» 하는 성분이 이것이다.
 * 순수 오실레이터만으로는 이 배음이 없어서 소리가 얇게 들린다.
 */
function softClip(): Float32Array<ArrayBuffer> {
  const n = 1024
  /* WaveShaper.curve는 SharedArrayBuffer를 받지 않는다. 버퍼를 직접 줘서 타입을 좁힌다. */
  const curve = new Float32Array(new ArrayBuffer(n * 4))
  for (let i = 0; i < n; i += 1) {
    const x = (i / (n - 1)) * 2 - 1
    curve[i] = x - 0.28 * x * x * x
  }
  return curve
}

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

  const shaper = c.createWaveShaper()
  shaper.curve = softClip()
  /* 4배 오버샘플. 안 하면 포화가 만든 고배음이 접혀 내려와 «지직»거린다. */
  shaper.oversample = '4x'
  node.connect(shaper).connect(out)

  /* 잔향에는 포화 전 신호를 보낸다 — 방까지 찌그러지면 넓이가 아니라 소음이 된다. */
  sendToReverb(node, SFX_ROOM)
  sfx = node
  return node
}

/**
 * 좌우 자리. 여러 겹을 같은 지점에 쌓으면 아무리 많이 쌓아도 «한 점»으로 들린다.
 * 폭이 생기는 것만으로 같은 소리가 두껍게 들린다.
 *
 * 연결해 넣을 노드를 돌려준다. 팬이 없거나 브라우저가 지원하지 않으면 출구를 그대로 준다.
 */
function panned(c: AudioContext, out: AudioNode, pan: number | undefined): AudioNode {
  if (pan === undefined || pan === 0) return out
  try {
    const node = c.createStereoPanner()
    node.pan.setValueAtTime(Math.min(1, Math.max(-1, pan)), c.currentTime)
    node.connect(out)
    return node
  } catch {
    /* 구형 사파리에는 StereoPanner가 없다. 폭이 없을 뿐 소리는 나야 한다. */
    return out
  }
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

let air: AudioBuffer | null = null

/**
 * 이음매 없는 잡음 8초. 배경음의 «공기»가 될 재료다.
 *
 * 위의 2초 버퍼를 그대로 반복하면 끝 샘플과 첫 샘플이 안 맞아 2초마다 «툭»이 들린다.
 * 조용한 바닥에서는 그 틱이 박자로 들려 곡 전체가 기계처럼 된다. 그래서 뒤꼬리를
 * 앞머리에 겹쳐 그 지점을 지운다 — 겹칠 때 제곱근을 쓰는 건 선형으로 섞으면
 * 겹치는 구간만 음량이 파이기 때문이다(등출력 교차).
 */
function airBuffer(c: AudioContext): AudioBuffer {
  if (air) return air
  const length = Math.floor(c.sampleRate * 8)
  const fade = Math.floor(c.sampleRate * 0.4)
  const raw = new Float32Array(length + fade)
  for (let i = 0; i < raw.length; i += 1) raw[i] = Math.random() * 2 - 1

  const buffer = c.createBuffer(1, length, c.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i += 1) data[i] = raw[i] ?? 0
  for (let i = 0; i < fade; i += 1) {
    const k = i / fade
    data[i] = (data[i] ?? 0) * Math.sqrt(k) + (raw[length + i] ?? 0) * Math.sqrt(1 - k)
  }
  air = buffer
  return buffer
}

let ir: AudioBuffer | null = null

/**
 * 잔향이 흉내 낼 «방». 임펄스 응답을 녹음 파일로 받지 않고 잡음에서 빚는다 —
 * 파일 하나에 수백 KB고, 여기서 필요한 건 특정 홀의 재현이 아니라 «넓고 차갑다»는 인상뿐이다.
 *
 * 두 가지가 이 방의 성격을 정한다.
 * **고역이 먼저 죽는다** — 시간이 갈수록 세게 뭉개서, 꼬리에는 낮은 웅웅거림만 남긴다.
 * 고역이 끝까지 살아 있으면 «욕실»이 되고, 먼저 죽으면 «돌로 된 큰 방»이 된다.
 * **앞머리 20ms를 비운다** — 소리가 난 뒤 벽에 닿기까지의 시간이라, 이게 없으면 방이 좁게 들린다.
 */
function impulse(c: AudioContext): AudioBuffer {
  if (ir) return ir
  const length = Math.floor(c.sampleRate * 3.4)
  const preDelay = Math.floor(c.sampleRate * 0.02)
  const buffer = c.createBuffer(2, length, c.sampleRate)

  /* 좌우를 따로 채워야 방이 넓게 퍼진다. 같은 잡음을 넣으면 소리가 가운데 한 점에 뭉친다. */
  for (let ch = 0; ch < 2; ch += 1) {
    const data = buffer.getChannelData(ch)
    let prev = 0
    for (let i = preDelay; i < length; i += 1) {
      const t = (i - preDelay) / (length - preDelay)
      const smooth = 0.5 - 0.44 * t
      prev += smooth * (Math.random() * 2 - 1 - prev)
      /* 뭉갠 만큼 음량이 죽으므로 되올린다. 지수 감쇠는 꼬리를 자연스럽게 끊는다. */
      data[i] = prev * Math.pow(1 - t, 2.4) * 3.2
    }
  }
  ir = buffer
  return buffer
}

let room: ConvolverNode | null = null

function reverb(): ConvolverNode | null {
  const c = context()
  const out = output()
  if (!c || !out) return null
  if (room) return room
  const node = c.createConvolver()
  node.buffer = impulse(c)
  node.connect(out)
  room = node
  return node
}

/**
 * 소리를 방에 넣는다. 원음 연결은 그대로 두고 곁가지로 젖은 소리를 더하는 방식이라,
 * amount가 0이어도 소리가 사라지지 않는다. 버스마다 한 번씩만 부른다 —
 * 부를 때마다 보내는 길이 하나씩 늘어 잔향이 겹겹이 쌓인다.
 */
export function sendToReverb(source: AudioNode, amount: number): void {
  const c = context()
  const target = reverb()
  if (!c || !target) return
  const send = c.createGain()
  send.gain.setValueAtTime(amount, c.currentTime)
  source.connect(send).connect(target)
}

export interface BedSpec {
  readonly gain: number
  /** 저역통과 차단점(Hz). 낮을수록 «먼 곳». 이 위의 «쉬——» 하는 고역이 잘려 나간다. */
  readonly cutoff: number
  /** 차단점이 오르내리는 폭(Hz)과 주기(Hz). 없으면 잡음이 멎어 있어 에어컨 소리가 된다. */
  readonly depth: number
  readonly rate: number
}

/**
 * 방의 공기. 걸러진 잡음을 계속 깔고 그 밝기를 아주 느리게 흔든다.
 *
 * 배경음이 «밋밋»한 것은 대개 음이 부족해서가 아니라 **아무것도 변하지 않아서**다.
 * 30초에 한 번 오가는 이 움직임은 의식적으로는 안 들리지만, 없으면 곡이 정지 화면처럼 들린다.
 */
export function bed(spec: BedSpec, target: AudioNode): (() => void) | null {
  const c = context()
  if (!c) return null
  const at = c.currentTime

  const src = c.createBufferSource()
  src.buffer = airBuffer(c)
  src.loop = true

  const filter = c.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(spec.cutoff, at)
  filter.Q.setValueAtTime(0.4, at)

  const lfo = c.createOscillator()
  lfo.type = 'sine'
  lfo.frequency.setValueAtTime(spec.rate, at)
  const swing = c.createGain()
  swing.gain.setValueAtTime(spec.depth, at)
  lfo.connect(swing).connect(filter.frequency)

  const level = c.createGain()
  level.gain.setValueAtTime(0.0001, at)
  /* 공기는 곡보다 느리게 들어온다. 같이 켜면 «치익» 하고 시작하는 게 들린다. */
  level.gain.linearRampToValueAtTime(spec.gain, at + 4)

  src.connect(filter).connect(level).connect(target)
  src.start()
  lfo.start()

  return () => {
    try {
      src.stop()
      lfo.stop()
    } catch {
      /* 이미 멈춘 것을 또 멈추면 던진다. 멈춘 게 목적이므로 삼킨다. */
    }
    src.disconnect()
    lfo.disconnect()
    swing.disconnect()
    filter.disconnect()
    level.disconnect()
  }
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
  /** 좌우 자리(-1 왼쪽 ~ 1 오른쪽). 겹을 벌려 놓으면 같은 소리가 두껍게 들린다. */
  readonly pan?: number
  /**
   * 배음을 만드는 짝. **이 파일에서 소리를 «풍부하게» 만드는 유일한 장치다.**
   *
   * 사인파는 배음이 하나뿐이라 아무리 겹쳐도 스펙트럼이 빈다. 다른 오실레이터로
   * 반송파의 주파수를 흔들면 그 주위에 배음이 조밀하게 깔린다.
   * ratio는 반송파 대비 주파수비 — 정수비(2, 3)는 «악기», 비정수비(1.41, 2.76)는 «쇠·유리»가 된다.
   * index는 흔드는 폭(Hz)이고, 소리보다 빨리 잦아든다 — 실제 물체는 때린 직후가 가장 배음이 많다.
   */
  readonly fm?: { readonly ratio: number; readonly index: number }
  /**
   * 꼬리의 음량을 흔든다. rate는 주기(Hz), depth는 흔드는 폭(음량 단위).
   *
   * 매끈하게 잦아드는 소리는 «기계»로 들린다. 실제로 울리는 물체는 공기와 재질 때문에
   * 음량이 미세하게 요동치고, 귀는 그 불안정함을 «아직 무언가 남아 있다»로 읽는다.
   */
  readonly wobble?: { readonly rate: number; readonly depth: number }
}

/** 음 하나. 오실레이터는 일회용이라 끝나면 버린다(재사용이 규격상 금지돼 있다). */
export function tone(at: number, spec: ToneSpec): void {
  const c = context()
  const bus = spec.target ?? sfxBus()
  if (!c || !bus) return
  const out = panned(c, bus, spec.pan)

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

  if (spec.fm) {
    const mod = c.createOscillator()
    mod.type = 'sine'
    mod.frequency.setValueAtTime(spec.from * spec.fm.ratio, t0)
    const depth = c.createGain()
    /* 배음을 소리보다 먼저 죽인다(0.55배). 끝까지 살아 있으면 물체가 아니라 신디사이저가 된다. */
    shape(depth.gain, t0, spec.fm.index, spec.attack, spec.decay * 0.55)
    mod.connect(depth).connect(osc.frequency)
    mod.start(t0)
    mod.stop(end + 0.05)
  }

  if (spec.wobble) {
    const lfo = c.createOscillator()
    lfo.type = 'sine'
    lfo.frequency.setValueAtTime(spec.wobble.rate, t0)
    const depth = c.createGain()
    /* 흔들림도 소리와 같이 잦아들어야 한다. 끝까지 같은 폭이면 «떨림»이 아니라 «신호»가 된다. */
    shape(depth.gain, t0, spec.wobble.depth, spec.attack, spec.decay)
    lfo.connect(depth).connect(gain.gain)
    lfo.start(t0)
    lfo.stop(end + 0.05)
  }

  /* 꼬리를 조금 남긴다. 곡선이 0.0001에 닿기 전에 끊으면 «툭» 하는 클릭이 들린다. */
  osc.stop(end + 0.05)
}

export interface BurstSpec {
  readonly gain: number
  readonly attack: number
  readonly decay: number
  readonly filter: BiquadFilterType
  readonly frequency: number
  /**
   * 필터가 여기까지 미끄러진다. **고정된 필터는 «틱»이고, 움직이는 필터는 «후욱»이다.**
   * 잡음에 방향을 주는 유일한 방법이라, 스치는 소리·바람·숨은 전부 이걸 쓴다.
   */
  readonly toFrequency?: number
  readonly q?: number
  readonly delay?: number
  /** ToneSpec.target과 같다. */
  readonly target?: AudioNode
  /** ToneSpec.pan과 같다. */
  readonly pan?: number
}

/** 잡음 한 덩이. 필터가 성격을 정한다 — 고역은 «날카로움», 저역은 «둔탁함». */
export function burst(at: number, spec: BurstSpec): void {
  const c = context()
  const bus = spec.target ?? sfxBus()
  if (!c || !bus) return
  const out = panned(c, bus, spec.pan)

  const t0 = at + (spec.delay ?? 0)
  const end = t0 + spec.attack + spec.decay

  const src = c.createBufferSource()
  const buffer = noiseBuffer(c)
  src.buffer = buffer

  const filter = c.createBiquadFilter()
  filter.type = spec.filter
  filter.frequency.setValueAtTime(spec.frequency, t0)
  if (spec.toFrequency !== undefined) {
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, spec.toFrequency), end)
  }
  if (spec.q !== undefined) filter.Q.setValueAtTime(spec.q, t0)

  const gain = c.createGain()
  shape(gain.gain, t0, spec.gain, spec.attack, spec.decay)

  src.connect(filter).connect(gain).connect(out)

  /*
   * 매번 다른 지점에서 읽는다. 같은 곳에서 뜨면 연타할 때 «기계가 도는» 소리로 들린다.
   *
   * 다만 **남은 길이를 넘겨 읽으면 안 된다.** 버퍼는 2초인데 뒤쪽에서 뜨면 0.5초밖에 안 남아,
   * 그보다 긴 잡음은 볼륨 곡선이 아직 살아 있는데 재생이 먼저 끝나 소리가 도중에 사라진다.
   * 필요한 길이만큼 앞쪽에서 뜨고, 버퍼보다 긴 소리는 되돌려 읽는다.
   */
  const needed = spec.attack + spec.decay + 0.05
  if (needed >= buffer.duration) {
    src.loop = true
    src.start(t0, Math.random() * buffer.duration)
  } else {
    src.start(t0, Math.random() * (buffer.duration - needed))
  }
  src.stop(end + 0.05)
}

export interface GrainSpec {
  /** 알갱이 개수. 10 아래는 «몇 번 딸깍», 20 위는 «쏟아짐»이다. */
  readonly count: number
  /** 흩뿌릴 시간 폭(초). */
  readonly spread: number
  readonly minHz: number
  readonly maxHz: number
  readonly gain: number
  /** 알갱이 하나의 길이. 개별로 다시 ±40% 흔든다. */
  readonly decay: number
  readonly q?: number
  /** 1이면 고르게, 크면 앞쪽에 몰린다(부딪히고 튀는 잔해), 작으면 뒤로 밀린다. */
  readonly curve?: number
  readonly delay?: number
  readonly target?: AudioNode
}

/**
 * 잡음 알갱이를 시간·음높이·좌우로 흩뿌린다. **«부산스러움»은 전부 여기서 나온다.**
 *
 * 겹을 아무리 두껍게 쌓아도 그것들이 «동시에» 울리면 소리는 두꺼워질 뿐 분주해지지 않는다.
 * 분주함은 두께가 아니라 **시간에 흩어진 잔사건의 개수**다. 종이 넘김·유리 잔해·쇠사슬·
 * 웅성거림이 전부 이 함수 하나로 나오고, 매번 다르게 뿌려지므로 두 번 들어도 같지 않다.
 *
 * 음높이를 로그로 고르는 이유는 귀가 주파수를 비율로 듣기 때문이다 — 균등하게 고르면
 * 알갱이가 전부 고역에 몰려 «치익» 하는 한 덩어리가 된다.
 */
export function grains(at: number, spec: GrainSpec): void {
  const curve = spec.curve ?? 1
  const ratio = spec.maxHz / spec.minHz
  for (let i = 0; i < spec.count; i += 1) {
    const t = spec.spread * Math.pow(Math.random(), curve)
    /* 뒤로 갈수록 작아진다. 끝까지 같은 크기면 흩뿌린 게 아니라 «연타»로 들린다. */
    const fade = 1 - (t / spec.spread) * 0.72
    burst(at, {
      gain: spec.gain * fade * (0.55 + Math.random() * 0.45),
      attack: 0.001,
      decay: spec.decay * (0.6 + Math.random() * 0.8),
      filter: 'bandpass',
      frequency: spec.minHz * Math.pow(ratio, Math.random()),
      q: spec.q ?? 2.2,
      delay: (spec.delay ?? 0) + t,
      pan: Math.random() * 1.6 - 0.8,
      target: spec.target,
    })
  }
}

export interface VoiceSpec {
  /** 공명점 세 개(Hz). 여기가 «무슨 모음인가»를 정한다. */
  readonly formants: readonly [number, number, number]
  /**
   * 주면 «목소리», 없으면 «숨». 있는 쪽이 사람에 가깝고 없는 쪽이 바람에 가깝다.
   * 소름은 대개 숨 쪽이 더 크다 — 정체가 덜 분명해서다.
   */
  readonly pitch?: number
  readonly toPitch?: number
  /** 공명점이 이 비율로 미끄러진다. 1보다 작으면 아래로 — «주저앉는 목소리». */
  readonly slide?: number
  readonly gain: number
  readonly attack: number
  readonly decay: number
  readonly q?: number
  readonly delay?: number
  readonly pan?: number
  readonly target?: AudioNode
}

/**
 * 숨 또는 신음. 잡음(또는 톱니파)을 사람 목의 공명점 세 곳에 통과시킨다.
 *
 * **«스산함»이 결정적으로 갈리는 지점이다.** 아무리 어두운 화음을 쌓아도 그건 «음악»이고,
 * 소리 안에 사람의 공명이 들어가는 순간 «방에 누가 있다»가 된다. 벌어진 정도가 모음을 정한다 —
 * 300·870·2240은 «우», 570·840·2410은 «어», 730·1090·2440은 «아»에 가깝다.
 *
 * 아래로 미끄러뜨리면(slide < 1) 목이 풀리며 주저앉는 소리가 되는데,
 * 이 파일에서 «절망»을 옮기는 가장 직접적인 수단이다.
 */
export function voice(at: number, spec: VoiceSpec): void {
  const c = context()
  const bus = spec.target ?? sfxBus()
  if (!c || !bus) return
  const out = panned(c, bus, spec.pan)

  const t0 = at + (spec.delay ?? 0)
  const end = t0 + spec.attack + spec.decay

  const env = c.createGain()
  shape(env.gain, t0, spec.gain, spec.attack, spec.decay)
  env.connect(out)

  /* 위 공명점일수록 작다. 같은 크기로 두면 모음이 아니라 «필터 세 개»로 들린다. */
  const weights = [1, 0.55, 0.3]
  const slide = spec.slide ?? 1
  const q = spec.q ?? 9

  for (let i = 0; i < spec.formants.length; i += 1) {
    const hz = spec.formants[i]
    const weight = weights[i]
    if (hz === undefined || weight === undefined) continue

    const filter = c.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.setValueAtTime(hz, t0)
    if (slide !== 1) filter.frequency.exponentialRampToValueAtTime(Math.max(20, hz * slide), end)
    filter.Q.setValueAtTime(q, t0)

    const level = c.createGain()
    level.gain.setValueAtTime(weight, t0)
    filter.connect(level).connect(env)

    if (spec.pitch !== undefined) {
      const osc = c.createOscillator()
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(spec.pitch, t0)
      if (spec.toPitch !== undefined) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, spec.toPitch), end)
      }
      osc.connect(filter)
      osc.start(t0)
      osc.stop(end + 0.05)
    } else {
      const src = c.createBufferSource()
      src.buffer = noiseBuffer(c)
      /* 공명점마다 다른 자리에서 뜬다. 같은 잡음을 세 번 거르면 위상이 겹쳐 «관»처럼 울린다. */
      src.loop = true
      src.connect(filter)
      src.start(t0, Math.random() * 1.5)
      src.stop(end + 0.05)
    }
  }
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

export interface SustainSpec {
  readonly type: OscillatorType
  readonly hz: number
  readonly gain: number
  /**
   * 아주 느린 음정 흔들림. cents는 폭(100이 반음), rate는 주기(Hz).
   *
   * 완벽하게 고정된 음은 사람이 낼 수 없는 소리라 «신디사이저»로 들킨다.
   * 몇 센트만 흔들어도 귀는 그것을 «울리고 있는 물체»로 받아들인다.
   */
  readonly drift?: { readonly cents: number; readonly rate: number }
}

/**
 * 끊기지 않고 계속 울리는 음. 배경음의 재료라 멈추는 손잡이를 돌려준다.
 * 켤 때 서서히 올리는 이유는 곧바로 최대로 켜면 곡이 «퍽» 하고 시작해서다.
 */
export function sustain(spec: SustainSpec, target: AudioNode): (() => void) | null {
  const c = context()
  if (!c) return null
  const at = c.currentTime

  const osc = c.createOscillator()
  osc.type = spec.type
  osc.frequency.setValueAtTime(spec.hz, at)

  const level = c.createGain()
  level.gain.setValueAtTime(0.0001, at)
  level.gain.linearRampToValueAtTime(spec.gain, at + 1.6)

  osc.connect(level).connect(target)
  osc.start()

  /* 흔들림은 detune에 건다 — frequency에 걸면 폭이 음높이마다 달라져 저역만 크게 요동친다. */
  let wobble: OscillatorNode | null = null
  let swing: GainNode | null = null
  if (spec.drift) {
    wobble = c.createOscillator()
    wobble.type = 'sine'
    wobble.frequency.setValueAtTime(spec.drift.rate, at)
    swing = c.createGain()
    swing.gain.setValueAtTime(spec.drift.cents, at)
    wobble.connect(swing).connect(osc.detune)
    wobble.start()
  }

  return () => {
    try {
      osc.stop()
      wobble?.stop()
    } catch {
      /* 이미 멈춘 오실레이터를 또 멈추면 던진다. 멈춘 게 목적이므로 삼킨다. */
    }
    osc.disconnect()
    level.disconnect()
    wobble?.disconnect()
    swing?.disconnect()
  }
}
