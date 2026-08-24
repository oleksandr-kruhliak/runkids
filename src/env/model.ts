// Data model for the Environment Studio: a named set of scene parameters
// (sky gradient, ground/grass colours, light, clouds, falling particles)
// that skins the race world — winter, autumn, spring, summer, or anything.

export type ParticleKind = 'none' | 'snow' | 'leaves' | 'petals' | 'rain'
export type SceneryExtra = 'none' | 'snowman' | 'pumpkin' | 'flowers'

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
  /** Primitive-built props scattered around the field. */
  scenery: {
    /** 0–100 amount of trees/rocks/bushes. */
    density: number
    /** Tree/bush foliage colour. */
    tree: string
    /** Season special: snowmen, pumpkins, flower patches. */
    extra: SceneryExtra
  }
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
}

export const SUMMER: EnvParams = {
  sky: { zenith: '#3f9ef2', mid: '#a8d8fb', horizon: '#e6f4fe' },
  clouds: 14,
  sun: 1.5,
  ground: '#7ed957',
  grass: '#83e05a',
  particles: 'none',
  particleDensity: 0,
  scenery: { density: 45, tree: '#3fa14f', extra: 'none' },
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
      scenery: { density: 50, tree: '#7fa696', extra: 'snowman' },
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
      scenery: { density: 55, tree: '#d1731f', extra: 'pumpkin' },
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
      scenery: { density: 50, tree: '#63c96a', extra: 'flowers' },
    },
  },
]

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

export function cloneParams(p: EnvParams): EnvParams {
  return { ...p, sky: { ...p.sky }, scenery: { ...p.scenery } }
}

export function newEnvDesign(params: EnvParams = SUMMER, name = 'My Environment'): EnvDesign {
  return { id: uid(), name, updated: Date.now(), params: cloneParams(params) }
}

const KINDS: ParticleKind[] = ['none', 'snow', 'leaves', 'petals', 'rain']
const EXTRAS: SceneryExtra[] = ['none', 'snowman', 'pumpkin', 'flowers']
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
    scenery: {
      density: Math.round(num(p.scenery?.density, SUMMER.scenery.density, 0, 100)),
      tree: color(p.scenery?.tree, SUMMER.scenery.tree),
      extra: EXTRAS.includes(p.scenery?.extra) ? p.scenery.extra : 'none',
    },
  }
  return {
    id: typeof v.id === 'string' ? v.id : uid(),
    name: typeof v.name === 'string' ? v.name : 'Imported Environment',
    updated: Date.now(),
    params,
  }
}
