// Voxel construction kit for the Cube Kids worlds: structures are assembled
// from many small unit cubes (like the channel art), collected into one flat
// buffer and drawn as a single instanced mesh — thousands of blocks for one
// draw call.

import * as THREE from 'three'

/** World size of one voxel cube. */
export const VOX = 0.55

export interface VoxelBag {
  pos: number[] // xyz triples (world units)
  col: number[] // rgb triples
  key: number // bump to invalidate the rendered instancing
}

export const newBag = (): VoxelBag => ({ pos: [], col: [], key: 0 })

const rnd = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

const tmp = new THREE.Color()

/** Add one cube at grid coords (gx up in cubes) with per-cube colour jitter. */
function put(
  bag: VoxelBag,
  ox: number,
  oz: number,
  gx: number,
  gy: number,
  gz: number,
  hex: string,
  seed: number,
  jitter = 0.14,
) {
  tmp.set(hex).multiplyScalar(1 - jitter / 2 + rnd(seed + gx * 3.1 + gy * 7.7 + gz * 13.3) * jitter)
  bag.pos.push(ox + gx * VOX, gy * VOX + VOX / 2, oz + gz * VOX)
  bag.col.push(tmp.r, tmp.g, tmp.b)
}

// ---- Nature ---------------------------------------------------------------

/** Oak-style tree: cube trunk + blobby ellipsoid canopy of many leaf cubes. */
export function vTree(bag: VoxelBag, ox: number, oz: number, seed: number, leaf: string, big = false) {
  const trunkH = big ? 5 + Math.floor(rnd(seed) * 3) : 3 + Math.floor(rnd(seed) * 2)
  const r = big ? 3 : 2 + Math.floor(rnd(seed + 1) * 2) // canopy radius in cubes
  const ry = Math.max(2, Math.round(r * 0.8))
  for (let y = 0; y < trunkH; y++) put(bag, ox, oz, 0, y, 0, '#7a5236', seed + y, 0.1)
  const cy = trunkH + ry - 1
  for (let dx = -r; dx <= r; dx++)
    for (let dy = -ry; dy <= ry; dy++)
      for (let dz = -r; dz <= r; dz++) {
        const d = (dx * dx) / (r * r) + (dy * dy) / (ry * ry) + (dz * dz) / (r * r)
        if (d <= 1 + (rnd(seed + dx * 5 + dy * 11 + dz * 17) - 0.5) * 0.45) {
          if (rnd(seed + dx * 23 + dy * 29 + dz * 31) < 0.08) continue // holes
          put(bag, ox, oz, dx, cy + dy, dz, leaf, seed + dx + dy + dz)
        }
      }
}

/** Tall column tree (two stacked canopy blobs) for backdrop forests. */
export function vTallTree(bag: VoxelBag, ox: number, oz: number, seed: number, leaf: string) {
  const trunkH = 7 + Math.floor(rnd(seed) * 3)
  for (let y = 0; y < trunkH; y++) put(bag, ox, oz, 0, y, 0, '#7a5236', seed + y, 0.1)
  for (let blob = 0; blob < 2; blob++) {
    const r = blob === 0 ? 3 : 2
    const cy = trunkH - 1 + blob * 3
    for (let dx = -r; dx <= r; dx++)
      for (let dy = -2; dy <= 2; dy++)
        for (let dz = -r; dz <= r; dz++) {
          const d = (dx * dx) / (r * r) + (dy * dy) / 4 + (dz * dz) / (r * r)
          if (d <= 1 + (rnd(seed + blob + dx * 5 + dy * 11 + dz * 17) - 0.5) * 0.4) {
            put(bag, ox, oz, dx, cy + dy, dz, leaf, seed + blob * 50 + dx + dy + dz)
          }
        }
  }
}

/** Savanna acacia: leaning trunk and a wide, flat two-layer canopy disc. */
export function vAcacia(bag: VoxelBag, ox: number, oz: number, seed: number, leaf: string) {
  const h = 5 + Math.floor(rnd(seed) * 3)
  const leanX = rnd(seed + 1) > 0.5 ? 1 : -1
  let lx = 0
  for (let y = 0; y < h; y++) {
    if (y > 1 && rnd(seed + y * 3) > 0.6) lx += leanX
    put(bag, ox, oz, lx, y, 0, '#6e4a2a', seed + y, 0.1)
    if (y === Math.floor(h / 2)) put(bag, ox, oz, lx - leanX, y, 0, '#6e4a2a', seed + y + 20, 0.1)
  }
  const r = 3 + Math.floor(rnd(seed + 2) * 2)
  for (let dx = -r; dx <= r; dx++)
    for (let dz = -r; dz <= r; dz++) {
      const d = Math.sqrt(dx * dx + dz * dz)
      if (d <= r + (rnd(seed + dx * 7 + dz * 13) - 0.5)) {
        put(bag, ox, oz, lx + dx, h, dz, leaf, seed + dx + dz)
        if (d <= r * 0.55) put(bag, ox, oz, lx + dx, h + 1, dz, leaf, seed + dx + dz + 99)
      }
    }
}

/** Conifer of stacked shrinking square layers, optionally snow-dusted. */
export function vPine(bag: VoxelBag, ox: number, oz: number, seed: number, leaf: string, snow: boolean) {
  put(bag, ox, oz, 0, 0, 0, '#6e4a2a', seed, 0.1)
  const layers = [3, 3, 2, 2, 1, 1]
  layers.forEach((r, i) => {
    const y = 1 + i
    for (let dx = -r; dx <= r; dx++)
      for (let dz = -r; dz <= r; dz++) {
        if (Math.abs(dx) + Math.abs(dz) > r + 1) continue
        const edge = Math.abs(dx) === r || Math.abs(dz) === r || Math.abs(dx) + Math.abs(dz) === r + 1
        const dusted = snow && edge && rnd(seed + dx * 7 + y * 11 + dz * 13) > 0.45
        put(bag, ox, oz, dx, y, dz, dusted ? '#f2f8fc' : leaf, seed + dx + y + dz)
      }
  })
  if (snow) put(bag, ox, oz, 0, 1 + layers.length, 0, '#ffffff', seed + 500, 0.05)
  else put(bag, ox, oz, 0, 1 + layers.length, 0, leaf, seed + 500)
}

/** Jagged block mountain with a snow cap; hundreds of cubes. */
export function vMountain(bag: VoxelBag, ox: number, oz: number, seed: number, big = false) {
  const r0 = big ? 7 + Math.floor(rnd(seed) * 3) : 5 + Math.floor(rnd(seed) * 2)
  const h = Math.round(r0 * (1.6 + rnd(seed + 1) * 0.5))
  for (let dx = -r0; dx <= r0; dx++)
    for (let dz = -r0; dz <= r0; dz++) {
      const d = Math.sqrt(dx * dx + dz * dz) / r0
      if (d > 1) continue
      const colH = Math.max(1, Math.round(h * (1 - d) * (0.7 + rnd(seed + dx * 5 + dz * 7) * 0.55)))
      for (let y = 0; y < colH; y++) {
        const snowLine = y > h * 0.45 + rnd(seed + dx + dz) * 2
        // Skip buried interior cubes to keep the buffer lean.
        if (y < colH - 3 && Math.abs(dx) < r0 - 1 && Math.abs(dz) < r0 - 1 && y > 0) continue
        put(bag, ox, oz, dx, y, dz, snowLine ? '#eef5fa' : '#93a8bd', seed + dx * 3 + y * 5 + dz * 7, 0.12)
      }
    }
}

/** Grass/sand-topped terraced cliff, optionally spilling a waterfall+river. */
export function vPlateau(
  bag: VoxelBag,
  ox: number,
  oz: number,
  seed: number,
  top: string,
  waterfall: boolean,
  awayX: number,
  awayZ: number,
) {
  const w = 3 + Math.floor(rnd(seed) * 3)
  const d = 3 + Math.floor(rnd(seed + 1) * 3)
  const h = 2 + Math.floor(rnd(seed + 2) * 2)
  for (let dx = -w; dx <= w; dx++)
    for (let dz = -d; dz <= d; dz++) {
      const colH = h + (rnd(seed + dx * 3 + dz * 5) > 0.75 ? 1 : 0)
      for (let y = 0; y < colH; y++) {
        if (y < colH - 1 && Math.abs(dx) < w && Math.abs(dz) < d) continue // hollow interior
        put(bag, ox, oz, dx, y, dz, y === colH - 1 ? top : '#8a5d3b', seed + dx + y + dz, 0.12)
      }
    }
  if (!waterfall) return
  // Waterfall down the face pointing away from the track, then a winding river.
  const ax = Math.abs(awayX) > Math.abs(awayZ) ? Math.sign(awayX) : 0
  const az = ax === 0 ? Math.sign(awayZ) || 1 : 0
  const ex = ax !== 0 ? ax * w : 0
  const ez = az !== 0 ? az * d : 0
  for (const side of [0, 1]) {
    const sx = ax === 0 ? side : 0
    const sz = az === 0 ? side : 0
    for (let y = 0; y <= h; y++) put(bag, ox, oz, ex + ax + sx, y, ez + az + sz, '#4db4f5', seed + y + side * 40, 0.18)
    put(bag, ox, oz, ex + ax + sx, 0, ez + az + sz, '#dff2fc', seed + side * 60, 0.05) // foam
  }
  let rx = ex + ax * 2
  let rz = ez + az * 2
  const len = 6 + Math.floor(rnd(seed + 3) * 8)
  for (let i = 0; i < len; i++) {
    for (const side of [0, 1]) {
      const sx = ax === 0 ? side : 0
      const sz = az === 0 ? side : 0
      put(bag, ox, oz, rx + sx, 0, rz + sz, i === 0 ? '#bfe8fb' : '#3ba7f0', seed + i * 7 + side, 0.16)
    }
    rx += ax + (ax === 0 ? Math.round(rnd(seed + i * 11) * 2 - 1) : 0)
    rz += az + (az === 0 ? Math.round(rnd(seed + i * 13) * 2 - 1) : 0)
  }
}

/** Round leaf-cube bush. */
export function vBush(bag: VoxelBag, ox: number, oz: number, seed: number, leaf: string) {
  const r = 1 + Math.floor(rnd(seed) * 2)
  for (let dx = -r; dx <= r; dx++)
    for (let dy = 0; dy <= r; dy++)
      for (let dz = -r; dz <= r; dz++) {
        if (dx * dx + (dy - 0.3) * (dy - 0.3) * 2 + dz * dz <= r * r + rnd(seed + dx + dy + dz) * 0.8) {
          put(bag, ox, oz, dx, dy, dz, leaf, seed + dx * 3 + dy * 5 + dz * 7)
        }
      }
}

const FLOWER_HEADS = ['#ff5e5e', '#ffd447', '#ff8ab5', '#b07ce8', '#ffffff']

/** A little cluster of cube flowers: green stem, coloured head. */
export function vFlowers(bag: VoxelBag, ox: number, oz: number, seed: number) {
  const n = 2 + Math.floor(rnd(seed) * 3)
  for (let i = 0; i < n; i++) {
    const dx = Math.round((rnd(seed + i * 3) - 0.5) * 4)
    const dz = Math.round((rnd(seed + i * 5) - 0.5) * 4)
    put(bag, ox, oz, dx, 0, dz, '#3c9a34', seed + i)
    put(bag, ox, oz, dx, 1, dz, FLOWER_HEADS[Math.floor(rnd(seed + i * 7) * FLOWER_HEADS.length)], seed + i * 11, 0.06)
  }
}

/** Rock pile of grey cubes. */
export function vRocks(bag: VoxelBag, ox: number, oz: number, seed: number, icy = false) {
  const n = 3 + Math.floor(rnd(seed) * 4)
  for (let i = 0; i < n; i++) {
    const dx = Math.round((rnd(seed + i * 3) - 0.5) * 3)
    const dz = Math.round((rnd(seed + i * 5) - 0.5) * 3)
    const hy = rnd(seed + i * 7) > 0.6 ? 1 : 0
    put(bag, ox, oz, dx, hy, dz, icy ? '#c8e2f2' : '#8f99a6', seed + i * 13, 0.16)
  }
}

/** Ice floe: pale platform with a blue water rim. */
export function vFloe(bag: VoxelBag, ox: number, oz: number, seed: number) {
  const r = 2 + Math.floor(rnd(seed) * 2)
  for (let dx = -r - 1; dx <= r + 1; dx++)
    for (let dz = -r - 1; dz <= r + 1; dz++) {
      const d = Math.sqrt(dx * dx + dz * dz)
      if (d <= r) put(bag, ox, oz, dx, 0, dz, '#eaf5fb', seed + dx + dz, 0.06)
      else if (d <= r + 1.4) put(bag, ox, oz, dx, 0, dz, '#4db4f5', seed + dx * 3 + dz * 5, 0.15)
    }
  if (rnd(seed + 9) > 0.5) put(bag, ox, oz, 0, 1, 0, '#ffffff', seed + 10, 0.04)
}

/** Snow drift mound. */
export function vDrift(bag: VoxelBag, ox: number, oz: number, seed: number) {
  const r = 1 + Math.floor(rnd(seed) * 2)
  for (let dx = -r; dx <= r; dx++)
    for (let dz = -r; dz <= r; dz++) {
      if (dx * dx + dz * dz <= r * r + 0.5) {
        put(bag, ox, oz, dx, 0, dz, '#f6fafc', seed + dx + dz, 0.05)
        if (dx === 0 && dz === 0 && r > 1) put(bag, ox, oz, 0, 1, 0, '#ffffff', seed + 30, 0.04)
      }
    }
}

const WALL_COLORS = ['#f0605a', '#4aa3f0', '#59c94f', '#f2b53c', '#9b6cf0', '#f078c2', '#3ecfc0', '#f28c3c']

/** Voxel city building: full block grid with window cubes on every face. */
export function vBuilding(bag: VoxelBag, ox: number, oz: number, seed: number, big = false) {
  const wall = WALL_COLORS[Math.floor(rnd(seed) * WALL_COLORS.length)]
  const roof = `#${tmp.set(wall).multiplyScalar(0.62).getHexString()}`
  const fw = 2 + Math.floor(rnd(seed + 1) * 2) // half-width
  const fd = 2 + Math.floor(rnd(seed + 2) * 2)
  const h = (big ? 9 : 5) + Math.floor(rnd(seed + 3) * (big ? 7 : 5))
  for (let dx = -fw; dx <= fw; dx++)
    for (let dz = -fd; dz <= fd; dz++)
      for (let y = 0; y < h; y++) {
        const shellX = Math.abs(dx) === fw
        const shellZ = Math.abs(dz) === fd
        if (!shellX && !shellZ && y > 0 && y < h - 1) continue // hollow interior
        let c = wall
        // Window pattern on the outer shell: every other column and row.
        const wx = shellZ && Math.abs(dx) < fw && Math.abs(dx) % 2 === 1
        const wz = shellX && Math.abs(dz) < fd && Math.abs(dz) % 2 === 1
        if ((wx || wz) && y % 2 === 1 && y < h - 1) c = '#cfeafd'
        if (y === h - 1) c = roof
        put(bag, ox, oz, dx, y, dz, c, seed + dx * 3 + y * 5 + dz * 7, c === '#cfeafd' ? 0.04 : 0.1)
      }
  // door
  put(bag, ox, oz, 0, 0, fd + 0.001, '#5a4632', seed + 900, 0.05)
  put(bag, ox, oz, 0, 1, fd + 0.001, '#5a4632', seed + 901, 0.05)
}

/** Street lamp: pole + glowing head. */
export function vLamp(bag: VoxelBag, ox: number, oz: number, seed: number) {
  for (let y = 0; y < 4; y++) put(bag, ox, oz, 0, y, 0, '#5a6672', seed + y, 0.06)
  put(bag, ox, oz, 0, 4, 0, '#ffe9a0', seed + 10, 0.03)
}
