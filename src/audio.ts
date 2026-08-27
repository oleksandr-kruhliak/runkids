// Procedural sound effects, synthesised with the Web Audio API. No audio
// files and no licensing: every sound is generated from oscillators and
// noise, so it can never trigger a copyright claim, and it fires exactly on
// the game event that causes it.

export type SfxName =
  | 'beep'
  | 'beepHi'
  | 'go'
  | 'boost'
  | 'jump'
  | 'splash'
  | 'mud'
  | 'thud'
  | 'smash'
  | 'boing'
  | 'chime'
  | 'slip'
  | 'warp'
  | 'gush'
  | 'fire'
  | 'skid'
  | 'clank'
  | 'wind'
  | 'rumble'
  | 'finish'
  | 'fanfare'
  | 'pop'

let ctx: AudioContext | null = null
let master: GainNode | null = null
let noise: AudioBuffer | null = null
let crowd: GainNode | null = null
let enabled = true
const lastPlayed: Record<string, number> = {}

/** Minimum seconds between repeats of the same sound (anti-machine-gun). */
const COOLDOWN: Partial<Record<SfxName, number>> = {
  thud: 0.09,
  smash: 0.08,
  splash: 0.15,
  mud: 0.2,
  boost: 0.15,
  fire: 0.12,
  skid: 0.4,
  wind: 0.5,
  rumble: 0.4,
  clank: 0.2,
  pop: 0.05,
}

function makeNoise(c: AudioContext): AudioBuffer {
  const len = Math.floor(c.sampleRate * 2)
  const buf = c.createBuffer(1, len, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  return buf
}

/** Create/resume the audio context. Must run from a user gesture. */
export function initAudio(): void {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume()
    return
  }
  const AC: typeof AudioContext | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return
  ctx = new AC()
  master = ctx.createGain()
  master.gain.value = enabled ? 0.85 : 0
  master.connect(ctx.destination)
  noise = makeNoise(ctx)

  // Looping stadium murmur, level controlled by setCrowd().
  const src = ctx.createBufferSource()
  src.buffer = noise
  src.loop = true
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 850
  bp.Q.value = 0.6
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 2200
  crowd = ctx.createGain()
  crowd.gain.value = 0
  src.connect(bp)
  bp.connect(lp)
  lp.connect(crowd)
  crowd.connect(master)
  src.start()
}

export function setAudioEnabled(on: boolean): void {
  enabled = on
  if (master && ctx) master.gain.setTargetAtTime(on ? 0.85 : 0, ctx.currentTime, 0.05)
}

export function isAudioEnabled(): boolean {
  return enabled
}

/** Crowd murmur level 0..1 (swell it at the start and finish). */
export function setCrowd(level: number, ramp = 0.5): void {
  if (!ctx || !crowd) return
  crowd.gain.setTargetAtTime(Math.max(0, Math.min(1, level)) * 0.16, ctx.currentTime, ramp)
}

// ---- building blocks ------------------------------------------------------

function env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
}

function tone(
  freq: number,
  dur: number,
  opts: {
    type?: OscillatorType
    gain?: number
    to?: number // pitch sweep target
    attack?: number
    delay?: number
    detune?: number
  } = {},
) {
  if (!ctx || !master) return
  const t = ctx.currentTime + (opts.delay ?? 0)
  const osc = ctx.createOscillator()
  osc.type = opts.type ?? 'sine'
  osc.frequency.setValueAtTime(freq, t)
  if (opts.to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.to), t + dur)
  if (opts.detune) osc.detune.value = opts.detune
  const g = ctx.createGain()
  env(g, t, opts.gain ?? 0.3, opts.attack ?? 0.008, dur)
  osc.connect(g)
  g.connect(master)
  osc.start(t)
  osc.stop(t + dur + 0.1)
}

function noiseBurst(
  dur: number,
  opts: {
    type?: BiquadFilterType
    freq?: number
    to?: number
    q?: number
    gain?: number
    attack?: number
    delay?: number
  } = {},
) {
  if (!ctx || !master || !noise) return
  const t = ctx.currentTime + (opts.delay ?? 0)
  const src = ctx.createBufferSource()
  src.buffer = noise
  src.loop = true
  const f = ctx.createBiquadFilter()
  f.type = opts.type ?? 'lowpass'
  f.frequency.setValueAtTime(opts.freq ?? 1200, t)
  if (opts.to) f.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t + dur)
  if (opts.q) f.Q.value = opts.q
  const g = ctx.createGain()
  env(g, t, opts.gain ?? 0.25, opts.attack ?? 0.006, dur)
  src.connect(f)
  f.connect(g)
  g.connect(master)
  src.start(t)
  src.stop(t + dur + 0.1)
}

// ---- the sounds -----------------------------------------------------------

const SOUNDS: Record<SfxName, (gain: number) => void> = {
  beep: (v) => tone(660, 0.16, { type: 'square', gain: 0.18 * v }),
  beepHi: (v) => tone(880, 0.16, { type: 'square', gain: 0.2 * v }),
  go: (v) => {
    // two-note horn blast
    tone(523, 0.5, { type: 'sawtooth', gain: 0.16 * v })
    tone(659, 0.5, { type: 'sawtooth', gain: 0.13 * v, detune: 6 })
    tone(784, 0.55, { type: 'sawtooth', gain: 0.1 * v, delay: 0.06 })
    noiseBurst(0.3, { type: 'highpass', freq: 2000, gain: 0.06 * v })
  },
  boost: (v) => {
    tone(320, 0.32, { type: 'sawtooth', gain: 0.12 * v, to: 1400 })
    noiseBurst(0.34, { type: 'bandpass', freq: 700, to: 4200, q: 1.2, gain: 0.18 * v })
  },
  jump: (v) => tone(300, 0.22, { type: 'triangle', gain: 0.16 * v, to: 780 }),
  splash: (v) => {
    noiseBurst(0.4, { type: 'bandpass', freq: 2600, to: 500, q: 0.8, gain: 0.26 * v })
    noiseBurst(0.22, { type: 'highpass', freq: 4200, gain: 0.12 * v, delay: 0.03 })
  },
  mud: (v) => {
    noiseBurst(0.5, { type: 'lowpass', freq: 700, to: 180, gain: 0.22 * v, attack: 0.05 })
    tone(150, 0.4, { type: 'sine', gain: 0.1 * v, to: 70 })
  },
  thud: (v) => {
    tone(120, 0.28, { type: 'sine', gain: 0.34 * v, to: 45 })
    noiseBurst(0.16, { type: 'lowpass', freq: 800, to: 200, gain: 0.2 * v })
  },
  smash: (v) => {
    noiseBurst(0.3, { type: 'bandpass', freq: 1400, to: 400, q: 0.7, gain: 0.26 * v })
    for (let i = 0; i < 4; i++) {
      noiseBurst(0.07, { type: 'highpass', freq: 1800, gain: 0.1 * v, delay: 0.04 + i * 0.05 })
    }
    tone(90, 0.2, { type: 'sine', gain: 0.18 * v, to: 50 })
  },
  boing: (v) => {
    tone(500, 0.34, { type: 'triangle', gain: 0.2 * v, to: 160 })
    tone(250, 0.3, { type: 'sine', gain: 0.12 * v, to: 620, delay: 0.06 })
  },
  chime: (v) => {
    tone(1046, 0.5, { type: 'sine', gain: 0.16 * v })
    tone(1568, 0.45, { type: 'sine', gain: 0.1 * v, delay: 0.05 })
    tone(2093, 0.4, { type: 'sine', gain: 0.06 * v, delay: 0.1 })
  },
  slip: (v) => {
    tone(900, 0.45, { type: 'sine', gain: 0.16 * v, to: 180 })
    noiseBurst(0.3, { type: 'bandpass', freq: 1800, to: 600, q: 3, gain: 0.1 * v })
  },
  warp: (v) => {
    tone(220, 0.45, { type: 'sine', gain: 0.16 * v, to: 1800 })
    tone(330, 0.4, { type: 'triangle', gain: 0.08 * v, to: 2400, delay: 0.05 })
    noiseBurst(0.4, { type: 'bandpass', freq: 400, to: 3600, q: 4, gain: 0.12 * v })
  },
  gush: (v) => {
    noiseBurst(0.8, { type: 'bandpass', freq: 500, to: 2800, q: 1.1, gain: 0.24 * v, attack: 0.08 })
    tone(180, 0.6, { type: 'sine', gain: 0.1 * v, to: 500 })
  },
  fire: (v) => {
    noiseBurst(0.5, { type: 'lowpass', freq: 2400, to: 700, gain: 0.24 * v, attack: 0.02 })
    tone(90, 0.3, { type: 'sawtooth', gain: 0.08 * v, to: 40 })
  },
  skid: (v) => noiseBurst(0.6, { type: 'bandpass', freq: 3000, to: 1500, q: 5, gain: 0.12 * v, attack: 0.1 }),
  clank: (v) => {
    tone(420, 0.18, { type: 'square', gain: 0.12 * v, to: 300 })
    noiseBurst(0.12, { type: 'highpass', freq: 2600, gain: 0.12 * v })
  },
  wind: (v) => noiseBurst(0.9, { type: 'bandpass', freq: 600, to: 1600, q: 0.7, gain: 0.16 * v, attack: 0.25 }),
  rumble: (v) => {
    tone(70, 0.7, { type: 'sine', gain: 0.22 * v, to: 45 })
    noiseBurst(0.7, { type: 'lowpass', freq: 300, to: 120, gain: 0.16 * v, attack: 0.15 })
  },
  finish: (v) => {
    tone(784, 0.3, { type: 'square', gain: 0.14 * v })
    tone(1046, 0.4, { type: 'square', gain: 0.12 * v, delay: 0.1 })
    noiseBurst(0.5, { type: 'bandpass', freq: 1200, q: 0.6, gain: 0.12 * v, attack: 0.05 })
  },
  fanfare: (v) => {
    // rising brass arpeggio, then a held chord
    const notes = [523, 659, 784, 1046]
    notes.forEach((f, i) => {
      tone(f, 0.28, { type: 'sawtooth', gain: 0.13 * v, delay: i * 0.11 })
      tone(f / 2, 0.28, { type: 'triangle', gain: 0.07 * v, delay: i * 0.11 })
    })
    ;[523, 659, 784, 1046].forEach((f) =>
      tone(f, 0.9, { type: 'sawtooth', gain: 0.09 * v, delay: 0.46, attack: 0.04 }),
    )
  },
  pop: (v) => {
    noiseBurst(0.22, { type: 'bandpass', freq: 2400, to: 600, q: 0.9, gain: 0.2 * v })
    tone(1200, 0.14, { type: 'sine', gain: 0.08 * v, to: 300 })
  },
}

// Which lane the camera is following: its sounds play at full volume, the
// rest sit back so eight racers don't turn into a wall of noise.
let focusLane = 0
export function setSfxFocus(lane: number): void {
  focusLane = lane
}
export function focusGain(lane: number): number {
  return lane === focusLane ? 1 : 0.28
}

/** Play a sound effect (no-op until initAudio() runs from a gesture). */
export function sfx(name: SfxName, gain = 1): void {
  if (!ctx || !enabled || gain <= 0.02) return
  const cd = COOLDOWN[name]
  if (cd) {
    const now = ctx.currentTime
    if (lastPlayed[name] != null && now - lastPlayed[name] < cd) return
    lastPlayed[name] = now
  }
  SOUNDS[name](gain)
}
