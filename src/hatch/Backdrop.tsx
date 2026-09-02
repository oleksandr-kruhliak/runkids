import { useMemo } from 'react'
import { EnvParams } from '../env/model'
import { rng, shade } from './eggGeo'

// What's behind the nests. The stage is a proscenium — the camera only ever
// looks one way, from in front — so instead of the race's scatter-around-the-
// course scenery this is built in bands of depth, all of it strictly behind
// the row so nothing can ever wander between the camera and an egg.
//
// Everything takes its colours from the chosen world, so a beach gets sand
// dunes and palms rather than the same green cubes as a meadow.

/** Nothing stands closer to the camera than this. */
const FRONT = -4.5

interface Band {
  /** Depth range for this layer. */
  z: [number, number]
  /** How wide it spreads, as a multiple of the row's own span. */
  spread: number
  count: number
  scale: [number, number]
}

/** Near, middle and far: three depths, so the ground doesn't read as flat. */
const BANDS: Band[] = [
  { z: [FRONT, -13], spread: 1.5, count: 26, scale: [0.5, 1.1] },
  { z: [-14, -30], spread: 2.1, count: 30, scale: [1.0, 2.2] },
  { z: [-34, -62], spread: 3.2, count: 22, scale: [2.2, 4.2] },
]

type PropKind = 'bush' | 'tree' | 'rock' | 'tuft'

interface Prop {
  kind: PropKind
  pos: [number, number, number]
  scale: number
  spin: number
  /** Small per-prop colour shift so a stand of trees isn't one flat green. */
  tint: number
}

/** A rounded clump of foliage — two or three boxes, never a lone cube. */
function Bush({ color }: { color: string }) {
  return (
    <group>
      <mesh castShadow receiveShadow position={[0, 0.34, 0]}>
        <boxGeometry args={[0.9, 0.68, 0.85]} />
        <meshStandardMaterial color={color} flatShading />
      </mesh>
      <mesh castShadow position={[0.3, 0.62, -0.1]}>
        <boxGeometry args={[0.5, 0.42, 0.5]} />
        <meshStandardMaterial color={color} flatShading />
      </mesh>
      <mesh castShadow position={[-0.28, 0.5, 0.14]}>
        <boxGeometry args={[0.42, 0.36, 0.44]} />
        <meshStandardMaterial color={color} flatShading />
      </mesh>
    </group>
  )
}

/** Trunk plus a stepped canopy. */
function Tree({ color, bark }: { color: string; bark: string }) {
  return (
    <group>
      <mesh castShadow position={[0, 0.55, 0]}>
        <boxGeometry args={[0.26, 1.1, 0.26]} />
        <meshStandardMaterial color={bark} flatShading />
      </mesh>
      <mesh castShadow position={[0, 1.35, 0]}>
        <boxGeometry args={[1.35, 0.7, 1.3]} />
        <meshStandardMaterial color={color} flatShading />
      </mesh>
      <mesh castShadow position={[0, 1.9, 0]}>
        <boxGeometry args={[0.95, 0.55, 0.9]} />
        <meshStandardMaterial color={color} flatShading />
      </mesh>
      <mesh castShadow position={[0, 2.3, 0]}>
        <boxGeometry args={[0.5, 0.36, 0.5]} />
        <meshStandardMaterial color={color} flatShading />
      </mesh>
    </group>
  )
}

/** A boulder: two chunks, tilted so it doesn't read as a crate. */
function Rock({ color }: { color: string }) {
  return (
    <group>
      <mesh castShadow receiveShadow position={[0, 0.32, 0]} rotation={[0.1, 0.4, 0.08]}>
        <boxGeometry args={[0.95, 0.64, 0.8]} />
        <meshStandardMaterial color={color} flatShading />
      </mesh>
      <mesh castShadow position={[0.34, 0.66, 0.1]} rotation={[0.2, 0.9, -0.12]}>
        <boxGeometry args={[0.5, 0.4, 0.44]} />
        <meshStandardMaterial color={color} flatShading />
      </mesh>
    </group>
  )
}

/** A little clump of grass blades / beach reeds, for ground texture. */
function Tuft({ color }: { color: string }) {
  return (
    <group>
      {[-0.12, 0, 0.13].map((x, i) => (
        <mesh key={i} position={[x, 0.22 + i * 0.04, i * 0.06]} rotation={[0, 0, x * 1.6]}>
          <boxGeometry args={[0.09, 0.46 + i * 0.1, 0.09]} />
          <meshStandardMaterial color={color} flatShading />
        </mesh>
      ))}
    </group>
  )
}

/**
 * Rolling hills on the horizon — without them the world just stops at a flat
 * line where the fog begins.
 *
 * Each hill is a stack of narrowing slabs rather than one box: a single box
 * presents a flat face and a level top edge, which from the front reads as a
 * wall. Stepping it gives the silhouette a peak, which is what says "hill" in
 * cube art.
 */
function Hills({ span, color }: { span: number; color: string }) {
  const hills = useMemo(() => {
    const rand = rng(8931)
    const reach = span * 2 + 110
    return Array.from({ length: 18 }, (_, i) => {
      const w = 24 + rand() * 38
      const h = 5 + rand() * 11
      const d = 20 + rand() * 18
      // Three tiers, each narrower and shorter than the one below it.
      const tiers = [
        { w: 1, h: 0.52, y: 0 },
        { w: 0.66, h: 0.32, y: 0.52 },
        { w: 0.34, h: 0.24, y: 0.8 },
      ].map((t) => ({
        size: [w * t.w, h * t.h, d * (0.5 + t.w * 0.5)] as [number, number, number],
        // Stacked from a base that starts below ground, so no hill floats.
        y: -2 + h * (t.y + t.h / 2),
        lean: (rand() - 0.5) * w * 0.12,
      }))
      return {
        x: -reach / 2 + (i / 17) * reach + (rand() - 0.5) * 14,
        z: -78 - rand() * 46,
        rot: (rand() - 0.5) * 0.5,
        tint: 0.06 + rand() * 0.16,
        tiers,
      }
    })
  }, [span])

  return (
    <group>
      {hills.map((h, i) => (
        <group key={i} position={[h.x, 0, h.z]} rotation={[0, h.rot, 0]}>
          {h.tiers.map((t, n) => (
            <mesh key={n} position={[t.lean, t.y, 0]}>
              <boxGeometry args={t.size} />
              {/* Darkened with distance so the ridge sits behind everything. */}
              <meshStandardMaterial color={shade(color, h.tint)} flatShading />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

export default function Backdrop({ span, env }: { span: number; env: EnvParams }) {
  const foliage = env.scenery.tree
  const density = env.scenery.density

  const props = useMemo<Prop[]>(() => {
    const rand = rng(1971)
    const out: Prop[] = []
    // Density scales what the chosen world asks for, but never to nothing.
    const scale = 0.4 + (density / 100) * 1.1
    for (const band of BANDS) {
      const n = Math.round(band.count * scale)
      for (let i = 0; i < n; i++) {
        const roll = rand()
        const kind: PropKind =
          roll < 0.42 ? 'bush' : roll < 0.72 ? 'tree' : roll < 0.88 ? 'rock' : 'tuft'
        out.push({
          kind,
          pos: [
            (rand() - 0.5) * (span + 26) * band.spread,
            0,
            band.z[0] + rand() * (band.z[1] - band.z[0]),
          ],
          scale: band.scale[0] + rand() * (band.scale[1] - band.scale[0]),
          spin: rand() * Math.PI * 2,
          tint: (rand() - 0.5) * 0.22,
        })
      }
    }
    return out
  }, [span, density])

  // Tones pulled from the world so nothing looks pasted in from another one.
  const bark = useMemo(() => shade(foliage, 0.45), [foliage])
  const rock = useMemo(() => shade(env.ground, 0.28), [env.ground])

  return (
    <group>
      <Hills span={span} color={env.ground} />
      {props.map((p, i) => {
        const tinted = p.tint > 0 ? shade(foliage, p.tint) : foliage
        return (
          <group key={i} position={p.pos} rotation={[0, p.spin, 0]} scale={p.scale}>
            {p.kind === 'bush' && <Bush color={tinted} />}
            {p.kind === 'tree' && <Tree color={tinted} bark={bark} />}
            {p.kind === 'rock' && <Rock color={rock} />}
            {p.kind === 'tuft' && <Tuft color={shade(foliage, -0.12)} />}
          </group>
        )
      })}
    </group>
  )
}
