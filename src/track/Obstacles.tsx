import { MutableRefObject, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { LANE_WIDTH, ObstaclePlacement, spinnerAngle, stopperUp } from './build'

const W = LANE_WIDTH - 0.2

const OCEAN_URL = `${import.meta.env.BASE_URL}models/track/ocean.glb`

/**
 * A pool of water using the Poly ocean tile: scaled to fill the lane
 * (width x obstacle length) with its wave height kept small, sitting on the
 * road surface, and gently bobbing so it reads as living water.
 */
function Water({ length }: { length: number }) {
  const gltf = useGLTF(OCEAN_URL)
  const group = useRef<THREE.Group>(null)

  const object = useMemo(() => {
    const clone = (gltf.scene as THREE.Object3D).clone(true)
    const box = new THREE.Box3().setFromObject(clone)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const sx = size.x || 1
    const sz = size.z || 1
    // Center horizontally, drop the troughs to y=0 (in raw units).
    clone.position.set(-center.x, -box.min.y, -center.z)
    const scaleXZ = W / sx
    const g = new THREE.Group()
    g.add(clone)
    // Map raw X->lane width, raw Z->obstacle length; keep waves proportional.
    g.scale.set(scaleXZ, scaleXZ, length / sz)
    return g
  }, [gltf.scene, length])

  useFrame((state) => {
    if (group.current) group.current.position.y = 0.02 + Math.sin(state.clock.elapsedTime * 1.6) * 0.03
  })

  return (
    <group ref={group}>
      <primitive object={object} />
    </group>
  )
}

/**
 * A low swinging hammer: a short post at the lane edge with a half-lane-length
 * handle and a heavy head that swings back and forth over the road (reversing
 * direction). Rotation is synced to the rider logic, so the animal is knocked
 * back when the hammer passes over it.
 */
function Spinner({ phase }: { phase: number }) {
  const arm = useRef<THREE.Group>(null)
  useFrame((state) => {
    if (arm.current) arm.current.rotation.y = spinnerAngle(phase, state.clock.elapsedTime)
  })
  const edgeX = LANE_WIDTH / 2 + 0.05
  const armLen = LANE_WIDTH / 2 // half the road width
  const armY = 0.42 // low, near the animals' body height
  return (
    <group>
      {/* Short post at the side of the lane */}
      <mesh position={[edgeX, 0.28, 0]}>
        <cylinderGeometry args={[0.13, 0.16, 0.56, 12]} />
        <meshStandardMaterial color="#455a64" metalness={0.4} roughness={0.5} />
      </mesh>
      {/* Hammer pivots at the post and swings across the road, low down */}
      <group ref={arm} position={[edgeX, armY, 0]}>
        {/* Wooden handle */}
        <mesh position={[-armLen / 2, 0, 0]}>
          <boxGeometry args={[armLen, 0.14, 0.14]} />
          <meshStandardMaterial color="#9c6b3f" flatShading />
        </mesh>
        {/* Heavy metal head at the tip */}
        <mesh position={[-armLen, 0, 0]}>
          <boxGeometry args={[0.5, 0.56, 0.92]} />
          <meshStandardMaterial color="#607d8b" metalness={0.5} roughness={0.4} />
        </mesh>
        {[0.46, -0.46].map((z, i) => (
          <mesh key={i} position={[-armLen, 0, z]}>
            <boxGeometry args={[0.54, 0.6, 0.1]} />
            <meshStandardMaterial color="#37474f" metalness={0.4} roughness={0.5} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

const FRAG_COUNT = 10
const EXPLODE_DUR = 1.1 // seconds

/**
 * A stack of crates on the road. When the lane's animal passes their position,
 * they burst into fragments that fly out and shrink, then re-form for next lap.
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
        c.position.set(v.x * e, v.y * e - 3 * e * e, v.z * e)
        c.rotation.set(v.spin * e, v.spin * e * 0.7, 0)
        c.scale.setScalar(k)
      })
      if (e > EXPLODE_DUR) {
        s.exploding = false
        if (frag.current) frag.current.visible = false
        if (intact.current) intact.current.visible = true
      }
    }
  })

  const crates: [number, number, number][] = [
    [-0.5, 0.35, 0],
    [0.5, 0.35, 0],
    [0, 0.35, 0.5],
    [0, 1.05, 0.15],
  ]

  return (
    <group>
      <group ref={intact}>
        {crates.map((c, i) => (
          <mesh key={i} position={c} castShadow>
            <boxGeometry args={[0.66, 0.66, 0.66]} />
            <meshStandardMaterial color={i === 3 ? '#c98a4a' : '#b5793b'} flatShading />
          </mesh>
        ))}
      </group>
      <group ref={frag} visible={false}>
        {vels.map((_, i) => (
          <mesh key={i} position={[0, 0.5, 0]}>
            <boxGeometry args={[0.3, 0.3, 0.3]} />
            <meshStandardMaterial color={i % 2 ? '#9c5f2c' : '#c98a4a'} flatShading />
          </mesh>
        ))}
      </group>
    </group>
  )
}

/** A boom barrier that rises from below the track, holds, then drops. */
function Stopper({ phase }: { phase: number }) {
  const g = useRef<THREE.Group>(null)
  useFrame((state) => {
    if (!g.current) return
    const target = stopperUp(phase, state.clock.elapsedTime) ? 0 : -1.7
    g.current.position.y += (target - g.current.position.y) * 0.18
  })
  return (
    <group ref={g} position={[0, -1.7, 0]}>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (LANE_WIDTH / 2), 0.6, 0]}>
          <boxGeometry args={[0.22, 1.2, 0.22]} />
          <meshStandardMaterial color="#eceff1" />
        </mesh>
      ))}
      <mesh position={[0, 0.95, 0]}>
        <boxGeometry args={[LANE_WIDTH, 0.34, 0.2]} />
        <meshStandardMaterial color="#e53935" />
      </mesh>
      {[-0.55, 0, 0.55].map((x, i) => (
        <mesh key={i} position={[x, 0.95, 0.11]}>
          <boxGeometry args={[0.22, 0.34, 0.02]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
      ))}
    </group>
  )
}

/** Renders themed meshes for each placed obstacle, oriented along the track. */
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
          {p.type === 'water' && <Water length={p.length} />}

          {p.type === 'mud' && (
            <mesh position={[0, 0.07, 0]}>
              <boxGeometry args={[W, 0.14, p.length]} />
              <meshStandardMaterial color="#6d4c2f" roughness={1} />
            </mesh>
          )}

          {p.type === 'boost' &&
            [-p.length / 3, 0, p.length / 3].map((z, i) => (
              <mesh key={i} position={[0, 0.12, z]} rotation={[-Math.PI / 2, 0, 0]}>
                <coneGeometry args={[0.55, 1.0, 4]} />
                <meshStandardMaterial color="#ffd21a" emissive="#ffa000" emissiveIntensity={0.6} />
              </mesh>
            ))}

          {p.type === 'trampoline' && (
            <group>
              {[
                [-0.6, -0.6],
                [0.6, -0.6],
                [-0.6, 0.6],
                [0.6, 0.6],
              ].map(([x, z], i) => (
                <mesh key={i} position={[x, 0.25, z]}>
                  <cylinderGeometry args={[0.08, 0.08, 0.5, 8]} />
                  <meshStandardMaterial color="#9e9e9e" metalness={0.6} roughness={0.3} />
                </mesh>
              ))}
              <mesh position={[0, 0.5, 0]}>
                <cylinderGeometry args={[1.0, 1.0, 0.16, 24]} />
                <meshStandardMaterial color="#37474f" />
              </mesh>
              <mesh position={[0, 0.59, 0]}>
                <cylinderGeometry args={[0.82, 0.82, 0.08, 24]} />
                <meshStandardMaterial color="#26c6da" emissive="#0097a7" emissiveIntensity={0.3} />
              </mesh>
              {[0.9, 1.5].map((y, i) => (
                <mesh key={i} position={[0, y, 0]}>
                  <coneGeometry args={[0.32 - i * 0.08, 0.4, 12]} />
                  <meshStandardMaterial color="#00e5ff" emissive="#00b8d4" emissiveIntensity={0.6} />
                </mesh>
              ))}
            </group>
          )}

          {p.type === 'stopper' && <Stopper phase={p.phase} />}

          {p.type === 'spinner' && <Spinner phase={p.phase} />}

          {p.type === 'crates' && (
            <Crates lane={p.lane} dist={p.dist} distancesRef={distancesRef} length={length} />
          )}

          {p.type === 'gap' &&
            [-p.length / 2, p.length / 2].map((z, i) => (
              <mesh key={i} position={[0, 0.14, z]}>
                <boxGeometry args={[LANE_WIDTH, 0.28, 0.4]} />
                <meshStandardMaterial color="#ffca28" emissive="#ff6f00" emissiveIntensity={0.3} />
              </mesh>
            ))}
        </group>
      ))}
    </>
  )
}

useGLTF.preload(OCEAN_URL)
