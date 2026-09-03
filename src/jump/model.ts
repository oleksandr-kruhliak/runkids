// Cloud Climb: the doodle-jump show. Every animal gets its own tower of
// floating platforms and bounces up it — the shell of an episode is the same
// as the other two shows (a chain of timed beats the app walks through by
// itself) but the climb is the open-ended one: it ends when the animals reach
// the top.
//
// Everything in here is pure: the towers are generated from the episode seed,
// and one racer's whole bounce is a function of (state, pads, dt). The stage
// owns the mutable copy and steps it every frame; nothing here touches React.

import { AnimalColors } from '../track/Animal'
import { EnvParams } from '../env/model'
import { AnimalDesign, starterFox } from '../studio/model'

export interface JumpPick {
  /** Library/pack design id, or null for a built-in coloured animal. */
  designId: string | null
  name: string
  colors: AnimalColors
}

export type Difficulty = 'easy' | 'normal' | 'wild'

export interface JumpConfig {
  picks: JumpPick[]
  /**
   * Seconds the winner's climb should take. The tower is built to length to
   * hit it — the same idea as the race's average lap, which sizes the track.
   */
  avgClimb: number
  /** 0-100: how much of the difficulty's trick-platform mix gets built. */
  obstacles: number
  difficulty: Difficulty
  /** Keep the pack together so nobody climbs out of shot. */
  rubber: boolean
  env: EnvParams
  envName: string
  /** Seeds the towers, the skill spread and every wobbly jump. */
  seed: number
}

/**
 * Where we are in the episode:
 *
 *   title   the opening card
 *   ready   3 - 2 - 1 - GO on the bottom platform
 *   climb   the race up the tower (the one open-ended beat)
 *   winner  the champion on the finish cloud while the rest come in
 *   result  the placings card
 *   outro   the sign-off card
 */
export type JumpBeat = 'title' | 'ready' | 'climb' | 'winner' | 'result' | 'outro'

// ---- Timings (ms) --------------------------------------------------------

export const TITLE_MS = 4200
/** One beat of the countdown; four of them (3, 2, 1, GO). */
export const COUNT_MS = 800
export const READY_MS = COUNT_MS * 4
/** How long the champion holds the finish cloud before the placings card. */
export const WINNER_MS = 6000
/**
 * Once the winner is up, how long the stragglers get to finish the climb —
 * and how long they get if one of them is nearly there. Being lifted onto the
 * cloud three metres short reads exactly like the bug where a climber
 * genuinely couldn't reach it, so a climber inside CLOSE_M of the goal is given
 * more time, in steps, up to the hard cap.
 */
export const STRAGGLER_MS = 12000
export const STRAGGLER_MAX_MS = 26000
export const STRAGGLER_STEP_MS = 2500
/** How near the finish counts as "nearly there", in metres. */
export const CLOSE_M = 7
export const RESULT_MS = 7000
export const OUTRO_MS = 9000
/** However badly a climb goes, an episode gives up after this and scores it. */
export const MAX_CLIMB_MS = 240000

// ---- The tower -----------------------------------------------------------

/**
 * What a platform does when an animal lands on it:
 *
 *   normal  bounces, and nothing else
 *   mover   slides side to side, so it has to be chased
 *   spring  throws the animal up three or four rungs
 *   cloud   bounces once and then falls away underfoot
 *   ice     freezes the animal to the spot for a moment before letting go
 *   sticky  honey: the first bounce off it is far too weak to reach the next
 *           rung, so it costs a drop back down
 *   fan     bounces normally and blows the animal sideways off its line
 */
export type PadKind = 'normal' | 'mover' | 'spring' | 'cloud' | 'ice' | 'sticky' | 'fan'

/** The ones that are an obstacle rather than a plain step up. */
export const TRICK_KINDS: Exclude<PadKind, 'normal'>[] = [
  'mover',
  'spring',
  'cloud',
  'ice',
  'sticky',
  'fan',
]

export const PAD_META: Record<PadKind, { icon: string; label: string }> = {
  normal: { icon: '▬', label: 'Plain' },
  mover: { icon: '↔️', label: 'Sliders' },
  spring: { icon: '🔴', label: 'Springs' },
  cloud: { icon: '☁️', label: 'Crumbling clouds' },
  ice: { icon: '🧊', label: 'Freezers' },
  sticky: { icon: '🍯', label: 'Honey' },
  fan: { icon: '🌀', label: 'Fans' },
}

export interface Pad {
  /** Index up the tower; 0 is the ground platform everyone starts on. */
  i: number
  y: number
  /** Centre of the platform across its lane, at rest. */
  x: number
  /** Full width — landing needs |x - padX| under half of it. */
  w: number
  kind: PadKind
  /** Movers slide this far either side of `x`. */
  travel: number
  /** Which way a fan blows: -1 or 1. Meaningless for every other kind. */
  dir: number
  /** Radians per second, and where in the slide it starts. */
  speed: number
  phase: number
  /** A star hovering over it, worth a little extra bounce. */
  star: boolean
}

/** The widest a platform gets, so a landing is never a coin flip. */
const PAD_W: Record<PadKind, number> = {
  normal: 1.7,
  mover: 1.5,
  spring: 1.5,
  cloud: 1.9,
  ice: 1.7,
  sticky: 1.7,
  fan: 1.6,
}

/** Distance between two lane centres. */
export const LANE_W = 5.0

/** Clear air left between one tower's widest platform and its neighbour's. */
const LANE_GAP = 0.35

/**
 * How far either side of its lane centre a platform can sit — derived, not
 * chosen, because the two numbers have to agree. Set by hand, a platform at
 * the edge of its lane grew into the next tower's: half a widest-platform
 * either side of two lane centres 4.4 apart came to more than 4.4. Deriving it
 * means widening a platform or narrowing the lanes can never bring that back.
 */
export const LANE_HALF = LANE_W / 2 - Math.max(...Object.values(PAD_W)) / 2 - LANE_GAP

/**
 * How much slower than the first cut of the climb everything moves. A bounce
 * that keeps its shape but takes longer is a division, not a subtraction: with
 * every speed divided by SLOW and gravity by SLOW squared, apex heights, gaps
 * and reach all come out exactly as they were and only the clock changes. That
 * matters — the tower is built around what one bounce can clear, so slowing it
 * by hand would quietly make platforms unreachable.
 */
const SLOW = 1.2

/** Gravity, world units per second squared. */
export const G = 34 / (SLOW * SLOW)
/** Speed off a normal platform — an apex of about 3.4 units. */
export const BOUNCE_V = 15.2 / SLOW
/** Speed off a spring: high enough to skip three or four platforms. */
export const SPRING_V = 25.5 / SLOW
/** A star tops the bounce up on the way past. */
export const STAR_V = 18.5 / SLOW
/** What is left of a bounce off a honey pad: barely enough to get off it. */
export const STICKY_MULT = 0.62
/** How long a frost pad holds an animal still, in seconds. */
export const FREEZE_S = 1.1 * SLOW
/**
 * Sideways speed a fan pushes with, and how long it holds the animal in it —
 * together about two units, which is wider than a platform (so the jump it was
 * lined up for is missed) but still inside the lane. A longer push carried
 * animals over their neighbour's tower and left them with nothing under them
 * but their own fan.
 */
export const FAN_V = 4.2 / SLOW
export const FAN_S = 0.5 * SLOW
/**
 * Top sideways speed, and how fast it gets there. A bounce spends about v/g
 * going up, so this has to cover the widest gap between two platforms (MAX_DX)
 * in that time with room to spare. Any less and the animals miss because they
 * physically couldn't get there, which reads as broken rather than as bad luck.
 */
export const STEER_V = 8.2 / SLOW
export const STEER_A = 44 / (SLOW * SLOW)

/** Apex reached from a launch at `v`. */
export const apexOf = (v: number) => (v * v) / (2 * G)

export interface Tune {
  gapMin: number
  gapMax: number
  /** Share of the tower each trick platform takes at 100% obstacles. */
  mix: Record<Exclude<PadKind, 'normal'>, number>
  /** How far a wobbly jump lands from where it was aimed. */
  err: number
  star: number
}

export const TUNE: Record<Difficulty, Tune> = {
  easy: {
    gapMin: 1.7,
    gapMax: 2.25,
    mix: { spring: 0.12, mover: 0.1, cloud: 0.05, ice: 0.06, sticky: 0.04, fan: 0.05 },
    err: 0.36,
    star: 0.22,
  },
  normal: {
    gapMin: 1.9,
    gapMax: 2.55,
    mix: { spring: 0.1, mover: 0.16, cloud: 0.1, ice: 0.09, sticky: 0.07, fan: 0.08 },
    err: 0.52,
    star: 0.18,
  },
  wild: {
    gapMin: 2.0,
    gapMax: 2.8,
    mix: { spring: 0.09, mover: 0.2, cloud: 0.14, ice: 0.11, sticky: 0.1, fan: 0.12 },
    err: 0.64,
    star: 0.15,
  },
}

export const DIFF_META: Record<Difficulty, { icon: string; label: string; desc: string }> = {
  easy: { icon: '🍀', label: 'Easy climb', desc: 'Close platforms, few slips' },
  normal: { icon: '⭐', label: 'Classic', desc: 'A bit of everything' },
  wild: { icon: '🌪', label: 'Wild', desc: 'Big gaps and lots of wobbles' },
}

/** Default share of the platforms that do something other than bounce. */
export const OBSTACLES_DEFAULT = 65

/** How far sideways a platform can move from the one below it. */
const MAX_DX = 2.0

/** Rungs at the top of the tower that are always plain platforms. */
const TOP_PLAIN = 2

/**
 * One tower. Gaps and offsets are rolled inside limits a single bounce can
 * always clear — the animals miss because their aim wobbles, never because the
 * jump was impossible. Springs are never stacked next to each other and the
 * bottom of the tower stays plain, so an episode opens on a readable climb.
 */
export function buildTower(
  rungs: number,
  tune: Tune,
  /** 0-100: how much of the difficulty's trick mix actually gets built. */
  obstacles: number,
  rand: () => number,
): Pad[] {
  const pads: Pad[] = [
    {
      i: 0,
      y: 0,
      x: 0,
      w: 2.8,
      kind: 'normal',
      travel: 0,
      dir: 1,
      speed: 0,
      phase: 0,
      star: false,
    },
  ]
  const scale = Math.max(0, Math.min(1, obstacles / 100))
  const kinds = TRICK_KINDS
  let y = 0
  let x = 0
  let sinceSpring = 0
  let sinceTrick = 0
  for (let i = 1; i <= rungs; i++) {
    y += tune.gapMin + rand() * (tune.gapMax - tune.gapMin)
    const dx = (rand() * 2 - 1) * MAX_DX
    x = Math.max(-LANE_HALF, Math.min(LANE_HALF, x + dx))
    // The first few rungs are plain, so the opening shot reads as a climb
    // rather than a fairground — and so are the last few, so that the run at
    // the finish cloud is always a clean one. Everything that has gone wrong
    // near the top of a tower has been a trick platform doing its job one rung
    // below the goal, where there is nothing above to recover onto.
    const roll = rand()
    let kind: PadKind = 'normal'
    if (i > 3 && i <= rungs - TOP_PLAIN) {
      let acc = 0
      for (const k of kinds) {
        acc += tune.mix[k] * scale
        if (roll < acc) {
          kind = k
          break
        }
      }
    }
    // Two springs in a row would fire an animal past a third of the tower, and
    // two hold-ups in a row reads as a bug rather than as bad luck.
    if (kind === 'spring' && sinceSpring <= 3) kind = 'normal'
    if ((kind === 'ice' || kind === 'sticky') && sinceTrick === 0) kind = 'normal'
    // Never two clouds together: one gone is a gap a bounce can wait out, but
    // a pair of them is a hole nothing could climb through even once they are
    // both back.
    if (kind === 'cloud' && pads[i - 1].kind === 'cloud') kind = 'normal'
    sinceSpring = kind === 'spring' ? 0 : sinceSpring + 1
    sinceTrick = kind === 'ice' || kind === 'sticky' ? 0 : sinceTrick + 1
    // A mover slides inside its lane, never off the end of it — so how far it
    // travels is decided first and then its centre is pulled in to leave room
    // for the slide. Clamping the travel to whatever room the centre happened
    // to leave still forced a minimum, which walked platforms at the edge of a
    // lane out over the next tower.
    const travel = kind === 'mover' ? 0.45 + rand() * 0.5 : 0
    if (travel > 0) {
      const room = LANE_HALF - travel
      x = Math.max(-room, Math.min(room, x))
    }
    pads.push({
      i,
      y,
      x,
      w: PAD_W[kind],
      kind,
      travel,
      // A fan blows towards the middle of the lane more often than out of it,
      // so it throws the aim off without simply pinning animals to the wall.
      dir: x > 0.6 ? -1 : x < -0.6 ? 1 : rand() < 0.5 ? -1 : 1,
      speed: 0.7 + rand() * 0.7,
      phase: rand() * Math.PI * 2,
      // Nothing hovers over a spring: the animal is already gone by then.
      star: kind !== 'spring' && rand() < tune.star,
    })
  }
  return pads
}

/** Where a platform is right now — only movers ever leave their mark. */
export function padX(p: Pad, t: number): number {
  return p.kind === 'mover' ? p.x + Math.sin(t * p.speed + p.phase) * p.travel : p.x
}

/** The finish cloud sits a comfortable bounce above the last platform. */
export const goalY = (pads: Pad[]) => pads[pads.length - 1].y + 2.4

/** X of lane `i` in a row of `n`, centred on the origin. */
export function laneX(i: number, n: number): number {
  return (i - (n - 1) / 2) * LANE_W
}

// ---- Racers --------------------------------------------------------------

export type RacerPhase = 'ready' | 'air' | 'bubble' | 'frozen' | 'done'

export interface Racer {
  lane: number
  x: number
  vx: number
  y: number
  vy: number
  /** The platform it last bounced off. */
  padIdx: number
  /** The one it is aiming at, and how far off the aim is this time. */
  target: number
  aimErr: number
  /** 0.35 (clumsy) to 0.9 (sure-footed); rolled per animal per episode. */
  skill: number
  phase: RacerPhase
  /** Highest it has been, which is what the leaderboard ranks on. */
  best: number
  /** performance.now() it last set that high mark — the anti-stall clock. */
  bestAt: number
  stars: number
  /** Bubble rescues used — the show counts them up in the recap. */
  saves: number
  /** Where a rescue started and where it is heading, and when it began. */
  fromY: number
  toY: number
  bubbleAt: number
  /** ms into the climb that it touched the finish cloud; 0 while climbing. */
  finishAt: number
  /** performance.now() of the last landing, for the squash. */
  landAt: number
  /** performance.now() a frost pad lets go; 0 when nothing is holding it. */
  freezeUntil: number
  /** performance.now() a fan stops blowing it, and which way. */
  blowUntil: number
  blowDir: number
  /**
   * performance.now() each cloud gave way underfoot, or 0 for one that is
   * whole. They come back — see `gone`.
   */
  brokenAt: Float64Array
  /** Stars already taken, so one can't be eaten twice. */
  taken: Uint8Array
  /**
   * Frost and honey pads that have already done their bit to this animal. A
   * pad only catches once: the bounce that gets it out of the honey has to be
   * a real one, or it would sit there dropping back into the same pad forever.
   */
  spent: Uint8Array
  /** Times it has been frozen, stuck or blown — the recap counts them up. */
  bumps: number
  rand: () => number
}

export function freshRacer(lane: number, pads: Pad[], skill: number, rand: () => number): Racer {
  return {
    lane,
    x: 0,
    vx: 0,
    y: 0,
    vy: 0,
    padIdx: 0,
    target: 1,
    aimErr: 0,
    skill,
    phase: 'ready',
    best: 0,
    bestAt: performance.now(),
    stars: 0,
    saves: 0,
    fromY: 0,
    toY: 0,
    bubbleAt: 0,
    finishAt: 0,
    landAt: 0,
    freezeUntil: 0,
    blowUntil: 0,
    blowDir: 1,
    brokenAt: new Float64Array(pads.length),
    taken: new Uint8Array(pads.length),
    spent: new Uint8Array(pads.length),
    bumps: 0,
    rand,
  }
}

/**
 * Is platform `i` missing from under this animal right now? Only crumbled
 * clouds ever are, and only for CLOUD_BACK_S — this is the single place that
 * decides it, so what the simulation lands on and what the tower draws can
 * never disagree.
 */
export function gone(r: Racer, i: number): boolean {
  const at = r.brokenAt[i]
  return at > 0 && performance.now() - at < CLOUD_BACK_S * 1000
}

/** What happened to a racer in one step — the stage turns these into noise. */
export type JumpEvent =
  | { kind: 'bounce'; pad: PadKind }
  | { kind: 'star' }
  | { kind: 'save' }
  | { kind: 'caught'; pad: PadKind }
  | { kind: 'finish' }

/** How far below the bottom of the picture an animal drops before a bubble
 *  comes for it — far enough that a deep bounce isn't mistaken for a fall. */
export const RESCUE_DROP = 1.5
/** How long a rescue takes, in seconds. */
export const BUBBLE_S = 1.6
/**
 * How long a crumbled cloud stays away before it puffs back into place.
 *
 * It has to come back. A gap is built for one bounce to clear, so two gaps
 * never are: a cloud that went for good would leave a ceiling nothing below it
 * could climb past. Lower down a bubble eventually fetches the animal out over
 * the top of it, but a cloud near the finish has no platform above it to be
 * fetched to, and the climber is stranded one rung short for the rest of the
 * episode.
 */
export const CLOUD_BACK_S = 4
/** How long an animal may go without a new high mark before a bubble fetches it. */
export const STALL_S = 15

/**
 * Bounce height is nudged by how far behind the pack an animal is: a trailer
 * springs higher, the leader a shade lower. It matters more than the numbers
 * look — apex goes with the square of the launch, so a trailer ten metres back
 * bounces about a metre and a half higher, which is often the difference
 * between reaching the next platform up and the one after it. That is what
 * keeps every animal inside one shot, which is the whole reason the show can
 * film a climb in one take.
 */
export function rubberFactor(y: number, leaderY: number, on: boolean): number {
  if (!on) return 1
  return Math.max(0.94, Math.min(1.3, 1 + (leaderY - y) * 0.028))
}

/** Aim for the next bounce: how far off, rolled against the animal's skill. */
function rollAim(r: Racer, tune: Tune): number {
  return (r.rand() * 2 - 1) * tune.err * (1.15 - r.skill)
}

/**
 * The platform to aim at after launching at `v` from height `y`: the highest
 * one the bounce can actually reach, because clearing three rungs at once is
 * what makes a spring feel like a spring. A star one wins a tie.
 */
export function chooseTarget(r: Racer, pads: Pad[], y: number, v: number): number {
  const apex = y + apexOf(v) - 0.3
  let best = -1
  for (let i = r.padIdx + 1; i < pads.length; i++) {
    const p = pads[i]
    if (p.y <= y + 0.35) continue
    if (p.y > apex) break
    if (gone(r, i)) continue
    best = i
    // One rung further is worth it for a star, but only just above the top of
    // the arc — an animal that always chased stars would stall.
    const nxt = pads[i + 1]
    if (nxt && nxt.star && !gone(r, i + 1) && nxt.y <= apex) best = i + 1
  }
  if (best >= 0) return best
  // Nothing in reach (a crumbled cloud, usually): aim at the next one anyway
  // and take the slip.
  return Math.min(pads.length - 1, r.padIdx + 1)
}

interface StepCtx {
  pads: Pad[]
  tune: Tune
  /** Seconds on the episode clock, for the movers. */
  t: number
  leaderY: number
  rubber: boolean
  goal: number
  /** Where the camera is centred, for choosing where a bubble puts someone. */
  camY: number
  /** Bottom of what the camera can see; below this a bubble steps in. */
  viewLow: number
  /** ms into the climb, stamped onto a finish. */
  clock: number
}

/** Launch off `pad`, pick the next target, and say so. */
function launch(r: Racer, pad: Pad, v: number, ctx: StepCtx, out: JumpEvent[]): void {
  r.vy = v * rubberFactor(r.y, ctx.leaderY, ctx.rubber)
  r.padIdx = pad.i
  r.phase = 'air'
  r.landAt = performance.now()
  r.target = chooseTarget(r, ctx.pads, r.y, r.vy)
  r.aimErr = rollAim(r, ctx.tune)
  out.push({ kind: 'bounce', pad: pad.kind })
}

/**
 * A platform doing whatever it does, the moment the feet touch it. Returns the
 * launch speed, or null if the animal is being held on the pad rather than
 * sent off it. Every hold is one-shot per pad per animal (`spent`): a trick
 * that fired every time would leave an animal stuck in a loop it cannot climb
 * out of.
 */
function trigger(r: Racer, p: Pad, out: JumpEvent[]): number | null {
  const fresh = !r.spent[p.i]
  switch (p.kind) {
    case 'spring':
      return SPRING_V
    case 'cloud':
      r.brokenAt[p.i] = performance.now() // it gives way underfoot, and comes back
      return BOUNCE_V
    case 'ice':
      if (!fresh) return BOUNCE_V
      r.spent[p.i] = 1
      r.bumps += 1
      r.phase = 'frozen'
      r.freezeUntil = performance.now() + FREEZE_S * 1000
      r.vy = 0
      r.vx = 0
      out.push({ kind: 'caught', pad: 'ice' })
      return null
    case 'sticky':
      if (!fresh) return BOUNCE_V
      r.spent[p.i] = 1
      r.bumps += 1
      out.push({ kind: 'caught', pad: 'sticky' })
      return BOUNCE_V * STICKY_MULT
    case 'fan':
      // Once, like the frost and the honey — and for a sharper reason. A blown
      // animal comes down outside its lane, from where the highest platform
      // below it is the fan it just left: it steers back onto it, gets blown
      // again, and rides that loop for the rest of the episode instead of
      // climbing. The second landing has to be an ordinary bounce.
      if (!fresh) return BOUNCE_V
      r.spent[p.i] = 1
      r.bumps += 1
      r.blowUntil = performance.now() + FAN_S * 1000
      r.blowDir = p.dir
      out.push({ kind: 'caught', pad: 'fan' })
      return BOUNCE_V
    default:
      return BOUNCE_V
  }
}

/**
 * One racer, one frame. Falling onto a platform bounces it; falling out of
 * shot puts it in a bubble; touching the finish cloud ends its climb.
 */
export function stepRacer(r: Racer, dt: number, ctx: StepCtx): JumpEvent[] {
  const out: JumpEvent[] = []
  if (r.phase === 'done') return out
  const { pads } = ctx

  if (r.phase === 'frozen') {
    // Held in the frost. A mover carries it along while it waits.
    const pad = pads[r.padIdx]
    r.y = pad.y
    r.x = padX(pad, ctx.t)
    r.vy = 0
    r.vx = 0
    if (performance.now() >= r.freezeUntil) launch(r, pad, BOUNCE_V, ctx, out)
    return out
  }

  if (r.phase === 'bubble') {
    const k = Math.min(1, (performance.now() - r.bubbleAt) / (BUBBLE_S * 1000))
    r.y = r.fromY + (r.toY - r.fromY) * (k * k * (3 - 2 * k))
    r.vy = 0
    if (k >= 1) {
      const pad = pads[r.padIdx]
      r.x = padX(pad, ctx.t)
      launch(r, pad, BOUNCE_V, ctx, out)
    }
    return out
  }

  // On the start platform through the countdown, nothing moves — steering here
  // would slide the animals sideways towards their first platform with their
  // feet planted, which reads as a moonwalk.
  if (r.phase === 'ready') return out

  if (performance.now() < r.blowUntil) {
    // In the draught of a fan: it has no say in where it is going for a moment,
    // which is the whole point of the thing.
    r.vx = r.blowDir * FAN_V
    r.x = Math.max(-LANE_HALF - 0.6, Math.min(LANE_HALF + 0.6, r.x + r.vx * dt))
  } else {
    // Steering: the animal leans toward wherever its target platform is right
    // now, which is what makes chasing a mover look deliberate.
    const tgt = pads[Math.min(r.target, pads.length - 1)]
    const wantX = Math.max(
      -LANE_HALF - 0.4,
      Math.min(LANE_HALF + 0.4, padX(tgt, ctx.t) + r.aimErr),
    )
    const dx = wantX - r.x
    const wantVx = Math.max(-STEER_V, Math.min(STEER_V, dx * 4.5))
    r.vx += Math.max(-STEER_A * dt, Math.min(STEER_A * dt, wantVx - r.vx))
    r.x += r.vx * dt
  }

  const prevY = r.y
  r.vy -= G * dt
  r.y += r.vy * dt
  if (r.y > r.best) {
    r.best = r.y
    r.bestAt = performance.now()
  }

  // The finish cloud, which is the only thing above the last platform.
  if (r.y >= ctx.goal) {
    r.y = ctx.goal
    r.vy = 0
    // Straight onto the middle of the cloud: the flag is planted at one end of
    // it, and the closing shot has the animals taking their bow next to it
    // rather than inside it.
    r.x = 0
    r.vx = 0
    r.phase = 'done'
    r.finishAt = ctx.clock
    out.push({ kind: 'finish' })
    return out
  }

  // Once it has fallen past whatever it was aiming for, it stops reaching for
  // it and goes for the highest thing still below — the same thing a player
  // does after a missed jump. Without this a slip turns into a long, silly
  // plummet past a column of perfectly good platforms.
  if (r.vy < 0 && pads[Math.min(r.target, pads.length - 1)].y > r.y - 0.25) {
    for (let i = Math.min(r.target, pads.length - 1); i >= 0; i--) {
      if (pads[i].y > r.y - 0.4 || gone(r, i)) continue
      if (i !== r.target) {
        r.target = i
        // A shorter reach than a launch gets: it is aiming at something it can
        // already see under its feet.
        r.aimErr = rollAim(r, ctx.tune) * 0.5
      }
      break
    }
  }

  // Stars are collected on the way past, whichever way it is going.
  for (let i = r.padIdx; i < pads.length; i++) {
    const p = pads[i]
    if (p.y > r.y + 2.4) break
    if (!p.star || r.taken[i]) continue
    const sy = p.y + 1.15
    if (Math.abs(r.y + 0.6 - sy) < 0.75 && Math.abs(r.x - padX(p, ctx.t)) < 0.75) {
      r.taken[i] = 1
      r.stars += 1
      // A star is a small kick, not a spring: it tops up whatever is left of
      // the bounce rather than replacing it.
      if (r.vy > -2) r.vy = Math.max(r.vy, STAR_V * 0.75)
      out.push({ kind: 'star' })
    }
  }

  if (r.vy <= 0) {
    // Landing: the feet crossed a platform's top this frame, and the animal
    // was over it when they did.
    for (const p of pads) {
      if (p.y > prevY + 0.05) continue
      if (p.y < r.y - 0.6) continue
      if (gone(r, p.i)) continue
      if (Math.abs(r.x - padX(p, ctx.t)) > p.w / 2 + 0.28) continue
      r.y = p.y
      r.padIdx = p.i
      const v = trigger(r, p, out)
      if (v !== null) launch(r, p, v, ctx, out)
      break
    }
  }

  // Out of shot, or going nowhere: a bubble comes down, and it carries the
  // animal back up to whatever is still on screen. It costs height, not the
  // race.
  //
  // The second half of that test is the safety net. A trick platform that
  // catches an animal in a loop — the fan used to, by blowing it out of its
  // lane and straight back onto itself — would otherwise leave it bouncing on
  // the spot for the rest of the episode. Nothing should be able to strand a
  // climber for a quarter of a minute, whatever new platform turns up later.
  const stalled = performance.now() - r.bestAt > STALL_S * 1000
  if (r.phase === 'air' && (r.y < ctx.viewLow - RESCUE_DROP || stalled)) {
    // The bubble puts it back in the bottom of the shot rather than at the
    // very edge of it — dropped right back on the lip, it would be out of
    // frame again inside two bounces.
    let land = 0
    for (let i = pads.length - 1; i >= 0; i--) {
      if (pads[i].y <= ctx.camY - 0.5 && !gone(r, i)) {
        land = i
        break
      }
    }
    r.phase = 'bubble'
    r.saves += 1
    r.padIdx = land
    r.target = land
    r.fromY = r.y
    r.toY = pads[land].y
    r.bubbleAt = performance.now()
    // The rescue restarts the stall clock: it has just been given a fresh
    // start, so it deserves the full stretch to make something of it.
    r.bestAt = performance.now() + BUBBLE_S * 1000
    out.push({ kind: 'save' })
  }

  return out
}

/** Standings: finishers by their time, then everyone else by height. */
export function ranking(racers: Racer[]): Racer[] {
  return [...racers].sort((a, b) => {
    if (a.finishAt && b.finishAt) return a.finishAt - b.finishAt
    if (a.finishAt) return -1
    if (b.finishAt) return 1
    return b.best - a.best
  })
}

// ---- Setup helpers -------------------------------------------------------

/** Title on the opening card. */
export function episodeTitle(count: number): string {
  return count === 1 ? 'Cloud Climb!' : `${count} Animals Climb the Sky!`
}

/**
 * How far up the tower, as a percentage of the whole climb — what every
 * on-screen readout is in. A height in metres means nothing on its own: the
 * towers are built to length for the asked-for climb time, so the same 40 m is
 * most of a short one and a third of a tall one. A percentage is the same
 * number in every episode, and it says who is winning at a glance.
 */
export function pct(y: number, goal: number): number {
  return Math.max(0, Math.min(100, Math.round((y / Math.max(1, goal)) * 100)))
}

/**
 * Seconds a rung costs the winner, measured off real climbs rather than worked
 * out from the bounce: stars, springs, hold-ups, slips and the rubber band all
 * pull on the pace and they don't cancel out. This is what turns the "average
 * climb" dial into a tower height, so it is the one number in here worth
 * re-measuring whenever the bounce or the trick mix changes.
 *
 * It really is an average. Climbs of the same tower height came in between 0.6
 * and 0.8 seconds a rung depending on how the springs and the slips fell, and
 * how many obstacles are in the mix moves the pace by less than that spread
 * does — a spring clears three rungs and buys back what a freezer costs. So the
 * dial promises a ballpark, the same way the race's average lap does.
 */
const RUNG_SECS: Record<Difficulty, number> = { easy: 0.52, normal: 0.67, wild: 0.73 }

/** Shortest and tallest tower the dial can ask for. */
export const MIN_RUNGS = 8
export const MAX_RUNGS = 200

/** How tall a tower has to be for the winner's climb to last `avgClimb`. */
export function rungsFor(avgClimb: number, diff: Difficulty): number {
  const rungs = Math.round(avgClimb / RUNG_SECS[diff])
  return Math.max(MIN_RUNGS, Math.min(MAX_RUNGS, rungs))
}

/** Once the winner is up, how long the stragglers typically take to come in. */
const TAIL_SECS = 5

/** The whole episode, for the "about 1m 40s" hint on the setup screen. */
export function episodeSecs(avgClimb: number): number {
  return Math.round(
    (TITLE_MS + READY_MS + WINNER_MS + RESULT_MS + OUTRO_MS) / 1000 + avgClimb + TAIL_SECS,
  )
}

// ---- Picks -> something we can actually render ---------------------------

/** The starter fox's three tones, which a built-in racer recolours. */
const FOX_TONES: AnimalColors = { body: '#e8734a', belly: '#ffd9b3', ear: '#c2542f' }

/** Same deal as the hatch show: pack animals come from the library, the five
 *  built-in racers hatch as the starter animal repainted in their palette. */
export function designFor(pick: JumpPick, library: AnimalDesign[]): AnimalDesign {
  const found = pick.designId ? library.find((d) => d.id === pick.designId) : null
  if (found) return found
  const fox = starterFox()
  fox.name = pick.name
  fox.blocks = fox.blocks.map((b) => {
    if (b.color === FOX_TONES.body) return { ...b, color: pick.colors.body }
    if (b.color === FOX_TONES.belly) return { ...b, color: pick.colors.belly }
    if (b.color === FOX_TONES.ear) return { ...b, color: pick.colors.ear }
    return b
  })
  return fox
}

// ---- The whole climb -----------------------------------------------------

/**
 * Everything the climb is: one tower per lane, one racer per tower, and the
 * clock they share. The stage owns exactly one of these and mutates it every
 * frame; the show reads it for the leaderboard. Keeping it out of React state
 * is the point — a bounce shouldn't cost a re-render.
 */
export interface Sim {
  pads: Pad[][]
  racers: Racer[]
  goal: number
  tune: Tune
  rubber: boolean
  /** Seconds since the towers were built, which is what the movers slide on. */
  t: number
  /** Are the animals bouncing yet? False through the title and countdown. */
  running: boolean
  /** ms on the climb clock, stamped onto finishes. */
  clock: number
  /** Where the camera is centred, written back by the rig each frame. */
  camY: number
  /** World height of the bottom edge of the picture, written back with it. */
  viewLow: number
  /** Finishers so far, in the order they arrived. */
  places: number[]
}

export function buildSim(cfg: JumpConfig): Sim {
  const tune = TUNE[cfg.difficulty]
  const rungs = rungsFor(cfg.avgClimb, cfg.difficulty)
  const n = cfg.picks.length
  const pads: Pad[][] = []
  const racers: Racer[] = []
  for (let i = 0; i < n; i++) {
    // Separate streams per lane, so how many numbers one tower draws can't
    // shift the next one — and the same seed always builds the same episode.
    pads.push(
      buildTower(rungs, tune, cfg.obstacles, rngOf(cfg.seed + i * 7919 + 13)),
    )
    const skillRand = rngOf(cfg.seed + i * 104729 + 71)
    racers.push(freshRacer(i, pads[i], 0.45 + skillRand() * 0.45, rngOf(cfg.seed + i * 31337 + 7)))
  }
  return {
    pads,
    racers,
    goal: goalY(pads[0]),
    tune,
    rubber: cfg.rubber,
    t: 0,
    running: false,
    clock: 0,
    camY: 0,
    viewLow: -8,
    places: [],
  }
}

/** Every racer, one frame. Returns whatever the stage needs to make a noise about. */
export function stepSim(sim: Sim, dt: number): { lane: number; ev: JumpEvent }[] {
  sim.t += dt
  if (!sim.running) return []
  sim.clock += dt * 1000
  const leaderY = sim.racers.reduce((m, r) => Math.max(m, r.y), 0)
  const out: { lane: number; ev: JumpEvent }[] = []
  for (const r of sim.racers) {
    const evs = stepRacer(r, dt, {
      pads: sim.pads[r.lane],
      tune: sim.tune,
      t: sim.t,
      leaderY,
      rubber: sim.rubber,
      goal: sim.goal,
      camY: sim.camY,
      viewLow: sim.viewLow,
      clock: sim.clock,
    })
    for (const ev of evs) {
      if (ev.kind === 'finish') sim.places.push(r.lane)
      out.push({ lane: r.lane, ev })
    }
  }
  return out
}

/** Kick every racer off the bottom platform at once. */
export function startClimb(sim: Sim): void {
  sim.running = true
  sim.clock = 0
  for (const r of sim.racers) {
    r.phase = 'air'
    r.vy = BOUNCE_V
    r.target = chooseTarget(r, sim.pads[r.lane], 0, BOUNCE_V)
    r.landAt = performance.now()
    // The stall clock starts at GO, not when the towers were built — the wait
    // through the title card and the countdown is not going nowhere.
    r.bestAt = performance.now()
  }
}

/** The small seeded generator the towers and the wobbles run on. */
export function rngOf(seed: number): () => number {
  let a = Math.imul((seed | 0) ^ 0x9e3779b9, 0x85ebca6b) >>> 0 || 1
  const next = () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  next()
  next()
  return next
}

/**
 * Everybody still climbing when the clock runs out is lifted onto their finish
 * cloud, so the last shot of the episode has the whole line-up on it. They keep
 * no finish time, which is what puts them behind the real finishers in the
 * standings — they're placed on the height they actually reached.
 */
export function finishAll(sim: Sim): void {
  for (const r of sim.racers) {
    if (r.phase === 'done') continue
    r.phase = 'done'
    r.y = sim.goal
    r.x = 0
    r.vx = 0
    r.vy = 0
  }
  sim.running = false
}
