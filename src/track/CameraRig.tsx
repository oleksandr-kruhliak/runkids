import { MutableRefObject, useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { LeadState } from './Riders'

export interface FollowCam {
  dist: number // distance from the animal
  azim: number // orbit angle around it (0 = in front)
  elev: number // elevation angle (height)
}

/** An explicit camera framing, used for the winners' podium. */
export interface FocusSpec {
  pos: THREE.Vector3
  /** Direction the subject faces; the camera parks along it, looking back. */
  dir: THREE.Vector3
  dist: number
  elev: number
  lookY: number
}

interface CameraRigProps {
  center: THREE.Vector3
  radius: number
  follow: boolean
  fitSignal: number
  leadRef: MutableRefObject<LeadState>
  camCtrlRef: MutableRefObject<FollowCam>
  /** When set, overrides fit/follow and frames this subject head-on. */
  focus?: FocusSpec | null
  /** Auto-director: cycle broadcast-style shots (cuts) while following. */
  director?: boolean
}

// Broadcast shot list for the auto-director. Orbit shots reuse the follow-cam
// math; 'trackside' parks a fixed camera ahead of the runner and pans as the
// pack races past. Each cut holds for `dur` seconds.
type Shot =
  | { kind: 'orbit'; dist: number; azim: number; elev: number; dur: number }
  | { kind: 'trackside'; dur: number }

const SHOTS: Shot[] = [
  { kind: 'orbit', dist: 6.76, azim: -0.98, elev: 0.44, dur: 6 }, // hero chase
  { kind: 'trackside', dur: 4.5 },
  { kind: 'orbit', dist: 4.6, azim: 0.14, elev: 0.2, dur: 4.5 }, // face close-up
  { kind: 'orbit', dist: 8.5, azim: 1.45, elev: 0.32, dur: 5 }, // side profile
  { kind: 'trackside', dur: 4.5 },
  { kind: 'orbit', dist: 12.5, azim: -2.1, elev: 1.0, dur: 5.5 }, // high drone
  { kind: 'orbit', dist: 7.2, azim: 2.95, elev: 0.14, dur: 5 }, // low behind
]

const ISO_DIR = new THREE.Vector3(0.9, 0.75, 1).normalize()
const WORLD_UP = new THREE.Vector3(0, 1, 0)

type OrbitLike = { target: THREE.Vector3; update: () => void } | null

export default function CameraRig({
  center,
  radius,
  follow,
  fitSignal,
  leadRef,
  camCtrlRef,
  focus,
  director,
}: CameraRigProps) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const focusRef = useRef(focus)
  focusRef.current = focus

  const centerRef = useRef(center)
  const radiusRef = useRef(radius)
  centerRef.current = center
  radiusRef.current = radius

  // Request a re-frame on mount and whenever Fit is pressed.
  const needFit = useRef(true)
  useEffect(() => {
    needFit.current = true
  }, [fitSignal])

  const desired = useRef(new THREE.Vector3())
  const look = useRef(new THREE.Vector3())

  // Auto-director state: current shot, when to cut, and the parked position
  // for trackside shots. `side` alternates which side of the track we park on.
  const shotIdx = useRef(0)
  const shotUntil = useRef(-1)
  const shotPos = useRef(new THREE.Vector3())
  const shotSide = useRef(1)
  const directorRef = useRef(!!director)
  useEffect(() => {
    // (Re)start the shot sequence whenever the director toggles on.
    if (director && !directorRef.current) {
      shotIdx.current = 0
      shotUntil.current = -1
    }
    directorRef.current = !!director
  }, [director])

  useFrame((state) => {
    const controls = state.controls as OrbitLike

    // Explicit framing (podium) wins over both follow and fit.
    const f = focusRef.current
    if (f) {
      desired.current
        .copy(f.pos)
        .addScaledVector(f.dir, f.dist * Math.cos(f.elev))
        .addScaledVector(WORLD_UP, f.dist * Math.sin(f.elev))
      camera.position.lerp(desired.current, 0.12)
      look.current.copy(f.pos).addScaledVector(WORLD_UP, f.lookY)
      camera.lookAt(look.current)
      // Keep any orbiting centred on the subject rather than the old target.
      if (controls) controls.target.copy(look.current)
      needFit.current = false
      return
    }

    if (follow && leadRef.current.active && directorRef.current) {
      const lead = leadRef.current
      const t = state.clock.elapsedTime
      let cut = false
      if (t > shotUntil.current) {
        // Next shot in the rotation — a hard cut, not a glide.
        if (shotUntil.current >= 0) shotIdx.current = (shotIdx.current + 1) % SHOTS.length
        const shot = SHOTS[shotIdx.current]
        shotUntil.current = t + shot.dur
        cut = true
        if (shot.kind === 'trackside') {
          // Park ahead of the runner, off to one (alternating) side.
          shotSide.current = -shotSide.current
          shotPos.current
            .copy(lead.pos)
            .addScaledVector(lead.tangent, 15)
            .addScaledVector(lead.right, 8.5 * shotSide.current)
            .addScaledVector(WORLD_UP, 2.6)
        }
      }
      const shot = SHOTS[shotIdx.current]
      if (shot.kind === 'trackside') {
        desired.current.copy(shotPos.current)
      } else {
        const horiz = shot.dist * Math.cos(shot.elev)
        const vert = shot.dist * Math.sin(shot.elev)
        desired.current
          .copy(lead.pos)
          .addScaledVector(lead.tangent, Math.cos(shot.azim) * horiz)
          .addScaledVector(lead.right, Math.sin(shot.azim) * horiz)
          .addScaledVector(WORLD_UP, vert)
      }
      if (cut) camera.position.copy(desired.current)
      else camera.position.lerp(desired.current, shot.kind === 'trackside' ? 1 : 0.14)
      look.current.copy(lead.pos).addScaledVector(WORLD_UP, 0.45)
      camera.lookAt(look.current)
      needFit.current = false
      return
    }

    if (follow && leadRef.current.active) {
      const lead = leadRef.current
      const { dist, azim, elev } = camCtrlRef.current
      // Orbit around the animal by azimuth (0 = in front) and elevation, at the
      // chosen distance. Looking back at the animal shows its face.
      const horiz = dist * Math.cos(elev)
      const vert = dist * Math.sin(elev)
      const cx = Math.cos(azim)
      const sx = Math.sin(azim)
      desired.current
        .copy(lead.pos)
        .addScaledVector(lead.tangent, cx * horiz)
        .addScaledVector(lead.right, sx * horiz)
        .addScaledVector(WORLD_UP, vert)
      camera.position.lerp(desired.current, 0.14)
      look.current.copy(lead.pos).addScaledVector(WORLD_UP, 0.45)
      camera.lookAt(look.current)
      needFit.current = false
      return
    }

    if (needFit.current) {
      const c = centerRef.current
      const r = radiusRef.current
      const fov = camera.fov ?? 50
      const dist = (r / Math.sin((fov * Math.PI) / 360)) * 1.15
      camera.position.copy(c).addScaledVector(ISO_DIR, dist)
      if (controls) {
        controls.target.copy(c)
        controls.update()
        needFit.current = false // done once controls exist to hold the framing
      } else {
        camera.lookAt(c) // hold until OrbitControls is ready
      }
    }
  })

  return null
}
