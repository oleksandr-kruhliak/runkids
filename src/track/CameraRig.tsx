import { MutableRefObject, useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { LeadState } from './Riders'

interface CameraRigProps {
  center: THREE.Vector3
  radius: number
  follow: boolean
  fitSignal: number
  leadRef: MutableRefObject<LeadState>
}

const ISO_DIR = new THREE.Vector3(0.9, 0.75, 1).normalize()
const WORLD_UP = new THREE.Vector3(0, 1, 0)

type OrbitLike = { target: THREE.Vector3; update: () => void } | null

export default function CameraRig({ center, radius, follow, fitSignal, leadRef }: CameraRigProps) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera

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

    if (follow && leadRef.current.active) {
      const lead = leadRef.current
      // Behind-and-above the animal, looking forward down the track: the
      // animal's back sits in the lower foreground with the road receding.
      desired.current
        .copy(lead.pos)
        .addScaledVector(lead.tangent, -3.0)
        .addScaledVector(lead.right, 0.9)
        .addScaledVector(WORLD_UP, 1.9)
      camera.position.lerp(desired.current, 0.14)
      look.current
        .copy(lead.pos)
        .addScaledVector(lead.tangent, 8)
        .addScaledVector(WORLD_UP, 0.7)
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
