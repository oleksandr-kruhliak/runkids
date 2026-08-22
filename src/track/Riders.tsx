import { MutableRefObject, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { RIDE_OFFSET, Track, jumpOffset, sampleTrack, speedMultiplier } from './build'
import Animal, { ANIMAL_PALETTES } from './Animal'

export interface LeadState {
  active: boolean
  pos: THREE.Vector3
  tangent: THREE.Vector3
  up: THREE.Vector3
}

interface RidersProps {
  track: Track
  playing: boolean
  count: number
  leadRef: MutableRefObject<LeadState>
}

const BASE_SPEED = 8 // world units / second

export default function Riders({ track, playing, count, leadRef }: RidersProps) {
  const groupRefs = useRef<(THREE.Group | null)[]>([])

  const riders = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        colors: ANIMAL_PALETTES[i % ANIMAL_PALETTES.length],
        speed: BASE_SPEED * (0.92 + 0.06 * i),
        offset: i * 6,
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
    let leadIdx = 0
    let leadDist = -Infinity

    for (let i = 0; i < count; i++) {
      const g = groupRefs.current[i]
      if (!g) continue

      const s = sampleTrack(track, dist.current[i])
      if (playing) dist.current[i] += riders[i].speed * speedMultiplier(s.type) * dt

      // Base position in the channel, plus jump/spring/water offset.
      g.position.copy(s.pos).addScaledVector(s.up, RIDE_OFFSET)
      g.position.y += jumpOffset(s.type, s.u)

      // A little hop bounce while moving on solid track.
      if (playing && s.type !== 'gap' && s.type !== 'spring') {
        g.position.y += Math.abs(Math.sin(dist.current[i] * 1.4)) * 0.06
      }

      // Orient: local +Z = tangent, local +Y = track up.
      xAxis.crossVectors(s.up, s.tangent).normalize()
      yAxis.crossVectors(s.tangent, xAxis).normalize()
      m.makeBasis(xAxis, yAxis, s.tangent)
      q.setFromRotationMatrix(m)
      g.quaternion.copy(q)

      if (dist.current[i] > leadDist) {
        leadDist = dist.current[i]
        leadIdx = i
      }
    }

    // Publish the lead rider for the follow-cam.
    const lead = sampleTrack(track, dist.current[leadIdx])
    leadRef.current.active = true
    leadRef.current.pos.copy(lead.pos).addScaledVector(lead.up, RIDE_OFFSET)
    leadRef.current.tangent.copy(lead.tangent)
    leadRef.current.up.copy(lead.up)
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
