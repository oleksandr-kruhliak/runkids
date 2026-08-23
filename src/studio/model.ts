// Data model for the Animal Studio: a primitive animal is a flat list of
// coloured boxes ("blocks"), each tagged with a role so the procedural
// idle/walk/jump animations know how to move it (legs swing, ears sway, etc.).

export type Vec3 = [number, number, number]

export type Clip = 'idle' | 'walk' | 'jump'
export const CLIPS: Clip[] = ['idle', 'walk', 'jump']

/**
 * A block's role drives how it animates. The four leg roles are paired
 * diagonally for a natural trot; other roles get light idle motion for life.
 */
export type Role =
  | 'body'
  | 'head'
  | 'ear'
  | 'tail'
  | 'legFL'
  | 'legFR'
  | 'legBL'
  | 'legBR'
  | 'none'

export const ROLES: { role: Role; label: string; hint: string }[] = [
  { role: 'body', label: 'Body', hint: 'Bobs up and down' },
  { role: 'head', label: 'Head', hint: 'Nods gently' },
  { role: 'ear', label: 'Ear', hint: 'Flaps / sways' },
  { role: 'tail', label: 'Tail', hint: 'Wags' },
  { role: 'legFL', label: 'Leg · front-L', hint: 'Swings (trot)' },
  { role: 'legFR', label: 'Leg · front-R', hint: 'Swings (trot)' },
  { role: 'legBL', label: 'Leg · back-L', hint: 'Swings (trot)' },
  { role: 'legBR', label: 'Leg · back-R', hint: 'Swings (trot)' },
  { role: 'none', label: 'Static', hint: 'Never moves' },
]

export const ROLE_LABEL: Record<Role, string> = ROLES.reduce(
  (m, r) => ((m[r.role] = r.label), m),
  {} as Record<Role, string>,
)

export interface Block {
  id: string
  name: string
  role: Role
  pos: Vec3
  size: Vec3
  /** Euler rotation in degrees (author-friendly). */
  rot: Vec3
  color: string
}

export interface AnimParams {
  idle: { bob: number; speed: number }
  walk: { legSwing: number; bodyBob: number; speed: number }
  jump: { height: number; tuck: number; speed: number }
}

export interface AnimalDesign {
  id: string
  name: string
  blocks: Block[]
  anim: AnimParams
  updated: number
}

export const DEFAULT_ANIM: AnimParams = {
  idle: { bob: 0.05, speed: 1.6 },
  walk: { legSwing: 42, bodyBob: 0.09, speed: 2.2 },
  jump: { height: 1.1, tuck: 34, speed: 0.9 },
}

export function uid(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
  }
}

export const PALETTE = [
  '#e8734a', '#8d6e63', '#9ccc65', '#90a4ae', '#f6bf42',
  '#ffd9b3', '#efe0d0', '#e6ffcf', '#eceff1', '#fff2c2',
  '#c2542f', '#5d4037', '#689f38', '#546e7a', '#d99a1c',
  '#3a2a25', '#1c1c1c', '#ffffff', '#ff7a1a', '#42a5f5',
]

function block(
  name: string,
  role: Role,
  pos: Vec3,
  size: Vec3,
  color: string,
  rot: Vec3 = [0, 0, 0],
): Block {
  return { id: uid(), name, role, pos, size, rot, color }
}

/**
 * A starter fox that mirrors the hardcoded primitive animal already used on
 * the race track, so there's immediate continuity to edit from.
 */
export function starterFox(): AnimalDesign {
  const body = '#e8734a'
  const belly = '#ffd9b3'
  const ear = '#c2542f'
  return {
    id: uid(),
    name: 'Fox',
    updated: Date.now(),
    anim: structuredCloneSafe(DEFAULT_ANIM),
    blocks: [
      block('Body', 'body', [0, 0, 0], [0.9, 0.8, 1.4], body),
      block('Belly', 'body', [0, -0.18, 0.2], [0.7, 0.5, 1.0], belly),
      block('Head', 'head', [0, 0.35, 0.72], [0.78, 0.72, 0.7], body),
      block('Snout', 'head', [0, 0.22, 1.08], [0.4, 0.34, 0.26], belly),
      block('Nose', 'head', [0, 0.28, 1.22], [0.14, 0.12, 0.1], '#3a2a25'),
      block('Ear L', 'ear', [-0.28, 0.78, 0.62], [0.22, 0.28, 0.12], ear),
      block('Ear R', 'ear', [0.28, 0.78, 0.62], [0.22, 0.28, 0.12], ear),
      block('Eye L', 'head', [-0.2, 0.42, 1.06], [0.1, 0.12, 0.06], '#1c1c1c'),
      block('Eye R', 'head', [0.2, 0.42, 1.06], [0.1, 0.12, 0.06], '#1c1c1c'),
      block('Leg FL', 'legFL', [-0.32, -0.45, 0.35], [0.22, 0.34, 0.22], ear),
      block('Leg FR', 'legFR', [0.32, -0.45, 0.35], [0.22, 0.34, 0.22], ear),
      block('Leg BL', 'legBL', [-0.32, -0.45, -0.35], [0.22, 0.34, 0.22], ear),
      block('Leg BR', 'legBR', [0.32, -0.45, -0.35], [0.22, 0.34, 0.22], ear),
      block('Tail', 'tail', [0, 0.1, -0.82], [0.24, 0.24, 0.4], ear),
    ],
  }
}

export function emptyDesign(): AnimalDesign {
  return {
    id: uid(),
    name: 'New Animal',
    updated: Date.now(),
    anim: structuredCloneSafe(DEFAULT_ANIM),
    blocks: [block('Body', 'body', [0, 0, 0], [1, 0.8, 1.4], '#e8734a')],
  }
}

export function newBlock(near?: Block): Block {
  const p: Vec3 = near ? [near.pos[0], near.pos[1] + 0.5, near.pos[2]] : [0, 0.5, 0]
  return block('Block', 'none', p, [0.4, 0.4, 0.4], '#ff7a1a')
}

/** structuredClone with a JSON fallback for older runtimes. */
export function structuredCloneSafe<T>(v: T): T {
  try {
    return structuredClone(v)
  } catch {
    return JSON.parse(JSON.stringify(v))
  }
}

export function cloneDesign(d: AnimalDesign): AnimalDesign {
  const copy = structuredCloneSafe(d)
  copy.id = uid()
  copy.blocks = copy.blocks.map((b) => ({ ...b, id: uid() }))
  copy.updated = Date.now()
  return copy
}

// ---- Validation (used when importing untrusted JSON) --------------------

const isVec3 = (v: unknown): v is Vec3 =>
  Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && isFinite(n))

const ROLE_SET = new Set<string>(ROLES.map((r) => r.role))

function coerceBlock(v: any): Block | null {
  if (!v || typeof v !== 'object') return null
  if (!isVec3(v.pos) || !isVec3(v.size) || typeof v.color !== 'string') return null
  return {
    id: typeof v.id === 'string' ? v.id : uid(),
    name: typeof v.name === 'string' ? v.name : 'Block',
    role: ROLE_SET.has(v.role) ? v.role : 'none',
    pos: v.pos,
    size: v.size,
    rot: isVec3(v.rot) ? v.rot : [0, 0, 0],
    color: v.color,
  }
}

export function coerceDesign(v: any): AnimalDesign | null {
  if (!v || typeof v !== 'object' || !Array.isArray(v.blocks)) return null
  const blocks = v.blocks.map(coerceBlock).filter(Boolean) as Block[]
  if (!blocks.length) return null
  const a = v.anim ?? {}
  const anim: AnimParams = {
    idle: { ...DEFAULT_ANIM.idle, ...(a.idle ?? {}) },
    walk: { ...DEFAULT_ANIM.walk, ...(a.walk ?? {}) },
    jump: { ...DEFAULT_ANIM.jump, ...(a.jump ?? {}) },
  }
  return {
    id: typeof v.id === 'string' ? v.id : uid(),
    name: typeof v.name === 'string' ? v.name : 'Imported Animal',
    updated: Date.now(),
    anim,
    blocks,
  }
}
