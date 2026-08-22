import { LANE_WIDTH, ObstaclePlacement } from './build'

const W = LANE_WIDTH - 0.2

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
              {/* Springy legs */}
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
              {/* Dark round frame */}
              <mesh position={[0, 0.5, 0]}>
                <cylinderGeometry args={[1.0, 1.0, 0.16, 24]} />
                <meshStandardMaterial color="#37474f" />
              </mesh>
              {/* Bouncy blue mat */}
              <mesh position={[0, 0.59, 0]}>
                <cylinderGeometry args={[0.82, 0.82, 0.08, 24]} />
                <meshStandardMaterial color="#26c6da" emissive="#0097a7" emissiveIntensity={0.3} />
              </mesh>
              {/* Up arrows to signal "bounce" */}
              {[0.9, 1.5].map((y, i) => (
                <mesh key={i} position={[0, y, 0]} rotation={[0, 0, 0]}>
                  <coneGeometry args={[0.32 - i * 0.08, 0.4, 12]} />
                  <meshStandardMaterial color="#00e5ff" emissive="#00b8d4" emissiveIntensity={0.6} />
                </mesh>
              ))}
            </group>
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
