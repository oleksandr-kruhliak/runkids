// Voxel geometry for the surprise eggs. An egg is a hollow shell of little
// cubes — same cube-art language as the animals — so it can crack along real
// voxel lines and burst into shards that fall and pile up on the ground.
//
// Everything here is a pure function of (style, seed): the same egg rebuilds
// identically on every render, which keeps the shatter physics stable.

export type EggPattern = 'plain' | 'spots' | 'stripes' | 'chevron'

export interface EggStyle {
  key: string
  label: string
  base: string
  accent: string
  pattern: EggPattern
}

/** Bright, sweet-shop egg palettes — one per egg on the stage. */
export const EGG_STYLES: EggStyle[] = [
  { key: 'mint', label: 'Mint', base: '#7fe0c8', accent: '#ffffff', pattern: 'spots' },
  { key: 'bubblegum', label: 'Bubblegum', base: '#ff9ec7', accent: '#fff3a6', pattern: 'stripes' },
  { key: 'sky', label: 'Sky', base: '#8ec7ff', accent: '#ffffff', pattern: 'chevron' },
  { key: 'sunny', label: 'Sunny', base: '#ffd45e', accent: '#ff8a3d', pattern: 'spots' },
  { key: 'grape', label: 'Grape', base: '#b79bff', accent: '#ffe9c9', pattern: 'stripes' },
  { key: 'lime', label: 'Lime', base: '#b6e86a', accent: '#ffffff', pattern: 'chevron' },
  { key: 'coral', label: 'Coral', base: '#ff8f6e', accent: '#fff0d6', pattern: 'spots' },
  { key: 'ice', label: 'Ice', base: '#e7f2ff', accent: '#8ec7ff', pattern: 'stripes' },
  { key: 'cocoa', label: 'Cocoa', base: '#b57a45', accent: '#ffe9c9', pattern: 'spots' },
  { key: 'candy', label: 'Candy', base: '#ff6f91', accent: '#ffffff', pattern: 'chevron' },
]

// Grid resolution. Odd counts on X/Z so the egg has a true centre column.
export const NX = 9
export const NY = 13
export const NZ = 9
/** Edge length of one shell cube, in world units. */
export const VOX = 0.115
/** Total egg height — the shell sits from y = 0 (in the nest) up to here. */
export const EGG_H = NY * VOX

/** Crack lines per egg, growing down from where the hammer lands. */
const CRACK_LINES = 3
/** Shards the shell breaks into: 6 around, 2 high. */
const SHARD_SECTORS = 6

export interface EggVoxel {
  /** Local position, egg base at y = 0 and centred on x/z. */
  p: [number, number, number]
  /** Normal (uncracked) colour. */
  color: string
  /** Angle around the vertical axis — used for shard grouping and cracks. */
  ang: number
  /** Which shard this cube flies away with. */
  shard: number
  /**
   * How far a crack must travel from the top to reach this cube, 0..1, or
   * Infinity when the cube isn't on a crack line. Compared against the hit
   * progress so cracks creep downward hit by hit.
   */
  crackAt: number
  /**
   * How far the rain has to soak down the shell before this cube takes its
   * colour, 0..1 — roughly its depth from the tip, jittered so the paint line
   * runs ragged instead of level.
   */
  paintAt: number
  /**
   * True for cubes that carry the pattern (the spots, stripes or chevrons)
   * rather than the base colour. The base coat and the pattern go on in two
   * separate passes, so the shell needs to know which is which.
   */
  pattern: boolean
}

export interface EggMesh {
  voxels: EggVoxel[]
  /** Number of shard groups (shard index is always < this). */
  shards: number
}

/**
 * Small deterministic PRNG so an egg looks the same every frame.
 *
 * The seed is hashed and the stream is warmed up before anything reads it:
 * raw mulberry32 starts nearby seeds in almost the same place, which is fine
 * for scattering straw but showed up badly where a handful of draws pick from
 * a short list — the "random" tools came out alternating between two of them.
 */
export function rng(seed: number): () => number {
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

/** Shortest angular distance between two angles. */
function angDist(a: number, b: number): number {
  let d = Math.abs(a - b) % (Math.PI * 2)
  if (d > Math.PI) d = Math.PI * 2 - d
  return d
}

/**
 * Egg profile: radius (0..1) at normalised height v in [-1, 1]. A circle
 * squeezed toward the top, which is what makes it read as an egg rather than
 * a ball — round and heavy at the bottom, tapered at the tip.
 */
function profile(v: number): number {
  return Math.sqrt(Math.max(0, 1 - v * v)) * (1 - 0.2 * v)
}

/**
 * Darken a #rrggbb colour toward black by `amount` (0..1); a negative amount
 * lightens it instead. Channels are clamped, so lightening can't overflow one
 * into the next and produce a colour three.js won't parse.
 */
export function shade(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return hex
  const n = parseInt(m[1], 16)
  const f = 1 - amount
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)))
  const r = ch((n >> 16) & 255)
  const g = ch((n >> 8) & 255)
  const b = ch(n & 255)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

/** The colour of a cracked cube: a dark seam in the shell. */
export function crackColor(style: EggStyle): string {
  return shade(style.base, 0.62)
}

/**
 * Every egg starts blank, and the rain cloud paints it. Off-white rather than
 * pure white so the flat-shaded facets still catch the light and the egg reads
 * as a solid object instead of a silhouette.
 */
export const BLANK = '#f2f4f7'

function patternColor(
  style: EggStyle,
  i: number,
  j: number,
  k: number,
  ang: number,
  spots: { ang: number; j: number }[],
): string {
  const cx = (NX - 1) / 2
  const cz = (NZ - 1) / 2
  switch (style.pattern) {
    case 'stripes':
      return Math.floor(j / 2) % 2 === 1 ? style.accent : style.base
    case 'chevron': {
      if (j < 2 || j > NY - 4) return style.base
      const d = Math.abs(i - cx) + Math.abs(k - cz)
      return (j + d) % 4 < 2 ? style.accent : style.base
    }
    case 'spots': {
      for (const s of spots) {
        if (Math.abs(j - s.j) <= 1 && angDist(ang, s.ang) < 0.5) return style.accent
      }
      return style.base
    }
    default:
      return style.base
  }
}

/**
 * Build one egg's shell. Only the outer layer of cubes is kept, so the egg is
 * hollow: when it bursts you see straight through to the animal inside.
 */
export function buildEgg(style: EggStyle, seed: number): EggMesh {
  const rand = rng(seed)
  const cx = (NX - 1) / 2
  const cz = (NZ - 1) / 2

  // Where the pattern's spots sit, and where the cracks run.
  const spots = Array.from({ length: 6 }, () => ({
    ang: rand() * Math.PI * 2,
    j: 2 + Math.floor(rand() * (NY - 4)),
  }))
  const lineAngles = Array.from(
    { length: CRACK_LINES },
    (_, m) => (m / CRACK_LINES) * Math.PI * 2 + rand() * 0.8,
  )
  const lineWobble = rand() * 6

  const inside = (i: number, j: number, k: number): boolean => {
    if (i < 0 || j < 0 || k < 0 || i >= NX || j >= NY || k >= NZ) return false
    // Sample the profile at the middle of the layer.
    const v = ((j + 0.5) / NY) * 2 - 1
    const r = profile(v) * (NX / 2)
    const dx = i - cx
    const dz = k - cz
    return Math.hypot(dx, dz) <= r - 0.001
  }

  const voxels: EggVoxel[] = []
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) {
      for (let k = 0; k < NZ; k++) {
        if (!inside(i, j, k)) continue
        // Hollow: keep only cubes that touch the outside world.
        const exposed =
          !inside(i + 1, j, k) ||
          !inside(i - 1, j, k) ||
          !inside(i, j + 1, k) ||
          !inside(i, j - 1, k) ||
          !inside(i, j, k + 1) ||
          !inside(i, j, k - 1)
        if (!exposed) continue

        const dx = i - cx
        const dz = k - cz
        const ang = Math.atan2(dz, dx)
        // Depth from the tip of the egg, 0 at the top row.
        const depth = (NY - 1 - j) / (NY - 1)

        // Does a crack line pass through here? Each line wanders a little as
        // it descends so the seam is jagged instead of a ruled stripe.
        let crackAt = Infinity
        for (let m = 0; m < lineAngles.length; m++) {
          const wander = 0.34 * Math.sin(j * 1.7 + m * 2.3 + lineWobble)
          if (angDist(ang, lineAngles[m] + wander) < 0.3) {
            crackAt = Math.min(crackAt, depth)
          }
        }

        const color = patternColor(style, i, j, k, ang, spots)
        voxels.push({
          p: [dx * VOX, (j + 0.5) * VOX, dz * VOX],
          color,
          pattern: color !== style.base,
          ang,
          shard:
            (Math.floor(((ang + Math.PI) / (Math.PI * 2)) * SHARD_SECTORS) % SHARD_SECTORS) +
            (j < NY / 2 ? 0 : SHARD_SECTORS),
          crackAt,
          // The colour soaks down from the tip, a little unevenly.
          paintAt: Math.max(0, Math.min(1, depth * 0.94 + (rand() - 0.5) * 0.1)),
        })
      }
    }
  }

  return { voxels, shards: SHARD_SECTORS * 2 }
}

/** Pick a style for egg `i`, offset by the show's seed so runs differ. */
export function styleFor(i: number, seed: number): EggStyle {
  return EGG_STYLES[(i + seed) % EGG_STYLES.length]
}
