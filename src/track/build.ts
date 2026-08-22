import * as THREE from 'three'
import {
  LOOP_ADVANCE,
  LOOP_RADIUS,
  LOOP_SAMPLES,
  OBSTACLE_LEN,
  PieceType,
  RAMP_HEIGHT,
  RAMP_LEN,
  SPEED_MULT,
  STRAIGHT_LEN,
  TURN_ANGLE,
  TURN_RADIUS,
} from './pieces'
import { ANIMAL_PALETTES } from './Animal'

export const NUM_LANES = 5
export const LANE_WIDTH = 2.1
export const LANE_SPACING = 2.35
export const WALL_HEIGHT = 0.5
export const RIDE_OFFSET = 0.3

const GAP_JUMP_HEIGHT = 2.6
const TRAMPOLINE_HEIGHT = 4.4
const WATER_SINK = 0.16

const UP = new THREE.Vector3(0, 1, 0)
const smoothstep = (t: number) => t * t * (3 - 2 * t)
const forwardVec = (yaw: number) => new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw))

export interface Center {
  points: THREE.Vector3[]
  tangents: THREE.Vector3[]
  ups: THREE.Vector3[]
  rights: THREE.Vector3[]
  cum: number[]
  length: number
}

export interface LaneObstacle {
  type: PieceType
  dist: number
  len: number
  start: number
  end: number
}

export interface Lane {
  index: number
  offset: number
  color: string
  geometry: THREE.BufferGeometry
  obstacles: LaneObstacle[]
}

export interface ObstaclePlacement {
  key: string
  type: PieceType
  position: [number, number, number]
  quaternion: [number, number, number, number]
  length: number
  phase: number
  lane: number
  dist: number
}

// --- Timed obstacle behavior (shared by visuals and rider logic) ---
export const STOPPER_UP = 3 // seconds raised (blocking)
export const STOPPER_DOWN = 3 // seconds lowered (clear)
export const SPIN_AMP = 4.0 // swing amplitude (rad) — the hammer swings ±this, reversing direction
export const SPIN_RATE = 1.1 // swing rate
export const SPINNER_WINDOW = 1.0 // rad half-window where the hammer is over the lane

/** Is a stopper (identified by its phase) currently raised? */
export function stopperUp(phase: number, t: number): boolean {
  const period = STOPPER_UP + STOPPER_DOWN
  let p = (t + phase) % period
  if (p < 0) p += period
  return p < STOPPER_UP
}

/**
 * Current rotation angle of a spinner hammer. It swings back and forth (a sine
 * sweep), so its rotation direction reverses each half-swing.
 */
export function spinnerAngle(phase: number, t: number): number {
  return SPIN_AMP * Math.sin(SPIN_RATE * t + phase)
}

/** Is a spinner arm currently sweeping across the lane (hitting)? */
export function spinnerHit(phase: number, t: number): boolean {
  let a = spinnerAngle(phase, t) % (2 * Math.PI)
  if (a < 0) a += 2 * Math.PI
  if (a > Math.PI) a -= 2 * Math.PI
  return Math.abs(a) < SPINNER_WINDOW
}

export interface Track {
  center: Center
  lanes: Lane[]
  placements: ObstaclePlacement[]
  boundsCenter: THREE.Vector3
  radius: number
  length: number
}

const SAMPLES: Record<string, number> = {
  straight: 8,
  left: 18,
  right: 18,
  rampUp: 12,
  rampDown: 12,
}

/**
 * Walk shape pieces into a dense centerline. Most pieces stay level and let the
 * up-vector be derived later; the loop supplies explicit up-vectors so the
 * track can go fully vertical and inverted.
 */
function buildCenter(shape: PieceType[]): Center {
  const points: THREE.Vector3[] = []
  const explicitUps: (THREE.Vector3 | null)[] = []
  const pos = new THREE.Vector3(0, 0, 0)
  let yaw = 0
  points.push(pos.clone())
  explicitUps.push(null)

  const push = (up: THREE.Vector3 | null = null) => {
    points.push(pos.clone())
    explicitUps.push(up)
  }

  for (const type of shape) {
    if (type === 'left' || type === 'right') {
      const n = SAMPLES[type]
      const sign = type === 'left' ? 1 : -1
      const dYaw = (sign * TURN_ANGLE) / n
      const stepLen = (TURN_RADIUS * TURN_ANGLE) / n
      for (let i = 1; i <= n; i++) {
        yaw += dYaw
        pos.addScaledVector(forwardVec(yaw), stepLen)
        push()
      }
    } else if (type === 'rampUp' || type === 'rampDown') {
      const n = SAMPLES[type]
      const sign = type === 'rampUp' ? 1 : -1
      const f = forwardVec(yaw)
      const startY = pos.y
      for (let i = 1; i <= n; i++) {
        pos.addScaledVector(f, RAMP_LEN / n)
        pos.y = startY + sign * RAMP_HEIGHT * smoothstep(i / n)
        push()
      }
    } else if (type === 'loop') {
      const n = LOOP_SAMPLES
      const start = pos.clone()
      const f = forwardVec(yaw)
      for (let i = 1; i <= n; i++) {
        const th = (2 * Math.PI * i) / n
        pos
          .copy(start)
          .addScaledVector(f, LOOP_RADIUS * Math.sin(th) + LOOP_ADVANCE * (i / n))
          .addScaledVector(UP, LOOP_RADIUS * (1 - Math.cos(th)))
        const up = new THREE.Vector3()
          .addScaledVector(f, -Math.sin(th))
          .addScaledVector(UP, Math.cos(th))
          .normalize()
        push(up)
      }
      pos.copy(start).addScaledVector(f, LOOP_ADVANCE)
    } else {
      const n = SAMPLES.straight
      const f = forwardVec(yaw)
      for (let i = 1; i <= n; i++) {
        pos.addScaledVector(f, STRAIGHT_LEN / n)
        push()
      }
    }
  }

  const tangents: THREE.Vector3[] = []
  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)]
    const next = points[Math.min(points.length - 1, i + 1)]
    const t = next.clone().sub(prev)
    if (t.lengthSq() < 1e-8) t.set(0, 0, 1)
    tangents.push(t.normalize())
  }

  const ups: THREE.Vector3[] = []
  const rights: THREE.Vector3[] = []
  for (let i = 0; i < points.length; i++) {
    const t = tangents[i]
    let up = explicitUps[i]
    if (up) {
      // Re-orthogonalize the supplied up against the tangent.
      const right = new THREE.Vector3().crossVectors(t, up)
      if (right.lengthSq() < 1e-6) right.set(1, 0, 0)
      right.normalize()
      up = new THREE.Vector3().crossVectors(right, t).normalize()
      rights.push(right)
    } else {
      const right = new THREE.Vector3().crossVectors(t, UP)
      if (right.lengthSq() < 1e-6) right.set(1, 0, 0)
      right.normalize()
      up = new THREE.Vector3().crossVectors(right, t).normalize()
      rights.push(right)
    }
    ups.push(up)
  }

  const cum: number[] = [0]
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + points[i].distanceTo(points[i - 1]))
  const length = cum[cum.length - 1] || 0

  return { points, tangents, ups, rights, cum, length }
}

export interface Frame {
  pos: THREE.Vector3
  tangent: THREE.Vector3
  up: THREE.Vector3
  right: THREE.Vector3
}

/** Sample the centerline at arc-length distance d (wraps for looping). */
export function sampleCenter(center: Center, d: number): Frame {
  const { cum, points, tangents, ups, rights, length } = center
  if (length <= 0 || points.length < 2) {
    return {
      pos: new THREE.Vector3(),
      tangent: new THREE.Vector3(0, 0, 1),
      up: UP.clone(),
      right: new THREE.Vector3(1, 0, 0),
    }
  }
  let dist = d % length
  if (dist < 0) dist += length
  let i = 0
  while (i < cum.length - 2 && cum[i + 1] < dist) i++
  const frac = (dist - cum[i]) / (cum[i + 1] - cum[i] || 1e-6)
  return {
    pos: points[i].clone().lerp(points[i + 1], frac),
    tangent: tangents[i].clone().lerp(tangents[i + 1], frac).normalize(),
    up: ups[i].clone().lerp(ups[i + 1], frac).normalize(),
    right: rights[i].clone().lerp(rights[i + 1], frac).normalize(),
  }
}

/** Build one lane's channel geometry, offset sideways, skipping jump gaps. */
function buildLaneGeometry(center: Center, offset: number, gaps: [number, number][]): THREE.BufferGeometry {
  const { points, rights, ups, cum } = center
  const half = LANE_WIDTH / 2
  const positions: number[] = []

  const laneC = points.map((p, i) => p.clone().addScaledVector(rights[i], offset))
  const baseL = laneC.map((c, i) => c.clone().addScaledVector(rights[i], -half))
  const baseR = laneC.map((c, i) => c.clone().addScaledVector(rights[i], half))
  const topL = baseL.map((b, i) => b.clone().addScaledVector(ups[i], WALL_HEIGHT))
  const topR = baseR.map((b, i) => b.clone().addScaledVector(ups[i], WALL_HEIGHT))

  const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => {
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
    positions.push(a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z)
  }

  const inGap = (d: number) => gaps.some(([s, e]) => d >= s && d <= e)

  for (let i = 0; i < points.length - 1; i++) {
    const mid = (cum[i] + cum[i + 1]) / 2
    if (inGap(mid)) continue
    quad(baseL[i], baseR[i], baseR[i + 1], baseL[i + 1])
    quad(baseL[i], topL[i], topL[i + 1], baseL[i + 1])
    quad(baseR[i], baseR[i + 1], topR[i + 1], topR[i])
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  return geometry
}

function frameQuaternion(f: Frame): [number, number, number, number] {
  const x = new THREE.Vector3().crossVectors(f.up, f.tangent).normalize()
  const y = new THREE.Vector3().crossVectors(f.tangent, x).normalize()
  const m = new THREE.Matrix4().makeBasis(x, y, f.tangent)
  const q = new THREE.Quaternion().setFromRotationMatrix(m)
  return [q.x, q.y, q.z, q.w]
}

export function buildTrack(shape: PieceType[], laneObstacles: PieceType[][]): Track {
  const center = buildCenter(shape)
  const { length } = center

  const lanes: Lane[] = []
  const placements: ObstaclePlacement[] = []

  for (let l = 0; l < NUM_LANES; l++) {
    const offset = (l - (NUM_LANES - 1) / 2) * LANE_SPACING
    const types = laneObstacles[l] ?? []
    const k = types.length
    const obstacles: LaneObstacle[] = types.map((type, j) => {
      const dist = length * ((j + 1) / (k + 1))
      const len = OBSTACLE_LEN[type] || 4
      return { type, dist, len, start: dist - len / 2, end: dist + len / 2 }
    })

    const gaps = obstacles
      .filter((o) => o.type === 'gap')
      .map((o) => [o.start, o.end] as [number, number])

    lanes.push({
      index: l,
      offset,
      color: ANIMAL_PALETTES[l % ANIMAL_PALETTES.length].body,
      geometry: buildLaneGeometry(center, offset, gaps),
      obstacles,
    })

    for (const o of obstacles) {
      const f = sampleCenter(center, o.dist)
      const p = f.pos.clone().addScaledVector(f.right, offset)
      placements.push({
        key: `${l}-${o.dist.toFixed(1)}-${o.type}`,
        type: o.type,
        position: [p.x, p.y, p.z],
        quaternion: frameQuaternion(f),
        length: o.len,
        // Desync timed obstacles by seeding phase from position.
        phase: o.type === 'stopper' || o.type === 'spinner' ? o.dist : 0,
        lane: l,
        dist: o.dist,
      })
    }
  }

  const box = new THREE.Box3()
  center.points.forEach((p) => box.expandByPoint(p))
  const boundsCenter = box.getCenter(new THREE.Vector3())
  const radius = box.getSize(new THREE.Vector3()).length() / 2 + NUM_LANES * LANE_SPACING || 12

  return { center, lanes, placements, boundsCenter, radius, length }
}

export function speedMultiplier(type: PieceType): number {
  return SPEED_MULT[type] ?? 1
}

export function jumpOffset(type: PieceType, u: number): number {
  const arc = 4 * u * (1 - u)
  if (type === 'gap') return GAP_JUMP_HEIGHT * arc
  if (type === 'trampoline') return TRAMPOLINE_HEIGHT * arc
  if (type === 'water') return -WATER_SINK
  return 0
}

/** Which obstacle (if any) a lane rider is inside at distance d. */
export function laneEffect(lane: Lane, d: number, length: number): { type: PieceType; u: number } {
  let dist = length > 0 ? d % length : d
  if (dist < 0) dist += length
  for (const o of lane.obstacles) {
    if (dist >= o.start && dist <= o.end) {
      return { type: o.type, u: (dist - o.start) / o.len }
    }
  }
  return { type: 'straight', u: 0 }
}
