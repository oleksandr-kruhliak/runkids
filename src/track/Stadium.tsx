import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Track, sampleCenter } from './build'
import { sfx } from '../audio'

// The stadium package: a checkered voxel start gate with countdown lights and
// a banner, grandstands full of cheering cube animals, trackside flags and
// curve chevrons, a balloon arch, and finish fireworks. Static parts render
// as instanced cubes (one draw call); only crowd + fireworks animate.

const rnd = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

interface Box {
  p: [number, number, number]
  s: [number, number, number]
  c: string
  j?: number
}

/** Render a box list as one instanced mesh (static). */
function InstancedBoxes({ boxes, glow }: { boxes: Box[]; glow?: boolean }) {
  const data = useMemo(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const v = new THREE.Vector3()
    const sc = new THREE.Vector3()
    const col = new THREE.Color()
    const mats: THREE.Matrix4[] = []
    const cols: THREE.Color[] = []
    boxes.forEach((b, i) => {
      v.set(b.p[0], b.p[1], b.p[2])
      sc.set(b.s[0], b.s[1], b.s[2])
      m.compose(v, q, sc)
      mats.push(m.clone())
      const jit = b.j ?? 0.08
      col.set(b.c).multiplyScalar(1 - jit / 2 + rnd(i * 3.7 + 1) * jit)
      cols.push(col.clone())
    })
    return { mats, cols }
  }, [boxes])
  if (data.mats.length === 0) return null
  return (
    <instancedMesh
      key={data.mats.length}
      args={[undefined, undefined, data.mats.length]}
      castShadow={!glow}
      ref={(inst) => {
        if (!inst) return
        for (let i = 0; i < data.mats.length; i++) {
          inst.setMatrixAt(i, data.mats[i])
          inst.setColorAt(i, data.cols[i])
        }
        inst.instanceMatrix.needsUpdate = true
        if (inst.instanceColor) inst.instanceColor.needsUpdate = true
      }}
    >
      <boxGeometry args={[1, 1, 1]} />
      {glow ? (
        <meshBasicMaterial fog={false} />
      ) : (
        <meshStandardMaterial roughness={0.85} flatShading />
      )}
    </instancedMesh>
  )
}

// ---- Start gate -----------------------------------------------------------

function bannerTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 160
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#e53935'
  ctx.fillRect(0, 0, 1024, 160)
  // checker border
  const s = 20
  for (let x = 0; x < 1024 / s; x++) {
    for (const y of [0, 1024 / s]) void y
    ctx.fillStyle = x % 2 ? '#ffffff' : '#1c1c1c'
    ctx.fillRect(x * s, 0, s, s)
    ctx.fillStyle = x % 2 ? '#1c1c1c' : '#ffffff'
    ctx.fillRect(x * s, 160 - s, s, s)
  }
  ctx.font = '900 92px system-ui, -apple-system, "Segoe UI", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineWidth = 10
  ctx.strokeStyle = '#8a1414'
  ctx.strokeText('CUBE KIDS RACE', 512, 84)
  ctx.fillStyle = '#ffffff'
  ctx.fillText('CUBE KIDS RACE', 512, 84)
  return new THREE.CanvasTexture(canvas)
}

const GATE_H = 4.4

function gateBoxes(halfW: number): Box[] {
  const boxes: Box[] = []
  const u = 0.42
  const tx = halfW + 0.7
  // checkered towers
  for (const sx of [-1, 1]) {
    for (let y = 0; y < Math.round(GATE_H / u); y++) {
      for (const [dx, dz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]] as const) {
        const check = (y + (dx > 0 ? 1 : 0) + (dz > 0 ? 1 : 0)) % 2 === 0
        boxes.push({ p: [sx * tx + dx * u, u / 2 + y * u, dz * u], s: [u, u, u], c: check ? '#1c1c1c' : '#ffffff', j: 0.04 })
      }
    }
    // tower cap
    boxes.push({ p: [sx * tx, GATE_H + 0.15, 0], s: [u * 2.6, 0.3, u * 2.6], c: '#e53935', j: 0.05 })
    boxes.push({ p: [sx * tx, GATE_H + 0.38, 0], s: [0.2, 0.24, 0.2], c: '#ffd21a', j: 0.04 })
  }
  // overhead beam (checkered)
  const n = Math.ceil((tx * 2) / u)
  for (let i = 0; i <= n; i++) {
    const x = -tx + i * u
    boxes.push({ p: [x, GATE_H - 0.2, 0], s: [u, u, u], c: i % 2 ? '#1c1c1c' : '#ffffff', j: 0.04 })
  }
  return boxes
}

/**
 * The start/finish gate: checkered voxel towers, a banner, and a countdown
 * light tree synced to the 3-2-1-GO. Lights: off -> reds during the count,
 * all green on GO (held while racing).
 */
export function StartGate({
  position,
  quaternion,
  halfW,
  countdown,
  armed,
}: {
  position: [number, number, number]
  quaternion: [number, number, number, number]
  halfW: number
  countdown: number | null
  armed: boolean
}) {
  const boxes = useMemo(() => gateBoxes(halfW), [halfW])
  const banner = useMemo(() => bannerTexture(), [])
  const lit = countdown !== null ? 3 - Math.max(0, countdown) : 0
  const go = countdown === 0 || armed
  return (
    <group position={position} quaternion={quaternion}>
      <InstancedBoxes boxes={boxes} />
      {/* banner hangs under the beam */}
      <mesh position={[0, GATE_H - 0.85, 0]}>
        <boxGeometry args={[halfW * 1.7, 0.85, 0.06]} />
        <meshStandardMaterial map={banner} />
      </mesh>
      {/* countdown light tree on the beam */}
      {[-1, 0, 1].map((sx, i) => {
        const on = go || lit > i
        const color = go ? '#2ee56a' : on ? '#ff3b30' : '#3a3a42'
        return (
          <mesh key={i} position={[sx * 0.75, GATE_H + 0.42, 0]}>
            <boxGeometry args={[0.42, 0.42, 0.42]} />
            <meshBasicMaterial color={color} fog={false} />
          </mesh>
        )
      })}
    </group>
  )
}

// ---- Grandstands with a cheering cube-animal crowd ------------------------

const CROWD_COLORS = [
  '#e8722e', '#8d6e63', '#9ccc65', '#90a4ae', '#f6bf42', '#f2f2ee',
  '#f2a0b4', '#23232e', '#f5f5f0', '#2e8ae8', '#f2b53c', '#5cc23e',
]

function standBoxes(): Box[] {
  const boxes: Box[] = []
  const u = 0.45
  const width = 9 // along z (track direction)
  const rows = 3
  for (let r = 0; r < rows; r++) {
    const x = r * 0.95
    const y = 0.3 + r * 0.55
    for (let gz = 0; gz < Math.round(width / u); gz++) {
      boxes.push({ p: [x, y, -width / 2 + gz * u], s: [1.0, 0.55, u], c: r % 2 ? '#8a5a34' : '#9c6b3f', j: 0.08 })
      boxes.push({ p: [x, y + 0.3, -width / 2 + gz * u], s: [0.9, 0.12, u], c: gz % 2 ? '#e53935' : '#f6f6f2', j: 0.05 })
    }
  }
  // side panels + roof posts + striped canopy
  for (const sz of [-1, 1]) {
    boxes.push({ p: [0.95, 0.8, sz * (width / 2)], s: [2.9, 1.6, 0.18], c: '#7a4e26', j: 0.06 })
    boxes.push({ p: [2.3, 2.1, sz * (width / 2 - 0.2)], s: [0.18, 3.4, 0.18], c: '#546e7a', j: 0.05 })
    boxes.push({ p: [-0.4, 2.6, sz * (width / 2 - 0.2)], s: [0.18, 2.4, 0.18], c: '#546e7a', j: 0.05 })
  }
  const segs = Math.round(width / u)
  for (let gz = 0; gz <= segs; gz++) {
    for (let gx = 0; gx < 8; gx++) {
      boxes.push({
        p: [-0.7 + gx * 0.45, 3.9 - gx * 0.09, -width / 2 + gz * u],
        s: [0.45, 0.14, u],
        c: gz % 2 ? '#e53935' : '#f6f6f2',
        j: 0.04,
      })
    }
  }
  return boxes
}

/** One grandstand; the crowd is an animated instanced mesh of tiny animals. */
function Grandstand({ seed }: { seed: number }) {
  const boxes = useMemo(() => standBoxes(), [])
  const crowdRef = useRef<THREE.InstancedMesh>(null)

  const crowd = useMemo(() => {
    const list: { x: number; y: number; z: number; c: string; phase: number; ear: number }[] = []
    for (let r = 0; r < 3; r++) {
      for (let i = 0; i < 9; i++) {
        if (rnd(seed + r * 31 + i * 7) < 0.15) continue // empty seats
        list.push({
          x: r * 0.95,
          y: 0.95 + r * 0.55,
          z: -4 + i * 0.92 + (rnd(seed + i * 13 + r) - 0.5) * 0.2,
          c: CROWD_COLORS[Math.floor(rnd(seed + r * 17 + i * 3) * CROWD_COLORS.length)],
          phase: rnd(seed + r * 7 + i * 11) * Math.PI * 2,
          ear: rnd(seed + r * 5 + i * 19),
        })
      }
    }
    return list
  }, [seed])

  const dummy = useMemo(() => new THREE.Object3D(), [])
  const CUBES_PER = 4 // body, head, two ears

  useFrame((state) => {
    const inst = crowdRef.current
    if (!inst) return
    const t = state.clock.elapsedTime
    crowd.forEach((sp, i) => {
      const hop = Math.abs(Math.sin(t * 3 + sp.phase)) * 0.22
      const base = i * CUBES_PER
      dummy.position.set(sp.x, sp.y + hop, sp.z)
      dummy.scale.set(0.42, 0.4, 0.34)
      dummy.updateMatrix()
      inst.setMatrixAt(base, dummy.matrix)
      dummy.position.set(sp.x, sp.y + 0.36 + hop, sp.z)
      dummy.scale.set(0.34, 0.3, 0.3)
      dummy.updateMatrix()
      inst.setMatrixAt(base + 1, dummy.matrix)
      for (const s of [-1, 1]) {
        dummy.position.set(sp.x, sp.y + 0.56 + hop, sp.z + s * 0.12)
        dummy.scale.set(0.1, sp.ear > 0.5 ? 0.16 : 0.08, 0.09)
        dummy.updateMatrix()
        inst.setMatrixAt(base + (s < 0 ? 2 : 3), dummy.matrix)
      }
    })
    inst.instanceMatrix.needsUpdate = true
  })

  return (
    <group>
      <InstancedBoxes boxes={boxes} />
      <instancedMesh
        ref={crowdRef}
        args={[undefined, undefined, crowd.length * CUBES_PER]}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.9} flatShading />
      </instancedMesh>
      {/* per-instance colours set once */}
      <ColorSetter meshRef={crowdRef} crowd={crowd} cubesPer={CUBES_PER} />
    </group>
  )
}

/** One-time instance colour writer (body colour, darker head, dark ears). */
function ColorSetter({
  meshRef,
  crowd,
  cubesPer,
}: {
  meshRef: React.RefObject<THREE.InstancedMesh | null>
  crowd: { c: string }[]
  cubesPer: number
}) {
  const done = useRef(false)
  useFrame(() => {
    const inst = meshRef.current
    if (!inst || done.current) return
    const col = new THREE.Color()
    crowd.forEach((sp, i) => {
      col.set(sp.c)
      inst.setColorAt(i * cubesPer, col)
      inst.setColorAt(i * cubesPer + 1, col.clone().multiplyScalar(1.08))
      const ear = col.clone().multiplyScalar(0.75)
      inst.setColorAt(i * cubesPer + 2, ear)
      inst.setColorAt(i * cubesPer + 3, ear)
    })
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true
    done.current = true
  })
  return null
}

/** Both grandstands flanking the start gate, facing the track. */
export function Grandstands({
  position,
  quaternion,
  halfW,
}: {
  position: [number, number, number]
  quaternion: [number, number, number, number]
  halfW: number
}) {
  return (
    <group position={position} quaternion={quaternion}>
      <group position={[halfW + 5.2, 0, 3]} rotation={[0, Math.PI, 0]}>
        <Grandstand seed={1} />
      </group>
      <group position={[-(halfW + 5.2), 0, -9]}>
        <Grandstand seed={2} />
      </group>
    </group>
  )
}

// ---- Trackside dressing: flags, curve chevrons, balloon arch --------------

const FLAG_COLORS = ['#e53935', '#2e8ae8', '#f2b53c', '#59c94f', '#9b6cf0', '#f078c2']

export function Trackside({ track, halfW }: { track: Track; halfW: number }) {
  const boxes = useMemo<Box[]>(() => {
    const out: Box[] = []
    const len = track.length
    if (len < 20) return out
    const pos = new THREE.Vector3()
    const prevTan = new THREE.Vector3()
    // walk the track, measuring curvature to decide flags vs chevrons
    for (let d = 6; d < len - 6; d += 4) {
      const f = sampleCenter(track.center, d)
      const f2 = sampleCenter(track.center, d + 4)
      const turn = f2.tangent.angleTo(f.tangent) / 4 // rad per unit
      const side = Math.sign(new THREE.Vector3().crossVectors(f.tangent, f2.tangent).y) || 1
      if (turn > 0.045) {
        // chevron sign on the outside of the curve
        const outSide = -side
        pos.copy(f.pos).addScaledVector(f.right, outSide * (halfW + 1.3))
        for (let y = 0; y < 2; y++)
          out.push({ p: [pos.x, 0.25 + y * 0.5, pos.z], s: [0.16, 0.5, 0.16], c: '#546e7a', j: 0.06 })
        // sign board with a chevron pointing into the turn
        for (let gx = -2; gx <= 2; gx++)
          for (let gy = -1; gy <= 1; gy++) {
            const chevron = Math.abs(gy) === Math.abs(gx) - (side > 0 ? 0 : 0) && gx * side <= 0
            const bx = pos.x + f.tangent.x * gx * 0.26
            const bz = pos.z + f.tangent.z * gx * 0.26
            out.push({
              p: [bx, 1.45 + gy * 0.26, bz],
              s: [0.26, 0.26, 0.14],
              c: chevron ? '#1c1c1c' : '#ffd21a',
              j: 0.04,
            })
          }
      } else if (Math.round(d / 4) % 2 === 0) {
        // flag on alternating sides of the straights
        const s = Math.round(d / 4) % 4 === 0 ? 1 : -1
        pos.copy(f.pos).addScaledVector(f.right, s * (halfW + 1.1))
        for (let y = 0; y < 6; y++)
          out.push({ p: [pos.x, 0.2 + y * 0.4, pos.z], s: [0.12, 0.4, 0.12], c: '#eceff1', j: 0.05 })
        const c = FLAG_COLORS[Math.round(d / 8) % FLAG_COLORS.length]
        for (let i = 0; i < 3; i++) {
          out.push({
            p: [pos.x + f.tangent.x * (0.24 + i * 0.24), 2.35 - i * 0.06, pos.z + f.tangent.z * (0.24 + i * 0.24)],
            s: [0.26, 0.5 - i * 0.13, 0.26],
            c,
            j: 0.06,
          })
        }
      }
      prevTan.copy(f.tangent)
    }
    // balloon arch at the halfway point
    const mid = sampleCenter(track.center, len / 2)
    const arcW = halfW + 1.2
    for (let i = 0; i <= 14; i++) {
      const t = i / 14
      const lx = (t - 0.5) * 2 * arcW
      const ly = 0.5 + Math.sin(t * Math.PI) * (arcW * 0.85)
      const bx = mid.pos.x + mid.right.x * lx
      const bz = mid.pos.z + mid.right.z * lx
      out.push({
        p: [bx, ly, bz],
        s: [0.55, 0.55, 0.55],
        c: FLAG_COLORS[i % FLAG_COLORS.length],
        j: 0.06,
      })
    }
    return out
  }, [track, halfW])
  return <InstancedBoxes boxes={boxes} />
}

// ---- Fireworks over the podium --------------------------------------------

const ROCKETS = 7
const PARTICLES = 40
const CYCLE = 2.6
const RISE = 0.75 // fraction of the cycle spent ascending

export function Fireworks({
  center,
  back,
  active,
}: {
  center: THREE.Vector3
  /** Direction the podium faces; bursts go the other way, into the visible sky. */
  back: THREE.Vector3
  active: boolean
}) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  // Track each rocket's phase so a pop fires exactly when it bursts.
  const wasRising = useRef<boolean[]>([])

  const rockets = useMemo(
    () =>
      Array.from({ length: ROCKETS }, (_, i) => ({
        phase: i * 0.43 * CYCLE,
        x: (rnd(i * 3 + 1) - 0.5) * 14,
        z: (rnd(i * 7 + 2) - 0.5) * 6,
        h: 5.5 + rnd(i * 11 + 3) * 3.5,
        color: new THREE.Color(FLAG_COLORS[i % FLAG_COLORS.length]).multiplyScalar(1.4),
        dirs: Array.from({ length: PARTICLES }, (_, k) => {
          const a = rnd(i * 91 + k * 17) * Math.PI * 2
          const b = Math.acos(2 * rnd(i * 57 + k * 29) - 1)
          return new THREE.Vector3(Math.sin(b) * Math.cos(a), Math.cos(b), Math.sin(b) * Math.sin(a))
        }),
      })),
    [],
  )

  useFrame((state) => {
    const inst = ref.current
    if (!inst) return
    const t = state.clock.elapsedTime
    let idx = 0
    const col = new THREE.Color()
    const bx = center.x - back.x * 9
    const bz = center.z - back.z * 9
    rockets.forEach((r, ri) => {
      let p = (t + r.phase) % CYCLE
      if (p < 0) p += CYCLE
      const u = p / CYCLE
      const rising = u < RISE
      if (wasRising.current[ri] && !rising) sfx('pop', 0.8)
      wasRising.current[ri] = rising
      r.dirs.forEach((dir, k) => {
        if (u < RISE) {
          // ascending: a short bright streak
          const y = (u / RISE) * r.h
          dummy.position.set(bx + r.x, center.y + y - k * 0.03, bz + r.z)
          dummy.scale.setScalar(k < 3 ? 0.45 : 0.001)
        } else {
          const e = (u - RISE) / (1 - RISE) // 0..1 burst
          const spread = 4.6 * (1 - Math.exp(-e * 3.2))
          dummy.position.set(
            bx + r.x + dir.x * spread,
            center.y + r.h + dir.y * spread - 2.0 * e * e,
            bz + r.z + dir.z * spread,
          )
          dummy.scale.setScalar(Math.max(0.001, 0.85 * (1 - e)))
        }
        dummy.updateMatrix()
        inst.setMatrixAt(idx, dummy.matrix)
        col.copy(r.color)
        if (u >= RISE && k % 5 === 0) col.set('#ffffff')
        inst.setColorAt(idx, col)
        idx++
      })
    })
    inst.instanceMatrix.needsUpdate = true
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true
  })

  if (!active) return null
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, ROCKETS * PARTICLES]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial fog={false} />
    </instancedMesh>
  )
}
