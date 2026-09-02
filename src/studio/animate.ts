// Procedural, role-driven animation for cube animals. No skeletons: each block
// is rotated about a role-appropriate pivot (legs about their top, ears about
// their base, tail about its front) and the whole animal gets a root bob/arc.
// Everything here is a pure function of (role, clip, time, params).

import { AnimParams, Block, Clip, Role, Vec3 } from './model'

const DEG = Math.PI / 180
const TAU = Math.PI * 2

/** Local pivot the block rotates about during animation, in animal space. */
export function pivotFor(b: Block): Vec3 {
  const [x, y, z] = b.pos
  const [, sy, sz] = b.size
  switch (b.role) {
    case 'legFL':
    case 'legFR':
    case 'legBL':
    case 'legBR':
    case 'lowerFL':
    case 'lowerFR':
    case 'lowerBL':
    case 'lowerBR':
      return [x, y + sy / 2, z] // hip / knee: top of the segment
    case 'ear':
      return [x, y - sy / 2, z] // base of the ear
    case 'tail':
      return [x, y, z + sz / 2] // where the tail meets the body (+Z)
    case 'head':
      return [x, y - sy / 2, z - sz / 2] // neck: back-bottom of the head
    default:
      return [x, y, z] // spin about own centre
  }
}

const UPPER_ROLES: Role[] = ['legFL', 'legFR', 'legBL', 'legBR']
const LOWER_ROLES: Role[] = ['lowerFL', 'lowerFR', 'lowerBL', 'lowerBR']
export const LIMB_ROLES: Role[] = [...UPPER_ROLES, ...LOWER_ROLES]

const isLeg = (r: Role) => UPPER_ROLES.includes(r)

/** The upper segment a lower (below knee/elbow) segment hangs from. */
export function parentRole(r: Role): Role | null {
  switch (r) {
    case 'lowerFL':
      return 'legFL'
    case 'lowerFR':
      return 'legFR'
    case 'lowerBL':
      return 'legBL'
    case 'lowerBR':
      return 'legBR'
    default:
      return null
  }
}

/** Front limbs fold like an elbow (forward), back limbs like a knee (back). */
const isFront = (r: Role) => r === 'legFL' || r === 'legFR' || r === 'lowerFL' || r === 'lowerFR'

/**
 * Shared hinge per limb role, so multi-block segments (leg + hoof + claws)
 * swing as one rigid unit. Rotating each block about its own pivot left feet
 * spinning in place while the leg's end swung away from them. Upper segments
 * hinge at the hip/shoulder, lower ones at the knee/elbow — both are the top
 * of that segment's own bounding box.
 */
export function limbPivots(blocks: Block[]): Partial<Record<Role, Vec3>> {
  const out: Partial<Record<Role, Vec3>> = {}
  for (const role of LIMB_ROLES) {
    let minX = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    let minZ = Infinity
    let maxZ = -Infinity
    let any = false
    for (const b of blocks) {
      if (b.role !== role) continue
      any = true
      minX = Math.min(minX, b.pos[0])
      maxX = Math.max(maxX, b.pos[0])
      maxY = Math.max(maxY, b.pos[1] + b.size[1] / 2)
      minZ = Math.min(minZ, b.pos[2])
      maxZ = Math.max(maxZ, b.pos[2])
    }
    if (any) out[role] = [(minX + maxX) / 2, maxY, (minZ + maxZ) / 2]
  }
  return out
}

/** Diagonal gait phase offset: FL+BR move together, FR+BL together (opposite). */
function legPhase(r: Role): number {
  const limb = parentRole(r) ?? r // a lower segment keeps its parent's phase
  return limb === 'legFL' || limb === 'legBR' ? 0 : Math.PI
}

export interface RootPose {
  y: number
  pitch: number // lean about X (radians)
}

/** Whole-animal motion: gentle bob when idle/walking, an arc when jumping. */
export function rootPose(clip: Clip, t: number, a: AnimParams): RootPose {
  if (clip === 'idle') {
    return { y: Math.sin(t * a.idle.speed) * a.idle.bob, pitch: 0 }
  }
  if (clip === 'walk') {
    const ph = t * a.walk.speed * TAU
    // Two body bobs per stride (a foot lands twice per cycle). sin² rather than
    // |sin| — same shape, but without the kink at the bottom of every bounce.
    const s = Math.sin(ph)
    return { y: s * s * a.walk.bodyBob, pitch: 0 }
  }
  // jump: a looped crouch -> launch -> arc -> land cycle.
  const u = frac(t * a.jump.speed)
  if (u < 0.18) {
    const k = u / 0.18 // crouch down
    return { y: -0.18 * ease(k), pitch: 0 }
  }
  if (u < 0.82) {
    const p = (u - 0.18) / 0.64 // airborne arc
    return { y: a.jump.height * Math.sin(Math.PI * p), pitch: -0.12 * Math.sin(TAU * p) }
  }
  const k = (u - 0.82) / 0.18 // settle back down
  return { y: -0.12 * (1 - k), pitch: 0 }
}

export interface BlockPose {
  rx: number
  ry: number
  rz: number
}

const REST: BlockPose = { rx: 0, ry: 0, rz: 0 }

/**
 * Per-block rotation offset (radians) about its pivot for the given clip.
 *
 * A lower segment's angle is *relative to its parent* — the renderer nests the
 * knee/elbow group inside the hip/shoulder group, so the two add up the way a
 * real joint chain does.
 */
export function blockPose(role: Role, clip: Clip, t: number, a: AnimParams): BlockPose {
  const parent = parentRole(role)

  if (clip === 'idle') {
    if (role === 'ear') return { rx: 0, ry: 0, rz: Math.sin(t * a.idle.speed * 1.3) * 6 * DEG }
    if (role === 'tail') return { rx: 0, ry: Math.sin(t * a.idle.speed * 1.1) * 10 * DEG, rz: 0 }
    if (role === 'head') return { rx: Math.sin(t * a.idle.speed * 0.9) * 3 * DEG, ry: 0, rz: 0 }
    // Standing still: the arms breathe a little, the planted legs don't, and
    // the elbows keep a soft resting bend instead of locking straight.
    if (parent) {
      if (!isFront(role)) return REST
      return { rx: (-5 - Math.sin(t * a.idle.speed * 0.9) * 1.5) * DEG, ry: 0, rz: 0 }
    }
    if (isLeg(role) && isFront(role)) {
      return { rx: Math.sin(t * a.idle.speed * 0.9 + legPhase(role)) * 2 * DEG, ry: 0, rz: 0 }
    }
    return REST
  }

  if (clip === 'walk') {
    const ph = t * a.walk.speed * TAU
    if (isLeg(role)) {
      return { rx: Math.sin(ph + legPhase(role)) * a.walk.legSwing * DEG, ry: 0, rz: 0 }
    }
    if (parent) {
      const u = ph + legPhase(role)
      if (isFront(role)) {
        // Elbow: bends most with the arm forward (sin u at its most negative),
        // never straightens all the way.
        const fold = (1 - Math.sin(u)) / 2
        return { rx: -a.walk.legSwing * 0.7 * (0.25 + 0.75 * fold) * DEG, ry: 0, rz: 0 }
      }
      // Knee: near-straight through the planted half of the stride, folding to
      // lift the foot through the swing (peak at u = pi, mid-swing).
      const s = (1 - Math.cos(u)) / 2
      return { rx: a.walk.legSwing * 1.25 * s * s * DEG, ry: 0, rz: 0 }
    }
    if (role === 'tail') return { rx: 0, ry: Math.sin(ph * 1.5) * 16 * DEG, rz: 0 }
    if (role === 'ear') return { rx: 0, ry: 0, rz: Math.sin(ph) * 8 * DEG }
    if (role === 'head') return { rx: Math.sin(ph * 2) * 4 * DEG, ry: 0, rz: 0 }
    return REST
  }

  // jump
  const u = frac(t * a.jump.speed)
  const airborne = u >= 0.18 && u < 0.82
  const p = airborne ? (u - 0.18) / 0.64 : 0
  if (isLeg(role) || parent) {
    // Tuck the limbs up while airborne; front and back tuck opposite ways, and
    // the knees/elbows fold harder than the segment above them.
    const tuck = airborne ? Math.sin(Math.PI * p) * a.jump.tuck * DEG : 0
    if (parent) return { rx: isFront(role) ? -tuck * 0.8 : tuck * 1.3, ry: 0, rz: 0 }
    return { rx: isFront(role) ? -tuck : tuck, ry: 0, rz: 0 }
  }
  if (role === 'ear') {
    const flap = airborne ? Math.sin(Math.PI * p) * 22 * DEG : 0
    return { rx: 0, ry: 0, rz: flap }
  }
  if (role === 'tail') {
    const up = airborne ? Math.sin(Math.PI * p) * 26 * DEG : 0
    return { rx: up, ry: 0, rz: 0 }
  }
  return REST
}

function frac(x: number): number {
  return x - Math.floor(x)
}

function ease(x: number): number {
  return x * x * (3 - 2 * x) // smoothstep
}
