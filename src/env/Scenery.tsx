import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { LANE_SPACING, NUM_LANES, Track } from '../track/build'
import { EnvParams, SceneryExtra } from './model'
import {
  VOX,
  VoxelBag,
  newBag,
  vAcacia,
  vBuilding,
  vBush,
  vDrift,
  vFloe,
  vFlowers,
  vLamp,
  vMountain,
  vPine,
  vPlateau,
  vRocks,
  vTallTree,
  vTree,
} from './voxels'

// Environment scenery. The 'classic' set uses low-poly primitives; the world
// sets (forest/savanna/snowy/city) assemble everything from thousands of
// small voxel cubes — Cube Kids style — rendered as one instanced mesh.

const CORRIDOR = ((NUM_LANES - 1) / 2) * LANE_SPACING + 2.6 // road + clearance
const REACH = 38
const MAX_HALF = 60

const rnd = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

const shade = (hex: string, k: number) => new THREE.Color(hex).multiplyScalar(k)

// ---- Classic low-poly props ----------------------------------------------

function PineTree({ leaf, snowCaps, s }: { leaf: string; snowCaps: boolean; s: number }) {
  const dark = useMemo(() => `#${shade(leaf, 0.8).getHexString()}`, [leaf])
  return (
    <group scale={s}>
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[0.45, 1, 0.45]} />
        <meshStandardMaterial color="#7a5236" />
      </mesh>
      <mesh position={[0, 1.55, 0]} castShadow>
        <coneGeometry args={[1.25, 1.6, 7]} />
        <meshStandardMaterial color={leaf} flatShading />
      </mesh>
      <mesh position={[0, 2.6, 0]} castShadow>
        <coneGeometry args={[0.95, 1.4, 7]} />
        <meshStandardMaterial color={dark} flatShading />
      </mesh>
      <mesh position={[0, 3.5, 0]} castShadow>
        <coneGeometry args={[0.6, 1.1, 7]} />
        <meshStandardMaterial color={leaf} flatShading />
      </mesh>
      {snowCaps && (
        <mesh position={[0, 3.78, 0]}>
          <coneGeometry args={[0.45, 0.7, 7]} />
          <meshStandardMaterial color="#f4f9fc" flatShading />
        </mesh>
      )}
    </group>
  )
}

function RoundTree({ leaf, s, seed }: { leaf: string; s: number; seed: number }) {
  const tone = useMemo(() => `#${shade(leaf, 0.85 + rnd(seed) * 0.3).getHexString()}`, [leaf, seed])
  return (
    <group scale={s}>
      <mesh position={[0, 0.7, 0]} castShadow>
        <boxGeometry args={[0.5, 1.4, 0.5]} />
        <meshStandardMaterial color="#8a5d3b" />
      </mesh>
      <mesh position={[0, 2.1, 0]} castShadow>
        <dodecahedronGeometry args={[1.35, 0]} />
        <meshStandardMaterial color={tone} flatShading />
      </mesh>
      <mesh position={[0.75, 1.55, 0.35]} castShadow>
        <dodecahedronGeometry args={[0.7, 0]} />
        <meshStandardMaterial color={leaf} flatShading />
      </mesh>
    </group>
  )
}

function Rock({ s, seed }: { s: number; seed: number }) {
  const tone = useMemo(() => `#${shade('#9aa3ad', 0.8 + rnd(seed) * 0.4).getHexString()}`, [seed])
  return (
    <mesh position={[0, 0.32 * s, 0]} scale={[s, s * 0.7, s]} rotation={[0, rnd(seed + 4) * Math.PI, 0]} castShadow>
      <dodecahedronGeometry args={[0.6, 0]} />
      <meshStandardMaterial color={tone} flatShading />
    </mesh>
  )
}

function Bush({ leaf, s }: { leaf: string; s: number }) {
  return (
    <group scale={s}>
      <mesh position={[0, 0.35, 0]} castShadow>
        <sphereGeometry args={[0.55, 8, 6]} />
        <meshStandardMaterial color={leaf} flatShading />
      </mesh>
      <mesh position={[0.45, 0.28, 0.1]} castShadow>
        <sphereGeometry args={[0.4, 8, 6]} />
        <meshStandardMaterial color={`#${shade(leaf, 0.85).getHexString()}`} flatShading />
      </mesh>
    </group>
  )
}

function Snowman({ s }: { s: number }) {
  return (
    <group scale={s}>
      <mesh position={[0, 0.5, 0]} castShadow>
        <sphereGeometry args={[0.62, 10, 8]} />
        <meshStandardMaterial color="#f6fafc" />
      </mesh>
      <mesh position={[0, 1.25, 0]} castShadow>
        <sphereGeometry args={[0.45, 10, 8]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0, 1.85, 0]} castShadow>
        <sphereGeometry args={[0.32, 10, 8]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0, 1.87, 0.34]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.07, 0.35, 6]} />
        <meshStandardMaterial color="#f08c1d" />
      </mesh>
      <mesh position={[-0.11, 1.98, 0.28]}>
        <sphereGeometry args={[0.04, 6, 5]} />
        <meshStandardMaterial color="#2a2a2a" />
      </mesh>
      <mesh position={[0.11, 1.98, 0.28]}>
        <sphereGeometry args={[0.04, 6, 5]} />
        <meshStandardMaterial color="#2a2a2a" />
      </mesh>
      <mesh position={[-0.62, 1.3, 0]} rotation={[0, 0, 0.7]}>
        <boxGeometry args={[0.5, 0.05, 0.05]} />
        <meshStandardMaterial color="#6b4a2c" />
      </mesh>
      <mesh position={[0.62, 1.3, 0]} rotation={[0, 0, -0.7]}>
        <boxGeometry args={[0.5, 0.05, 0.05]} />
        <meshStandardMaterial color="#6b4a2c" />
      </mesh>
    </group>
  )
}

function Pumpkin({ s }: { s: number }) {
  return (
    <group scale={s}>
      <mesh position={[0, 0.32, 0]} scale={[1, 0.72, 1]} castShadow>
        <sphereGeometry args={[0.5, 10, 8]} />
        <meshStandardMaterial color="#e8761e" flatShading />
      </mesh>
      <mesh position={[0, 0.72, 0]}>
        <cylinderGeometry args={[0.06, 0.09, 0.25, 6]} />
        <meshStandardMaterial color="#4c7a2e" />
      </mesh>
    </group>
  )
}

const FLOWER_COLORS = ['#ff8ab5', '#ffd447', '#ffffff', '#b07ce8', '#ff6a5e']

function FlowerPatch({ s, seed }: { s: number; seed: number }) {
  const flowers = useMemo(
    () =>
      Array.from({ length: 3 }, (_, i) => ({
        x: (rnd(seed + i * 3) - 0.5) * 1.4,
        z: (rnd(seed + i * 7) - 0.5) * 1.4,
        h: 0.35 + rnd(seed + i * 11) * 0.3,
        c: FLOWER_COLORS[Math.floor(rnd(seed + i * 13) * FLOWER_COLORS.length)],
      })),
    [seed],
  )
  return (
    <group scale={s}>
      {flowers.map((f, i) => (
        <group key={i} position={[f.x, 0, f.z]}>
          <mesh position={[0, f.h / 2, 0]}>
            <cylinderGeometry args={[0.035, 0.035, f.h, 5]} />
            <meshStandardMaterial color="#4c8a3a" />
          </mesh>
          <mesh position={[0, f.h + 0.09, 0]}>
            <sphereGeometry args={[0.13, 7, 6]} />
            <meshStandardMaterial color={f.c} flatShading />
          </mesh>
        </group>
      ))}
    </group>
  )
}

const CABIN_COLORS = ['#f0605a', '#4aa3f0', '#59c94f', '#f2b53c', '#9b6cf0', '#f078c2', '#3ecfc0', '#f28c3c']

/** A slowly turning ferris wheel of coloured cabin cubes. */
function FerrisWheel({ s }: { s: number }) {
  const wheel = useRef<THREE.Group>(null)
  useFrame((_, delta) => {
    if (wheel.current) wheel.current.rotation.z += delta * 0.25
  })
  const cabins = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2
        return {
          pos: [Math.cos(a) * 4.2, Math.sin(a) * 4.2, 0] as [number, number, number],
          c: CABIN_COLORS[i % CABIN_COLORS.length],
        }
      }),
    [],
  )
  return (
    <group scale={s}>
      <mesh position={[-1.6, 2.8, 0]} rotation={[0, 0, 0.3]} castShadow>
        <boxGeometry args={[0.35, 6, 0.35]} />
        <meshStandardMaterial color="#5a6672" />
      </mesh>
      <mesh position={[1.6, 2.8, 0]} rotation={[0, 0, -0.3]} castShadow>
        <boxGeometry args={[0.35, 6, 0.35]} />
        <meshStandardMaterial color="#5a6672" />
      </mesh>
      <group position={[0, 5.6, 0]} ref={wheel}>
        <mesh>
          <boxGeometry args={[0.8, 0.8, 0.6]} />
          <meshStandardMaterial color="#f2b53c" />
        </mesh>
        {cabins.map((c, i) => (
          <group key={i}>
            <mesh
              position={[c.pos[0] / 2, c.pos[1] / 2, 0]}
              rotation={[0, 0, Math.atan2(c.pos[1], c.pos[0])]}
            >
              <boxGeometry args={[4.2, 0.15, 0.15]} />
              <meshStandardMaterial color="#7d8894" />
            </mesh>
            <mesh position={c.pos} castShadow>
              <boxGeometry args={[0.85, 0.85, 0.85]} />
              <meshStandardMaterial color={c.c} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  )
}

/** A blocky hot-air balloon floating over the city. */
function Balloon({ s, seed }: { s: number; seed: number }) {
  const c = CABIN_COLORS[Math.floor(rnd(seed + 81) * CABIN_COLORS.length)]
  const h = 8 + rnd(seed + 83) * 6
  return (
    <group position={[0, h, 0]} scale={s}>
      <mesh castShadow>
        <boxGeometry args={[1.9, 1.9, 1.9]} />
        <meshStandardMaterial color={c} />
      </mesh>
      <mesh position={[0, 1.2, 0]}>
        <boxGeometry args={[1.2, 0.65, 1.2]} />
        <meshStandardMaterial color={`#${shade(c, 0.8).getHexString()}`} />
      </mesh>
      <mesh position={[0, -1.5, 0]}>
        <boxGeometry args={[0.7, 0.6, 0.7]} />
        <meshStandardMaterial color="#8a5d3b" />
      </mesh>
      <mesh position={[0, -1, 0]}>
        <boxGeometry args={[0.07, 0.55, 0.07]} />
        <meshStandardMaterial color="#5a4632" />
      </mesh>
    </group>
  )
}

// ---- Voxel field rendering ------------------------------------------------

let bagCounter = 0

/** Draws a whole VoxelBag as one instanced cube mesh (one draw call). */
function VoxelField({ bag }: { bag: VoxelBag }) {
  const count = bag.pos.length / 3
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const color = useMemo(() => new THREE.Color(), [])
  if (count === 0) return null
  return (
    <instancedMesh
      key={bag.key}
      args={[undefined, undefined, count]}
      castShadow
      receiveShadow
      ref={(inst) => {
        if (!inst) return
        for (let i = 0; i < count; i++) {
          matrix.setPosition(bag.pos[i * 3], bag.pos[i * 3 + 1], bag.pos[i * 3 + 2])
          inst.setMatrixAt(i, matrix)
          color.setRGB(bag.col[i * 3], bag.col[i * 3 + 1], bag.col[i * 3 + 2])
          inst.setColorAt(i, color)
        }
        inst.instanceMatrix.needsUpdate = true
        if (inst.instanceColor) inst.instanceColor.needsUpdate = true
      }}
    >
      <boxGeometry args={[VOX, VOX, VOX]} />
      <meshStandardMaterial roughness={0.85} />
    </instancedMesh>
  )
}

// ---- Scatter --------------------------------------------------------------

type ClassicKind = 'pine' | 'round' | 'rock' | 'bush' | 'extra'
type JsxKind = 'extra' | 'ferris' | 'balloon'

interface Item {
  key: number
  kind: string
  pos: [number, number, number]
  rot: number
  scale: number
  seed: number
}

export default function Scenery({ track, env }: { track: Track; env: EnvParams }) {
  const { density, tree, extra, set } = env.scenery
  const grassTop = env.grass
  const isVoxel = set !== 'classic'

  // Shared scatter helper: pick a clear spot away from the road.
  const scatterSpots = (
    count: number,
    half: number,
    cx: number,
    cz: number,
    pts: THREE.Vector3[],
    clearance: number,
    salt: number,
  ) => {
    const out: { x: number; z: number; seed: number }[] = []
    let tries = 0
    let i = 0
    while (out.length < count && tries < count * 8) {
      tries++
      i++
      const x = cx + (rnd(i * 2 + 1 + salt) - 0.5) * 2 * half
      const z = cz + (rnd(i * 2 + 2 + salt) - 0.5) * 2 * half
      let near = false
      for (let k = 0; k < pts.length; k += 2) {
        const dx = pts[k].x - x
        const dz = pts[k].z - z
        if (dx * dx + dz * dz < clearance * clearance) {
          near = true
          break
        }
      }
      if (near) continue
      out.push({ x, z, seed: i + salt })
    }
    return out
  }

  // ---- Classic set: low-poly JSX items ----
  const items = useMemo<Item[]>(() => {
    if (isVoxel || density <= 0 || track.length === 0) return []
    const cx = track.boundsCenter.x
    const cz = track.boundsCenter.z
    const half = Math.min(track.radius + REACH, MAX_HALF)
    const areaScale = Math.max(0.5, Math.min(2, (half * half) / 1600))
    const count = Math.round(density * 0.9 * areaScale)
    return scatterSpots(count, half, cx, cz, track.center.points, CORRIDOR, 0).map((sp, n) => {
      const roll = rnd(sp.seed * 5 + 3)
      const kind: ClassicKind =
        extra !== 'none' && roll < 0.14
          ? 'extra'
          : roll < 0.5
            ? 'pine'
            : roll < 0.74
              ? 'round'
              : roll < 0.87
                ? 'rock'
                : 'bush'
      return {
        key: n,
        kind,
        pos: [sp.x, 0, sp.z] as [number, number, number],
        rot: rnd(sp.seed * 7 + 5) * Math.PI * 2,
        scale: 0.75 + rnd(sp.seed * 11 + 7) * 0.6,
        seed: sp.seed,
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVoxel, track, density, extra])

  // ---- Voxel sets: build one big cube buffer + a few animated JSX items ----
  const voxel = useMemo(() => {
    if (!isVoxel || density <= 0 || track.length === 0) return null
    const bag = newBag()
    bag.key = ++bagCounter
    const jsx: Item[] = []
    const cx = track.boundsCenter.x
    const cz = track.boundsCenter.z
    const half = Math.min(track.radius + REACH, MAX_HALF)
    const areaScale = Math.max(0.5, Math.min(2, (half * half) / 1600))
    const count = Math.min(170, Math.round(density * 1.5 * areaScale))
    const pts = track.center.points

    const spots = scatterSpots(count, half, cx, cz, pts, CORRIDOR + 2, 1000)
    let balloons = 0
    let ferris = 0
    for (const sp of spots) {
      const r = rnd(sp.seed * 5 + 3)
      const awayX = sp.x - cx
      const awayZ = sp.z - cz
      const fromCenter = Math.sqrt(awayX * awayX + awayZ * awayZ)
      const addExtra = extra !== 'none' && r < 0.1
      if (addExtra) {
        jsx.push({
          key: jsx.length,
          kind: 'extra',
          pos: [sp.x, 0, sp.z],
          rot: rnd(sp.seed * 7) * Math.PI * 2,
          scale: 0.8 + rnd(sp.seed * 11) * 0.5,
          seed: sp.seed,
        })
        continue
      }
      const t = extra !== 'none' ? (r - 0.1) / 0.9 : r
      switch (set) {
        case 'forest':
          if (t < 0.4) vTree(bag, sp.x, sp.z, sp.seed, tree)
          else if (t < 0.52) vTallTree(bag, sp.x, sp.z, sp.seed, tree)
          else if (t < 0.6) vPlateau(bag, sp.x, sp.z, sp.seed, grassTop, rnd(sp.seed + 7) > 0.45, awayX, awayZ)
          else if (t < 0.74) vBush(bag, sp.x, sp.z, sp.seed, tree)
          else if (t < 0.88) vFlowers(bag, sp.x, sp.z, sp.seed)
          else vRocks(bag, sp.x, sp.z, sp.seed)
          break
        case 'savanna':
          if (t < 0.44) vAcacia(bag, sp.x, sp.z, sp.seed, tree)
          else if (t < 0.56) vRocks(bag, sp.x, sp.z, sp.seed)
          else if (t < 0.66) vPlateau(bag, sp.x, sp.z, sp.seed, '#e0b556', rnd(sp.seed + 7) > 0.55, awayX, awayZ)
          else if (t < 0.86) vBush(bag, sp.x, sp.z, sp.seed, '#a8a04e')
          else vFlowers(bag, sp.x, sp.z, sp.seed)
          break
        case 'snowy':
          if (t < 0.34) vPine(bag, sp.x, sp.z, sp.seed, tree, true)
          else if (t < 0.5) vFloe(bag, sp.x, sp.z, sp.seed)
          else if (t < 0.64) vDrift(bag, sp.x, sp.z, sp.seed)
          else if (t < 0.74) vRocks(bag, sp.x, sp.z, sp.seed, true)
          else if (fromCenter > track.radius + 9) vMountain(bag, sp.x, sp.z, sp.seed)
          else vPine(bag, sp.x, sp.z, sp.seed, tree, true)
          break
        case 'city':
          if (t < 0.08 && balloons < 3) {
            balloons++
            jsx.push({ key: jsx.length, kind: 'balloon', pos: [sp.x, 0, sp.z], rot: 0, scale: 0.9, seed: sp.seed })
          } else if (t < 0.11 && ferris < 1 && fromCenter > track.radius + 6) {
            ferris++
            jsx.push({ key: jsx.length, kind: 'ferris', pos: [sp.x, 0, sp.z], rot: rnd(sp.seed) * Math.PI, scale: 1.1, seed: sp.seed })
          } else if (t < 0.56) vBuilding(bag, sp.x, sp.z, sp.seed)
          else if (t < 0.72) vTree(bag, sp.x, sp.z, sp.seed, tree)
          else if (t < 0.8) vLamp(bag, sp.x, sp.z, sp.seed)
          else if (t < 0.9) vFlowers(bag, sp.x, sp.z, sp.seed)
          else vBush(bag, sp.x, sp.z, sp.seed, tree)
          break
      }
    }

    // Backdrop ring: big landmarks beyond the field so the horizon feels full.
    const ringCount = Math.round(16 * Math.max(0.7, areaScale))
    for (let i = 0; i < ringCount; i++) {
      const a = (i / ringCount) * Math.PI * 2 + rnd(i + 77) * 0.5
      const rr = half * (0.95 + rnd(i + 88) * 0.3)
      const x = cx + Math.cos(a) * rr
      const z = cz + Math.sin(a) * rr
      const seed = 5000 + i
      switch (set) {
        case 'forest':
          if (rnd(seed) > 0.5) vTallTree(bag, x, z, seed, tree)
          else vTree(bag, x, z, seed, tree, true)
          break
        case 'savanna':
          vAcacia(bag, x, z, seed, tree)
          break
        case 'snowy':
          vMountain(bag, x, z, seed, true)
          break
        case 'city':
          vBuilding(bag, x, z, seed, true)
          break
      }
    }

    return { bag, jsx }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVoxel, track, density, tree, extra, set, grassTop])

  const snowCaps = extra === 'snowman'

  const renderExtra = (it: Item) => {
    switch (extra as SceneryExtra) {
      case 'snowman':
        return <Snowman s={it.scale} />
      case 'pumpkin':
        return <Pumpkin s={it.scale * 1.2} />
      case 'flowers':
        return <FlowerPatch s={it.scale * 1.1} seed={it.seed} />
      default:
        return null
    }
  }

  const renderJsx = (it: Item) => {
    switch (it.kind as JsxKind) {
      case 'ferris':
        return <FerrisWheel s={it.scale} />
      case 'balloon':
        return <Balloon s={it.scale} seed={it.seed} />
      default:
        return renderExtra(it)
    }
  }

  return (
    <group>
      {voxel && <VoxelField bag={voxel.bag} />}
      {voxel?.jsx.map((it) => (
        <group key={it.key} position={it.pos} rotation={[0, it.rot, 0]}>
          {renderJsx(it)}
        </group>
      ))}
      {items.map((it) => (
        <group key={it.key} position={it.pos} rotation={[0, it.rot, 0]}>
          {it.kind === 'pine' && <PineTree leaf={tree} snowCaps={snowCaps} s={it.scale} />}
          {it.kind === 'round' && <RoundTree leaf={tree} s={it.scale} seed={it.seed} />}
          {it.kind === 'rock' && <Rock s={it.scale} seed={it.seed} />}
          {it.kind === 'bush' && <Bush leaf={tree} s={it.scale * 0.9} />}
          {it.kind === 'extra' && renderExtra(it)}
        </group>
      ))}
    </group>
  )
}
