import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { RIDE_OFFSET, Track, sampleTrack } from './build'
import Animal, { ANIMAL_PALETTES } from './Animal'

interface RidersProps {
  track: Track
  playing: boolean
  count: number
}

const BASE_SPEED = 7 // world units / second

export default function Riders({ track, playing, count }: RidersProps) {
  const groupRefs = useRef<(THREE.Group | null)[]>([])

  const riders = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        colors: ANIMAL_PALETTES[i % ANIMAL_PALETTES.length],
        speed: BASE_SPEED * (0.85 + 0.12 * i),
        // Space riders out along the track.
        offset: i * 5,
      })),
    [count],
  )

  const dist = useRef<number[]>([])
  if (dist.current.length !== count) {
    dist.current = riders.map((r) => r.offset)
  }

  const m = useMemo(() => new THREE.Matrix4(), [])
  const q = useMemo(() => new THREE.Quaternion(), [])
  const xAxis = useMemo(() => new THREE.Vector3(), [])
  const yAxis = useMemo(() => new THREE.Vector3(), [])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    for (let i = 0; i < count; i++) {
      const g = groupRefs.current[i]
      if (!g) continue
      if (playing) dist.current[i] += riders[i].speed * dt

      const s = sampleTrack(track, dist.current[i])
      // Position the animal in the channel, lifted to ride height.
      g.position.copy(s.pos).addScaledVector(s.up, RIDE_OFFSET)

      // Orient: local +Z = tangent, local +Y = track up.
      const z = s.tangent
      const y = s.up
      xAxis.crossVectors(y, z).normalize()
      yAxis.crossVectors(z, xAxis).normalize()
      m.makeBasis(xAxis, yAxis, z)
      q.setFromRotationMatrix(m)
      g.quaternion.copy(q)

      // A little hop bounce while moving.
      if (playing) {
        const bob = Math.sin(dist.current[i] * 1.5) * 0.06
        g.position.addScaledVector(s.up, bob)
      }
    }
  })

  return (
    <>
      {riders.map((r, i) => (
        <group
          key={i}
          ref={(el) => {
            groupRefs.current[i] = el
          }}
          scale={0.9}
        >
          <Animal colors={r.colors} />
        </group>
      ))}
    </>
  )
}
