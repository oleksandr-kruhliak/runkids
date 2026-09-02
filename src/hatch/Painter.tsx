import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { CLOUD_IN_MS, PAINT_EACH_MS, cloudXAt } from './model'
import { EggColors, PainterDef } from './painters'

// Carries whichever painter the episode drew along the row of eggs. The path
// and the colour hand-off live here, so a rig only has to animate itself in
// place — and every rig travels identically, which keeps the camera, the egg
// paint timings and the director all working off one set of numbers.

interface Props {
  painter: PainterDef
  /** performance.now() when the painting beat began; 0 = nothing on stage. */
  since: number
  count: number
  /** Each egg's two colours, in row order. */
  palette: EggColors[]
  /** World Y the paint meets the shell. */
  landY: number
}

export default function Painter({ painter, since, count, palette, landY }: Props) {
  const root = useRef<THREE.Group>(null)
  /**
   * Which egg's colours the rig is wearing. It changes a handful of times an
   * episode — at the midpoint between two nests — so it's cheap to hold in
   * state and let the rig render its colours declaratively.
   */
  const [over, setOver] = useState(0)
  const overRef = useRef(0)

  useFrame(() => {
    const g = root.current
    if (!g) return
    if (since <= 0) {
      g.visible = false
      return
    }
    const ms = performance.now() - since
    g.visible = true
    g.position.x = cloudXAt(ms, count)

    const next = Math.max(
      0,
      Math.min(count - 1, Math.round((ms - CLOUD_IN_MS) / PAINT_EACH_MS)),
    )
    if (next !== overRef.current) {
      overRef.current = next
      setOver(next)
    }
  })

  const colors = palette[over] ?? palette[0] ?? { base: '#ffffff', accent: '#ffffff' }
  const { Rig } = painter

  return (
    <group ref={root} visible={false}>
      <Rig colors={colors} landY={landY} />
    </group>
  )
}
