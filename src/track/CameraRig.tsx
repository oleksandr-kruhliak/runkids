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
}

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
