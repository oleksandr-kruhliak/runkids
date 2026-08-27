// Data model for the Environment Studio: a named set of scene parameters
// (sky gradient, ground/grass colours, light, clouds, falling particles)
// that skins the race world — winter, autumn, spring, summer, or anything.

export type ParticleKind = 'none' | 'snow' | 'leaves' | 'petals' | 'rain' | 'embers' | 'sprinkles' | 'storm'
export type SceneryExtra = 'none' | 'snowman' | 'pumpkin' | 'flowers'
/** Which asset family fills the field: the classic low-poly props, or one of
 * the voxel world sets (cube trees, block mountains, city buildings...). */
export type ScenerySet =
  | 'classic'
  | 'forest'
  | 'savanna'
  | 'snowy'
  | 'city'
  | 'volcano'
  | 'candy'
  | 'nightcity'
  | 'beach'
  | 'moon'

export interface EnvParams {
  sky: { zenith: string; mid: string; horizon: string }
  /** Number of drifting clouds (0–20). */
  clouds: number
  /** Directional sunlight intensity (0.4–2.2). */
  sun: number
  ground: string
  grass: string
  particles: ParticleKind
  /** 0–100, how dense the falling particles are. */
  particleDensity: number
  /** Night mode: starfield + moon instead of the sun, dim light. */
  night?: boolean
  /** Jump-height multiplier (moon gravity!). Default 1. */
  jump?: number
  /** Sun elevation in degrees, 8..80 (low = golden hour). Default 55. */
  sunElev?: number
  /** Flocks of flying birds, 0..6. Defaults: 2 by day, 0 at night. */
  birds?: number
  /** Primitive-built props scattered around the field. */
  scenery: {
    /** 0–100 amount of trees/rocks/bushes. */
    density: number
    /** Tree/bush foliage colour. */
    tree: string
    /** Season special: snowmen, pumpkins, flower patches. */
    extra: SceneryExtra
    /** Asset family: classic low-poly or a voxel world set. */
    set: ScenerySet
  }
}

export const SET_META: Record<ScenerySet, { icon: string; label: string }> = {
  classic: { icon: '🎪', label: 'Classic' },
  forest: { icon: '🌳', label: 'Cube Forest' },
  savanna: { icon: '🦒', label: 'Savanna' },
  snowy: { icon: '🏔', label: 'Snowy Peaks' },
  city: { icon: '🏙', label: 'Block City' },
  volcano: { icon: '🌋', label: 'Volcano' },
  candy: { icon: '🍭', label: 'Candy' },
  nightcity: { icon: '🌃', label: 'Night City' },
  beach: { icon: '🏖', label: 'Beach' },
  moon: { icon: '🌙', label: 'Moon' },
}

export const EXTRA_META: Record<SceneryExtra, { icon: string; label: string }> = {
  none: { icon: '·', label: 'None' },
  snowman: { icon: '⛄', label: 'Snowmen' },
  pumpkin: { icon: '🎃', label: 'Pumpkins' },
  flowers: { icon: '🌼', label: 'Flowers' },
}

export interface EnvDesign {
  id: string
  name: string
  updated: number
  params: EnvParams
}

export const PARTICLE_META: Record<ParticleKind, { icon: string; label: string }> = {
  none: { icon: '·', label: 'None' },
  snow: { icon: '❄️', label: 'Snow' },
  leaves: { icon: '🍂', label: 'Leaves' },
  petals: { icon: '🌸', label: 'Petals' },
  rain: { icon: '🌧', label: 'Rain' },
  embers: { icon: '🔥', label: 'Embers' },
  sprinkles: { icon: '🍬', label: 'Sprinkles' },
  storm: { icon: '⛈', label: 'Storm' },
}

export const SUMMER: EnvParams = {
  sky: { zenith: '#3f9ef2', mid: '#a8d8fb', horizon: '#e6f4fe' },
  clouds: 14,
  sun: 1.5,
  ground: '#7ed957',
  grass: '#83e05a',
  particles: 'none',
  particleDensity: 0,
  scenery: { density: 45, tree: '#3fa14f', extra: 'none', set: 'classic' },
}

export const PRESETS: { key: string; icon: string; label: string; params: EnvParams }[] = [
  { key: 'summer', icon: '☀️', label: 'Summer', params: SUMMER },
  {
    key: 'winter',
    icon: '❄️',
    label: 'Winter',
    params: {
      sky: { zenith: '#7db4e0', mid: '#c9e2f2', horizon: '#f2f7fb' },
      clouds: 18,
      sun: 1.05,
      ground: '#eef4f8',
      grass: '#cfdfe8',
      particles: 'snow',
      particleDensity: 65,
      scenery: { density: 50, tree: '#7fa696', extra: 'snowman', set: 'classic' },
    },
  },
  {
    key: 'autumn',
    icon: '🍂',
    label: 'Autumn',
    params: {
      sky: { zenith: '#6b9bd2', mid: '#c9d5e4', horizon: '#f6ead8' },
      clouds: 12,
      sun: 1.2,
      ground: '#c9a24f',
      grass: '#d8a24e',
      particles: 'leaves',
      particleDensity: 55,
      scenery: { density: 55, tree: '#d1731f', extra: 'pumpkin', set: 'classic' },
    },
  },
  {
    key: 'spring',
    icon: '🌸',
    label: 'Spring',
    params: {
      sky: { zenith: '#4aa3f0', mid: '#b5e0fb', horizon: '#effaf1' },
      clouds: 10,
      sun: 1.5,
      ground: '#8fe066',
      grass: '#9ae970',
      particles: 'petals',
      particleDensity: 40,
      scenery: { density: 50, tree: '#63c96a', extra: 'flowers', set: 'classic' },
    },
  },
]

// Voxel worlds, matching the Cube Kids channel art: saturated colours, cube
// trees, blocky terrain and clouds.
export const WORLDS: { key: string; icon: string; label: string; params: EnvParams }[] = [
  {
    key: 'forest',
    icon: '🌳',
    label: 'Green Forest',
    params: {
      sky: { zenith: '#1e90f0', mid: '#7cc4f8', horizon: '#d8f2ff' },
      clouds: 12,
      sun: 1.65,
      birds: 3,
      ground: '#5fd438',
      grass: '#6fe243',
      particles: 'none',
      particleDensity: 0,
      scenery: { density: 70, tree: '#3cb52e', extra: 'flowers', set: 'forest' },
    },
  },
  {
    key: 'savanna',
    icon: '🌅',
    label: 'Savanna Sunset',
    params: {
      sky: { zenith: '#e8933a', mid: '#f7b64f', horizon: '#ffd98a' },
      clouds: 6,
      sun: 1.35,
      sunElev: 14,
      birds: 2,
      ground: '#d9a648',
      grass: '#e0b556',
      particles: 'none',
      particleDensity: 0,
      scenery: { density: 55, tree: '#7ca43c', extra: 'none', set: 'savanna' },
    },
  },
  {
    key: 'snowy',
    icon: '🏔',
    label: 'Snowy Mountains',
    params: {
      sky: { zenith: '#2a8ae8', mid: '#8fd0f6', horizon: '#eaf7ff' },
      clouds: 10,
      sun: 1.35,
      ground: '#f0f6fa',
      grass: '#dcebf3',
      particles: 'snow',
      particleDensity: 55,
      scenery: { density: 55, tree: '#2e7d4f', extra: 'snowman', set: 'snowy' },
    },
  },
  {
    key: 'city',
    icon: '🏙',
    label: 'Fun Block City',
    params: {
      sky: { zenith: '#1e90f0', mid: '#7cc4f8', horizon: '#d8f2ff' },
      clouds: 10,
      sun: 1.55,
      ground: '#9fb3bd',
      grass: '#8fd06c',
      particles: 'none',
      particleDensity: 0,
      scenery: { density: 55, tree: '#49c53d', extra: 'none', set: 'city' },
    },
  },
]

export const WORLDS2: { key: string; icon: string; label: string; params: EnvParams }[] = [
  {
    key: 'volcano',
    icon: '🌋',
    label: 'Volcano',
    params: {
      sky: { zenith: '#2a1216', mid: '#8a2e1e', horizon: '#f2823c' },
      clouds: 5,
      sun: 0.95,
      ground: '#4a3a3c',
      grass: '#5a4448',
      particles: 'embers',
      particleDensity: 45,
      scenery: { density: 55, tree: '#3d2f2f', extra: 'none', set: 'volcano' },
    },
  },
  {
    key: 'candy',
    icon: '🍭',
    label: 'Candy Land',
    params: {
      sky: { zenith: '#f49ac8', mid: '#fbc8e0', horizon: '#fff0f6' },
      clouds: 12,
      sun: 1.6,
      ground: '#9fe8c8',
      grass: '#f078c2',
      particles: 'sprinkles',
      particleDensity: 40,
      scenery: { density: 60, tree: '#ff5e8a', extra: 'none', set: 'candy' },
    },
  },
  {
    key: 'nightcity',
    icon: '🌃',
    label: 'Night City',
    params: {
      sky: { zenith: '#070b1c', mid: '#141d42', horizon: '#2a3566' },
      clouds: 4,
      sun: 0.55,
      ground: '#3a4250',
      grass: '#2f3a46',
      particles: 'none',
      particleDensity: 0,
      night: true,
      scenery: { density: 55, tree: '#1f4a38', extra: 'none', set: 'nightcity' },
    },
  },
  {
    key: 'beach',
    icon: '🏖',
    label: 'Beach Day',
    params: {
      sky: { zenith: '#1e90f0', mid: '#7cc4f8', horizon: '#e0f6ff' },
      clouds: 8,
      sun: 1.75,
      birds: 3,
      ground: '#f2dca2',
      grass: '#e8cf9a',
      particles: 'none',
      particleDensity: 0,
      scenery: { density: 55, tree: '#4cae3d', extra: 'none', set: 'beach' },
    },
  },
  {
    key: 'moon',
    icon: '🌙',
    label: 'Moon Base',
    params: {
      sky: { zenith: '#04060f', mid: '#0a0f24', horizon: '#1a2138' },
      clouds: 0,
      sun: 0.85,
      ground: '#8a8f9a',
      grass: '#7d828e',
      particles: 'none',
      particleDensity: 0,
      night: true,
      jump: 1.8,
      scenery: { density: 50, tree: '#8a8f9a', extra: 'none', set: 'moon' },
    },
  },
]

/** Every pickable preset: seasons plus voxel worlds. */
export const ALL_PRESETS = [...PRESETS, ...WORLDS, ...WORLDS2]

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

export function cloneParams(p: EnvParams): EnvParams {
  return { ...p, sky: { ...p.sky }, scenery: { ...p.scenery } }
}

export function newEnvDesign(params: EnvParams = SUMMER, name = 'My Environment'): EnvDesign {
  return { id: uid(), name, updated: Date.now(), params: cloneParams(params) }
}

const KINDS: ParticleKind[] = ['none', 'snow', 'leaves', 'petals', 'rain', 'embers', 'sprinkles', 'storm']
const EXTRAS: SceneryExtra[] = ['none', 'snowman', 'pumpkin', 'flowers']
const SETS: ScenerySet[] = ['classic', 'forest', 'savanna', 'snowy', 'city', 'volcano', 'candy', 'nightcity', 'beach', 'moon']
const color = (v: unknown, fb: string) =>
  typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : fb
const num = (v: unknown, fb: number, lo: number, hi: number) =>
  typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fb

export function coerceEnv(v: any): EnvDesign | null {
  if (!v || typeof v !== 'object') return null
  const p = v.params ?? v
  if (!p || typeof p !== 'object') return null
  const sky = p.sky ?? {}
  const params: EnvParams = {
    sky: {
      zenith: color(sky.zenith, SUMMER.sky.zenith),
      mid: color(sky.mid, SUMMER.sky.mid),
      horizon: color(sky.horizon, SUMMER.sky.horizon),
    },
    clouds: Math.round(num(p.clouds, SUMMER.clouds, 0, 20)),
    sun: num(p.sun, SUMMER.sun, 0.4, 2.2),
    ground: color(p.ground, SUMMER.ground),
    grass: color(p.grass, SUMMER.grass),
    particles: KINDS.includes(p.particles) ? p.particles : 'none',
    particleDensity: Math.round(num(p.particleDensity, 0, 0, 100)),
    night: p.night === true,
    jump: num(p.jump, 1, 0.5, 2.5),
    sunElev: num(p.sunElev, 55, 8, 80),
    birds: Math.round(num(p.birds, p.night === true ? 0 : 2, 0, 6)),
    scenery: {
      density: Math.round(num(p.scenery?.density, SUMMER.scenery.density, 0, 100)),
      tree: color(p.scenery?.tree, SUMMER.scenery.tree),
      extra: EXTRAS.includes(p.scenery?.extra) ? p.scenery.extra : 'none',
      set: SETS.includes(p.scenery?.set) ? p.scenery.set : 'classic',
    },
  }
  return {
    id: typeof v.id === 'string' ? v.id : uid(),
    name: typeof v.name === 'string' ? v.name : 'Imported Environment',
    updated: Date.now(),
    params,
  }
}
