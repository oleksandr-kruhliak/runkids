import { useMemo } from 'react'
import * as THREE from 'three'
import { Segment, TRACK_WIDTH } from './build'

const W = TRACK_WIDTH - 0.3

interface Placed {
  key: number
  type: Segment['type']
  position: [number, number, number]
  quaternion: [number, number, number, number]
  length: number
}

/** Renders themed meshes for each obstacle segment, oriented along the track. */
export default function Obstacles({ segments }: { segments: Segment[] }) {
  const placed = useMemo<Placed[]>(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const x = new THREE.Vector3()
    const y = new THREE.Vector3()
    return segments.map((s, i) => {
      x.crossVectors(s.up, s.tangent).normalize()
      y.crossVectors(s.tangent, x).normalize()
      m.makeBasis(x, y, s.tangent)
      q.setFromRotationMatrix(m)
      return {
        key: i,
        type: s.type,
        position: [s.center.x, s.center.y, s.center.z],
        quaternion: [q.x, q.y, q.z, q.w],
        length: Math.max(s.length, 1),
      }
    })
  }, [segments])

  return (
    <>
      {placed.map((p) => (
        <group key={p.key} position={p.position} quaternion={p.quaternion}>
          {p.type === 'water' && (
            <mesh position={[0, 0.22, 0]}>
              <boxGeometry args={[W, 0.42, p.length]} />
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
                <coneGeometry args={[0.7, 1.1, 4]} />
                <meshStandardMaterial color="#ffd21a" emissive="#ffa000" emissiveIntensity={0.6} />
              </mesh>
            ))}

          {p.type === 'spring' && (
            <group>
              <mesh position={[0, 0.18, 0]}>
                <cylinderGeometry args={[1.0, 1.0, 0.34, 20]} />
                <meshStandardMaterial color="#e53935" />
              </mesh>
              <mesh position={[0, 0.4, 0]}>
                <cylinderGeometry args={[0.7, 0.7, 0.16, 20]} />
                <meshStandardMaterial color="#ffffff" />
              </mesh>
            </group>
          )}

          {p.type === 'gap' &&
            [-p.length / 2, p.length / 2].map((z, i) => (
              <mesh key={i} position={[0, 0.14, z]}>
                <boxGeometry args={[TRACK_WIDTH, 0.28, 0.4]} />
                <meshStandardMaterial color="#ffca28" emissive="#ff6f00" emissiveIntensity={0.3} />
              </mesh>
            ))}
        </group>
      ))}
    </>
  )
}
