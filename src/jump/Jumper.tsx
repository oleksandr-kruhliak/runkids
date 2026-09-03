import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import RaceAnimal from '../track/RaceAnimal'
import { AnimalDesign } from '../studio/model'
import { BOUNCE_V, Racer, laneX } from './model'

// One climbing animal. The bounce itself is the simulation's — this only reads
// the racer's state and puts the model where the numbers say it is, then adds
// the two things that make a jump feel like a jump: squash on the landing,
// stretch on the way up, and a lean in the direction it's steering.

/** Scale on top of the racer size, so an animal fits on a platform. */
const SIZE = 0.62
/** How long the landing squash takes to spring back out, in seconds. */
const SQUASH_S = 0.2

interface Props {
  racer: Racer
  /** Lane count, so the animal knows where its column is. */
  lanes: number
  design: AnimalDesign
  color: string
}

export default function Jumper({ racer, lanes, design, color }: Props) {
  const root = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const bubble = useRef<THREE.Mesh>(null)
  const frost = useRef<THREE.Mesh>(null)
  const shadow = useRef<THREE.Mesh>(null)

  useFrame(() => {
    const g = root.current
    const inner = body.current
    if (!g || !inner) return
    const base = laneX(racer.lane, lanes)
    g.position.set(base + racer.x, racer.y, 0)

    // Squash then stretch: the landing flattens it, and the climb pulls it
    // tall. Both are on the same axis pair, so the volume looks kept.
    const since = (performance.now() - racer.landAt) / 1000
    const squash = since < SQUASH_S ? 1 - 0.3 * (1 - since / SQUASH_S) : 1
    const stretch =
      racer.phase === 'air' ? THREE.MathUtils.clamp(1 + racer.vy / (BOUNCE_V * 9), 0.9, 1.16) : 1
    const k = squash * stretch
    inner.scale.set(SIZE * (2 - k), SIZE * k, SIZE * (2 - k))

    // Leans into the steer, and tips back a touch at the top of the arc.
    inner.rotation.z = THREE.MathUtils.clamp(-racer.vx * 0.045, -0.3, 0.3)
    inner.rotation.x =
      racer.phase === 'air' ? THREE.MathUtils.clamp(-racer.vy * 0.006, -0.1, 0.1) : 0
    // Caught in a fan: it tumbles while the draught has hold of it, which is
    // what makes a blown jump read as blown rather than as badly aimed.
    const blown = performance.now() < racer.blowUntil
    inner.rotation.y = blown ? inner.rotation.y + 0.22 * racer.blowDir : 0

    const b = bubble.current
    if (b) {
      b.visible = racer.phase === 'bubble'
      if (b.visible) b.rotation.y += 0.02
    }
    const ice = frost.current
    if (ice) {
      ice.visible = racer.phase === 'frozen'
      if (ice.visible) ice.rotation.y = Math.sin(performance.now() / 400) * 0.06
    }
    // A little disc under the animal, purely so the eye can tell how far it
    // still has to fall — the platforms are too thin to catch a real shadow.
    const s = shadow.current
    if (s) {
      s.position.set(base + racer.x, racer.y - 0.02, 0.1)
      s.visible = racer.phase !== 'done'
    }
  })

  return (
    <>
      <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.42, 16]} />
        <meshBasicMaterial color="#0b1220" transparent opacity={0.16} depthWrite={false} />
      </mesh>
      <group ref={root}>
        <group ref={body} scale={SIZE}>
          {/* Designs face +Z, straight at the camera; a little yaw gives the
              three-quarter view that reads best in a portrait column. */}
          <RaceAnimal
            design={design}
            clip={racer.phase === 'done' ? 'jump' : 'idle'}
            faceY={0.26}
          />
        </group>
        {/* The rescue bubble, outside the squash so it stays a bubble. */}
        <mesh ref={bubble} visible={false} position={[0, 0.68, 0]}>
          <sphereGeometry args={[1.05, 16, 12]} />
          <meshStandardMaterial
            color={color}
            transparent
            opacity={0.24}
            roughness={0.1}
            metalness={0.1}
          />
        </mesh>
        {/* Frozen to a frost platform: a block of ice, outside the squash for
            the same reason the bubble is. */}
        <mesh ref={frost} visible={false} position={[0, 0.66, 0]}>
          <boxGeometry args={[1.35, 1.5, 1.35]} />
          <meshStandardMaterial
            color="#bfeeff"
            emissive="#7fd6ff"
            emissiveIntensity={0.3}
            transparent
            opacity={0.42}
            roughness={0.15}
            flatShading
          />
        </mesh>
      </group>
    </>
  )
}
