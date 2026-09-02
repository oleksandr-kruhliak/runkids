import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import RaceAnimal from '../track/RaceAnimal'
import { AnimalDesign, Clip } from '../studio/model'

// The payoff: the animal climbing out of the broken shell, and later stepping
// down off its nest for the curtain call. It's drawn by the track's racer
// renderer, which already measures each design, stands it on its feet and
// merges its ~2000 blocks down to a handful of meshes — so a stage with eight
// animals walking about on it still runs smoothly.

/** Scale on top of the racer size, so a hatchling matches its egg. */
const SIZE = 0.85
/** Seconds of jumping for joy on arrival before it settles into an idle. */
const CHEER_S = 1.7
/** Seconds it takes to walk down off the nest to its parade spot. */
const WALK_S = 2.6

interface Props {
  design: AnimalDesign
  /** Nest position; where it hatches and stands until the parade. */
  position: [number, number, number]
  /** performance.now() when the shell burst. */
  since: number
  /** Where it walks to for the curtain call. */
  paradeTo: [number, number, number]
  /** performance.now() when it set off; 0 = stay on the nest. */
  paradeAt: number
  /** Celebrating: it jumps on the spot once everyone is in the line. */
  cheering: boolean
}

export default function HatchAnimal({
  design,
  position,
  since,
  paradeTo,
  paradeAt,
  cheering,
}: Props) {
  const root = useRef<THREE.Group>(null)
  const [clip, setClip] = useState<Clip>('jump')

  // A little jump for joy on arrival, then it settles down and idles.
  useEffect(() => {
    setClip('jump')
    const t = setTimeout(() => setClip('idle'), CHEER_S * 1000)
    return () => clearTimeout(t)
  }, [since])

  // Walking to the line, then celebrating once it gets there.
  useEffect(() => {
    if (paradeAt <= 0) return
    setClip('walk')
    const t = setTimeout(() => setClip(cheering ? 'jump' : 'idle'), WALK_S * 1000)
    return () => clearTimeout(t)
  }, [paradeAt, cheering])

  // Once everyone has arrived, the whole line cheers together.
  useEffect(() => {
    if (paradeAt <= 0) return
    if (performance.now() - paradeAt > WALK_S * 1000) setClip(cheering ? 'jump' : 'idle')
  }, [cheering, paradeAt])

  useFrame(() => {
    const g = root.current
    if (!g) return
    const t = Math.max(0, (performance.now() - since) / 1000)
    // Springy pop out of the shell: overshoot once, then settle. "Boing!"
    const spring = 1 - Math.exp(-9 * t) * Math.cos(11 * t)
    g.scale.setScalar(SIZE * THREE.MathUtils.clamp(spring, 0.001, 1.18))

    // Rises out of the shell as it grows, then walks out to the parade line.
    const rise = position[1] - 0.5 * Math.max(0, 1 - t * 2.2)
    if (paradeAt > 0) {
      const k = THREE.MathUtils.clamp((performance.now() - paradeAt) / (WALK_S * 1000), 0, 1)
      // Smoothstep, so it eases off the nest and settles on its mark rather
      // than starting and stopping dead.
      const e = k * k * (3 - 2 * k)
      g.position.set(
        THREE.MathUtils.lerp(position[0], paradeTo[0], e),
        THREE.MathUtils.lerp(rise, paradeTo[1], e),
        THREE.MathUtils.lerp(position[2], paradeTo[2], e),
      )
    } else {
      g.position.set(position[0], rise, position[2])
    }
  })

  return (
    <group ref={root} position={position} scale={0.001}>
      {/* Designs face +Z, which is straight at the camera; a touch of yaw
          gives the three-quarter view that reads best on a portrait. */}
      <RaceAnimal design={design} clip={clip} faceY={0.22} />
    </group>
  )
}
