import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { LANE_SPACING, NUM_LANES, Track } from '../track/build'
import { EnvParams, SceneryExtra, ScenerySet } from './model'

// Environment scenery built entirely from primitives (boxes, cones, spheres):
// pine and round trees, rocks, bushes, and seasonal extras (snowman, pumpkin,
// flower patches). Deterministically scattered across the field, keeping off
// the road — like GrassField, but sparse and chunky.

const CORRIDOR = ((NUM_LANES - 1) / 2) * LANE_SPACING + 2.6 // road + clearance
const REACH = 34 // how far past the track bounds scenery spreads
const MAX_HALF = 56

const rnd = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

/** Slightly darken/lighten a colour for variety. */
const shade = (hex: string, k: number) => new THREE.Color(hex).multiplyScalar(k)

// ---- Primitive-built props ------------------------------------------------

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
      {/* carrot nose + coal eyes */}
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
      {/* stick arms */}
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

// ---- Voxel world props (Cube Kids style: everything is blocks) ------------

/** Minecraft-style tree: box trunk + stacked cube canopy. Two silhouettes. */
function CubeTree({ leaf, s, seed }: { leaf: string; s: number; seed: number }) {
  const dark = useMemo(() => `#${shade(leaf, 0.78).getHexString()}`, [leaf])
  const tall = rnd(seed + 21) > 0.55
  return tall ? (
    <group scale={s}>
      <mesh position={[0, 1.1, 0]} castShadow>
        <boxGeometry args={[0.55, 2.2, 0.55]} />
        <meshStandardMaterial color="#7a5236" />
      </mesh>
      <mesh position={[0, 2.7, 0]} castShadow>
        <boxGeometry args={[1.7, 1.5, 1.7]} />
        <meshStandardMaterial color={leaf} />
      </mesh>
      <mesh position={[0, 3.9, 0]} castShadow>
        <boxGeometry args={[1.15, 1.1, 1.15]} />
        <meshStandardMaterial color={dark} />
      </mesh>
    </group>
  ) : (
    <group scale={s}>
      <mesh position={[0, 0.7, 0]} castShadow>
        <boxGeometry args={[0.55, 1.4, 0.55]} />
        <meshStandardMaterial color="#7a5236" />
      </mesh>
      <mesh position={[0, 2, 0]} castShadow>
        <boxGeometry args={[2.3, 1.5, 2.3]} />
        <meshStandardMaterial color={leaf} />
      </mesh>
      <mesh position={[0, 3.1, 0]} castShadow>
        <boxGeometry args={[1.4, 0.8, 1.4]} />
        <meshStandardMaterial color={dark} />
      </mesh>
    </group>
  )
}

/** Savanna acacia: tall thin trunk with a wide, flat block canopy. */
function AcaciaTree({ leaf, s, seed }: { leaf: string; s: number; seed: number }) {
  const lean = (rnd(seed + 31) - 0.5) * 0.35
  return (
    <group scale={s} rotation={[0, 0, lean * 0.4]}>
      <mesh position={[0, 1.3, 0]} castShadow>
        <boxGeometry args={[0.4, 2.6, 0.4]} />
        <meshStandardMaterial color="#6e4a2a" />
      </mesh>
      <mesh position={[lean, 2.75, 0]} castShadow>
        <boxGeometry args={[3.3, 0.55, 2.7]} />
        <meshStandardMaterial color={leaf} />
      </mesh>
      <mesh position={[lean * 1.5, 3.25, 0]} castShadow>
        <boxGeometry args={[1.9, 0.45, 1.5]} />
        <meshStandardMaterial color={`#${shade(leaf, 0.82).getHexString()}`} />
      </mesh>
    </group>
  )
}

/** Snowy block pine: shrinking stacked boxes with a snow slab on top. */
function BlockPine({ leaf, s }: { leaf: string; s: number }) {
  const dark = `#${shade(leaf, 0.8).getHexString()}`
  return (
    <group scale={s}>
      <mesh position={[0, 0.4, 0]} castShadow>
        <boxGeometry args={[0.5, 0.8, 0.5]} />
        <meshStandardMaterial color="#6e4a2a" />
      </mesh>
      <mesh position={[0, 1.2, 0]} castShadow>
        <boxGeometry args={[2.1, 0.9, 2.1]} />
        <meshStandardMaterial color={leaf} />
      </mesh>
      <mesh position={[0, 2.05, 0]} castShadow>
        <boxGeometry args={[1.5, 0.85, 1.5]} />
        <meshStandardMaterial color={dark} />
      </mesh>
      <mesh position={[0, 2.85, 0]} castShadow>
        <boxGeometry args={[0.95, 0.8, 0.95]} />
        <meshStandardMaterial color={leaf} />
      </mesh>
      <mesh position={[0, 3.4, 0]} castShadow>
        <boxGeometry args={[0.75, 0.35, 0.75]} />
        <meshStandardMaterial color="#f4f9fc" />
      </mesh>
    </group>
  )
}

/** Terrain accent: a grass/snow/sand-topped dirt block, sometimes stacked. */
function BlockMound({ top, s, seed }: { top: string; s: number; seed: number }) {
  const twoHigh = rnd(seed + 41) > 0.6
  return (
    <group scale={s}>
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[1.5, 1, 1.5]} />
        <meshStandardMaterial color="#8a5d3b" />
      </mesh>
      <mesh position={[0, 1.1, 0]} castShadow>
        <boxGeometry args={[1.52, 0.24, 1.52]} />
        <meshStandardMaterial color={top} />
      </mesh>
      {twoHigh && (
        <group position={[0.9 + rnd(seed + 43) * 0.4, 0, 0.3]}>
          <mesh position={[0, 0.3, 0]} castShadow>
            <boxGeometry args={[1, 0.6, 1]} />
            <meshStandardMaterial color="#8a5d3b" />
          </mesh>
          <mesh position={[0, 0.7, 0]} castShadow>
            <boxGeometry args={[1.02, 0.22, 1.02]} />
            <meshStandardMaterial color={top} />
          </mesh>
        </group>
      )}
    </group>
  )
}

function IceBlock({ s, seed }: { s: number; seed: number }) {
  return (
    <mesh position={[0, 0.5 * s, 0]} scale={s} rotation={[0, rnd(seed + 51) * Math.PI, 0]} castShadow>
      <boxGeometry args={[1.1, 1, 1.1]} />
      <meshStandardMaterial color="#bfe4f6" transparent opacity={0.85} roughness={0.2} />
    </mesh>
  )
}

/** Distant block mountain: a shrinking stack of stone boxes, snow on top. */
function BlockMountain({ s, seed }: { s: number; seed: number }) {
  const tone = `#${shade('#9fb2c4', 0.85 + rnd(seed) * 0.3).getHexString()}`
  return (
    <group scale={s} rotation={[0, rnd(seed + 61) * Math.PI, 0]}>
      <mesh position={[0, 1.5, 0]} castShadow>
        <boxGeometry args={[5.2, 3, 5.2]} />
        <meshStandardMaterial color={tone} />
      </mesh>
      <mesh position={[0.4, 3.8, -0.3]} castShadow>
        <boxGeometry args={[3.4, 2.4, 3.4]} />
        <meshStandardMaterial color={tone} />
      </mesh>
      <mesh position={[0.1, 5.6, 0]} castShadow>
        <boxGeometry args={[2, 1.6, 2]} />
        <meshStandardMaterial color="#eef5fa" />
      </mesh>
      <mesh position={[0.1, 6.6, 0]}>
        <boxGeometry args={[1.1, 0.7, 1.1]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
    </group>
  )
}

const BUILDING_COLORS = ['#f0605a', '#4aa3f0', '#59c94f', '#f2b53c', '#9b6cf0', '#f078c2', '#3ecfc0']

/** Colourful block-city building with a window grid and a roof slab. */
function Building({ s, seed }: { s: number; seed: number }) {
  const color = BUILDING_COLORS[Math.floor(rnd(seed + 71) * BUILDING_COLORS.length)]
  const floors = 2 + Math.floor(rnd(seed + 73) * 4)
  const h = floors * 1.4
  const w = 2.2 + rnd(seed + 75) * 1.2
  const windows = useMemo(() => {
    const out: { x: number; y: number }[] = []
    for (let f = 0; f < floors; f++) {
      out.push({ x: -w / 4, y: 0.9 + f * 1.4 })
      out.push({ x: w / 4, y: 0.9 + f * 1.4 })
    }
    return out
  }, [floors, w])
  return (
    <group scale={s}>
      <mesh position={[0, h / 2, 0]} castShadow>
        <boxGeometry args={[w, h, w * 0.85]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, h + 0.15, 0]} castShadow>
        <boxGeometry args={[w + 0.3, 0.3, w * 0.85 + 0.3]} />
        <meshStandardMaterial color={`#${shade(color, 0.7).getHexString()}`} />
      </mesh>
      {windows.map((win, i) => (
        <group key={i}>
          <mesh position={[win.x, win.y, (w * 0.85) / 2 + 0.03]}>
            <boxGeometry args={[0.5, 0.6, 0.08]} />
            <meshStandardMaterial color="#bfe6f8" emissive="#9fd6f0" emissiveIntensity={0.25} />
          </mesh>
          <mesh position={[win.x, win.y, -(w * 0.85) / 2 - 0.03]}>
            <boxGeometry args={[0.5, 0.6, 0.08]} />
            <meshStandardMaterial color="#bfe6f8" emissive="#9fd6f0" emissiveIntensity={0.25} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.5, (w * 0.85) / 2 + 0.03]}>
        <boxGeometry args={[0.6, 1, 0.08]} />
        <meshStandardMaterial color="#5a4632" />
      </mesh>
    </group>
  )
}

/** A slowly turning ferris wheel of coloured cabin cubes. */
function FerrisWheel({ s }: { s: number }) {
  const wheel = useRef<THREE.Group>(null)
  useFrame((_, delta) => {
    if (wheel.current) wheel.current.rotation.z += delta * 0.25
  })
  const cabins = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2
        return {
          pos: [Math.cos(a) * 3, Math.sin(a) * 3, 0] as [number, number, number],
          c: BUILDING_COLORS[i % BUILDING_COLORS.length],
        }
      }),
    [],
  )
  return (
    <group scale={s}>
      {/* legs */}
      <mesh position={[-1.2, 2, 0]} rotation={[0, 0, 0.3]} castShadow>
        <boxGeometry args={[0.3, 4.4, 0.3]} />
        <meshStandardMaterial color="#5a6672" />
      </mesh>
      <mesh position={[1.2, 2, 0]} rotation={[0, 0, -0.3]} castShadow>
        <boxGeometry args={[0.3, 4.4, 0.3]} />
        <meshStandardMaterial color="#5a6672" />
      </mesh>
      <group position={[0, 4.2, 0]} ref={wheel}>
        <mesh>
          <boxGeometry args={[0.7, 0.7, 0.5]} />
          <meshStandardMaterial color="#f2b53c" />
        </mesh>
        {cabins.map((c, i) => (
          <group key={i}>
            <mesh position={[c.pos[0] / 2, c.pos[1] / 2, 0]} rotation={[0, 0, Math.atan2(c.pos[1], c.pos[0])]}>
              <boxGeometry args={[3, 0.14, 0.14]} />
              <meshStandardMaterial color="#7d8894" />
            </mesh>
            <mesh position={c.pos} castShadow>
              <boxGeometry args={[0.75, 0.75, 0.75]} />
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
  const c = BUILDING_COLORS[Math.floor(rnd(seed + 81) * BUILDING_COLORS.length)]
  const h = 7 + rnd(seed + 83) * 5
  return (
    <group position={[0, h, 0]} scale={s}>
      <mesh castShadow>
        <boxGeometry args={[1.7, 1.7, 1.7]} />
        <meshStandardMaterial color={c} />
      </mesh>
      <mesh position={[0, 1.1, 0]}>
        <boxGeometry args={[1.1, 0.6, 1.1]} />
        <meshStandardMaterial color={`#${shade(c, 0.8).getHexString()}`} />
      </mesh>
      <mesh position={[0, -1.35, 0]}>
        <boxGeometry args={[0.65, 0.55, 0.65]} />
        <meshStandardMaterial color="#8a5d3b" />
      </mesh>
      <mesh position={[0, -0.9, 0]}>
        <boxGeometry args={[0.06, 0.5, 0.06]} />
        <meshStandardMaterial color="#5a4632" />
      </mesh>
    </group>
  )
}

// ---- Scatter --------------------------------------------------------------

type Kind =
  | 'pine'
  | 'round'
  | 'rock'
  | 'bush'
  | 'extra'
  | 'cubetree'
  | 'acacia'
  | 'blockpine'
  | 'mound'
  | 'ice'
  | 'mountain'
  | 'building'
  | 'ferris'
  | 'balloon'

/** Weighted pick per asset set. `r` in [0,1); extras handled by the caller. */
function pickKind(set: ScenerySet, r: number): Kind {
  switch (set) {
    case 'forest':
      return r < 0.58 ? 'cubetree' : r < 0.76 ? 'mound' : r < 0.9 ? 'bush' : 'rock'
    case 'savanna':
      return r < 0.5 ? 'acacia' : r < 0.68 ? 'rock' : r < 0.88 ? 'mound' : 'bush'
    case 'snowy':
      return r < 0.42 ? 'blockpine' : r < 0.58 ? 'mountain' : r < 0.72 ? 'ice' : r < 0.88 ? 'mound' : 'rock'
    case 'city':
      return r < 0.06 ? 'balloon' : r < 0.09 ? 'ferris' : r < 0.6 ? 'building' : r < 0.8 ? 'cubetree' : 'mound'
    default:
      return r < 0.5 ? 'pine' : r < 0.74 ? 'round' : r < 0.87 ? 'rock' : 'bush'
  }
}

interface Item {
  key: number
  kind: Kind
  pos: [number, number, number]
  rot: number
  scale: number
  seed: number
}

export default function Scenery({ track, env }: { track: Track; env: EnvParams }) {
  const { density, tree, extra, set } = env.scenery
  const grassTop = env.grass

  const items = useMemo<Item[]>(() => {
    if (density <= 0 || track.length === 0) return []
    const cx = track.boundsCenter.x
    const cz = track.boundsCenter.z
    const half = Math.min(track.radius + REACH, MAX_HALF)
    const areaScale = Math.max(0.5, Math.min(2, (half * half) / 1600))
    const count = Math.round(density * 0.9 * areaScale)
    const pts = track.center.points
    const out: Item[] = []
    let tries = 0
    let i = 0
    while (out.length < count && tries < count * 8) {
      tries++
      i++
      const x = cx + (rnd(i * 2 + 1) - 0.5) * 2 * half
      const z = cz + (rnd(i * 2 + 2) - 0.5) * 2 * half
      // Keep clear of the road.
      let near = false
      for (let k = 0; k < pts.length; k += 2) {
        const dx = pts[k].x - x
        const dz = pts[k].z - z
        if (dx * dx + dz * dz < CORRIDOR * CORRIDOR) {
          near = true
          break
        }
      }
      if (near) continue
      const roll = rnd(i * 5 + 3)
      let kind: Kind
      if (extra !== 'none' && roll < 0.14) {
        kind = 'extra'
      } else {
        kind = pickKind(set, (roll - (extra !== 'none' ? 0.14 : 0)) / (extra !== 'none' ? 0.86 : 1))
      }
      // Placement rules: mountains stay in the outer ring so they never crowd
      // the course; only one ferris wheel and a few balloons per world.
      const dx = x - cx
      const dz = z - cz
      const fromCenter = Math.sqrt(dx * dx + dz * dz)
      if (kind === 'mountain' && fromCenter < track.radius + 10) kind = 'blockpine'
      if (kind === 'ferris' && (out.some((o) => o.kind === 'ferris') || fromCenter < track.radius + 6)) {
        kind = 'building'
      }
      if (kind === 'balloon' && out.filter((o) => o.kind === 'balloon').length >= 3) kind = 'building'
      out.push({
        key: out.length,
        kind,
        pos: [x, 0, z],
        rot: rnd(i * 7 + 5) * Math.PI * 2,
        scale: 0.75 + rnd(i * 11 + 7) * 0.6,
        seed: i,
      })
    }
    return out
  }, [track, density, extra, set])

  const snowCaps = extra === 'snowman'
  const moundTop = set === 'snowy' ? '#f0f6fa' : set === 'savanna' ? '#e0b556' : grassTop

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

  return (
    <group>
      {items.map((it) => (
        <group key={it.key} position={it.pos} rotation={[0, it.rot, 0]}>
          {it.kind === 'pine' && <PineTree leaf={tree} snowCaps={snowCaps} s={it.scale} />}
          {it.kind === 'round' && <RoundTree leaf={tree} s={it.scale} seed={it.seed} />}
          {it.kind === 'rock' && <Rock s={it.scale} seed={it.seed} />}
          {it.kind === 'bush' && <Bush leaf={tree} s={it.scale * 0.9} />}
          {it.kind === 'cubetree' && <CubeTree leaf={tree} s={it.scale} seed={it.seed} />}
          {it.kind === 'acacia' && <AcaciaTree leaf={tree} s={it.scale * 1.1} seed={it.seed} />}
          {it.kind === 'blockpine' && <BlockPine leaf={tree} s={it.scale} />}
          {it.kind === 'mound' && <BlockMound top={moundTop} s={it.scale} seed={it.seed} />}
          {it.kind === 'ice' && <IceBlock s={it.scale} seed={it.seed} />}
          {it.kind === 'mountain' && <BlockMountain s={it.scale * 1.6} seed={it.seed} />}
          {it.kind === 'building' && <Building s={it.scale} seed={it.seed} />}
          {it.kind === 'ferris' && <FerrisWheel s={it.scale * 1.2} />}
          {it.kind === 'balloon' && <Balloon s={it.scale} seed={it.seed} />}
          {it.kind === 'extra' && renderExtra(it)}
        </group>
      ))}
    </group>
  )
}
