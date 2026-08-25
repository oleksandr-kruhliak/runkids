import { Component, MutableRefObject, ReactNode, Suspense, useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import {
  RIDE_OFFSET,
  Track,
  chomperClosed,
  fanOn,
  fireOn,
  geyserOn,
  jumpOffset,
  laneEffect,
  logU,
  pendulumStruck,
  sampleCenter,
  speedMultiplier,
  spinnerStruck,
  spinnerSwingSign,
  stopperUp,
} from './build'
import Animal, { ANIMAL_PALETTES, AnimalColors } from './Animal'
import Animal3D from './Animal3D'
import RaceAnimal from './RaceAnimal'
import { AnimalDesign } from '../studio/model'

/** Rounded-pill name tag rendered to a canvas texture, shown as a sprite. */
function makeTagTexture(name: string, color: string) {
  const pad = 26
  const fontPx = 44
  const h = 84
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  ctx.font = `800 ${fontPx}px system-ui, -apple-system, "Segoe UI", sans-serif`
  const textW = Math.ceil(ctx.measureText(name).width)
  const w = textW + pad * 2
  canvas.width = w
  canvas.height = h
  // pill
  const r = h / 2
  ctx.beginPath()
  ctx.moveTo(r, 0)
  ctx.arcTo(w, 0, w, h, r)
  ctx.arcTo(w, h, 0, h, r)
  ctx.arcTo(0, h, 0, 0, r)
  ctx.arcTo(0, 0, w, 0, r)
  ctx.closePath()
  ctx.fillStyle = color
  ctx.globalAlpha = 0.92
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.lineWidth = 5
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'
  ctx.stroke()
  // name
  ctx.font = `800 ${fontPx}px system-ui, -apple-system, "Segoe UI", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineWidth = 7
  ctx.strokeStyle = 'rgba(20,25,35,0.85)'
  ctx.strokeText(name, w / 2, h / 2 + 2)
  ctx.fillStyle = '#ffffff'
  ctx.fillText(name, w / 2, h / 2 + 2)
  const texture = new THREE.CanvasTexture(canvas)
  texture.anisotropy = 4
  return { texture, aspect: w / h }
}

function NameTag({ name, color }: { name: string; color: string }) {
  const { texture, aspect } = useMemo(() => makeTagTexture(name, color), [name, color])
  useEffect(() => () => texture.dispose(), [texture])
  const H = 0.62
  return (
    <sprite position={[0, 1.8, 0]} scale={[H * aspect, H, 1]} renderOrder={5}>
      <spriteMaterial map={texture} transparent depthWrite={false} sizeAttenuation />
    </sprite>
  )
}

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
  /** Per-lane saved cube-animal design; when set, that lane rides it. */
  laneDesigns?: (AnimalDesign | null)[]
  /** Race mode: `lane` >= 0 runs that lane alone (time trial); `lane` === -1
   * runs every lane at once (grand prix). `armed` is false during the 3-2-1
   * countdown so racers wait at the start line. */
  trial?: { active: boolean; lane: number; armed: boolean }
  /** Riders writes the current trial run's elapsed seconds here for display. */
  trialTimeRef?: MutableRefObject<number>
  /** Called when the active trial lane crosses the finish (one lap). */
  onTrialFinish?: (lane: number, time: number) => void
  /** Freeze all motion (ESC pause menu). */
  paused?: boolean
  /** Per-lane colours for the default (primitive) animal. */
  laneColors?: AnimalColors[]
  /** Per-lane display names; when `showTags` is true a floating name pill
   * rides above each animal (broadcast overlay). */
  names?: string[]
  showTags?: boolean
}

const MAX_LANES = 8 // upper bound on racers; ref arrays are sized to this
// sampleCenter()/laneEffect() wrap at exactly `length`, which would snap a
// finished animal back to the start line, so park it a hair short of the end.
const FINISH_EPS = 0.01
const BASE_SPEED = 8
const STOP_HOLD_AHEAD = 0.6 // how far before a raised stopper an animal halts
const KNOCK_SPEED = 7 // how fast the hammer flings the animal
const KNOCK_DUR = 0.8 // how long the knock lasts after a hit (seconds)
const MUD_SLOW = 0.25 // speed multiplier at full mud stickiness
const HOP_DUR = 0.9 // seconds airborne on a geyser jet
const HOP_HEIGHT = 2.4
const SPIN_OUT_DUR = 0.8 // seconds of banana-peel stumble
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
  laneDesigns,
  trial,
  trialTimeRef,
  onTrialFinish,
  paused,
  laneColors,
  names,
  showTags,
}: RidersProps) {
  const groupRefs = useRef<(THREE.Group | null)[]>([])
  const dist = useRef<number[]>(Array.from({ length: MAX_LANES }, () => 0))
  // Active hammer-knock impulse per lane: until when, and which direction.
  const knockUntil = useRef<number[]>(Array.from({ length: MAX_LANES }, () => 0))
  const knockDir = useRef<number[]>(Array.from({ length: MAX_LANES }, () => 0))
  // Per-lane mud stickiness (1 while in mud, decays after leaving).
  const mudStick = useRef<number[]>(Array.from({ length: MAX_LANES }, () => 0))
  // Geyser hop (launch window), banana spin-out, and one-shot event guards.
  const hopStart = useRef<number[]>(Array.from({ length: MAX_LANES }, () => -99))
  const spinStart = useRef<number[]>(Array.from({ length: MAX_LANES }, () => -99))
  // Per-lane current forward speed, so the 3D models can play a run/idle
  // animation that matches whether the animal is actually moving.
  const speedRef = useRef<number[]>(Array.from({ length: MAX_LANES }, () => 0))
  // Time-trial: which lanes have crossed the finish (parked at the line).
  const finished = useRef<boolean[]>(Array.from({ length: MAX_LANES }, () => false))
  // Keep the finish callback fresh without re-subscribing the frame loop.
  const onFinishRef = useRef(onTrialFinish)
  onFinishRef.current = onTrialFinish

  // Reset every animal back to the start line when asked.
  useEffect(() => {
    for (let l = 0; l < MAX_LANES; l++) {
      dist.current[l] = 0
      knockUntil.current[l] = 0
      knockDir.current[l] = 0
      mudStick.current[l] = 0
      hopStart.current[l] = -99
      spinStart.current[l] = -99
      speedRef.current[l] = 0
      distancesRef.current[l] = 0
      finished.current[l] = false
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
    const count = track.lanes.length

    const isTrial = !!trial?.active
    const allMode = isTrial && trial!.lane === -1
    // Advance the shared race clock while at least one racer is still going.
    if (isTrial && trial!.armed && !paused && trialTimeRef && len > 0) {
      const anyLeft = allMode
        ? track.lanes.some((_, l) => !finished.current[l])
        : trial!.lane >= 0 && !finished.current[trial!.lane]
      if (anyLeft) trialTimeRef.current += dt
    }

    for (let l = 0; l < count; l++) {
      const g = groupRefs.current[l]
      const lane = track.lanes[l]
      if (!g || !lane) continue

      const effect = laneEffect(lane, dist.current[l], len)

      // In a trial only the active lane(s) run, once, until they finish; in
      // free mode a lane runs while its `running` flag is set (and loops).
      const laneRunning =
        !paused &&
        (isTrial
          ? trial!.armed && !finished.current[l] && len > 0 && (allMode || trial!.lane === l)
          : running[l])

      if (laneRunning) {
        let lap = len > 0 ? dist.current[l] % len : dist.current[l]
        if (lap < 0) lap += len

        // Timed obstacles: hold at a raised stopper or a closed chomper; hits
        // from the spinner, fire jets, and pendulum axe launch an impulse.
        let hold = false
        let fanPush = false
        let logPush = false
        for (const o of lane.obstacles) {
          const inZone = lap >= o.start && lap <= o.end
          if (o.type === 'stopper' && stopperUp(o.dist, t)) {
            let ahead = o.dist - lap
            if (ahead < 0) ahead += len
            if (ahead < STOP_HOLD_AHEAD) hold = true
          } else if (o.type === 'chomper' && chomperClosed(o.dist, t)) {
            let ahead = o.dist - lap
            if (ahead < 0) ahead += len
            if (ahead < STOP_HOLD_AHEAD) hold = true
          } else if (o.type === 'spinner') {
            // Knock when the hammer sweeps across while the animal is under it.
            if (inZone && spinnerStruck(o.dist, t, Math.min(delta, 0.1))) {
              knockUntil.current[l] = t + KNOCK_DUR
              knockDir.current[l] = spinnerSwingSign(o.dist, t)
            }
          } else if (o.type === 'fire') {
            if (inZone && fireOn(o.dist, t) && t > knockUntil.current[l] + 0.4) {
              knockUntil.current[l] = t + KNOCK_DUR * 0.8
              knockDir.current[l] = -1
            }
          } else if (o.type === 'pendulum') {
            if (inZone && pendulumStruck(o.dist, t, Math.min(delta, 0.1))) {
              knockUntil.current[l] = t + KNOCK_DUR
              knockDir.current[l] = -1
            }
          } else if (o.type === 'fan') {
            if (inZone && fanOn(o.dist, t)) fanPush = true
          } else if (o.type === 'geyser') {
            if (inZone && geyserOn(o.dist, t) && t > hopStart.current[l] + 1.6) {
              hopStart.current[l] = t
            }
          } else if (o.type === 'log') {
            const logLap = o.end - logU(o.dist, t) * o.len
            if (inZone && lap < logLap && logLap - lap < 0.9) logPush = true
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
        if (t < hopStart.current[l] + HOP_DUR) v *= 0.5 // riding a geyser jet
        if (t < spinStart.current[l] + SPIN_OUT_DUR) v *= 0.12 // banana stumble
        if (hold) v = 0
        else if (t < knockUntil.current[l]) v = KNOCK_SPEED * knockDir.current[l]
        else if (fanPush) v = -3.2
        else if (logPush) v = -4
        const lapBefore = lap
        dist.current[l] += v * dt
        // One-shot crossings (banana spin-out, portal teleport).
        let lapAfter = len > 0 ? dist.current[l] % len : dist.current[l]
        if (lapAfter < 0) lapAfter += len
        if (v > 0) {
          for (const o of lane.obstacles) {
            if (o.type !== 'banana' && o.type !== 'portal') continue
            const crossed =
              lapBefore <= lapAfter
                ? o.dist > lapBefore && o.dist <= lapAfter
                : o.dist > lapBefore || o.dist <= lapAfter
            if (!crossed) continue
            if (o.type === 'banana' && t > spinStart.current[l] + SPIN_OUT_DUR + 0.5) {
              spinStart.current[l] = t
            } else if (o.type === 'portal' && o.delta != null) {
              dist.current[l] += o.delta
            }
          }
        }

        if (isTrial) {
          // Stop the animal on the finish line after a single lap.
          if (dist.current[l] < 0) dist.current[l] = 0
          if (dist.current[l] >= len) {
            dist.current[l] = len - FINISH_EPS
            finished.current[l] = true
            onFinishRef.current?.(l, trialTimeRef ? trialTimeRef.current : 0)
          }
        } else if (dist.current[l] < 0) {
          dist.current[l] += len
        }
        speedRef.current[l] = v
      } else {
        speedRef.current[l] = 0
      }

      // Where the animal sits along the course (single lap in a trial).
      const along = isTrial
        ? Math.max(0, Math.min(dist.current[l], len - FINISH_EPS))
        : dist.current[l]
      const f = sampleCenter(track.center, along)
      g.position
        .copy(f.pos)
        .addScaledVector(f.right, lane.offset)
        .addScaledVector(f.up, RIDE_OFFSET)
      g.position.y += jumpOffset(effect.type, effect.u)
      if (laneRunning && effect.type !== 'gap' && effect.type !== 'trampoline') {
        g.position.y += Math.abs(Math.sin(dist.current[l] * 1.4)) * 0.06
      }
      // Geyser hop: a tall slow arc while the jet carries the animal.
      const hopP = (t - hopStart.current[l]) / HOP_DUR
      if (hopP >= 0 && hopP < 1) g.position.y += Math.sin(Math.PI * hopP) * HOP_HEIGHT
      // Ice skid: slide side to side with a little body roll.
      const onIce = effect.type === 'ice'
      if (onIce) g.position.addScaledVector(f.right, Math.sin(dist.current[l] * 2.2) * 0.18)

      xAxis.crossVectors(f.up, f.tangent).normalize()
      yAxis.crossVectors(f.tangent, xAxis).normalize()
      m.makeBasis(xAxis, yAxis, f.tangent)
      q.setFromRotationMatrix(m)
      g.quaternion.copy(q)
      if (onIce) g.rotateZ(Math.sin(dist.current[l] * 2.2 + 1) * 0.16)
      // Banana spin-out: a full pirouette while stumbling.
      const spinP = (t - spinStart.current[l]) / SPIN_OUT_DUR
      if (spinP >= 0 && spinP < 1) g.rotateY(spinP * Math.PI * 2)

      // Publish current lap distance for obstacle (crate) hit detection.
      let lapNow = len > 0 ? along % len : along
      if (lapNow < 0) lapNow += len
      distancesRef.current[l] = lapNow

      // Follow target: solo trial pins the camera on the running animal; in a
      // grand prix the camera tracks the front runner still racing.
      const rank = isTrial
        ? allMode
          ? finished.current[l]
            ? dist.current[l] - 1e9
            : dist.current[l]
          : trial!.lane === l
            ? Infinity
            : dist.current[l]
        : dist.current[l]
      if (rank > leadDist) {
        leadDist = rank
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
      {Array.from({ length: track.lanes.length }, (_, l) => {
        const primitive = (
          <Animal colors={laneColors?.[l] ?? ANIMAL_PALETTES[l % ANIMAL_PALETTES.length]} />
        )
        const design = laneDesigns?.[l] ?? null
        const use = use3d && animalUrls.length > 0
        return (
          <group
            key={l}
            ref={(el) => {
              groupRefs.current[l] = el
            }}
            scale={GROUP_SCALE}
          >
            {design ? (
              <RaceAnimal
                design={design}
                laneIndex={l}
                speedRef={speedRef}
                faceY={faceY}
                groundDrop={-RIDE_OFFSET / GROUP_SCALE}
              />
            ) : use ? (
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
            {showTags && names?.[l] && (
              <NameTag
                name={names[l]}
                color={(laneColors?.[l] ?? ANIMAL_PALETTES[l % ANIMAL_PALETTES.length]).body}
              />
            )}
          </group>
        )
      })}
    </>
  )
}
