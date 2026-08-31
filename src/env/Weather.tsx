import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// Living-atmosphere extras: flocks of flying cube birds, and thunderstorm
// lightning (ambient flash + a jagged voxel bolt).

const rnd = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

const BIRD_COLORS = ['#3a3a42', '#2e8ae8', '#f2f2ee', '#e8722e']
const CUBES_PER_BIRD = 3 // body + two wings

/**
 * How far out ambient effects may sit. Everything here is only ever seen from
 * wherever the camera is, so on a course bigger than this they follow the
 * viewer rather than scaling with the course and drifting out of shot.
 */
const LOCAL = 90

/** Small V-formation flocks slowly circling the sky above the world. */
export function Birds({
  center,
  radius,
  flocks,
}: {
  center: THREE.Vector3
  radius: number
  flocks: number
}) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])

  const flock = useMemo(
    () =>
      Array.from({ length: flocks }, (_, i) => ({
        n: 4 + Math.floor(rnd(i * 3 + 1) * 3),
        h: 12 + rnd(i * 5 + 2) * 10,
        r: Math.min(radius, LOCAL) * (0.45 + rnd(i * 7 + 3) * 0.6) + 8,
        speed: (0.05 + rnd(i * 11 + 4) * 0.035) * (i % 2 === 0 ? 1 : -1),
        phase: rnd(i * 13 + 5) * Math.PI * 2,
        flap: 7 + rnd(i * 17 + 6) * 4,
        color: BIRD_COLORS[i % BIRD_COLORS.length],
      })),
    [flocks, radius],
  )
  // Anchor the flight paths near the viewer on a big course: circling the
  // bounding centre would park them hundreds of units off-screen.
  const anchor = useMemo(() => new THREE.Vector3(), [])

  const total = flock.reduce((sum, f) => sum + f.n, 0) * CUBES_PER_BIRD

  useFrame((state) => {
    const inst = ref.current
    if (!inst) return
    const t = state.clock.elapsedTime
    anchor.set(
      radius > LOCAL ? state.camera.position.x : center.x,
      0,
      radius > LOCAL ? state.camera.position.z : center.z,
    )
    let idx = 0
    for (const f of flock) {
      const a = t * f.speed + f.phase
      const heading = a + (f.speed > 0 ? Math.PI / 2 : -Math.PI / 2)
      const hx = Math.cos(heading)
      const hz = Math.sin(heading)
      for (let b = 0; b < f.n; b++) {
        const k = b - (f.n - 1) / 2
        // V formation: trail behind and to the side of the leader
        const backX = -hx * Math.abs(k) * 1.3 + hz * k * 1.0
        const backZ = -hz * Math.abs(k) * 1.3 - hx * k * 1.0
        const x = anchor.x + Math.cos(a) * f.r + backX
        const z = anchor.z + Math.sin(a) * f.r + backZ
        const y = f.h + Math.sin(t * 1.2 + b) * 0.4
        const flap = Math.sin(t * f.flap + b * 1.7)
        // body
        dummy.position.set(x, y, z)
        dummy.rotation.set(0, -heading, 0)
        dummy.scale.set(0.55, 0.22, 0.3)
        dummy.updateMatrix()
        inst.setMatrixAt(idx++, dummy.matrix)
        // wings flap by tilting around the body
        for (const side of [-1, 1]) {
          dummy.position.set(x - hz * side * 0.35, y + Math.abs(flap) * 0.22, z + hx * side * 0.35)
          dummy.rotation.set(0, -heading, side * flap * 0.7)
          dummy.scale.set(0.34, 0.06, 0.5)
          dummy.updateMatrix()
          inst.setMatrixAt(idx++, dummy.matrix)
        }
      }
    }
    inst.instanceMatrix.needsUpdate = true
  })

  if (flocks <= 0) return null
  return (
    <instancedMesh
      key={total}
      ref={(inst) => {
        ;(ref as React.MutableRefObject<THREE.InstancedMesh | null>).current = inst
        if (!inst) return
        const c = new THREE.Color()
        let idx = 0
        for (const f of flock) {
          for (let b = 0; b < f.n; b++) {
            c.set(f.color)
            for (let k = 0; k < CUBES_PER_BIRD; k++) inst.setColorAt(idx++, c)
          }
        }
        if (inst.instanceColor) inst.instanceColor.needsUpdate = true
      }}
      args={[undefined, undefined, total]}
      frustumCulled={false}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.9} flatShading />
    </instancedMesh>
  )
}

/** Thunderstorm lightning: random ambient flashes with a jagged voxel bolt. */
export function Lightning({ center, radius }: { center: THREE.Vector3; radius: number }) {
  const state = useRef({ next: 2.5, until: 0, x: 0, z: 0, seed: 1 })
  const light = useRef<THREE.AmbientLight>(null)
  const bolt = useRef<THREE.Group>(null)

  // A fixed jagged bolt shape, repositioned per strike.
  const segments = useMemo(() => {
    const out: { p: [number, number, number]; s: [number, number, number] }[] = []
    let x = 0
    let z = 0
    for (let y = 24; y > 0; y -= 2) {
      x += (rnd(y * 7 + 1) - 0.5) * 2.4
      z += (rnd(y * 13 + 2) - 0.5) * 1.6
      out.push({ p: [x, y, z], s: [0.35, 2.4, 0.35] })
      if (y === 12) out.push({ p: [x + 2, y - 1, z], s: [0.25, 3.2, 0.25] }) // fork
    }
    return out
  }, [])

  useFrame((frameState) => {
    const t = frameState.clock.elapsedTime
    const st = state.current
    if (t > st.next) {
      st.until = t + 0.16 + rnd(st.seed) * 0.14
      st.next = t + 3.5 + rnd(st.seed + 1) * 5.5
      // Strike within sight of the viewer. Scaled to the course's bounds, a
      // long one threw every bolt well outside the fog, so the storm flashed
      // but nothing was ever there to see.
      const spread = Math.min(radius, LOCAL) * 1.6
      const ax = radius > LOCAL ? frameState.camera.position.x : center.x
      const az = radius > LOCAL ? frameState.camera.position.z : center.z
      st.x = ax + (rnd(st.seed + 2) - 0.5) * spread
      st.z = az + (rnd(st.seed + 3) - 0.5) * spread
      st.seed += 7
    }
    const on = t < st.until
    if (light.current) light.current.intensity = on ? 1.7 + Math.sin(t * 90) * 0.8 : 0
    if (bolt.current) {
      bolt.current.visible = on
      bolt.current.position.set(st.x, 0, st.z)
    }
  })

  return (
    <group>
      <ambientLight ref={light} color="#cdd8ff" intensity={0} />
      <group ref={bolt} visible={false}>
        {segments.map((seg, i) => (
          <mesh key={i} position={seg.p}>
            <boxGeometry args={seg.s} />
            <meshBasicMaterial color={i % 3 ? '#ffffff' : '#cdd8ff'} fog={false} />
          </mesh>
        ))}
      </group>
    </group>
  )
}
