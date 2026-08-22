import { MutableRefObject, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import {
  NUM_LANES,
  RIDE_OFFSET,
  Track,
  jumpOffset,
  laneEffect,
  sampleCenter,
  speedMultiplier,
} from './build'
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
  leadRef: MutableRefObject<LeadState>
  /** Which lane the follow-cam tracks; -1 = whichever animal is leading. */
  followTarget: number
}

const BASE_SPEED = 8

export default function Riders({ track, playing, leadRef, followTarget }: RidersProps) {
  const groupRefs = useRef<(THREE.Group | null)[]>([])
  const dist = useRef<number[]>(Array.from({ length: NUM_LANES }, () => 0))

  const m = useMemo(() => new THREE.Matrix4(), [])
  const q = useMemo(() => new THREE.Quaternion(), [])
  const xAxis = useMemo(() => new THREE.Vector3(), [])
  const yAxis = useMemo(() => new THREE.Vector3(), [])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const len = track.length
    let leadIdx = 0
    let leadDist = -Infinity

    for (let l = 0; l < NUM_LANES; l++) {
      const g = groupRefs.current[l]
      const lane = track.lanes[l]
      if (!g || !lane) continue

      const effect = laneEffect(lane, dist.current[l], len)
      if (playing) dist.current[l] += BASE_SPEED * speedMultiplier(effect.type) * dt

      const f = sampleCenter(track.center, dist.current[l])
      g.position
        .copy(f.pos)
        .addScaledVector(f.right, lane.offset)
        .addScaledVector(f.up, RIDE_OFFSET)
      g.position.y += jumpOffset(effect.type, effect.u)
      if (playing && effect.type !== 'gap' && effect.type !== 'trampoline') {
        g.position.y += Math.abs(Math.sin(dist.current[l] * 1.4)) * 0.06
      }

      xAxis.crossVectors(f.up, f.tangent).normalize()
      yAxis.crossVectors(f.tangent, xAxis).normalize()
      m.makeBasis(xAxis, yAxis, f.tangent)
      q.setFromRotationMatrix(m)
      g.quaternion.copy(q)

      if (dist.current[l] > leadDist) {
        leadDist = dist.current[l]
        leadIdx = l
      }
    }

    // Publish the animal the camera should follow: the chosen lane, or the
    // current leader when followTarget is -1.
    const followIdx =
      followTarget >= 0 && followTarget < track.lanes.length ? followTarget : leadIdx
    const followLane = track.lanes[followIdx]
    if (followLane) {
      const f = sampleCenter(track.center, dist.current[followIdx])
      leadRef.current.active = true
      leadRef.current.pos
        .copy(f.pos)
        .addScaledVector(f.right, followLane.offset)
        .addScaledVector(f.up, RIDE_OFFSET)
      leadRef.current.tangent.copy(f.tangent)
      leadRef.current.up.copy(f.up)
    }
  })

  return (
    <>
      {Array.from({ length: NUM_LANES }, (_, l) => (
        <group
          key={l}
          ref={(el) => {
            groupRefs.current[l] = el
          }}
          scale={0.82}
        >
          <Animal colors={ANIMAL_PALETTES[l % ANIMAL_PALETTES.length]} />
        </group>
      ))}
    </>
  )
}
