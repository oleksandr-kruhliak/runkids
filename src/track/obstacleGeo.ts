// Voxel-built obstacle geometry, matching the Cube Kids product style: every
// obstacle is assembled from 100-200 small coloured boxes, merged into shared
// vertex-coloured geometries (one per type) so hundreds of placements still
// cost one draw call each.

import * as THREE from 'three'
import { LANE_WIDTH } from './build'

const rnd = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

interface Part {
  p: [number, number, number]
  s: [number, number, number]
  c: string
  j?: number // colour jitter (default 0.1)
}

/** Merge a part list into one vertex-coloured geometry. */
function geo(parts: Part[]): THREE.BufferGeometry {
  const geos: THREE.BufferGeometry[] = []
  const m = new THREE.Matrix4()
  const col = new THREE.Color()
  parts.forEach((part, i) => {
    const g = new THREE.BoxGeometry(part.s[0], part.s[1], part.s[2])
    m.makeTranslation(part.p[0], part.p[1], part.p[2])
    g.applyMatrix4(m)
    const jit = part.j ?? 0.1
    col.set(part.c).multiplyScalar(1 - jit / 2 + rnd(i * 7.3 + 1) * jit)
    const n = g.attributes.position.count
    const colors = new Float32Array(n * 3)
    for (let k = 0; k < n; k++) {
      colors[k * 3] = col.r
      colors[k * 3 + 1] = col.g
      colors[k * 3 + 2] = col.b
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geos.push(g)
  })
  const merged = mergeGeos(geos)
  geos.forEach((g) => g.dispose())
  return merged
}

/** Minimal non-indexed merge (all BoxGeometries share attribute layout). */
function mergeGeos(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const nonIndexed = list.map((g) => g.toNonIndexed())
  let total = 0
  for (const g of nonIndexed) total += g.attributes.position.count
  const pos = new Float32Array(total * 3)
  const nor = new Float32Array(total * 3)
  const col = new Float32Array(total * 3)
  let o = 0
  for (const g of nonIndexed) {
    pos.set(g.attributes.position.array as Float32Array, o * 3)
    nor.set(g.attributes.normal.array as Float32Array, o * 3)
    col.set(g.attributes.color.array as Float32Array, o * 3)
    o += g.attributes.position.count
    g.dispose()
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  out.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return out
}

const W = LANE_WIDTH - 0.2

// ---- Water: voxel pond with ripples, foam rim, lily pads and reeds --------
function waterParts(): Part[] {
  const parts: Part[] = []
  const u = 0.24
  const rx = 0.92
  const rz = 3.2
  for (let gx = -4; gx <= 4; gx++)
    for (let gz = -14; gz <= 14; gz++) {
      const x = gx * u
      const z = gz * u
      const e = (x * x) / (rx * rx) + (z * z) / (rz * rz)
      if (e <= 1) {
        const ripple = (gx * gx + gz) % 6 === 0
        parts.push({ p: [x, 0.045, z], s: [u, 0.09, u], c: ripple ? '#7fd0f8' : '#3ba7f0', j: 0.12 })
      } else if (e <= 1.45) {
        parts.push({ p: [x, 0.075, z], s: [u, 0.15, u], c: rnd(gx * 9 + gz) > 0.4 ? '#dff2fc' : '#bfe8fb', j: 0.06 })
      }
    }
  // lily pads with a blossom
  for (const [px, pz, flower] of [[-0.35, -1.6, 1], [0.4, 1.2, 0], [0.1, 2.4, 1]] as const) {
    for (let gx = -1; gx <= 1; gx++)
      for (let gz = -1; gz <= 1; gz++) {
        if (gx === 1 && gz === 1) continue // notch
        parts.push({ p: [px + gx * 0.2, 0.12, pz + gz * 0.2], s: [0.2, 0.05, 0.2], c: '#4cae3d', j: 0.12 })
      }
    if (flower) {
      parts.push({ p: [px, 0.2, pz], s: [0.14, 0.12, 0.14], c: '#ff8ab5', j: 0.05 })
      parts.push({ p: [px, 0.28, pz], s: [0.08, 0.06, 0.08], c: '#ffd447', j: 0.05 })
    }
  }
  // reed clusters at the corners
  for (const [cx, cz] of [[-0.85, -2.9], [0.85, -2.6], [-0.8, 2.8], [0.9, 2.5]] as const) {
    for (let i = 0; i < 3; i++) {
      const x = cx + (rnd(i * 3 + cx * 7) - 0.5) * 0.25
      const z = cz + (rnd(i * 5 + cz * 9) - 0.5) * 0.25
      const h = 2 + Math.floor(rnd(i * 7 + cx) * 3)
      for (let y = 0; y < h; y++) parts.push({ p: [x, 0.1 + y * 0.16, z], s: [0.09, 0.16, 0.09], c: '#4c8a3a', j: 0.12 })
      parts.push({ p: [x, 0.1 + h * 0.16, z], s: [0.11, 0.22, 0.11], c: '#8a5a34', j: 0.08 })
    }
  }
  return parts
}

// ---- Mud: brown goo with humps, stones and bubbles ------------------------
function mudParts(): Part[] {
  const parts: Part[] = []
  const u = 0.24
  const rx = 0.92
  const rz = 2.7
  for (let gx = -4; gx <= 4; gx++)
    for (let gz = -12; gz <= 12; gz++) {
      const x = gx * u
      const z = gz * u
      const e = (x * x) / (rx * rx) + (z * z) / (rz * rz)
      if (e <= 1) {
        const dark = rnd(gx * 13 + gz * 7) > 0.6
        parts.push({ p: [x, 0.055, z], s: [u, 0.11, u], c: dark ? '#5a3d22' : '#6d4c2f', j: 0.12 })
      } else if (e <= 1.35) {
        parts.push({ p: [x, 0.04, z], s: [u, 0.08, u], c: '#7d5c3a', j: 0.14 })
      }
    }
  // goo humps + bubbles + half-sunk stones
  for (const [hx, hz, r] of [[-0.3, -1.4, 2], [0.35, 0.3, 2], [-0.2, 1.8, 1]] as const) {
    for (let gx = -r; gx <= r; gx++)
      for (let gz = -r; gz <= r; gz++) {
        if (Math.abs(gx) + Math.abs(gz) > r) continue
        parts.push({ p: [hx + gx * 0.2, 0.16, hz + gz * 0.2], s: [0.2, 0.12, 0.2], c: '#5a3d22', j: 0.1 })
      }
  }
  for (let i = 0; i < 7; i++) {
    parts.push({
      p: [(rnd(i * 11) - 0.5) * 1.4, 0.15, (rnd(i * 13) - 0.5) * 4.6],
      s: [0.11, 0.09, 0.11],
      c: i % 2 ? '#8a6a44' : '#4a3018',
      j: 0.08,
    })
  }
  for (const [sx, sz] of [[0.55, -2.1], [-0.6, 0.9]] as const) {
    parts.push({ p: [sx, 0.12, sz], s: [0.3, 0.18, 0.34], c: '#8f99a6', j: 0.14 })
    parts.push({ p: [sx + 0.2, 0.1, sz + 0.15], s: [0.18, 0.12, 0.2], c: '#7d8894', j: 0.14 })
  }
  return parts
}

// ---- Boost: teal pad with glowing chevrons and edge lights ----------------
function boostParts(): { base: Part[]; glow: Part[] } {
  const base: Part[] = []
  const glow: Part[] = []
  const u = 0.26
  const halfX = 3
  const halfZ = 12
  for (let gx = -halfX; gx <= halfX; gx++)
    for (let gz = -halfZ; gz <= halfZ; gz++) {
      const edge = Math.abs(gx) === halfX || Math.abs(gz) === halfZ
      base.push({
        p: [gx * u, edge ? 0.07 : 0.05, gz * u],
        s: [u, edge ? 0.14 : 0.1, u],
        c: edge ? '#0a4f46' : (gx + gz) % 2 === 0 ? '#0e7c6b' : '#0b6a5c',
        j: 0.08,
      })
    }
  // three chevron arrows pointing down-track (+z)
  for (const zc of [-6, 0, 6]) {
    for (let k = 0; k < 3; k++) {
      for (const sx of [-1, 1]) {
        glow.push({ p: [sx * (2 - k) * u, 0.13, (zc + k * 2 - 2) * u], s: [u, 0.08, u], c: '#fff6a8', j: 0.03 })
        glow.push({ p: [sx * (2 - k) * u, 0.13, (zc + k * 2 - 1) * u], s: [u, 0.08, u], c: '#ffe36b', j: 0.03 })
      }
    }
    glow.push({ p: [0, 0.13, (zc + 4) * u], s: [u, 0.08, u], c: '#ffffff', j: 0.02 })
    glow.push({ p: [0, 0.13, (zc + 3) * u], s: [u, 0.08, u], c: '#fff6a8', j: 0.02 })
  }
  // edge marker lights
  for (let gz = -halfZ; gz <= halfZ; gz += 3) {
    glow.push({ p: [-halfX * u, 0.17, gz * u], s: [0.12, 0.1, 0.12], c: '#ffd21a', j: 0.03 })
    glow.push({ p: [halfX * u, 0.17, gz * u], s: [0.12, 0.1, 0.12], c: '#ffd21a', j: 0.03 })
  }
  return { base, glow }
}

// ---- Gap: stepped launch ramp + striped landing pad -----------------------
function gapParts(): Part[] {
  const parts: Part[] = []
  const u = 0.24
  const steps = 7
  // kicker at the zone start (animal launches forward over the gap)
  for (let s = 0; s < steps; s++) {
    const z = -2.9 + s * u
    for (let gx = -3; gx <= 3; gx++)
      for (let y = 0; y <= s; y++) {
        if (y < s - 1) continue // hollow under the slope
        const face = y === s
        parts.push({
          p: [gx * u, 0.06 + y * 0.13, z],
          s: [u, 0.13, u],
          c: face ? ((gx + s) % 2 === 0 ? '#f2b53c' : '#e8933a') : '#9c6b3f',
          j: 0.1,
        })
      }
  }
  // side rails on the kicker
  for (let s = 0; s < steps; s++) {
    for (const sx of [-3.6, 3.6]) {
      parts.push({ p: [sx * u * 0.95, 0.14 + s * 0.13, -2.9 + s * u], s: [0.14, 0.2, u], c: '#e53935', j: 0.08 })
    }
  }
  // landing pad with white arrows at the zone end
  for (let gx = -3; gx <= 3; gx++)
    for (let gz = 0; gz < 5; gz++) {
      const stripe = (gx + gz) % 3 === 0
      parts.push({ p: [gx * u, 0.05, 2.0 + gz * u], s: [u, 0.1, u], c: stripe ? '#eceff1' : '#607d8b', j: 0.08 })
    }
  // little flags on posts either side of the landing
  for (const sx of [-1, 1]) {
    for (let y = 0; y < 4; y++) parts.push({ p: [sx * 0.95, 0.15 + y * 0.2, 2.1], s: [0.1, 0.2, 0.1], c: '#9c6b3f', j: 0.08 })
    parts.push({ p: [sx * 0.8, 0.95, 2.1], s: [0.24, 0.18, 0.06], c: sx < 0 ? '#e53935' : '#42a5f5', j: 0.05 })
  }
  return parts
}

// ---- Trampoline: octagon frame, checker mat, springs and legs -------------
function trampolineParts(): { base: Part[]; glow: Part[] } {
  const base: Part[] = []
  const glow: Part[] = []
  const u = 0.24
  const R = 4
  for (let gx = -R; gx <= R; gx++)
    for (let gz = -R; gz <= R; gz++) {
      const d = Math.max(Math.abs(gx), Math.abs(gz)) + Math.min(Math.abs(gx), Math.abs(gz)) * 0.45
      if (d > R + 0.3) continue
      if (d > R - 0.9) {
        // frame ring, two layers
        base.push({ p: [gx * u, 0.5, gz * u], s: [u, 0.18, u], c: '#37474f', j: 0.08 })
        base.push({ p: [gx * u, 0.62, gz * u], s: [u, 0.1, u], c: '#455a64', j: 0.08 })
      } else {
        // bouncy checker mat
        glow.push({ p: [gx * u, 0.56, gz * u], s: [u, 0.07, u], c: (gx + gz) % 2 === 0 ? '#26c6da' : '#0e9cb0', j: 0.05 })
      }
    }
  // chunky legs + springs
  for (const [lx, lz] of [[-0.62, -0.62], [0.62, -0.62], [-0.62, 0.62], [0.62, 0.62]] as const) {
    for (let y = 0; y < 3; y++) base.push({ p: [lx, 0.08 + y * 0.16, lz], s: [0.2, 0.16, 0.2], c: '#546e7a', j: 0.08 })
    for (let y = 0; y < 3; y++) {
      base.push({ p: [lx * 1.28, 0.34 + y * 0.09, lz * 1.28], s: [0.12, 0.09, 0.12], c: y % 2 ? '#f2b53c' : '#90a4ae', j: 0.06 })
    }
  }
  // corner reflectors on the frame
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    glow.push({ p: [Math.cos(a) * 0.93, 0.7, Math.sin(a) * 0.93], s: [0.1, 0.08, 0.1], c: '#ffe36b', j: 0.03 })
  }
  return { base, glow }
}

// ---- Stopper: striped toll-gate towers + rising bar -----------------------
function stopperPostParts(): Part[] {
  const parts: Part[] = []
  const u = 0.22
  for (const sx of [-1, 1]) {
    const x0 = sx * (LANE_WIDTH / 2 + 0.05)
    // hazard-striped base plate
    for (let gx = -1; gx <= 1; gx++)
      for (let gz = -1; gz <= 1; gz++)
        parts.push({ p: [x0 + gx * u, 0.06, gz * u], s: [u, 0.12, u], c: (gx + gz) % 2 ? '#ffd21a' : '#2a2a32', j: 0.05 })
    // striped tower, 2x2 wide
    for (let y = 0; y < 11; y++) {
      const band = Math.floor(y / 2) % 2 === 0
      for (const [dx, dz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]] as const) {
        parts.push({ p: [x0 + dx * u, 0.18 + y * u, dz * u], s: [u, u, u], c: band ? '#e53935' : '#f6f6f2', j: 0.06 })
      }
    }
    // cap lamp
    parts.push({ p: [x0, 0.18 + 11 * u, 0], s: [u * 2.4, 0.14, u * 2.4], c: '#37474f', j: 0.05 })
    parts.push({ p: [x0, 0.34 + 11 * u, 0], s: [0.16, 0.16, 0.16], c: '#ffe36b', j: 0.03 })
  }
  return parts
}

function stopperBarParts(): Part[] {
  const parts: Part[] = []
  const u = 0.22
  const n = Math.round(LANE_WIDTH / u)
  for (let i = 0; i <= n; i++) {
    const band = Math.floor(i / 2) % 2 === 0
    const x = -LANE_WIDTH / 2 + i * u
    parts.push({ p: [x, 0, 0], s: [u, 0.26, 0.2], c: band ? '#e53935' : '#f6f6f2', j: 0.05 })
    if (i % 3 === 1) parts.push({ p: [x, -0.2, 0.02], s: [u * 0.8, 0.14, 0.14], c: '#e53935', j: 0.05 })
  }
  // hanging stop sign in the middle
  for (let gx = -1; gx <= 1; gx++)
    for (let gy = -1; gy <= 1; gy++)
      parts.push({
        p: [gx * 0.16, -0.42 + gy * 0.16, 0.02],
        s: [0.16, 0.16, 0.1],
        c: Math.abs(gx) + Math.abs(gy) === 2 ? '#b71c1c' : '#e53935',
        j: 0.05,
      })
  parts.push({ p: [0, -0.42, 0.08], s: [0.3, 0.08, 0.04], c: '#ffffff', j: 0.02 })
  return parts
}

// ---- Spinner: stone tower + voxel mallet on both ends of the arm ----------
function spinnerTowerParts(): Part[] {
  const parts: Part[] = []
  const u = 0.16
  const x0 = LANE_WIDTH / 2 + 0.05
  for (let gx = -1; gx <= 1; gx++)
    for (let gz = -1; gz <= 1; gz++)
      for (let gy = 0; gy < 2; gy++)
        parts.push({ p: [x0 + gx * u, 0.08 + gy * u, gz * u], s: [u, u, u], c: '#7d8894', j: 0.14 })
  for (let gy = 0; gy < 3; gy++)
    for (const [dx, dz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]] as const)
      parts.push({ p: [x0 + dx * u, 0.4 + gy * u, dz * u], s: [u, u, u], c: '#546e7a', j: 0.1 })
  parts.push({ p: [x0, 0.4 + 3 * u, 0], s: [u * 2.6, 0.1, u * 2.6], c: '#37474f', j: 0.06 })
  return parts
}

function spinnerArmParts(): Part[] {
  const parts: Part[] = []
  const u = 0.15
  const armLen = LANE_WIDTH / 2
  // two-tone wooden beam
  const n = Math.round((armLen * 2) / u)
  for (let i = 0; i <= n; i++) {
    const x = -armLen + i * u
    parts.push({ p: [x, 0, 0], s: [u, 0.15, 0.15], c: i % 2 ? '#9c6b3f' : '#8a5a34', j: 0.1 })
  }
  // voxel mallet heads with rivets and a bright band
  for (const ex of [-armLen, armLen]) {
    for (let gx = -1; gx <= 1; gx++)
      for (let gy = -1; gy <= 2; gy++)
        for (let gz = -3; gz <= 3; gz++) {
          const band = gz === 0
          parts.push({
            p: [ex + gx * u, gy * u - 0.05, gz * u],
            s: [u, u, u],
            c: band ? '#90a4ae' : '#546e7a',
            j: 0.1,
          })
        }
    // rivets on the outer faces
    for (const gz of [-3, 3])
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 2], [1, 2]] as const)
        parts.push({ p: [ex + dx * u, dy * u - 0.05, gz * u * 1.06], s: [0.07, 0.07, 0.05], c: '#eceff1', j: 0.04 })
  }
  return parts
}

// ---- Crates: plank-built boxes with frames --------------------------------
function crateParts(cx: number, cy: number, cz: number, size: number, tone: number): Part[] {
  const parts: Part[] = []
  const n = 4
  const u = size / n
  for (let gx = 0; gx < n; gx++)
    for (let gy = 0; gy < n; gy++)
      for (let gz = 0; gz < n; gz++) {
        const edgeCount =
          (gx === 0 || gx === n - 1 ? 1 : 0) + (gy === 0 || gy === n - 1 ? 1 : 0) + (gz === 0 || gz === n - 1 ? 1 : 0)
        if (edgeCount === 0) continue // hollow
        const frame = edgeCount >= 2
        const plank = gy % 2 === 0
        parts.push({
          p: [cx + (gx - (n - 1) / 2) * u, cy + (gy - (n - 1) / 2) * u, cz + (gz - (n - 1) / 2) * u],
          s: [u, u, u],
          c: frame ? '#7a4e26' : plank ? (tone ? '#c98a4a' : '#b5793b') : tone ? '#b5793b' : '#a86c33',
          j: 0.1,
        })
      }
  return parts
}

function crateStackParts(): Part[] {
  return [
    ...crateParts(-0.5, 0.35, 0, 0.66, 0),
    ...crateParts(0.5, 0.35, 0.05, 0.66, 1),
    ...crateParts(0.02, 0.35, 0.55, 0.66, 0),
    ...crateParts(0.05, 1.03, 0.18, 0.62, 1),
  ]
}

function fragmentParts(): Part[] {
  // one broken plank piece (re-used for every fragment)
  return [
    { p: [0, 0, 0], s: [0.3, 0.08, 0.14], c: '#c98a4a', j: 0.1 },
    { p: [0.06, 0.07, 0], s: [0.16, 0.07, 0.12], c: '#9c5f2c', j: 0.1 },
    { p: [-0.08, -0.06, 0.02], s: [0.12, 0.06, 0.1], c: '#7a4e26', j: 0.1 },
  ]
}

// ---- Shared geometries + materials (built once at module load) ------------
export const OBSTACLE_GEO = {
  water: geo(waterParts()),
  mud: geo(mudParts()),
  boostBase: geo(boostParts().base),
  boostGlow: geo(boostParts().glow),
  gap: geo(gapParts()),
  trampolineBase: geo(trampolineParts().base),
  trampolineGlow: geo(trampolineParts().glow),
  stopperPosts: geo(stopperPostParts()),
  stopperBar: geo(stopperBarParts()),
  spinnerTower: geo(spinnerTowerParts()),
  spinnerArm: geo(spinnerArmParts()),
  crateStack: geo(crateStackParts()),
  crateFragment: geo(fragmentParts()),
}

export const OBSTACLE_MAT = new THREE.MeshStandardMaterial({
  vertexColors: true,
  flatShading: true,
  roughness: 0.85,
})

export const OBSTACLE_GLOW_MAT = new THREE.MeshStandardMaterial({
  vertexColors: true,
  flatShading: true,
  roughness: 0.5,
  emissive: new THREE.Color('#5c4a08'),
  emissiveIntensity: 0.7,
})

export const OBSTACLE_W = W
