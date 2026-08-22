import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { LANE_WIDTH, ObstaclePlacement, spinnerAngle, stopperUp } from './build'

const W = LANE_WIDTH - 0.2

/**
 * A "wheeling stick": a post at the lane edge with an arm that sweeps across
 * the road. Its rotation is synced to the same clock the rider logic reads,
 * so the animal is knocked back exactly when the arm passes over it.
 */
function Spinner({ phase }: { phase: number }) {
  const arm = useRef<THREE.Group>(null)
  useFrame((state) => {
    if (arm.current) arm.current.rotation.y = spinnerAngle(phase, state.clock.elapsedTime)
  })
  const edgeX = LANE_WIDTH / 2 + 0.25
  const armLen = LANE_WIDTH + 0.6
  return (
    <group>
      {/* Post at the side of the lane */}
      <mesh position={[edgeX, 0.55, 0]}>
        <cylinderGeometry args={[0.12, 0.15, 1.1, 12]} />
        <meshStandardMaterial color="#455a64" metalness={0.4} roughness={0.5} />
      </mesh>
      {/* Arm pivots at the post and reaches across the road */}
      <group ref={arm} position={[edgeX, 0.95, 0]}>
        <mesh position={[-armLen / 2, 0, 0]}>
          <boxGeometry args={[armLen, 0.18, 0.18]} />
          <meshStandardMaterial color="#e53935" />
        </mesh>
        <mesh position={[-armLen + 0.15, 0, 0]}>
          <boxGeometry args={[0.34, 0.36, 0.36]} />
          <meshStandardMaterial color="#ffca28" emissive="#ff8f00" emissiveIntensity={0.4} />
        </mesh>
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
export default function Obstacles({ placements }: { placements: ObstaclePlacement[] }) {
  return (
    <>
      {placements.map((p) => (
        <group key={p.key} position={p.position} quaternion={p.quaternion}>
          {p.type === 'water' && (
            <mesh position={[0, 0.2, 0]}>
              <boxGeometry args={[W, 0.4, p.length]} />
              <meshStandardMaterial
                color="#2196f3"
                transparent
                opacity={0.72}
                metalness={0.2}
                roughness={0.15}
              />
            </mesh>
          )}

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
