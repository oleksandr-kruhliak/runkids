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
  spinnerHit,
  stopperUp,
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
const STOP_HOLD_AHEAD = 0.6 // how far before a raised stopper an animal halts
const SPIN_KNOCKBACK = 5 // reverse speed while a spinner arm is over the animal

export default function Riders({ track, playing, leadRef, followTarget }: RidersProps) {
  const groupRefs = useRef<(THREE.Group | null)[]>([])
  const dist = useRef<number[]>(Array.from({ length: NUM_LANES }, () => 0))

  const m = useMemo(() => new THREE.Matrix4(), [])
  const q = useMemo(() => new THREE.Quaternion(), [])
  const xAxis = useMemo(() => new THREE.Vector3(), [])
  const yAxis = useMemo(() => new THREE.Vector3(), [])

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05)
    const t = state.clock.elapsedTime
    const len = track.length
    let leadIdx = 0
    let leadDist = -Infinity

    for (let l = 0; l < NUM_LANES; l++) {
      const g = groupRefs.current[l]
      const lane = track.lanes[l]
      if (!g || !lane) continue

      const effect = laneEffect(lane, dist.current[l], len)

      if (playing) {
        let lap = len > 0 ? dist.current[l] % len : dist.current[l]
        if (lap < 0) lap += len

        // Timed obstacles: hold at a raised stopper; get knocked back by a
        // spinner arm sweeping across.
        let hold = false
        let knockback = false
        for (const o of lane.obstacles) {
          if (o.type === 'stopper' && stopperUp(o.dist, t)) {
            let ahead = o.dist - lap
            if (ahead < 0) ahead += len
            if (ahead < STOP_HOLD_AHEAD) hold = true
          } else if (o.type === 'spinner' && spinnerHit(o.dist, t)) {
            if (lap >= o.start && lap <= o.end) knockback = true
          }
        }

        let v = BASE_SPEED * speedMultiplier(effect.type)
        if (hold) v = 0
        else if (knockback) v = -SPIN_KNOCKBACK
        dist.current[l] += v * dt
        if (dist.current[l] < 0) dist.current[l] += len
      }

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
