// The Egg Hatch show: what an episode is made of, and how long each beat of it
// lasts. Same idea as the race auto-show — a fixed sequence the app can film
// hands-free — but the open-ended beat here is the smashing, which ends when
// the last blow lands.

import { AnimalColors } from '../track/Animal'
import { EnvParams } from '../env/model'
import { AnimalDesign, starterFox } from '../studio/model'
import { AVG_SWING_MS } from './tools'

export interface EggPick {
  /** Library/pack design id, or null for a built-in coloured animal. */
  designId: string | null
  name: string
  colors: AnimalColors
}

export interface HatchConfig {
  picks: EggPick[]
  /**
   * The toughest an egg can be. Each one rolls its own number of blows between
   * MIN_HITS and this, so nobody watching can guess when it's about to go.
   */
  maxHits: number
  /** Auto: the tool swings by itself. Otherwise the viewer taps to swing. */
  auto: boolean
  /** Pin every egg to one tool by key, or undefined to roll one per egg. */
  tool?: string
  /** Pin the painter by key, or undefined to draw one for the episode. */
  painter?: string
  env: EnvParams
  envName: string
  /** Seeds the egg styles, crack lines, tools and hit counts. */
  seed: number
}

/** However lucky the roll, an egg never gives up in fewer than this many. */
export const MIN_HITS = 3

/** How many blows each egg takes, rolled fresh for every egg in the episode. */
export function rollHits(count: number, maxHits: number, rand: () => number): number[] {
  const top = Math.max(MIN_HITS, maxHits)
  return Array.from(
    { length: count },
    () => MIN_HITS + Math.floor(rand() * (top - MIN_HITS + 1)),
  )
}

/**
 * Where we are in the episode:
 *
 *   title   the opening card
 *   drop    the cold open — empty nests, and the eggs fall out of the sky
 *   paint   a painter works down the row laying the base coat
 *   pattern a second painter comes back and stamps the spots and stripes on
 *   admire  a short hold on the finished row before anything gets broken
 *   smash   blows land until the egg gives up (the one open-ended beat)
 *   meet    the animal that was inside
 *   parade  everyone steps down off their nest and takes a bow
 *   recap   the camera walks the line, naming them one at a time
 *   outro   the sign-off card
 */
export type HatchBeat =
  | 'title'
  | 'drop'
  | 'paint'
  | 'pattern'
  | 'admire'
  | 'smash'
  | 'meet'
  | 'parade'
  | 'recap'
  | 'outro'

/** Live state of one egg on the stage. Timestamps are `performance.now()`. */
export interface EggRuntime {
  /** When this egg was released from the sky. 0 = not on stage yet. */
  dropAt: number
  /** When the base coat reached this egg. */
  paintAt: number
  /** When the second pass reached it and its pattern started appearing. */
  patternAt: number
  /** Blows landed so far. */
  hits: number
  /** When the last blow landed (drives the squash + chips), 0 for none. */
  hitAt: number
  /** When the shell burst, 0 while it's whole. */
  breakAt: number
}

export const freshEggs = (n: number): EggRuntime[] =>
  Array.from({ length: n }, () => ({
    dropAt: 0,
    paintAt: 0,
    patternAt: 0,
    hits: 0,
    hitAt: 0,
    breakAt: 0,
  }))

// ---- Timings (ms) --------------------------------------------------------

/** Title card at the top of the episode. */
export const TITLE_MS = 4200
/** Gap between one egg being released from the sky and the next. */
export const DROP_EACH_MS = 520
/** Quiet held after the last egg lands, before the painter shows up. */
export const DROP_TAIL_MS = 900
/** The cloud drifting in from off-stage before it reaches the first egg. */
export const CLOUD_IN_MS = 2200
/**
 * How long the cloud spends over each egg as it works down the row. This is
 * what sets its speed: it covers one SPACING in this time, so ~2 units per
 * second — an amble, not a march.
 */
export const PAINT_EACH_MS = 1700
/**
 * Once an egg is under the rain, how long its colour takes to soak down. Kept
 * well under PAINT_EACH_MS: the cloud is always moving, so a slow soak would
 * still be creeping down a shell the cloud had left behind.
 */
export const PAINT_MS = 800
/** The cloud drifting away again once the last egg has its colour. */
export const CLOUD_OUT_MS = 1600
/** Camera flies to the next egg and lets it wobble before the first blow. */
export const SETTLE_MS = 1100
/** Beat between one swing finishing and the next starting. */
export const HIT_GAP_MS = 180
/** Shell flying / animal climbing out, before the name card lands. */
export const BURST_MS = 700
/** How long the freshly hatched animal holds the screen. */
export const MEET_MS = 3400
/** A hold on the finished row, once both coats are on and before the smashing. */
export const ADMIRE_MS = 3500
/** The curtain call: everyone steps off their nest and celebrates. */
export const PARADE_MS = 11000
/** How long each animal gets its name on screen during the recap. */
export const RECAP_EACH_MS = 3000
/** A breath at the end of the recap before the sign-off card. */
export const RECAP_TAIL_MS = 1200
/** The sign-off, which is the call to action. */
export const OUTRO_MS = 9000

/** The whole recap: one named animal after another. */
export function recapMs(count: number): number {
  return count * RECAP_EACH_MS + RECAP_TAIL_MS
}

// ---- The arrival ---------------------------------------------------------

/** Gravity for a falling egg, in world units per second squared. */
const DROP_G = 26
/** How high above its nest an egg is released — above the top of frame. */
export const DROP_H = 8
/** How much of its speed an egg keeps on each bounce. */
const DROP_BOUNCE = 0.3
/** Bounces before it settles into the straw. */
const DROP_BOUNCES = 2

export interface DropPose {
  /** Height above the nest. */
  y: number
  /** Seconds since the last time it hit the nest; Infinity before the first. */
  sinceHit: number
  /** True once it has stopped bouncing. */
  landed: boolean
}

/**
 * Where a falling egg is `t` seconds after it was let go: a free fall onto the
 * nest, then a couple of diminishing bounces. Pure maths, so the egg needs no
 * state of its own — it can work out its whole arrival from one timestamp.
 */
export function dropPose(t: number): DropPose {
  if (t <= 0) return { y: DROP_H, sinceHit: Infinity, landed: false }
  const tFall = Math.sqrt((2 * DROP_H) / DROP_G)
  if (t < tFall) {
    return { y: DROP_H - 0.5 * DROP_G * t * t, sinceHit: Infinity, landed: false }
  }
  let rest = t - tFall
  let v = DROP_G * tFall
  for (let b = 0; b < DROP_BOUNCES; b++) {
    v *= DROP_BOUNCE
    const up = (2 * v) / DROP_G
    if (rest < up) {
      return { y: v * rest - 0.5 * DROP_G * rest * rest, sinceHit: rest, landed: false }
    }
    rest -= up
  }
  return { y: 0, sinceHit: rest, landed: true }
}

/** How long one egg takes to fall and stop bouncing. */
export const DROP_SETTLE_MS = (() => {
  const tFall = Math.sqrt((2 * DROP_H) / DROP_G)
  let total = tFall
  let v = DROP_G * tFall
  for (let b = 0; b < DROP_BOUNCES; b++) {
    v *= DROP_BOUNCE
    total += (2 * v) / DROP_G
  }
  return Math.round(total * 1000)
})()

/** When egg `i` is released, measured from the start of the drop beat. */
export function dropStartMs(i: number): number {
  return i * DROP_EACH_MS
}

/** The whole cold open: every egg released, landed and settled. */
export function dropBeatMs(count: number): number {
  return dropStartMs(Math.max(0, count - 1)) + DROP_SETTLE_MS + DROP_TAIL_MS
}

/** The whole painting beat, cloud entrance and exit included. */
export function paintBeatMs(count: number): number {
  return CLOUD_IN_MS + Math.max(0, count - 1) * PAINT_EACH_MS + CLOUD_OUT_MS
}

/**
 * When egg `i` starts taking colour, measured from the start of the beat. The
 * cloud is centred over it at `CLOUD_IN_MS + i * PAINT_EACH_MS`; the soak is
 * started a little before that and finishes a little after, so it straddles
 * the pass instead of trailing it. The shower is wider than an egg, so rain
 * reaching a shell slightly early reads as correct.
 */
export function paintStartMs(i: number): number {
  return CLOUD_IN_MS + i * PAINT_EACH_MS - PAINT_MS * 0.45
}

/** One egg, start to finish — used to preview the episode length in setup. */
export function eggMs(hits: number): number {
  return SETTLE_MS + hits * (AVG_SWING_MS + HIT_GAP_MS) + BURST_MS + MEET_MS
}

/**
 * Roughly how long the episode runs, for the "about 1m 20s" hint in setup.
 * Both the hit counts and the tools are rolled at showtime, so this works off
 * the averages — it's a hint, not a promise.
 */
export function episodeSecs(count: number, maxHits: number): number {
  const avgHits = (MIN_HITS + Math.max(MIN_HITS, maxHits)) / 2
  return Math.round(
    (TITLE_MS +
      dropBeatMs(count) +
      // Two passes of the painter: base coat, then the pattern.
      paintBeatMs(count) * 2 +
      ADMIRE_MS +
      count * eggMs(avgHits) +
      PARADE_MS +
      recapMs(count) +
      OUTRO_MS) /
      1000,
  )
}

// ---- Stage layout --------------------------------------------------------

/** Distance between two nests on the shelf. */
export const SPACING = 3.6
/** World height of the nest's rim — where an egg (and later a animal) sits. */
export const NEST_TOP = 0.62

/** X of egg `i` in a row of `n`, centred on the origin. */
export function eggX(i: number, n: number): number {
  return (i - (n - 1) / 2) * SPACING
}

/** How far forward of the nests the animals come for the curtain call. */
export const PARADE_Z = 2.6

/**
 * Where animal `i` stands during the parade and recap: straight forward off
 * its own nest, and down onto the grass — y is 0, not NEST_TOP, because there
 * is no nest under it out here. Walking forward keeps the designs facing the
 * camera, which is the way they're modelled; marching them sideways would mean
 * turning every one of them.
 */
export function paradeSpot(i: number, n: number): [number, number, number] {
  return [eggX(i, n), 0, PARADE_Z]
}

/** How far off-stage the cloud starts and ends. */
const CLOUD_MARGIN = 6

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const smooth = (x: number) => x * x * (3 - 2 * x)

/** Time the cloud spends crossing the row: egg 0 to the last one. */
const crossMs = (count: number) => Math.max(0, count - 1) * PAINT_EACH_MS

/**
 * Where the rain cloud is `ms` into the painting beat. It eases in from
 * off-stage, crosses the row at a steady rate — so every egg gets the same
 * soaking — and then drifts away past the last one. The crossing ends *on* the
 * last egg, not beyond it: any overshoot is dead time with nothing left to
 * paint.
 */
export function cloudXAt(ms: number, count: number): number {
  const first = eggX(0, count)
  const last = eggX(count - 1, count)
  const cross = crossMs(count)
  if (ms <= 0) return first - CLOUD_MARGIN
  if (ms < CLOUD_IN_MS) {
    return lerp(first - CLOUD_MARGIN, first, smooth(ms / CLOUD_IN_MS))
  }
  if (cross > 0 && ms < CLOUD_IN_MS + cross) {
    // Linear, so egg `i` sits under the cloud exactly at paintStartMs(i).
    return lerp(first, last, (ms - CLOUD_IN_MS) / cross)
  }
  const k = Math.min(1, (ms - CLOUD_IN_MS - cross) / CLOUD_OUT_MS)
  return lerp(last, last + CLOUD_MARGIN, smooth(k))
}

/**
 * Where the camera watches from during the beat. It rides along with the cloud
 * but never past the row: it holds on the first egg while the cloud sails in
 * and on the last one while it sails out, so the shot always has an egg in it
 * rather than a pan across empty meadow.
 */
export function paintCamXAt(ms: number, count: number): number {
  const x = cloudXAt(ms, count)
  return Math.max(eggX(0, count), Math.min(eggX(count - 1, count), x))
}

/** Title shown on the opening card. */
export function episodeTitle(count: number): string {
  return count === 1 ? 'Surprise Egg!' : `${count} Surprise Eggs!`
}

// ---- Picks -> something we can actually render ---------------------------

/** The starter fox's three tones, which a built-in racer recolours. */
const FOX_TONES: AnimalColors = { body: '#e8734a', belly: '#ffd9b3', ear: '#c2542f' }

/**
 * The design to hatch for a pick. Library and pack animals come out of the
 * saved designs; the five built-in racers have colours but no blocks, so they
 * hatch as the starter animal repainted in their own palette.
 */
export function designFor(pick: EggPick, library: AnimalDesign[]): AnimalDesign {
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
