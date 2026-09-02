import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { ToolDef } from './tools'

// The rig that drives whichever tool is on stage. Every swing has the same
// three-part shape — a slow wind-up for anticipation, a fast strike, then a
// recoil — so the blow always lands on exactly the frame the show says it
// does, however different the tools look.

/** Height the sideways rigs (bat, glove) are held at, above the egg's base. */
const SIDE_Y = 0.78

const ease = (x: number) => x * x * (3 - 2 * x)

/**
 * Where the tool is `ms` into a swing, between its resting, wound-up and
 * striking poses. Radians for the swung tools, world units for the punch.
 */
function swingPose(tool: ToolDef, ms: number): number {
  const { rest, wind, strike, swingMs, impactMs } = tool
  if (ms < 0 || ms > swingMs) return rest
  const windEnd = impactMs * 0.45
  if (ms < windEnd) return THREE.MathUtils.lerp(rest, wind, ease(ms / windEnd))
  if (ms < impactMs) {
    // Accelerating strike: most of the travel happens in the last few frames.
    const k = (ms - windEnd) / (impactMs - windEnd)
    return THREE.MathUtils.lerp(wind, strike, Math.pow(k, 1.9))
  }
  // Recoil: bounce off the shell, then settle back ready for the next blow.
  const k = (ms - impactMs) / (swingMs - impactMs)
  const bounce = Math.sin(Math.PI * k) * (strike > rest ? -0.22 : 0.22)
  return THREE.MathUtils.lerp(strike, rest, ease(k)) + bounce
}

interface Props {
  tool: ToolDef
  /** The egg's base position — the rig anchors itself relative to this. */
  position: [number, number, number]
  /** performance.now() when the current swing began; 0 = resting. */
  swingAt: number
  /** False makes the tool shrink away between eggs. */
  show: boolean
}

export default function Tool({ tool, position, swingAt, show }: Props) {
  const arm = useRef<THREE.Group>(null)
  const root = useRef<THREE.Group>(null)
  const [x, y, z] = position

  // Anchor: overhead for a chop, out to the left for a sweep or a punch.
  const anchor: [number, number, number] =
    tool.kind === 'chop'
      ? [x, y + tool.reach, z + 0.1]
      : [x - tool.reach, y + SIDE_Y, z + (tool.kind === 'punch' ? 0.15 : 0)]

  useFrame((_, delta) => {
    const now = performance.now()
    const pose = swingPose(tool, swingAt > 0 ? now - swingAt : -1)
    const g = arm.current
    if (g) {
      // Each rig moves on exactly one axis; the others stay put.
      g.rotation.set(0, 0, 0)
      g.position.set(0, 0, 0)
      if (tool.kind === 'chop') g.rotation.z = pose
      else if (tool.kind === 'sweep') g.rotation.y = pose
      else g.position.x = pose
    }
    if (root.current) {
      // Grow in when it's this egg's turn, shrink away afterwards.
      const target = show ? 1 : 0
      const s = THREE.MathUtils.lerp(root.current.scale.x, target, Math.min(1, delta * 9))
      root.current.scale.setScalar(s < 0.002 ? 0 : s)
      root.current.visible = s > 0.01
    }
  })

  return (
    <group ref={root} position={anchor} scale={0}>
      {/* Keyed on the tool so switching swaps the geometry cleanly. */}
      <group ref={arm} key={tool.key}>
        {tool.body}
      </group>
    </group>
  )
}
