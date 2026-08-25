import { MutableRefObject, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { ObstaclePlacement, spinnerAngle, stopperUp } from './build'
import { OBSTACLE_GEO as G, OBSTACLE_GLOW_MAT, OBSTACLE_MAT } from './obstacleGeo'

// Obstacles are voxel-built (100-200 blocks each) from shared merged
// geometries — see obstacleGeo.ts. Only the moving parts (spinner arm,
// stopper bar, crate fragments) are separate meshes.

/**
 * A low swinging double-headed hammer: a voxel tower at the lane edge with a
 * plank arm carrying a mallet head on BOTH ends, swinging back and forth over
 * the road. Rotation is synced to the rider logic.
 */
function Spinner({ phase }: { phase: number }) {
  const arm = useRef<THREE.Group>(null)
  useFrame((state) => {
    if (arm.current) arm.current.rotation.y = spinnerAngle(phase, state.clock.elapsedTime)
  })
  return (
    <group>
      <mesh geometry={G.spinnerTower} material={OBSTACLE_MAT} castShadow />
      <group ref={arm} position={[1.1, 0.42, 0]}>
        <mesh geometry={G.spinnerArm} material={OBSTACLE_MAT} castShadow />
      </group>
    </group>
  )
}

const FRAG_COUNT = 12
const EXPLODE_DUR = 1.1 // seconds

/**
 * A stack of plank crates on the road. When the lane's animal passes their
 * position they burst into flying plank fragments, then re-form for next lap.
 */
function Crates({
  lane,
  dist,
  distancesRef,
  length,
}: {
  lane: number
  dist: number
  distancesRef: MutableRefObject<number[]>
  length: number
}) {
  const intact = useRef<THREE.Group>(null)
  const frag = useRef<THREE.Group>(null)
  const st = useRef({ exploding: false, tStart: 0, prev: -1 })

  // Deterministic fragment velocities.
  const vels = useMemo(
    () =>
      Array.from({ length: FRAG_COUNT }, (_, i) => {
        const a = (i / FRAG_COUNT) * Math.PI * 2 + i
        const r = 2 + (i % 3)
        return { x: Math.cos(a) * r, y: 2.5 + (i % 4) * 0.6, z: Math.sin(a) * r, spin: 4 + i }
      }),
    [],
  )

  useFrame((state) => {
    const t = state.clock.elapsedTime
    const d = distancesRef.current[lane] ?? 0
    const s = st.current

    if (!s.exploding && s.prev >= 0 && length > 0) {
      const crossed =
        s.prev <= d ? dist > s.prev && dist <= d : dist > s.prev || dist <= d
      if (crossed) {
        s.exploding = true
        s.tStart = t
        if (intact.current) intact.current.visible = false
        if (frag.current) frag.current.visible = true
      }
    }
    s.prev = d

    if (s.exploding && frag.current) {
      const e = t - s.tStart
      const k = Math.max(0, 1 - e / EXPLODE_DUR)
      frag.current.children.forEach((c, i) => {
        const v = vels[i]
        c.position.set(v.x * e, 0.5 + v.y * e - 3 * e * e, v.z * e)
        c.rotation.set(v.spin * e, v.spin * e * 0.7, 0)
        c.scale.setScalar(k * (0.8 + (i % 3) * 0.25))
      })
      if (e > EXPLODE_DUR) {
        s.exploding = false
        if (frag.current) frag.current.visible = false
        if (intact.current) intact.current.visible = true
      }
    }
  })

  return (
    <group>
      <group ref={intact}>
        <mesh geometry={G.crateStack} material={OBSTACLE_MAT} castShadow />
      </group>
      <group ref={frag} visible={false}>
        {vels.map((_, i) => (
          <mesh key={i} geometry={G.crateFragment} material={OBSTACLE_MAT} position={[0, 0.5, 0]} />
        ))}
      </group>
    </group>
  )
}

/**
 * A striped toll gate: two lamp-topped towers flank the lane and a red/white
 * bar (with a hanging stop sign) drops to road level to block, then lifts
 * overhead to clear. Motion is synced to the rider logic.
 */
function Stopper({ phase }: { phase: number }) {
  const bar = useRef<THREE.Group>(null)
  useFrame((state) => {
    if (!bar.current) return
    const target = stopperUp(phase, state.clock.elapsedTime) ? 0.75 : 2.3
    bar.current.position.y += (target - bar.current.position.y) * 0.14
  })
  return (
    <group>
      <mesh geometry={G.stopperPosts} material={OBSTACLE_MAT} castShadow />
      <group ref={bar} position={[0, 2.3, 0]}>
        <mesh geometry={G.stopperBar} material={OBSTACLE_MAT} castShadow />
      </group>
    </group>
  )
}

/** Renders themed voxel meshes for each placed obstacle, along the track. */
export default function Obstacles({
  placements,
  distancesRef,
  length,
}: {
  placements: ObstaclePlacement[]
  distancesRef: MutableRefObject<number[]>
  length: number
}) {
  return (
    <>
      {placements.map((p) => (
        <group key={p.key} position={p.position} quaternion={p.quaternion}>
          {p.type === 'water' && <mesh geometry={G.water} material={OBSTACLE_MAT} receiveShadow />}

          {p.type === 'mud' && <mesh geometry={G.mud} material={OBSTACLE_MAT} receiveShadow />}

          {p.type === 'boost' && (
            <group>
              <mesh geometry={G.boostBase} material={OBSTACLE_MAT} receiveShadow />
              <mesh geometry={G.boostGlow} material={OBSTACLE_GLOW_MAT} />
            </group>
          )}

          {p.type === 'trampoline' && (
            <group>
              <mesh geometry={G.trampolineBase} material={OBSTACLE_MAT} castShadow />
              <mesh geometry={G.trampolineGlow} material={OBSTACLE_GLOW_MAT} />
            </group>
          )}

          {p.type === 'stopper' && <Stopper phase={p.phase} />}

          {p.type === 'spinner' && <Spinner phase={p.phase} />}

          {p.type === 'crates' && (
            <Crates lane={p.lane} dist={p.dist} distancesRef={distancesRef} length={length} />
          )}

          {p.type === 'gap' && <mesh geometry={G.gap} material={OBSTACLE_MAT} castShadow />}
        </group>
      ))}
    </>
  )
}
