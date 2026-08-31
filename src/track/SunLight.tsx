import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// The key light. Its shadow camera is a box, and a box big enough to cover a
// five-minute course would be far too coarse to resolve anything — so instead
// the box stays small and rides along with the camera, keeping whatever is on
// screen inside it. A fixed box at the origin left everything past the first
// stretch of a long course completely unshadowed, which read as flat.

/** Half-width of the shadow volume, in world units. */
const SPAN = 96
const MAP = 2048
/** How far ahead of the camera to centre the volume. */
const LEAD = 26

export default function SunLight({
  offset,
  color,
  intensity,
}: {
  /** Light position relative to the point it lights, i.e. sun direction * distance. */
  offset: [number, number, number]
  color: string
  intensity: number
}) {
  const ref = useRef<THREE.DirectionalLight>(null)
  const focus = useMemo(() => new THREE.Vector3(), [])
  const fwd = useMemo(() => new THREE.Vector3(), [])

  useFrame(({ camera }) => {
    const l = ref.current
    if (!l) return
    camera.getWorldDirection(fwd)
    focus.copy(camera.position).addScaledVector(fwd, LEAD)
    focus.y = 0
    // Snap to whole shadow texels, otherwise the map resamples every frame and
    // every shadow edge crawls.
    const texel = (SPAN * 2) / MAP
    focus.x = Math.round(focus.x / texel) * texel
    focus.z = Math.round(focus.z / texel) * texel
    l.position.set(focus.x + offset[0], focus.y + offset[1], focus.z + offset[2])
    l.target.position.copy(focus)
    l.target.updateMatrixWorld()
  })

  return (
    <directionalLight
      ref={ref}
      color={color}
      intensity={intensity}
      castShadow
      shadow-mapSize={[MAP, MAP]}
      shadow-bias={-0.0006}
      shadow-camera-left={-SPAN}
      shadow-camera-right={SPAN}
      shadow-camera-top={SPAN}
      shadow-camera-bottom={-SPAN}
      shadow-camera-near={1}
      shadow-camera-far={SPAN * 4}
    />
  )
}
