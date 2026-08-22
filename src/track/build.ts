import * as THREE from 'three'
import {
  Piece,
  RAMP_HEIGHT,
  RAMP_LEN,
  STRAIGHT_LEN,
  TURN_ANGLE,
  TURN_RADIUS,
} from './pieces'

// Visual dimensions of the orange track cross-section.
export const TRACK_WIDTH = 2.6
export const WALL_HEIGHT = 0.55
export const RIDE_OFFSET = 0.32 // how high above the base the animals sit

export interface Track {
  points: THREE.Vector3[]
  tangents: THREE.Vector3[]
  ups: THREE.Vector3[]
  cum: number[] // cumulative arc length at each point
  length: number
  geometry: THREE.BufferGeometry
}

const UP = new THREE.Vector3(0, 1, 0)
const smoothstep = (t: number) => t * t * (3 - 2 * t)

function forwardVec(yaw: number) {
  return new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw))
}

/** Walk the piece list, emitting a dense list of centerline points. */
function centerline(pieces: Piece[]): THREE.Vector3[] {
  const pts: THREE.Vector3[] = []
  const pos = new THREE.Vector3(0, 0, 0)
  let yaw = 0

  pts.push(pos.clone())

  for (const piece of pieces) {
    switch (piece.type) {
      case 'straight': {
        const n = 8
        const f = forwardVec(yaw)
        for (let i = 1; i <= n; i++) {
          pos.addScaledVector(f, STRAIGHT_LEN / n)
          pts.push(pos.clone())
        }
        break
      }
      case 'left':
      case 'right': {
        const n = 16
        const sign = piece.type === 'left' ? 1 : -1
        const dYaw = (sign * TURN_ANGLE) / n
        const stepLen = (TURN_RADIUS * TURN_ANGLE) / n
        for (let i = 1; i <= n; i++) {
          yaw += dYaw
          pos.addScaledVector(forwardVec(yaw), stepLen)
          pts.push(pos.clone())
        }
        break
      }
      case 'rampUp':
      case 'rampDown': {
        const n = 12
        const sign = piece.type === 'rampUp' ? 1 : -1
        const f = forwardVec(yaw)
        const startY = pos.y
        for (let i = 1; i <= n; i++) {
          pos.addScaledVector(f, RAMP_LEN / n)
          pos.y = startY + sign * RAMP_HEIGHT * smoothstep(i / n)
          pts.push(pos.clone())
        }
        break
      }
    }
  }

  return pts
}

/** Build the orange channel geometry (base + two side walls) from the frames. */
function buildGeometry(
  points: THREE.Vector3[],
  tangents: THREE.Vector3[],
  ups: THREE.Vector3[],
): THREE.BufferGeometry {
  const positions: number[] = []
  const half = TRACK_WIDTH / 2

  const baseL: THREE.Vector3[] = []
  const baseR: THREE.Vector3[] = []
  const topL: THREE.Vector3[] = []
  const topR: THREE.Vector3[] = []

  for (let i = 0; i < points.length; i++) {
    const t = tangents[i]
    const up = ups[i]
    const right = new THREE.Vector3().crossVectors(t, up).normalize()
    const p = points[i]
    const bl = p.clone().addScaledVector(right, -half)
    const br = p.clone().addScaledVector(right, half)
    baseL.push(bl)
    baseR.push(br)
    topL.push(bl.clone().addScaledVector(up, WALL_HEIGHT))
    topR.push(br.clone().addScaledVector(up, WALL_HEIGHT))
  }

  const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => {
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
    positions.push(a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z)
  }

  for (let i = 0; i < points.length - 1; i++) {
    // Base floor.
    quad(baseL[i], baseR[i], baseR[i + 1], baseL[i + 1])
    // Left wall (inner face).
    quad(baseL[i], topL[i], topL[i + 1], baseL[i + 1])
    // Right wall (inner face).
    quad(baseR[i], baseR[i + 1], topR[i + 1], topR[i])
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  return geometry
}

export function buildTrack(pieces: Piece[]): Track {
  const points = centerline(pieces)

  // Tangents via central differences.
  const tangents: THREE.Vector3[] = []
  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)]
    const next = points[Math.min(points.length - 1, i + 1)]
    const t = next.clone().sub(prev)
    if (t.lengthSq() < 1e-8) t.set(0, 0, 1)
    tangents.push(t.normalize())
  }

  // Stable up per point (keeps walls upright, tilts on ramps).
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

  return { points, tangents, ups, cum, length, geometry: buildGeometry(points, tangents, ups) }
}

export interface TrackSample {
  pos: THREE.Vector3
  tangent: THREE.Vector3
  up: THREE.Vector3
}

/** Sample the track at arc-length distance d (wraps around for looping). */
export function sampleTrack(track: Track, d: number): TrackSample {
  const { cum, points, tangents, ups, length } = track
  if (length <= 0 || points.length < 2) {
    return { pos: new THREE.Vector3(), tangent: new THREE.Vector3(0, 0, 1), up: UP.clone() }
  }
  let dist = d % length
  if (dist < 0) dist += length

  // Linear scan (tracks are short); find segment containing dist.
  let i = 0
  while (i < cum.length - 2 && cum[i + 1] < dist) i++

  const segLen = cum[i + 1] - cum[i] || 1e-6
  const frac = (dist - cum[i]) / segLen
  const pos = points[i].clone().lerp(points[i + 1], frac)
  const tangent = tangents[i].clone().lerp(tangents[i + 1], frac).normalize()
  const up = ups[i].clone().lerp(ups[i + 1], frac).normalize()
  return { pos, tangent, up }
}
