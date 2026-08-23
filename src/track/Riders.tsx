import { Component, MutableRefObject, ReactNode, Suspense, useEffect, useMemo, useRef } from 'react'
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
  spinnerSwingSign,
  stopperUp,
} from './build'
import Animal, { ANIMAL_PALETTES } from './Animal'
import Animal3D from './Animal3D'

/** Falls back to its `fallback` if the 3D model fails to load. */
class ModelBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

export interface LeadState {
  active: boolean
  pos: THREE.Vector3
  tangent: THREE.Vector3
  up: THREE.Vector3
  right: THREE.Vector3
}

interface RidersProps {
  track: Track
  /** Per-lane running flag: an animal moves only when its entry is true. */
  running: boolean[]
  /** Bumping this resets every animal back to the start line. */
  resetSignal: number
  leadRef: MutableRefObject<LeadState>
  /** Which lane the follow-cam tracks; -1 = whichever animal is leading. */
  followTarget: number
  /** Per-lane current lap distance, published for obstacle hit detection. */
  distancesRef: MutableRefObject<number[]>
  /** When true and models are provided, ride real .glb animals. */
  use3d: boolean
  animalUrls: string[]
  /** Yaw offset to face 3D models forward along the track. */
  faceY: number
}

const BASE_SPEED = 8
const STOP_HOLD_AHEAD = 0.6 // how far before a raised stopper an animal halts
const KNOCK_SPEED = 7 // how fast the hammer flings the animal
const KNOCK_DUR = 0.8 // how long the knock lasts after a hit (seconds)
const MUD_SLOW = 0.25 // speed multiplier at full mud stickiness
const MUD_LINGER = 0.9 // seconds mud keeps slowing the animal after it leaves
const GROUP_SCALE = 0.82 // rider group scale (applies to primitive + 3D)

export default function Riders({
  track,
  running,
  resetSignal,
  leadRef,
  followTarget,
  distancesRef,
  use3d,
  animalUrls,
  faceY,
}: RidersProps) {
  const groupRefs = useRef<(THREE.Group | null)[]>([])
  const dist = useRef<number[]>(Array.from({ length: NUM_LANES }, () => 0))
  // Active hammer-knock impulse per lane: until when, and which direction.
  const knockUntil = useRef<number[]>(Array.from({ length: NUM_LANES }, () => 0))
  const knockDir = useRef<number[]>(Array.from({ length: NUM_LANES }, () => 0))
  // Per-lane mud stickiness (1 while in mud, decays after leaving).
  const mudStick = useRef<number[]>(Array.from({ length: NUM_LANES }, () => 0))
  // Per-lane current forward speed, so the 3D models can play a run/idle
  // animation that matches whether the animal is actually moving.
  const speedRef = useRef<number[]>(Array.from({ length: NUM_LANES }, () => 0))

  // Reset every animal back to the start line when asked.
  useEffect(() => {
    for (let l = 0; l < NUM_LANES; l++) {
      dist.current[l] = 0
      knockUntil.current[l] = 0
      knockDir.current[l] = 0
      mudStick.current[l] = 0
      speedRef.current[l] = 0
      distancesRef.current[l] = 0
    }
  }, [resetSignal, distancesRef])

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

      if (running[l]) {
        let lap = len > 0 ? dist.current[l] % len : dist.current[l]
        if (lap < 0) lap += len

        // Timed obstacles: hold at a raised stopper; a spinning hammer hit
        // launches a lasting impulse in its swing direction (front -> back,
        // back -> forward).
        let hold = false
        for (const o of lane.obstacles) {
          if (o.type === 'stopper' && stopperUp(o.dist, t)) {
            let ahead = o.dist - lap
            if (ahead < 0) ahead += len
            if (ahead < STOP_HOLD_AHEAD) hold = true
          } else if (o.type === 'spinner' && spinnerHit(o.dist, t)) {
            if (lap >= o.start && lap <= o.end) {
              knockUntil.current[l] = t + KNOCK_DUR
              knockDir.current[l] = spinnerSwingSign(o.dist, t)
            }
          }
        }

        // Mud sticks to the legs: full while in it, then decays, and keeps
        // slowing the animal until it works free.
        if (effect.type === 'mud') mudStick.current[l] = 1
        else mudStick.current[l] = Math.max(0, mudStick.current[l] - dt / MUD_LINGER)

        let v = BASE_SPEED * speedMultiplier(effect.type)
        if (effect.type !== 'mud' && mudStick.current[l] > 0) {
          v *= THREE.MathUtils.lerp(1, MUD_SLOW, mudStick.current[l])
        }
        if (hold) v = 0
        else if (t < knockUntil.current[l]) v = KNOCK_SPEED * knockDir.current[l]
        dist.current[l] += v * dt
        if (dist.current[l] < 0) dist.current[l] += len
        speedRef.current[l] = v
      } else {
        speedRef.current[l] = 0
      }

      const f = sampleCenter(track.center, dist.current[l])
      g.position
        .copy(f.pos)
        .addScaledVector(f.right, lane.offset)
        .addScaledVector(f.up, RIDE_OFFSET)
      g.position.y += jumpOffset(effect.type, effect.u)
      if (running[l] && effect.type !== 'gap' && effect.type !== 'trampoline') {
        g.position.y += Math.abs(Math.sin(dist.current[l] * 1.4)) * 0.06
      }

      xAxis.crossVectors(f.up, f.tangent).normalize()
      yAxis.crossVectors(f.tangent, xAxis).normalize()
      m.makeBasis(xAxis, yAxis, f.tangent)
      q.setFromRotationMatrix(m)
      g.quaternion.copy(q)

      // Publish current lap distance for obstacle (crate) hit detection.
      let lapNow = len > 0 ? dist.current[l] % len : dist.current[l]
      if (lapNow < 0) lapNow += len
      distancesRef.current[l] = lapNow

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
      leadRef.current.right.copy(f.right)
    }
  })

  return (
    <>
      {Array.from({ length: NUM_LANES }, (_, l) => {
        const primitive = <Animal colors={ANIMAL_PALETTES[l % ANIMAL_PALETTES.length]} />
        const use = use3d && animalUrls.length > 0
        return (
          <group
            key={l}
            ref={(el) => {
              groupRefs.current[l] = el
            }}
            scale={GROUP_SCALE}
          >
            {use ? (
              <ModelBoundary fallback={primitive}>
                <Suspense fallback={null}>
                  <Animal3D
                    url={animalUrls[l % animalUrls.length]}
                    faceY={faceY}
                    laneIndex={l}
                    speedRef={speedRef}
                    groundDrop={-RIDE_OFFSET / GROUP_SCALE}
                  />
                </Suspense>
              </ModelBoundary>
            ) : (
              primitive
            )}
          </group>
        )
      })}
    </>
  )
}
