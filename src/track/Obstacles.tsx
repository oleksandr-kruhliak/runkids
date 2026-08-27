import { MutableRefObject, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import {
  FIRE_ON,
  FIRE_PERIOD,
  GEYSER_ON,
  GEYSER_PERIOD,
  ObstaclePlacement,
  chomperClosed,
  fanOn,
  logU,
  pendulumAngle,
  spinnerAngle,
  stopperUp,
} from './build'
import { OBSTACLE_GEO as G, OBSTACLE_GLOW_MAT, OBSTACLE_MAT } from './obstacleGeo'
import { focusGain, sfx } from '../audio'

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
        sfx('smash', focusGain(lane))
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

/** Flame columns that flare up on the fire rhythm. */
function FireJets({ phase }: { phase: number }) {
  const flames = useRef<THREE.Group>(null)
  useFrame((state) => {
    if (!flames.current) return
    let p = (state.clock.elapsedTime + phase) % FIRE_PERIOD
    if (p < 0) p += FIRE_PERIOD
    // quick ramp up, hold, quick die-down
    const k = p < FIRE_ON ? Math.min(1, p * 6, (FIRE_ON - p) * 4) : 0
    flames.current.children.forEach((c, i) => {
      c.scale.set(1, Math.max(0.02, k * (0.85 + (i % 3) * 0.12)), 1)
    })
  })
  return (
    <group>
      <mesh geometry={G.fireBase} material={OBSTACLE_MAT} receiveShadow />
      <group ref={flames}>
        {[-1.5, -0.5, 0.5, 1.5].map((z, i) => (
          <group key={i} position={[0, 0.18, z]} scale={[1, 0.02, 1]}>
            <mesh geometry={G.fireFlame} material={OBSTACLE_GLOW_MAT} />
          </group>
        ))}
      </group>
    </group>
  )
}

/** The pendulum axe swings on its gallows frame, synced to the strike logic. */
function PendulumAxe({ phase }: { phase: number }) {
  const blade = useRef<THREE.Group>(null)
  useFrame((state) => {
    if (blade.current) blade.current.rotation.z = pendulumAngle(phase, state.clock.elapsedTime)
  })
  return (
    <group>
      <mesh geometry={G.pendFrame} material={OBSTACLE_MAT} castShadow />
      <group ref={blade} position={[0, 2.65, 0]}>
        <mesh geometry={G.pendBlade} material={OBSTACLE_MAT} castShadow />
      </group>
    </group>
  )
}

/** The geyser jet grows out of the crater during its eruption window. */
function Geyser({ phase }: { phase: number }) {
  const jet = useRef<THREE.Group>(null)
  useFrame((state) => {
    if (!jet.current) return
    let p = (state.clock.elapsedTime + phase) % GEYSER_PERIOD
    if (p < 0) p += GEYSER_PERIOD
    const k = p < GEYSER_ON ? Math.min(1, p * 7, (GEYSER_ON - p) * 3) : 0
    jet.current.scale.set(1, Math.max(0.02, k), 1)
  })
  return (
    <group>
      <mesh geometry={G.geyserBase} material={OBSTACLE_MAT} castShadow />
      <group ref={jet} scale={[1, 0.02, 1]}>
        <mesh geometry={G.geyserJet} material={OBSTACLE_MAT} />
      </group>
    </group>
  )
}

/** Croc head whose upper jaw snaps shut on the chomp rhythm. */
function Chomper({ phase }: { phase: number }) {
  const jaw = useRef<THREE.Group>(null)
  useFrame((state) => {
    if (!jaw.current) return
    const target = chomperClosed(phase, state.clock.elapsedTime) ? -0.04 : -0.85
    jaw.current.rotation.x += (target - jaw.current.rotation.x) * 0.25
  })
  return (
    <group>
      <mesh geometry={G.chomperBase} material={OBSTACLE_MAT} castShadow />
      <group ref={jaw} position={[0, 0.28, 0.85]} rotation={[-0.85, 0, 0]}>
        <mesh geometry={G.chomperJaw} material={OBSTACLE_MAT} castShadow />
      </group>
    </group>
  )
}

/** Caged fan: rotor always turns, wind streaks appear while it blows. */
function Fan({ phase }: { phase: number }) {
  const rotor = useRef<THREE.Group>(null)
  const wind = useRef<THREE.Group>(null)
  useFrame((state, delta) => {
    const t = state.clock.elapsedTime
    const blowing = fanOn(phase, t)
    if (rotor.current) rotor.current.rotation.z += delta * (blowing ? 14 : 2.5)
    if (wind.current) wind.current.visible = blowing
  })
  return (
    <group>
      <mesh geometry={G.fanFrame} material={OBSTACLE_MAT} castShadow />
      <group ref={rotor} position={[0, 1.15, 2.66]}>
        <mesh geometry={G.fanBlades} material={OBSTACLE_MAT} />
      </group>
      <group ref={wind} visible={false}>
        <mesh geometry={G.fanWind} material={OBSTACLE_GLOW_MAT} />
      </group>
    </group>
  )
}

/** Rolling log: sweeps its zone toward the oncoming racer, then respawns. */
function RollingLog({ phase, length }: { phase: number; length: number }) {
  const log = useRef<THREE.Group>(null)
  useFrame((state) => {
    if (!log.current) return
    const u = logU(phase, state.clock.elapsedTime)
    if (u < 0) {
      log.current.scale.setScalar(0.01) // resting between sweeps
      return
    }
    const z = length / 2 - u * length
    log.current.position.set(0, 0.32, z)
    log.current.rotation.x = -u * length / 0.3 // roll with travel
    // pop in/out at the ends
    const k = Math.min(1, u * 8, (1 - u) * 8)
    log.current.scale.setScalar(Math.max(0.01, k))
  })
  return (
    <group ref={log} position={[0, 0.32, 0]}>
      <mesh geometry={G.log} material={OBSTACLE_MAT} castShadow />
    </group>
  )
}

/** Slowly turning swirl ring (entry or exit). */
function PortalRing({ exit }: { exit?: boolean }) {
  const ring = useRef<THREE.Group>(null)
  useFrame((_, delta) => {
    if (ring.current) ring.current.rotation.z += delta * (exit ? -0.8 : 0.8)
  })
  return (
    <group>
      <group ref={ring} position={[0, 1.15, 0]}>
        <mesh geometry={exit ? G.portalExit : G.portalEntry} material={OBSTACLE_GLOW_MAT} position={[0, -1.15, 0]} />
      </group>
    </group>
  )
}

/** Bonus hoop: the golden ring spins gently. */
function SpeedRing() {
  const hoop = useRef<THREE.Group>(null)
  useFrame((state) => {
    if (hoop.current) hoop.current.rotation.z = Math.sin(state.clock.elapsedTime * 1.4) * 0.18
  })
  return (
    <group>
      <mesh geometry={G.ringBase} material={OBSTACLE_MAT} castShadow />
      <group ref={hoop} position={[0, 1.2, 0]}>
        <mesh geometry={G.ringGlow} material={OBSTACLE_GLOW_MAT} position={[0, -1.2, 0]} />
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

          {p.type === 'ice' && <mesh geometry={G.ice} material={OBSTACLE_MAT} receiveShadow />}

          {p.type === 'web' && <mesh geometry={G.web} material={OBSTACLE_MAT} receiveShadow />}

          {p.type === 'magnet' && (
            <group>
              <mesh geometry={G.magnetBase} material={OBSTACLE_MAT} castShadow />
              <mesh geometry={G.magnetGlow} material={OBSTACLE_GLOW_MAT} />
            </group>
          )}

          {p.type === 'fire' && <FireJets phase={p.phase} />}

          {p.type === 'pendulum' && <PendulumAxe phase={p.phase} />}

          {p.type === 'geyser' && <Geyser phase={p.phase} />}

          {p.type === 'chomper' && <Chomper phase={p.phase} />}

          {p.type === 'fan' && <Fan phase={p.phase} />}

          {p.type === 'banana' && <mesh geometry={G.banana} material={OBSTACLE_MAT} castShadow />}

          {p.type === 'portal' && <PortalRing />}

          {p.type === 'log' && <RollingLog phase={p.phase} length={p.length} />}

          {p.type === 'ring' && <SpeedRing />}
        </group>
      ))}
      {/* Portal exit rings live at their own spot on the track. */}
      {placements
        .filter((p) => p.type === 'portal' && p.exitPosition)
        .map((p) => (
          <group key={`${p.key}-exit`} position={p.exitPosition} quaternion={p.exitQuaternion}>
            <PortalRing exit />
          </group>
        ))}
    </>
  )
}
