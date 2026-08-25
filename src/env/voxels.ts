// Voxel construction kit for the Cube Kids worlds: structures are assembled
// from many small unit cubes (like the channel art), collected into one flat
// buffer and drawn as a single instanced mesh — thousands of blocks for one
// draw call. High-detail edition: 0.26u cubes put big elements at 1000+ cubes.

import * as THREE from 'three'

/** World size of one voxel cube. */
export const VOX = 0.26

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

/** Add one cube at grid coords (gy up in cubes) with per-cube colour jitter. */
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

/** Shell ellipsoid blob: surface cubes only (interiors skipped for weight). */
function blob(
  bag: VoxelBag,
  ox: number,
  oz: number,
  cx: number,
  cy: number,
  cz: number,
  rx: number,
  ry: number,
  rz: number,
  color: string | ((gx: number, gy: number, gz: number) => string),
  seed: number,
  jitter = 0.14,
) {
  for (let dx = -rx; dx <= rx; dx++)
    for (let dy = -ry; dy <= ry; dy++)
      for (let dz = -rz; dz <= rz; dz++) {
        const d = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) + (dz * dz) / (rz * rz)
        const w = (rnd(seed + dx * 5 + dy * 11 + dz * 17) - 0.5) * 0.35
        if (d <= 1 + w && d >= 0.42) {
          const c = typeof color === 'string' ? color : color(cx + dx, cy + dy, cz + dz)
          put(bag, ox, oz, cx + dx, cy + dy, cz + dz, c, seed + dx + dy + dz, jitter)
        }
      }
}

// ---- Nature ---------------------------------------------------------------

/** Oak-style tree: box trunk + blobby cube canopy (~700-1500 cubes). */
export function vTree(bag: VoxelBag, ox: number, oz: number, seed: number, leaf: string, big = false) {
  const trunkH = big ? 12 + Math.floor(rnd(seed) * 4) : 7 + Math.floor(rnd(seed) * 4)
  const r = big ? 7 + Math.floor(rnd(seed + 1) * 2) : 4 + Math.floor(rnd(seed + 1) * 3)
  const ry = Math.max(3, Math.round(r * 0.85))
  const dark = `#${tmp.set(leaf).multiplyScalar(0.8).getHexString()}`
  const tw = trunkH > 9 ? 1 : 0
  for (let y = 0; y < trunkH; y++)
    for (let dx = -tw; dx <= tw; dx++)
      for (let dz = -tw; dz <= tw; dz++) put(bag, ox, oz, dx, y, dz, '#7a5236', seed + y + dx + dz, 0.1)
  blob(bag, ox, oz, 0, trunkH + ry - 2, 0, r, ry, r, (_gx, gy) => (gy > trunkH + ry ? dark : leaf), seed + 7)
}

/** Tall column tree (two stacked canopy blobs) for backdrop forests. */
export function vTallTree(bag: VoxelBag, ox: number, oz: number, seed: number, leaf: string) {
  const trunkH = 15 + Math.floor(rnd(seed) * 5)
  for (let y = 0; y < trunkH; y++) {
    put(bag, ox, oz, 0, y, 0, '#7a5236', seed + y, 0.1)
    put(bag, ox, oz, 1, y, 0, '#6d4a2f', seed + y + 40, 0.1)
  }
  blob(bag, ox, oz, 0, trunkH - 1, 0, 6, 5, 6, leaf, seed + 9)
  blob(bag, ox, oz, 0, trunkH + 6, 0, 4, 4, 4, `#${tmp.set(leaf).multiplyScalar(0.85).getHexString()}`, seed + 11)
}

/** Savanna acacia: leaning trunk and a wide, flat canopy disc (~900 cubes). */
export function vAcacia(bag: VoxelBag, ox: number, oz: number, seed: number, leaf: string) {
  const h = 11 + Math.floor(rnd(seed) * 5)
  const leanX = rnd(seed + 1) > 0.5 ? 1 : -1
  let lx = 0
  for (let y = 0; y < h; y++) {
    if (y > 3 && rnd(seed + y * 3) > 0.6) lx += leanX
    put(bag, ox, oz, lx, y, 0, '#6e4a2a', seed + y, 0.1)
    put(bag, ox, oz, lx + 1, y, 0, '#61411f', seed + y + 20, 0.1)
    put(bag, ox, oz, lx, y, 1, '#6e4a2a', seed + y + 60, 0.1)
  }
  const r = 7 + Math.floor(rnd(seed + 2) * 3)
  const dark = `#${tmp.set(leaf).multiplyScalar(0.82).getHexString()}`
  for (let dx = -r; dx <= r; dx++)
    for (let dz = -r; dz <= r; dz++) {
      const d = Math.sqrt(dx * dx + dz * dz)
      if (d <= r + (rnd(seed + dx * 7 + dz * 13) - 0.5) * 1.5) {
        put(bag, ox, oz, lx + dx, h, dz, leaf, seed + dx + dz)
        if (d <= r * 0.8) put(bag, ox, oz, lx + dx, h + 1, dz, dark, seed + dx + dz + 99)
        if (d <= r * 0.4) put(bag, ox, oz, lx + dx, h + 2, dz, leaf, seed + dx + dz + 151)
      }
    }
}

/** Conifer of stacked shrinking square layers, optionally snow-dusted (~1100). */
export function vPine(bag: VoxelBag, ox: number, oz: number, seed: number, leaf: string, snow: boolean) {
  for (let y = 0; y < 2; y++)
    for (let dx = 0; dx <= 1; dx++)
      for (let dz = 0; dz <= 1; dz++) put(bag, ox, oz, dx, y, dz, '#6e4a2a', seed + y + dx + dz, 0.1)
  const layers = [7, 6, 6, 5, 5, 4, 4, 3, 3, 2, 2, 1]
  layers.forEach((r, i) => {
    const y = 2 + i
    for (let dx = -r; dx <= r; dx++)
      for (let dz = -r; dz <= r; dz++) {
        if (Math.abs(dx) + Math.abs(dz) > r + 2) continue
        const edge = Math.abs(dx) >= r - 1 || Math.abs(dz) >= r - 1 || Math.abs(dx) + Math.abs(dz) >= r + 1
        const dusted = snow && edge && rnd(seed + dx * 7 + y * 11 + dz * 13) > 0.4
        put(bag, ox, oz, dx, y, dz, dusted ? '#f2f8fc' : leaf, seed + dx + y + dz)
      }
  })
  put(bag, ox, oz, 0, 2 + layers.length, 0, snow ? '#ffffff' : leaf, seed + 500, 0.05)
}

/** Jagged block mountain with a snow cap; thousands of cubes. */
export function vMountain(bag: VoxelBag, ox: number, oz: number, seed: number, big = false) {
  const r0 = big ? 15 + Math.floor(rnd(seed) * 5) : 11 + Math.floor(rnd(seed) * 4)
  const h = Math.round(r0 * (1.5 + rnd(seed + 1) * 0.5))
  for (let dx = -r0; dx <= r0; dx++)
    for (let dz = -r0; dz <= r0; dz++) {
      const d = Math.sqrt(dx * dx + dz * dz) / r0
      if (d > 1) continue
      const colH = Math.max(1, Math.round(h * (1 - d) * (0.7 + rnd(seed + dx * 5 + dz * 7) * 0.55)))
      for (let y = 0; y < colH; y++) {
        // Keep only the outer crust so the buffer stays lean.
        if (y < colH - 3 && Math.abs(dx) < r0 - 2 && Math.abs(dz) < r0 - 2 && y > 0) continue
        const snowLine = y > h * 0.45 + rnd(seed + dx + dz) * 3
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
  const w = 7 + Math.floor(rnd(seed) * 5)
  const d = 7 + Math.floor(rnd(seed + 1) * 5)
  const h = 4 + Math.floor(rnd(seed + 2) * 4)
  for (let dx = -w; dx <= w; dx++)
    for (let dz = -d; dz <= d; dz++) {
      const colH = h + (rnd(seed + dx * 3 + dz * 5) > 0.8 ? 1 : 0)
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
  for (let side = -1; side <= 2; side++) {
    const sx = ax === 0 ? side : 0
    const sz = az === 0 ? side : 0
    for (let y = 0; y <= h; y++)
      put(bag, ox, oz, ex + ax + sx, y, ez + az + sz, y === h ? '#bfe8fb' : '#4db4f5', seed + y + side * 40, 0.18)
    put(bag, ox, oz, ex + ax * 2 + sx, 0, ez + az * 2 + sz, '#dff2fc', seed + side * 60, 0.05) // foam
  }
  let rx = ex + ax * 3
  let rz = ez + az * 3
  const len = 14 + Math.floor(rnd(seed + 3) * 16)
  for (let i = 0; i < len; i++) {
    for (let side = -1; side <= 2; side++) {
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
  const r = 3 + Math.floor(rnd(seed) * 3)
  blob(bag, ox, oz, 0, Math.round(r * 0.4), 0, r, Math.max(2, Math.round(r * 0.7)), r, leaf, seed)
}

const FLOWER_HEADS = ['#ff5e5e', '#ffd447', '#ff8ab5', '#b07ce8', '#ffffff']

/** A little cluster of cube flowers: green stems, petal-cross heads. */
export function vFlowers(bag: VoxelBag, ox: number, oz: number, seed: number) {
  const n = 3 + Math.floor(rnd(seed) * 4)
  for (let i = 0; i < n; i++) {
    const dx = Math.round((rnd(seed + i * 3) - 0.5) * 9)
    const dz = Math.round((rnd(seed + i * 5) - 0.5) * 9)
    const h = 2 + Math.floor(rnd(seed + i * 9) * 2)
    for (let y = 0; y < h; y++) put(bag, ox, oz, dx, y, dz, '#3c9a34', seed + i + y)
    const c = FLOWER_HEADS[Math.floor(rnd(seed + i * 7) * FLOWER_HEADS.length)]
    put(bag, ox, oz, dx, h, dz, '#ffe9a0', seed + i * 11, 0.05) // centre
    put(bag, ox, oz, dx - 1, h, dz, c, seed + i * 13, 0.06)
    put(bag, ox, oz, dx + 1, h, dz, c, seed + i * 17, 0.06)
    put(bag, ox, oz, dx, h, dz - 1, c, seed + i * 19, 0.06)
    put(bag, ox, oz, dx, h, dz + 1, c, seed + i * 23, 0.06)
  }
}

/** Rock pile: a couple of grey shell blobs. */
export function vRocks(bag: VoxelBag, ox: number, oz: number, seed: number, icy = false) {
  const c = icy ? '#c8e2f2' : '#8f99a6'
  const n = 2 + Math.floor(rnd(seed) * 2)
  for (let i = 0; i < n; i++) {
    const r = 2 + Math.floor(rnd(seed + i * 7) * 2)
    blob(bag, ox, oz, Math.round((rnd(seed + i * 3) - 0.5) * 6), Math.round(r * 0.35),
         Math.round((rnd(seed + i * 5) - 0.5) * 6), r, Math.max(1, Math.round(r * 0.7)), r, c, seed + i * 31, 0.16)
  }
}

/** Ice floe: pale platform with a blue water rim. */
export function vFloe(bag: VoxelBag, ox: number, oz: number, seed: number) {
  const r = 5 + Math.floor(rnd(seed) * 4)
  for (let dx = -r - 3; dx <= r + 3; dx++)
    for (let dz = -r - 3; dz <= r + 3; dz++) {
      const d = Math.sqrt(dx * dx + dz * dz)
      if (d <= r) put(bag, ox, oz, dx, 0, dz, '#eaf5fb', seed + dx + dz, 0.06)
      else if (d <= r + 3) put(bag, ox, oz, dx, 0, dz, '#4db4f5', seed + dx * 3 + dz * 5, 0.15)
    }
  if (rnd(seed + 9) > 0.5) blob(bag, ox, oz, 0, 1, 0, 2, 1, 2, '#ffffff', seed + 10, 0.04)
}

/** Snow drift mound. */
export function vDrift(bag: VoxelBag, ox: number, oz: number, seed: number) {
  const r = 3 + Math.floor(rnd(seed) * 3)
  blob(bag, ox, oz, 0, 0, 0, r, Math.max(1, Math.round(r * 0.5)), r, '#f6fafc', seed, 0.05)
}

const WALL_COLORS = ['#f0605a', '#4aa3f0', '#59c94f', '#f2b53c', '#9b6cf0', '#f078c2', '#3ecfc0', '#f28c3c']

/** Voxel city building: block grid with 2x2 window panes on every face. */
export function vBuilding(bag: VoxelBag, ox: number, oz: number, seed: number, big = false) {
  const wall = WALL_COLORS[Math.floor(rnd(seed) * WALL_COLORS.length)]
  const roof = `#${tmp.set(wall).multiplyScalar(0.62).getHexString()}`
  const fw = 4 + Math.floor(rnd(seed + 1) * (big ? 4 : 3)) // half-width
  const fd = 4 + Math.floor(rnd(seed + 2) * 3)
  const h = (big ? 20 : 11) + Math.floor(rnd(seed + 3) * (big ? 12 : 8))
  for (let dx = -fw; dx <= fw; dx++)
    for (let dz = -fd; dz <= fd; dz++)
      for (let y = 0; y < h; y++) {
        const shellX = Math.abs(dx) === fw
        const shellZ = Math.abs(dz) === fd
        if (!shellX && !shellZ && y > 0 && y < h - 1) continue // hollow interior
        let c = wall
        // 2x2 window panes on a 3x4 grid over the outer shell.
        const wy = y % 4 === 1 || y % 4 === 2
        const wx = shellZ && Math.abs(dx) < fw && Math.abs(dx) % 3 !== 0
        const wz = shellX && Math.abs(dz) < fd && Math.abs(dz) % 3 !== 0
        if ((wx || wz) && wy && y < h - 1 && y > 0) c = '#cfeafd'
        if (y === h - 1) c = roof
        put(bag, ox, oz, dx, y, dz, c, seed + dx * 3 + y * 5 + dz * 7, c === '#cfeafd' ? 0.04 : 0.1)
      }
  // door: 2 wide, 3 high on the +z face
  for (let dx = 0; dx <= 1; dx++)
    for (let y = 0; y < 3; y++) put(bag, ox, oz, dx, y, fd + 0.001, '#5a4632', seed + 900 + dx + y, 0.05)
}

/** Street lamp: pole + glowing head. */
export function vLamp(bag: VoxelBag, ox: number, oz: number, seed: number) {
  for (let y = 0; y < 9; y++) put(bag, ox, oz, 0, y, 0, '#5a6672', seed + y, 0.06)
  for (let dx = -1; dx <= 1; dx++)
    for (let dz = -1; dz <= 1; dz++)
      for (let dy = 0; dy <= 1; dy++)
        put(bag, ox, oz, dx, 9 + dy, dz, dx === 0 && dz === 0 ? '#fff2c2' : '#ffe9a0', seed + 10 + dx + dz + dy, 0.03)
}
