// Alpine Strike: the bowling show. Every animal gets its own run down the
// mountain on a skateboard and its own rack of ten pins waiting at the bottom.
// The shell of an episode is the same as the other three shows — a chain of
// timed beats the app walks through by itself — with two open-ended beats in
// the middle: the ride, which ends when the first board reaches the deck, and
// the smash, which ends when the last pin stops rolling.
//
// Everything in here is pure: the mountains are generated from the episode
// seed, and one rider's whole run is a function of (state, hazards, dt). The
// stage owns the mutable copy and steps it every frame; nothing here touches
// React.

import { AnimalColors } from '../track/Animal'
import { EnvParams } from '../env/model'
import { AnimalDesign, starterFox } from '../studio/model'

export interface BowlPick {
  /** Library/pack design id, or null for a built-in coloured animal. */
  designId: string | null
  name: string
  colors: AnimalColors
}

export type Difficulty = 'easy' | 'normal' | 'wild'

/**
 * Whether the animals ride all at once, each on its own mountain, or one at a
 * time — the next dropping in once the last one's pins have stopped. Turns is
 * the default: the camera can sit right on a single rider, and every roll gets
 * its own moment instead of four racks going over in the same two seconds.
 */
export type Mode = 'turns' | 'together'

export interface BowlConfig {
  picks: BowlPick[]
  mode: Mode
  /**
   * Seconds the leader's ride should take. The mountain is built to length to
   * hit it — the same idea as the race's average lap, which sizes the track.
   */
  avgRide: number
  /** 0-100: how thickly the difficulty's hazard mix gets scattered down it. */
  hazards: number
  difficulty: Difficulty
  /** Keep the pack together so nobody rides out of shot. */
  rubber: boolean
  env: EnvParams
  envName: string
  /** Seeds the mountains, the skill spread and every wobbly line. */
  seed: number
}

/**
 * Where we are in the episode:
 *
 *   title   the opening card
 *   ready   3 - 2 - 1 - GO on the launch pad
 *   ride    the run down the mountain (open-ended: ends at the first arrival)
 *   smash   the racks going over (open-ended: ends when the pins settle)
 *   winner  whoever knocked the most down
 *   result  the placings card
 *   outro   the sign-off card
 */
export type BowlBeat = 'title' | 'ready' | 'ride' | 'smash' | 'winner' | 'result' | 'outro'

// ---- Timings (ms) --------------------------------------------------------

export const TITLE_MS = 4200
/** One beat of the countdown; four of them (3, 2, 1, GO). */
export const COUNT_MS = 800
export const READY_MS = COUNT_MS * 4
/** Between turns: the "next up" card, then a single GO. */
export const NEXT_MS = 1500
export const NEXT_TOTAL_MS = NEXT_MS + COUNT_MS
/**
 * How long the deck holds after the last pin has stopped moving. The pins
 * settling is the punchline of the whole episode, so it gets a moment to land
 * before the score card covers it up.
 */
export const SMASH_HOLD_MS = 2600
/**
 * However long the racks take, the smash beat gives up after this. A pin
 * jittering against a berm forever would otherwise stall the episode — the
 * settle test is a threshold, and thresholds can be missed.
 */
export const MAX_SMASH_MS = 16000
/** How long the champion holds the deck before the placings card. */
export const WINNER_MS = 6000
export const RESULT_MS = 7000
export const OUTRO_MS = 9000
/** However badly a ride goes, an episode gives up after this and scores it. */
export const MAX_RIDE_MS = 240000

// ---- The mountain --------------------------------------------------------

/**
 * The run is measured along the ground, not down the face: `z` is how far
 * down-course an animal has come, from 0 at the lip to `run` at the deck.
 * World space puts that on -Z, so the mountain falls away from the camera and
 * the pins sit in the distance at the start — the shot a bowler gets.
 */
export const worldZ = (z: number) => -z

/**
 * Flat summit above the lip, where the animals stand through the countdown.
 * Long enough for the opening camera to stand on it: with a short one the
 * camera sat behind the mountain's end wall and the countdown was filmed over
 * a cliff face.
 */
export const START_PAD = 34
/** Where the riders wait: back from the lip, so GO is a run-up and a drop-in. */
export const START_Z = -4.5

/**
 * Flat deck past the bottom of the slope. The pins live on the near end of it
 * and the rest is room for a board to plough through the rack and coast to a
 * stop past it — an animal that stops dead on the head pin is buried in its own
 * rack for the whole of the closing shot.
 */
export const DECK_LEN = 24
/** How far onto the deck the head pin sits. */
export const PIN_Z0 = 3.4

/**
 * Distance between two lane centres. Comfortably more than twice the riding
 * surface: at a gap of half a metre the lanes butted up against each other down
 * the barrel of the chase shot and four mountains read as one grey field with
 * seams in it. The clear air between them is what makes them separate mountains.
 */
export const LANE_W = 9.4
/**
 * Half-width of the flat riding surface, and of the whole lane including the
 * berms banked up either side of it. Two numbers rather than one because
 * everything the simulation does — where a rider may steer, where a hazard may
 * sit, how far a scattered pin can slide — happens on the flat, while the
 * geometry needs to know where the banking ends. Collapsing them let riders
 * steer up onto the berm and put the outer pins of every rack on a slope.
 */
export const LANE_SURF = 2.9
export const LANE_EDGE = LANE_SURF + 1.0
/**
 * How far either side of its lane centre a rider can steer. Derived from the
 * surface rather than picked, so widening a lane can never leave a rider
 * hanging over the berm.
 */
export const RIDER_R = 0.42
export const LANE_HALF = LANE_SURF - RIDER_R - 0.18

/**
 * The shape of the face: one pitch all the way down, easing into the flat deck
 * over the last `RUNOUT` metres.
 *
 * The first cut of this was a curve that flattened gradually the whole way
 * down, and it was wrong for a reason worth writing down: a board is at
 * terminal speed almost the whole ride, and terminal speed follows the pitch —
 * so a face that eased off over its full length had every rider crawling into
 * the pins at less than half the speed it had been doing at the top. The pitch
 * has to hold, and the flattening has to be short enough that a board carries
 * its speed through it.
 */
const FACE_SLOPE = 0.4
const RUNOUT = 16

/** Where the run-out begins. */
const easeAt = (run: number) => run - RUNOUT

/**
 * How high the mountain stands at `z` — the integral of the pitch below it, so
 * it agrees with `slopeAt` exactly rather than approximately. Flat above the
 * lip and past the deck.
 */
export function heightAt(z: number, run: number): number {
  if (z >= run) return 0
  const k = easeAt(run)
  if (z <= k) return FACE_SLOPE * (k - Math.max(0, Math.min(k, z))) + (FACE_SLOPE * RUNOUT) / 2
  const a = (z - k) / RUNOUT
  return FACE_SLOPE * RUNOUT * ((1 - a) / 2 - Math.sin(Math.PI * a) / (2 * Math.PI))
}

/** How steeply it falls at `z` — this is what gravity pulls on. */
export function slopeAt(z: number, run: number): number {
  if (z <= 0 || z >= run) return 0
  const k = easeAt(run)
  if (z <= k) return FACE_SLOPE
  return (FACE_SLOPE * (1 + Math.cos((Math.PI * (z - k)) / RUNOUT))) / 2
}

/** Total drop of a mountain of this length, for the setup screen's readout. */
export const dropOf = (run: number) => Math.round(FACE_SLOPE * (run - RUNOUT / 2))

// ---- Riding physics ------------------------------------------------------

/**
 * Gravity along the slope, and the drag that stops it running away. Together
 * they set a terminal speed of about sixteen down the face — fast enough to
 * feel like a mountain, slow enough that a hazard is something a rider can be
 * seen to dodge rather than teleport past.
 *
 * Only their ratio sets that speed; their size sets how quickly a board gets
 * back to it after something slows it down. Both are deliberately small: with
 * a stiffer pair the run-out at the bottom bled off most of the ride's speed
 * before the pins, and arriving slowly is the one thing the show cannot
 * afford — speed is the whole currency of the score.
 */
export const G_RIDE = 9
const DRAG = 0.0135
/** The kick off the launch pad, which is flat and would otherwise never start. */
export const START_V = 5.5
/**
 * Deceleration once the wheels are on the flat deck. This is what brings a
 * rider to a stop a little past its own fallen pins instead of shooting off the
 * end of the shot — the smash is filmed from beyond the rack, and an animal
 * that exits frame two beats after arriving takes the best part of it with it.
 */
const DECK_FRICTION = 4

/**
 * What one hazard costs beyond the speed it takes on the spot: a lasting drag
 * penalty, and a wider roll of the line into the rack. These two are the wire
 * between the ride and the score — turn them both to zero and the mountain
 * stops mattering.
 */
const BUMP_DRAG = 0.035
const BUMP_AIM = 0.045

/**
 * Top sideways speed and how fast it is reached. A rider has to be able to
 * cross the lane inside the look-ahead below, or it misses a dodge because it
 * physically couldn't get there — which reads as broken rather than as clumsy.
 */
const STEER_V = 6.0
const STEER_A = 22

/**
 * How far ahead a rider picks its line: about three-quarters of a second at
 * cruising speed, which is enough to get across the lane but not enough to do
 * it comfortably. That margin is the game. Give a rider a second and a half and
 * it clears every hazard on the mountain, every episode — which is exactly what
 * the first cut of this did, and it made the ride down a formality.
 */
const LOOK_AHEAD = 9
// How much of that a rider actually gets is the difficulty's `notice`: every
// hazard is seen somewhere between that share of the look-ahead and all of
// it, rolled per hazard against skill — a sure-footed rider sees most of them
// coming, a clumsy one is forever reacting late. This, not the wobble, is
// where most of the hits come from: a dodge started with half a second in
// hand is a dodge that only half happens.
/** How close past a hazard's edge a rider chooses to go. Near, so a wobble tells. */
const HUG = 0.62
/**
 * The last stretch, where the rider stops dodging and lines up on the rack.
 * Anything closer to the deck than this is left clear of hazards, so the run at
 * the pins is always the rider's own aim rather than a boulder's.
 */
export const APPROACH = 20

// ---- Hazards -------------------------------------------------------------

/**
 * What a hazard does to a rider that hits it. All four cost speed, which is
 * the only currency the show has: arriving slow means the rack barely scatters.
 *
 *   rock   a boulder — the big one, and the narrowest to dodge
 *   mud    a wallow that all but stops the board
 *   snow   a drift: wide, and cheap to clip
 *   ice    a slick that barely slows anything, but takes the steering away
 *          long enough that whatever is next can't be dodged
 */
export type HazardKind = 'rock' | 'mud' | 'snow' | 'ice'

export const HAZARD_KINDS: HazardKind[] = ['rock', 'mud', 'snow', 'ice']

export const HAZARD_META: Record<HazardKind, { icon: string; label: string }> = {
  rock: { icon: '🪨', label: 'Boulders' },
  mud: { icon: '🟤', label: 'Mud wallows' },
  snow: { icon: '❄️', label: 'Snow drifts' },
  ice: { icon: '🧊', label: 'Ice slicks' },
}

interface HazardSpec {
  /** Half-width, for both the collision and the model that draws it. */
  w: number
  /** What is left of the rider's speed after hitting it. */
  slow: number
  /** Seconds of no steering afterwards. Only the ice has any. */
  skid: number
  /** Seconds the animal spends tumbling — the visible half of being hit. */
  tumble: number
}

const HAZ: Record<HazardKind, HazardSpec> = {
  rock: { w: 0.6, slow: 0.5, skid: 0.25, tumble: 0.9 },
  mud: { w: 0.92, slow: 0.6, skid: 0, tumble: 0.7 },
  snow: { w: 1.15, slow: 0.75, skid: 0, tumble: 0.55 },
  ice: { w: 1.15, slow: 0.94, skid: 1.15, tumble: 0 },
}

export interface Hazard {
  i: number
  /** Distance down the run. */
  z: number
  /** Centre across the lane. */
  x: number
  w: number
  kind: HazardKind
  /** Seeds whatever wobble the model has, so no two look alike. */
  phase: number
}

export interface Tune {
  /** Distance between hazards at 100%, before the dial stretches it out. */
  gapMin: number
  gapMax: number
  /** Relative weights for which kind turns up. */
  mix: Record<HazardKind, number>
  /** How far a wobbly line lands from where it was aimed. */
  err: number
  /** How wide of the pocket a clumsy rider arrives. */
  aim: number
  /**
   * Share of stations that are a gate — two hazards abreast with one slot
   * between them — rather than a single thing to go round.
   */
  gate: number
  /** Least share of the look-ahead a rider gets before it reacts. */
  notice: number
}

export const TUNE: Record<Difficulty, Tune> = {
  easy: {
    gapMin: 17,
    gapMax: 26,
    mix: { rock: 0.16, mud: 0.2, snow: 0.44, ice: 0.2 },
    err: 0.6,
    aim: 1.2,
    gate: 0.12,
    notice: 0.62,
  },
  normal: {
    gapMin: 12,
    gapMax: 19,
    mix: { rock: 0.26, mud: 0.24, snow: 0.26, ice: 0.24 },
    err: 1.1,
    aim: 1.9,
    gate: 0.35,
    notice: 0.4,
  },
  wild: {
    gapMin: 9,
    gapMax: 14,
    mix: { rock: 0.32, mud: 0.26, snow: 0.14, ice: 0.28 },
    err: 1.35,
    aim: 2.4,
    gate: 0.5,
    notice: 0.3,
  },
}

export const DIFF_META: Record<Difficulty, { icon: string; label: string; desc: string }> = {
  easy: { icon: '🍀', label: 'Bunny slope', desc: 'Wide gaps, soft landings' },
  normal: { icon: '⭐', label: 'Classic', desc: 'A bit of everything' },
  wild: { icon: '🌪', label: 'Black run', desc: 'Boulders and ice, everywhere' },
}

/** Default share of the mountain that has something in the way. */
export const HAZARDS_DEFAULT = 65

/** Clear ground off the lip, so the opening shot reads as a mountain. */
const HEAD_CLEAR = 22

/** Narrowest slot a gate leaves, over and above the rider's own width. */
const GATE_SLACK_MIN = 0.45
const GATE_SLACK_MAX = 1.0
/** Gate hazards are built a little smaller, or two abreast would fill the lane. */
const GATE_SHRINK = 0.78

/**
 * Scatter one mountain. Nothing here ever spans the whole lane: a single
 * hazard leaves a side to go round, and a gate — two abreast — leaves a slot
 * between them wider than a board. So there is always a way through, and a
 * rider misses because its line wobbles, never because the mountain was
 * impassable.
 *
 * Gates are what make the ride a ride. A lone boulder in a lane six metres wide
 * is a formality — the first cut had riders clearing nine in ten of them — but
 * a slot a metre and a half wide, coming up at sixteen a second, is something
 * that has to be threaded.
 */
export function buildHazards(
  run: number,
  tune: Tune,
  /** 0-100: how thickly they are scattered. */
  density: number,
  rand: () => number,
): Hazard[] {
  const out: Hazard[] = []
  if (density <= 0) return out
  // The dial stretches the gaps rather than skipping stations, so turning it
  // down thins the mountain evenly instead of leaving bald patches. Square
  // root, so the top half of the dial is the interesting half: linear, 65%
  // was already half as many hazards as 100%.
  const stretch = Math.sqrt(100 / Math.max(8, density))
  const total = tune.mix.rock + tune.mix.mud + tune.mix.snow + tune.mix.ice
  const pick = (): HazardKind => {
    let roll = rand() * total
    for (const k of HAZARD_KINDS) {
      roll -= tune.mix[k]
      if (roll <= 0) return k
    }
    return 'snow'
  }
  let z = HEAD_CLEAR
  let i = 0
  const last = run - APPROACH
  for (;;) {
    z += (tune.gapMin + rand() * (tune.gapMax - tune.gapMin)) * stretch
    if (z > last) break
    if (rand() < tune.gate) {
      // Two abreast, with a slot between them just wider than a board. The
      // slot's centre wanders off the lane's, so threading it is a steer and
      // not a matter of holding the middle.
      const slot = RIDER_R * 2 + GATE_SLACK_MIN + rand() * (GATE_SLACK_MAX - GATE_SLACK_MIN)
      const kl = pick()
      const kr = pick()
      const wl = HAZ[kl].w * GATE_SHRINK
      const wr = HAZ[kr].w * GATE_SHRINK
      const cx = (rand() * 2 - 1) * 0.7
      out.push({ i: i++, z, x: cx - slot / 2 - wl, w: wl, kind: kl, phase: rand() * Math.PI * 2 })
      out.push({ i: i++, z, x: cx + slot / 2 + wr, w: wr, kind: kr, phase: rand() * Math.PI * 2 })
      continue
    }
    const kind = pick()
    const w = HAZ[kind].w
    // The centre is rolled inside whatever room is left once the rider's own
    // width and a margin are taken off both sides, so there is always a gap
    // wide enough to steer through on at least one side.
    const room = Math.max(0.2, LANE_HALF - w - RIDER_R - 0.25)
    out.push({ i: i++, z, x: (rand() * 2 - 1) * room, w, kind, phase: rand() * Math.PI * 2 })
  }
  return out
}

/** X of lane `i` in a row of `n`, centred on the origin. */
export function laneX(i: number, n: number): number {
  return (i - (n - 1) / 2) * LANE_W
}

// ---- The pins ------------------------------------------------------------

export const PIN_R = 0.3
/** Centre-to-centre spacing in the rack. */
export const PIN_GAP = 1.1
/** Rows of the triangle, front to back: 1, 2, 3, 4. */
export const PIN_ROWS = 4
export const PIN_COUNT = 10

/** How hard a pin has to be shoved before it goes over rather than just slides. */
const TIP_V = 1.3
/** How fast a moving pin topples — it is over inside about half a second. */
const TILT_RATE = 2.2
/**
 * Velocity decay per second, standing and once it is down. Deliberately light:
 * a pin that stops a foot from where it was hit takes its neighbours with it
 * and nothing else, and a rack that never chains is a rack that never gives up
 * more than four.
 */
const PIN_DAMP = 2.6
const DOWN_DAMP = 3
/** Bounce between two pins. They are hollow, and they scatter. */
const PIN_BOUNCE = 0.7
/**
 * How wide the nose of the board is where it meets a rack. Much smaller than
 * the disc the mountain uses to decide whether a boulder was clipped, and
 * deliberately so: at the hazard radius a board straddled three columns of the
 * rack at once and knocked six pins over by touch alone, which left nothing for
 * the chain to do and made every roll in the show a strike whatever the aim.
 */
export const BOARD_R = 0.2
/** How much of the rider's speed a pin takes off the front of the board. */
const TRANSFER = 0.68
/**
 * And how much speed the rider gives up per second per pin it is shouldering
 * through. Per second, not per contact — the first cut took a fixed bite every
 * frame a pin was touching, which at sixty frames a second stopped the board
 * dead on the head pin, buried it in its own rack for the closing shot, and
 * capped every score in the show at four.
 */
const PLOUGH = 7
/** How hard a pin shoves the board sideways, per second of contact. */
const DEFLECT = 2.5
/** Under this, everything on the deck counts as stopped. */
const REST_V = 0.14
/** A pin leaning past this is going over; it is what the score counts. */
const FALLEN = 0.75

export interface Pin {
  i: number
  /** Where it started, so the deck can be drawn without re-deriving the rack. */
  homeX: number
  homeZ: number
  x: number
  z: number
  vx: number
  vz: number
  /** 0 standing, 1 flat on the deck. */
  tilt: number
  /** Which way it is going over, as an angle in the deck plane. */
  fall: number
  /** A little yaw, so a rack going over doesn't look like a drill team. */
  spin: number
  down: boolean
}

/** The ten pins of one lane, in the standard triangle with the head nearest. */
export function buildRack(run: number): Pin[] {
  const pins: Pin[] = []
  let i = 0
  for (let row = 0; row < PIN_ROWS; row++) {
    for (let k = 0; k <= row; k++) {
      const x = (k - row / 2) * PIN_GAP
      const z = run + PIN_Z0 + row * PIN_GAP * 0.866
      pins.push({
        i: i++,
        homeX: x,
        homeZ: z,
        x,
        z,
        vx: 0,
        vz: 0,
        tilt: 0,
        fall: 0,
        spin: 0,
        down: false,
      })
    }
  }
  return pins
}

export interface Deck {
  lane: number
  pins: Pin[]
  /** Pins down so far. Recounted every step, so it ticks up as they go over. */
  score: number
  /** Nothing on the deck is moving any more. */
  settled: boolean
  /** Has a board crossed the foul line yet? Until it has, nothing here counts. */
  rolled: boolean
  /** Where the back wall is, in run distance. */
  back: number
}

/** How many are over. A pin leaning past FALLEN is not coming back. */
export function countDown(pins: Pin[]): number {
  let n = 0
  for (const p of pins) if (p.tilt >= FALLEN) n++
  return n
}

/** Start a pin going over, in whatever direction it was shoved. */
function topple(p: Pin, nx: number, nz: number, force: number, rand: () => number): void {
  if (p.tilt > 0 || force < TIP_V) return
  p.fall = Math.atan2(nx, nz)
  p.spin = (rand() * 2 - 1) * 0.9
  // A hair off zero, so the tilt starts growing this frame rather than waiting
  // for the next shove.
  p.tilt = 0.001
}

/**
 * The deck for one frame: pins slide, topple, and shove each other over. Ten
 * pins is forty-five pairs, which is nothing — so this is the honest O(n²)
 * pass rather than anything clever, and the pins knock each other down for the
 * same reason they do on a real lane.
 */
export function stepDeck(deck: Deck, dt: number, rand: () => number): number {
  const { pins } = deck
  let moving = false

  for (const p of pins) {
    const damp = Math.exp(-(p.down ? DOWN_DAMP : PIN_DAMP) * dt)
    p.x += p.vx * dt
    p.z += p.vz * dt
    p.vx *= damp
    p.vz *= damp
    const speed = Math.hypot(p.vx, p.vz)
    // Anything with a shove still in it keeps going over. A pin that has been
    // nudged but never really hit stops part-way and stays standing, which is
    // where the wobblers and the near-misses come from.
    if (p.tilt > 0 && p.tilt < 1) {
      p.tilt = Math.min(1, p.tilt + dt * TILT_RATE * Math.max(0.6, speed))
      if (p.tilt >= 1) p.down = true
      moving = true
    }
    if (speed > REST_V) moving = true
    // The berms are what keep a scattered rack in shot rather than sliding off
    // into the next lane's.
    const lim = LANE_SURF - PIN_R
    const back = deck.back - PIN_R
    if (p.z > back) {
      p.z = back
      p.vz = -Math.abs(p.vz) * 0.4
    }
    if (p.x < -lim) {
      p.x = -lim
      p.vx = Math.abs(p.vx) * 0.4
    } else if (p.x > lim) {
      p.x = lim
      p.vx = -Math.abs(p.vx) * 0.4
    }
  }

  for (let a = 0; a < pins.length; a++) {
    for (let b = a + 1; b < pins.length; b++) {
      const pa = pins[a]
      const pb = pins[b]
      const dx = pb.x - pa.x
      const dz = pb.z - pa.z
      const d = Math.hypot(dx, dz)
      if (d >= PIN_R * 2 || d === 0) continue
      const nx = dx / d
      const nz = dz / d
      const overlap = PIN_R * 2 - d
      pa.x -= nx * overlap * 0.5
      pa.z -= nz * overlap * 0.5
      pb.x += nx * overlap * 0.5
      pb.z += nz * overlap * 0.5
      // Closing speed along the line between them. Only the part along the
      // normal is exchanged, which is what makes a rack spread sideways out of
      // a shove that came straight down the lane.
      const rel = (pb.vx - pa.vx) * nx + (pb.vz - pa.vz) * nz
      if (rel > 0) continue
      const j = (-(1 + PIN_BOUNCE) * rel) / 2
      pa.vx -= j * nx
      pa.vz -= j * nz
      pb.vx += j * nx
      pb.vz += j * nz
      const force = Math.abs(rel)
      topple(pa, -nx, -nz, force, rand)
      topple(pb, nx, nz, force, rand)
      moving = true
    }
  }

  deck.score = countDown(pins)
  // Nothing settles before the board has actually arrived — an untouched rack
  // is motionless, and would otherwise be "settled" from the opening card.
  deck.settled = deck.rolled && !moving
  return deck.score
}

// ---- Riders --------------------------------------------------------------

export type RiderPhase = 'ready' | 'ride' | 'deck' | 'done'

export interface Rider {
  lane: number
  /** Distance down the run, and speed along it. */
  z: number
  v: number
  /** Across the lane, and how fast it is sliding that way. */
  x: number
  vx: number
  /** 0.35 (clumsy) to 0.9 (sure-footed); rolled per animal per episode. */
  skill: number
  /**
   * How well the board runs today, give or take a few per cent. Small, and it
   * earns its place: without it two riders that both dodge everything arrive at
   * the deck at the same speed to the decimal, and a race between two identical
   * numbers is not a race.
   */
  glide: number
  phase: RiderPhase
  /** The hazard it is currently steering around, or -1. */
  dodge: number
  /** How far off the next hazard has to be before this rider reacts to it. */
  notice: number
  /** Where it wants to be across the lane right now. */
  wantX: number
  /** Where it will meet the rack — rolled once, on the approach. */
  aimX: number
  /** Has the approach line been rolled yet? */
  aimed: boolean
  /** Hazards already hit, so one can't catch the same rider twice. */
  hit: Uint8Array
  /**
   * Seconds of steering still lost to an ice slick. Counted down off the
   * simulation's own clock rather than the wall's: every number in here is a
   * function of (state, dt), so the ride comes out the same whether it is being
   * drawn at sixty frames a second or stepped a thousand times in a test.
   */
  skidLeft: number
  /** Seconds of tumbling left after a hit. Same clock as the skid. */
  tumbleLeft: number
  /** What hit it last, for the burst the stage throws up. */
  lastHit: HazardKind | null
  /** Hazards clipped and speed lost — the recap counts them up. */
  bumps: number
  /** Speed it arrived at the rack with. The whole ride, in one number. */
  hitV: number
  /** ms on the ride clock when it set off. Zero when everyone goes together. */
  startMs: number
  /** ms into the ride that it reached the deck; 0 while still riding. */
  arriveAt: number
  /** Fastest it went, for the recap. */
  topV: number
  rand: () => number
}

export function freshRider(
  lane: number,
  hazards: Hazard[],
  skill: number,
  rand: () => number,
): Rider {
  return {
    lane,
    z: START_Z,
    v: 0,
    x: 0,
    vx: 0,
    skill,
    glide: 0.94 + rand() * 0.12,
    phase: 'ready',
    dodge: -1,
    notice: LOOK_AHEAD,
    wantX: 0,
    aimX: 0,
    aimed: false,
    hit: new Uint8Array(Math.max(1, hazards.length)),
    skidLeft: 0,
    tumbleLeft: 0,
    lastHit: null,
    bumps: 0,
    hitV: 0,
    startMs: 0,
    arriveAt: 0,
    topV: 0,
    rand,
  }
}

/** What happened to a rider in one step — the stage turns these into noise. */
export type BowlEvent =
  | { kind: 'hazard'; haz: HazardKind }
  | { kind: 'arrive'; speed: number }
  | { kind: 'pins'; n: number }
  | { kind: 'strike' }

/**
 * How much faster a trailing rider goes. It is applied to gravity and to drag
 * at once — lifting the pull and lightening the drag together raises the speed
 * the slope settles at, where nudging the pull alone would do almost nothing:
 * a rider on a long face is already at terminal, where the two cancel out.
 */
export function rubberFactor(z: number, leadZ: number, on: boolean): number {
  if (!on) return 1
  return Math.max(0.95, Math.min(1.3, 1 + (leadZ - z) * 0.004))
}

/** Hazards closer together than this down the run count as one row. */
const ROW_Z = 1.5

/**
 * The line a rider takes through the row that `h` is part of. Everything at
 * that distance is blocked out of the lane and what is left is a list of
 * slots; the rider takes the slot it is already lined up for if a board fits
 * through it, and the widest one otherwise — then aims for its centre with a
 * wobble rolled against its skill. A clumsy rider's wobble is what clips the
 * boulder; a slot only just wider than the board is what makes the wobble
 * matter.
 */
function lineAround(r: Rider, h: Hazard, hazards: Hazard[], tune: Tune): number {
  const blocked: [number, number][] = []
  for (const o of hazards) {
    if (Math.abs(o.z - h.z) > ROW_Z || r.hit[o.i]) continue
    blocked.push([o.x - o.w - RIDER_R, o.x + o.w + RIDER_R])
  }
  blocked.sort((a, b) => a[0] - b[0])
  const slots: [number, number][] = []
  let cursor = -LANE_HALF
  for (const [a, b] of blocked) {
    if (a > cursor) slots.push([cursor, a])
    cursor = Math.max(cursor, b)
  }
  if (cursor < LANE_HALF) slots.push([cursor, LANE_HALF])
  const fits = (sl: [number, number]) => sl[1] - sl[0] >= 0.1
  let use = slots.find((sl) => fits(sl) && r.x >= sl[0] - 0.3 && r.x <= sl[1] + 0.3)
  if (!use) {
    use = slots.filter(fits).sort((a, b) => b[1] - b[0] - (a[1] - a[0]))[0]
  }
  // Nothing fits at all — which the builder never produces, but a rider should
  // still aim somewhere rather than at NaN.
  if (!use) return r.x
  const mid = (use[0] + use[1]) / 2
  // Toward whichever edge of the slot is a hazard and nearer: a rider that
  // always took the exact middle of a six-metre lane never touched anything.
  // The lane's own berm is not a hazard, so a slot against the berm is taken
  // toward the hazard on its other side.
  const leftIsHaz = use[0] > -LANE_HALF + 0.01
  const rightIsHaz = use[1] < LANE_HALF - 0.01
  let edge = mid
  if (leftIsHaz && rightIsHaz) edge = Math.abs(use[0] - r.x) < Math.abs(use[1] - r.x) ? use[0] : use[1]
  else if (leftIsHaz) edge = use[0]
  else if (rightIsHaz) edge = use[1]
  const want = mid + (edge - mid) * HUG
  const err = (r.rand() * 2 - 1) * tune.err * (1.15 - r.skill)
  return Math.max(-LANE_HALF, Math.min(LANE_HALF, want + err))
}

interface StepCtx {
  hazards: Hazard[]
  deck: Deck
  tune: Tune
  run: number
  leadZ: number
  rubber: boolean
  /** ms into the ride, stamped onto an arrival. */
  clock: number
}

/**
 * One rider, one frame: gravity down the face, a line picked around whatever
 * is next, and then the rack.
 */
export function stepRider(r: Rider, dt: number, ctx: StepCtx): BowlEvent[] {
  const out: BowlEvent[] = []
  if (r.phase === 'ready' || r.phase === 'done') return out
  const { hazards, run } = ctx

  // --- Down the hill ------------------------------------------------------
  const onDeck = r.z >= run
  const rf = rubberFactor(r.z, ctx.leadZ, ctx.rubber)
  if (onDeck) {
    r.v = Math.max(0, r.v - DECK_FRICTION * dt - DRAG * r.v * r.v * dt)
  } else {
    // Every knock leaves the rider riding a little scrappier for the rest of
    // the mountain, which is what stops a hit near the top from being repaid in
    // full long before the pins. Speed alone recovers; a battered rider does
    // not.
    const drag = (DRAG * (1 + r.bumps * BUMP_DRAG)) / rf
    r.v += (G_RIDE * slopeAt(r.z, run) * rf * r.glide - drag * r.v * r.v) * dt
  }
  const prevZ = r.z
  r.z += r.v * dt
  if (r.v > r.topV) r.topV = r.v

  // --- Picking a line -----------------------------------------------------
  if (!onDeck) {
    if (r.z > run - APPROACH) {
      // Off the hazards and onto the rack. The pocket is rolled once, so the
      // rider commits to a line rather than wandering onto a new one every
      // frame — and how far off it lands is the whole story of the score.
      if (!r.aimed) {
        r.aimed = true
        // How wide of the middle it will meet the rack. Skill is half of it;
        // the other half is how battered the ride down was. That second term is
        // what makes the mountain matter: without it the hazards cost speed,
        // speed turned out to make almost no difference to a rack, and the
        // whole ride was decoration in front of a score decided at the top by a
        // dice roll on skill.
        r.aimX =
          (r.rand() * 2 - 1) * ctx.tune.aim * (1.15 - r.skill) * (1 + r.bumps * BUMP_AIM)
        r.dodge = -1
      }
      r.wantX = r.aimX
    } else {
      // The next thing in the way that hasn't already had this rider.
      if (r.dodge < 0 || hazards[r.dodge].z < r.z) {
        r.dodge = -1
        for (const h of hazards) {
          if (h.z <= r.z || r.hit[h.i]) continue
          if (h.z - r.z > r.notice) break
          r.dodge = h.i
          r.wantX = lineAround(r, h, hazards, ctx.tune)
          // Roll how late the *next* one is noticed, now, so the hazard after
          // this one is already a surprise or not by the time it comes.
          r.notice = LOOK_AHEAD * (ctx.tune.notice + (1 - ctx.tune.notice) * r.skill * r.rand())
          break
        }
        // Nothing ahead: drift back to the middle, which is where the run at
        // the pins wants to start from.
        if (r.dodge < 0) r.wantX = 0
      }
    }

    r.skidLeft = Math.max(0, r.skidLeft - dt)
    r.tumbleLeft = Math.max(0, r.tumbleLeft - dt)
    if (r.skidLeft <= 0) {
      const dx = r.wantX - r.x
      const wantVx = Math.max(-STEER_V, Math.min(STEER_V, dx * 3.4))
      r.vx += Math.max(-STEER_A * dt, Math.min(STEER_A * dt, wantVx - r.vx))
    }
    // On the ice it keeps whatever sideways speed it had — that is the whole
    // trick of the thing, and it is why an ice slick above a boulder is worse
    // than either on its own.
    r.x = Math.max(-LANE_HALF, Math.min(LANE_HALF, r.x + r.vx * dt))

    // --- Anything it drove through ---------------------------------------
    for (const h of hazards) {
      if (h.z > r.z || h.z < prevZ - 0.001 || r.hit[h.i]) continue
      if (Math.abs(r.x - h.x) > h.w + RIDER_R) continue
      const spec = HAZ[h.kind]
      r.hit[h.i] = 1
      r.bumps += 1
      r.v *= spec.slow
      r.lastHit = h.kind
      if (spec.skid > 0) r.skidLeft = Math.max(r.skidLeft, spec.skid)
      if (spec.tumble > 0) r.tumbleLeft = Math.max(r.tumbleLeft, spec.tumble)
      // Knocked off its line as well as slowed, which is what sets up the
      // second hazard catching a rider that the first one only clipped.
      r.vx += (r.rand() * 2 - 1) * 2.6
      out.push({ kind: 'hazard', haz: h.kind })
    }
  }

  // --- The rack -----------------------------------------------------------
  if (r.phase === 'ride' && r.z >= run) {
    r.phase = 'deck'
    r.arriveAt = ctx.clock
    r.hitV = r.v
    // The deck counts as rolled when the board crosses the foul line, not when
    // it first touches a pin — a roll slow enough to stop short of the rack
    // would otherwise never count as having happened, and the beat waiting on
    // it to settle would wait forever.
    ctx.deck.rolled = true
    out.push({ kind: 'arrive', speed: r.v })
  }

  if (r.phase === 'deck') {
    // Steering is over the moment the wheels are on the boards: from here the
    // board goes where the rack sends it.
    r.vx *= Math.exp(-2.5 * dt)
    const edge = LANE_SURF - RIDER_R
    r.x = Math.max(-edge, Math.min(edge, r.x + r.vx * dt))

    const before = ctx.deck.score
    for (const p of ctx.deck.pins) {
      const dx = p.x - r.x
      const dz = p.z - r.z
      const d = Math.hypot(dx, dz)
      if (d >= PIN_R + BOARD_R || d === 0) continue
      const nx = dx / d
      const nz = dz / d
      // The board shoves the pin along the line between them and takes a bite
      // out of its own speed doing it. Ploughing the whole rack is what stops
      // a slow arrival from bowling a strike through sheer persistence.
      const push = Math.max(0, r.v * nz + Math.abs(r.vx * nx) * 0.4) * TRANSFER
      p.vx += nx * push
      p.vz += nz * push
      topple(p, nx, nz, push, r.rand)
      r.v = Math.max(0, r.v - PLOUGH * dt)
      // And the pin shoves back. This is the whole reason aim matters: a board
      // that comes in down the middle is pushed evenly from both sides and
      // drives straight through the rack, while one that arrives wide takes all
      // its shoves from one side, is deflected further that way, and leaves the
      // far pins standing. Without it the rider bulldozed the rack from any
      // angle and every roll in the show was a strike.
      r.vx -= nx * r.v * DEFLECT * dt
      // Pushed clear of the board so the same pin isn't shoved every frame.
      p.x = r.x + nx * (PIN_R + BOARD_R + 0.01)
      p.z = r.z + nz * (PIN_R + BOARD_R + 0.01)
    }
    const after = countDown(ctx.deck.pins)
    if (after > before) out.push({ kind: 'pins', n: after - before })
    if (after >= PIN_COUNT && before < PIN_COUNT) out.push({ kind: 'strike' })

    // Stopped, or as far down the deck as it is allowed to coast. It is held
    // clear of the back wall rather than at it: a rider parked inside the wall
    // is a rider nobody watching the closing shot can see.
    const stop = run + DECK_LEN - 2.5
    if (r.v <= 0.35 || r.z >= stop) {
      r.v = 0
      r.z = Math.min(r.z, stop)
      r.phase = 'done'
    }
  }

  return out
}

/** Standings: most pins first, then whoever got there quickest. */
export function ranking(riders: Rider[], decks: Deck[]): Rider[] {
  return [...riders].sort((a, b) => {
    const pa = decks[a.lane]?.score ?? 0
    const pb = decks[b.lane]?.score ?? 0
    if (pa !== pb) return pb - pa
    // Nobody there yet ranks behind everybody who is; among those who are, the
    // quicker ride — measured from its own start, so a rider that went fourth
    // is not fourth for having waited.
    if (a.arriveAt && b.arriveAt) return a.arriveAt - a.startMs - (b.arriveAt - b.startMs)
    if (a.arriveAt) return -1
    if (b.arriveAt) return 1
    return b.z - a.z
  })
}

// ---- Setup helpers -------------------------------------------------------

/** Title on the opening card. */
export function episodeTitle(count: number): string {
  return count === 1 ? 'Alpine Strike!' : `${count} Animals Bowl Down a Mountain!`
}

/** How far down the run, as a percentage — what the live board reads out. */
export function pct(z: number, run: number): number {
  return Math.max(0, Math.min(100, Math.round((z / Math.max(1, run)) * 100)))
}

/**
 * What a pin count is worth saying out loud. Ten is the only one with a name
 * that means anything to a four-year-old, so the rest are just enthusiasm.
 */
export function callIt(pins: number): string {
  if (pins >= PIN_COUNT) return 'STRIKE! 🎳'
  if (pins >= 8) return 'So close! 🔥'
  if (pins >= 5) return 'Good hit! 👏'
  if (pins >= 1) return `${pins} down!`
  return 'Gutter! 😅'
}

/**
 * Average speed a ride actually comes out at, measured off real runs rather
 * than worked out from the slope: hazards, the rubber band and the run-out all
 * pull on it and they don't cancel. This is what turns the "average ride" dial
 * into a mountain length, so it is the one number worth re-measuring whenever
 * the physics or the hazard mix changes.
 */
const RIDE_SPEED: Record<Difficulty, number> = { easy: 12.9, normal: 12.3, wild: 11.5 }

/** Shortest and longest mountain the dial can ask for. */
export const MIN_RUN = 120
export const MAX_RUN = 2600

/** How long a mountain has to be for the leader's ride to last `avgRide`. */
export function runFor(avgRide: number, diff: Difficulty): number {
  return Math.max(MIN_RUN, Math.min(MAX_RUN, Math.round(avgRide * RIDE_SPEED[diff])))
}

/** Once the leader is down, how long the rest typically take to arrive. */
const TAIL_SECS = 6

/** The whole episode, for the "about 1m 40s" hint on the setup screen. */
export function episodeSecs(avgRide: number, riders: number, mode: Mode): number {
  const cards = (TITLE_MS + READY_MS + WINNER_MS + RESULT_MS + OUTRO_MS) / 1000
  if (mode === 'together') return Math.round(cards + avgRide + TAIL_SECS + SMASH_HOLD_MS / 1000)
  // One ride and one settle per animal, plus the card between each pair.
  const perTurn = avgRide + 3 + SMASH_HOLD_MS / 1000
  return Math.round(cards + riders * perTurn + ((riders - 1) * NEXT_TOTAL_MS) / 1000)
}

// ---- Picks -> something we can actually render ---------------------------

/** The starter fox's three tones, which a built-in rider recolours. */
const FOX_TONES: AnimalColors = { body: '#e8734a', belly: '#ffd9b3', ear: '#c2542f' }

/** Same deal as the other shows: pack animals come from the library, the five
 *  built-in riders are the starter animal repainted in their palette. */
export function designFor(pick: BowlPick, library: AnimalDesign[]): AnimalDesign {
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

// ---- The whole episode ---------------------------------------------------

/**
 * Everything the ride is: one mountain per lane, one rider and one rack per
 * mountain, and the clock they share. The stage owns exactly one of these and
 * mutates it every frame; the show reads it for the leaderboard. Keeping it out
 * of React state is the point — a falling pin shouldn't cost a re-render.
 */
export interface Sim {
  hazards: Hazard[][]
  riders: Rider[]
  decks: Deck[]
  run: number
  tune: Tune
  rubber: boolean
  /** Seconds since the mountains were built. */
  t: number
  /** Are they riding yet? False through the title and the countdown. */
  running: boolean
  /** ms on the ride clock, stamped onto arrivals. */
  clock: number
  /** Where the camera is, written back by the rig for the sun and the weather. */
  camY: number
  camZ: number
  /** Arrivals so far, in the order they came in. */
  places: number[]
  /** A shared stream for the tumble, so a rack looks rolled rather than tidy. */
  rand: () => number
  /** The episode seed, for anything the stage wants to scatter to match. */
  seed: number
  mode: Mode
  /** In turns: which lane is riding, or -1 before the first drops in. */
  turn: number
}

export function buildSim(cfg: BowlConfig): Sim {
  const tune = TUNE[cfg.difficulty]
  const run = runFor(cfg.avgRide, cfg.difficulty)
  const n = cfg.picks.length
  const hazards: Hazard[][] = []
  const riders: Rider[] = []
  const decks: Deck[] = []
  for (let i = 0; i < n; i++) {
    // Separate streams per lane, so how many numbers one mountain draws can't
    // shift the next one — and the same seed always builds the same episode.
    hazards.push(buildHazards(run, tune, cfg.hazards, rngOf(cfg.seed + i * 7919 + 13)))
    const skillRand = rngOf(cfg.seed + i * 104729 + 71)
    riders.push(
      freshRider(i, hazards[i], 0.45 + skillRand() * 0.45, rngOf(cfg.seed + i * 31337 + 7)),
    )
    decks.push({
      lane: i,
      pins: buildRack(run),
      score: 0,
      settled: false,
      rolled: false,
      back: run + DECK_LEN,
    })
  }
  return {
    hazards,
    riders,
    decks,
    run,
    tune,
    rubber: cfg.rubber,
    t: 0,
    running: false,
    clock: 0,
    camY: 0,
    camZ: 0,
    places: [],
    rand: rngOf(cfg.seed + 4241),
    seed: cfg.seed,
    mode: cfg.mode,
    turn: -1,
  }
}

/** Every rider and every deck, one frame. */
export function stepSim(sim: Sim, dt: number): { lane: number; ev: BowlEvent }[] {
  sim.t += dt
  if (!sim.running) return []
  sim.clock += dt * 1000
  const leadZ = sim.riders.reduce((m, r) => Math.max(m, r.z), -Infinity)
  const out: { lane: number; ev: BowlEvent }[] = []
  for (const r of sim.riders) {
    const evs = stepRider(r, dt, {
      hazards: sim.hazards[r.lane],
      deck: sim.decks[r.lane],
      tune: sim.tune,
      run: sim.run,
      leadZ,
      rubber: sim.rubber,
      clock: sim.clock,
    })
    for (const ev of evs) {
      if (ev.kind === 'arrive') sim.places.push(r.lane)
      out.push({ lane: r.lane, ev })
    }
  }
  // The pins keep moving after the board has stopped shoving them, and a board
  // still ploughing through can set a settled rack going again — so every deck
  // is stepped every frame rather than being retired the first time it goes
  // quiet. Ten pins is forty-five pairs; four lanes of that is nothing.
  for (const d of sim.decks) stepDeck(d, dt, sim.rand)
  return out
}

/** Kick one rider off the launch pad. The clock runs from the first. */
export function startRider(sim: Sim, lane: number): void {
  const r = sim.riders[lane]
  if (!r || r.phase !== 'ready') return
  sim.running = true
  sim.turn = lane
  r.phase = 'ride'
  r.v = START_V
  r.startMs = sim.clock
}

/** Kick every rider off at once. */
export function startRide(sim: Sim): void {
  sim.clock = 0
  for (const r of sim.riders) startRider(sim, r.lane)
}

/** Has this lane's roll finished — board stopped, and every pin with it? */
export function riderSettled(sim: Sim, lane: number): boolean {
  return sim.riders[lane]?.phase === 'done' && !!sim.decks[lane]?.settled
}

/**
 * Is the episode's scoring finished? Both halves matter: a rack can be
 * motionless because the board that will scatter it is still a hundred metres
 * up the mountain, and a board that has stopped can leave a pin still rolling.
 */
export function allSettled(sim: Sim): boolean {
  return sim.riders.every((r) => r.phase === 'done') && sim.decks.every((d) => d.settled)
}

/**
 * Time is up. Anyone still on the mountain is put on their deck at the speed
 * they were carrying, so the closing shot has the whole line-up on it rather
 * than one animal and three empty racks — and so a rider that had a shocker
 * still gets the roll it earned.
 */
export function finishAll(sim: Sim): void {
  for (const r of sim.riders) {
    // Only riders actually on the mountain: one still waiting its turn on the
    // summit has a ride coming and must not be dropped onto the deck.
    if (r.phase !== 'ride') continue
    r.z = sim.run
    r.x = r.aimed ? r.aimX : 0
    r.phase = 'deck'
    r.arriveAt = sim.clock
    r.hitV = r.v
  }
}

/** Stop the world: everything settles where it stands. */
export function settleAll(sim: Sim): void {
  for (const r of sim.riders) {
    r.v = 0
    r.phase = 'done'
  }
  for (const d of sim.decks) {
    for (const p of d.pins) {
      p.vx = 0
      p.vz = 0
      if (p.tilt > 0) p.tilt = p.tilt >= FALLEN ? 1 : 0
      p.down = p.tilt >= 1
    }
    d.score = countDown(d.pins)
    d.settled = true
  }
  sim.running = false
}

/** The small seeded generator the mountains and the wobbles run on. */
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
