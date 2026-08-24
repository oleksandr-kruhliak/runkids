import { useMemo } from 'react'
import * as THREE from 'three'
import { LANE_SPACING, NUM_LANES, Track } from '../track/build'
import { EnvParams, SceneryExtra } from './model'

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

// ---- Scatter --------------------------------------------------------------

type Kind = 'pine' | 'round' | 'rock' | 'bush' | 'extra'

interface Item {
  key: number
  kind: Kind
  pos: [number, number, number]
  rot: number
  scale: number
  seed: number
}

export default function Scenery({ track, env }: { track: Track; env: EnvParams }) {
  const { density, tree, extra } = env.scenery

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
      const kind: Kind =
        extra !== 'none' && roll < 0.14
          ? 'extra'
          : roll < 0.5
            ? 'pine'
            : roll < 0.74
              ? 'round'
              : roll < 0.87
                ? 'rock'
                : 'bush'
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
  }, [track, density, extra])

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

  return (
    <group>
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
