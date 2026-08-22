import * as THREE from 'three'
import {
  BOOST_LEN,
  GAP_LEN,
  MUD_LEN,
  Piece,
  PieceType,
  RAMP_HEIGHT,
  RAMP_LEN,
  SPEED_MULT,
  SPRING_LEN,
  STRAIGHT_LEN,
  TURN_ANGLE,
  TURN_RADIUS,
  WATER_LEN,
} from './pieces'

// Visual dimensions of the orange track cross-section.
export const TRACK_WIDTH = 2.6
export const WALL_HEIGHT = 0.55
export const RIDE_OFFSET = 0.32 // how high above the base the animals sit

const GAP_JUMP_HEIGHT = 2.8
const SPRING_HEIGHT = 3.4
const WATER_SINK = 0.16

export interface Segment {
  type: PieceType
  center: THREE.Vector3
  tangent: THREE.Vector3
  up: THREE.Vector3
  length: number
}

export interface Track {
  points: THREE.Vector3[]
  tangents: THREE.Vector3[]
  ups: THREE.Vector3[]
  types: PieceType[]
  us: number[] // fractional position (0..1) within the owning piece
  cum: number[] // cumulative arc length at each point
  length: number
  geometry: THREE.BufferGeometry
  segments: Segment[]
  center: THREE.Vector3
  radius: number
}

const UP = new THREE.Vector3(0, 1, 0)
const smoothstep = (t: number) => t * t * (3 - 2 * t)

function forwardVec(yaw: number) {
  return new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw))
}

interface Walk {
  points: THREE.Vector3[]
  types: PieceType[]
  us: number[]
  spans: { type: PieceType; start: number; end: number }[]
}

/** Sample counts per piece type. */
const SAMPLES: Record<PieceType, number> = {
  straight: 8,
  left: 16,
  right: 16,
  rampUp: 12,
  rampDown: 12,
  gap: 14,
  water: 12,
  mud: 10,
  boost: 10,
  spring: 10,
}

/** Walk the piece list, emitting a dense centerline plus per-point metadata. */
function walk(pieces: Piece[]): Walk {
  const points: THREE.Vector3[] = []
  const types: PieceType[] = []
  const us: number[] = []
  const spans: Walk['spans'] = []

  const pos = new THREE.Vector3(0, 0, 0)
  let yaw = 0

  points.push(pos.clone())
  types.push('straight')
  us.push(0)

  const push = (type: PieceType, u: number) => {
    points.push(pos.clone())
    types.push(type)
    us.push(u)
  }

  for (const piece of pieces) {
    const n = SAMPLES[piece.type]
    const start = points.length // first index this piece contributes
    switch (piece.type) {
      case 'left':
      case 'right': {
        const sign = piece.type === 'left' ? 1 : -1
        const dYaw = (sign * TURN_ANGLE) / n
        const stepLen = (TURN_RADIUS * TURN_ANGLE) / n
        for (let i = 1; i <= n; i++) {
          yaw += dYaw
          pos.addScaledVector(forwardVec(yaw), stepLen)
          push(piece.type, i / n)
        }
        break
      }
      case 'rampUp':
      case 'rampDown': {
        const sign = piece.type === 'rampUp' ? 1 : -1
        const f = forwardVec(yaw)
        const startY = pos.y
        for (let i = 1; i <= n; i++) {
          pos.addScaledVector(f, RAMP_LEN / n)
          pos.y = startY + sign * RAMP_HEIGHT * smoothstep(i / n)
          push(piece.type, i / n)
        }
        break
      }
      default: {
        // Straight-like pieces (straight + all obstacles): advance forward.
        const len =
          piece.type === 'straight'
            ? STRAIGHT_LEN
            : piece.type === 'gap'
              ? GAP_LEN
              : piece.type === 'water'
                ? WATER_LEN
                : piece.type === 'mud'
                  ? MUD_LEN
                  : piece.type === 'boost'
                    ? BOOST_LEN
                    : SPRING_LEN
        const f = forwardVec(yaw)
        for (let i = 1; i <= n; i++) {
          pos.addScaledVector(f, len / n)
          push(piece.type, i / n)
        }
        break
      }
    }
    spans.push({ type: piece.type, start, end: points.length - 1 })
  }

  return { points, types, us, spans }
}

/** Build the orange channel geometry, skipping gap sections (jump holes). */
function buildGeometry(
  points: THREE.Vector3[],
  tangents: THREE.Vector3[],
  ups: THREE.Vector3[],
  types: PieceType[],
): THREE.BufferGeometry {
  const positions: number[] = []
  const half = TRACK_WIDTH / 2

  const baseL: THREE.Vector3[] = []
  const baseR: THREE.Vector3[] = []
  const topL: THREE.Vector3[] = []
  const topR: THREE.Vector3[] = []

  for (let i = 0; i < points.length; i++) {
    const right = new THREE.Vector3().crossVectors(tangents[i], ups[i]).normalize()
    const p = points[i]
    const bl = p.clone().addScaledVector(right, -half)
    const br = p.clone().addScaledVector(right, half)
    baseL.push(bl)
    baseR.push(br)
    topL.push(bl.clone().addScaledVector(ups[i], WALL_HEIGHT))
    topR.push(br.clone().addScaledVector(ups[i], WALL_HEIGHT))
  }

  const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => {
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
    positions.push(a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z)
  }

  for (let i = 0; i < points.length - 1; i++) {
    // Leave a hole where the jump gap is.
    if (types[i] === 'gap' || types[i + 1] === 'gap') continue
    quad(baseL[i], baseR[i], baseR[i + 1], baseL[i + 1]) // floor
    quad(baseL[i], topL[i], topL[i + 1], baseL[i + 1]) // left wall
    quad(baseR[i], baseR[i + 1], topR[i + 1], topR[i]) // right wall
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  return geometry
}

export function buildTrack(pieces: Piece[]): Track {
  const { points, types, us, spans } = walk(pieces)

  // Tangents via central differences.
  const tangents: THREE.Vector3[] = []
  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)]
    const next = points[Math.min(points.length - 1, i + 1)]
    const t = next.clone().sub(prev)
    if (t.lengthSq() < 1e-8) t.set(0, 0, 1)
    tangents.push(t.normalize())
  }

  // Stable up per point (walls upright, tilting on ramps).
  const ups: THREE.Vector3[] = tangents.map((t) => {
    const right = new THREE.Vector3().crossVectors(t, UP)
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0)
    right.normalize()
    return new THREE.Vector3().crossVectors(right, t).normalize()
  })

  // Cumulative arc length.
  const cum: number[] = [0]
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1] + points[i].distanceTo(points[i - 1]))
  }
  const length = cum[cum.length - 1] || 0

  // Obstacle segments (for overlay rendering).
  const segments: Segment[] = spans
    .filter((s) => s.type !== 'straight')
    .map((s) => {
      const mid = Math.floor((s.start + s.end) / 2)
      return {
        type: s.type,
        center: points[mid].clone(),
        tangent: tangents[mid].clone(),
        up: ups[mid].clone(),
        length: cum[s.end] - cum[s.start - 1 < 0 ? 0 : s.start - 1],
      }
    })

  // Bounding sphere for camera framing.
  const box = new THREE.Box3()
  points.forEach((p) => box.expandByPoint(p))
  const center = box.getCenter(new THREE.Vector3())
  const radius = box.getSize(new THREE.Vector3()).length() / 2 || 10

  return {
    points,
    tangents,
    ups,
    types,
    us,
    cum,
    length,
    geometry: buildGeometry(points, tangents, ups, types),
    segments,
    center,
    radius,
  }
}

export interface TrackSample {
  pos: THREE.Vector3
  tangent: THREE.Vector3
  up: THREE.Vector3
  type: PieceType
  u: number
}

/** Sample the track at arc-length distance d (wraps around for looping). */
export function sampleTrack(track: Track, d: number): TrackSample {
  const { cum, points, tangents, ups, types, us, length } = track
  if (length <= 0 || points.length < 2) {
    return {
      pos: new THREE.Vector3(),
      tangent: new THREE.Vector3(0, 0, 1),
      up: UP.clone(),
      type: 'straight',
      u: 0,
    }
  }
  let dist = d % length
  if (dist < 0) dist += length

  let i = 0
  while (i < cum.length - 2 && cum[i + 1] < dist) i++

  const segLen = cum[i + 1] - cum[i] || 1e-6
  const frac = (dist - cum[i]) / segLen
  const pos = points[i].clone().lerp(points[i + 1], frac)
  const tangent = tangents[i].clone().lerp(tangents[i + 1], frac).normalize()
  const up = ups[i].clone().lerp(ups[i + 1], frac).normalize()
  const type = types[i]
  // Interpolate u within a piece; at a piece boundary us resets, so clamp.
  const u = us[i + 1] >= us[i] ? us[i] + (us[i + 1] - us[i]) * frac : us[i]
  return { pos, tangent, up, type, u }
}

export function speedMultiplier(type: PieceType): number {
  return SPEED_MULT[type] ?? 1
}

/** Extra world-space Y offset for jump/spring arcs. */
export function jumpOffset(type: PieceType, u: number): number {
  const arc = 4 * u * (1 - u) // parabola peaking at u=0.5
  if (type === 'gap') return GAP_JUMP_HEIGHT * arc
  if (type === 'spring') return SPRING_HEIGHT * arc
  if (type === 'water') return -WATER_SINK
  return 0
}
