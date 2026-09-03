import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Deck, PIN_R, worldZ } from './model'

// One rack of ten. The tumble is the simulation's — this reads each pin's
// position and lean and puts the model where the numbers say it is, so a rack
// going over costs one render rather than one per pin per frame.

/** Pins are white with a red collar, which is the one silhouette every child
 *  already reads as "knock me down". The base ring takes the lane's colour. */
const BODY = '#f8fafc'
const STRIPE = '#e5484d'

/**
 * Straight up, as a vector, and the axis a pin turns about as it goes over.
 * Reused every frame for every pin rather than allocated — forty pins times
 * sixty frames is a lot of garbage otherwise.
 */
const axis = new THREE.Vector3()
const quat = new THREE.Quaternion()

/** The silhouette: a flared foot, a belly, a neck and a head. */
function PinModel({ color }: { color: string }) {
  return (
    <>
      <mesh castShadow receiveShadow position={[0, 0.14, 0]}>
        <cylinderGeometry args={[0.2, 0.26, 0.28, 9]} />
        <meshStandardMaterial color={BODY} flatShading />
      </mesh>
      {/* The lane's colour, low down where a fallen pin still shows it. */}
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.27, 0.27, 0.1, 9]} />
        <meshStandardMaterial color={color} flatShading />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.56, 0]}>
        <cylinderGeometry args={[0.19, 0.27, 0.57, 9]} />
        <meshStandardMaterial color={BODY} flatShading />
      </mesh>
      <mesh castShadow position={[0, 1.05, 0]}>
        <cylinderGeometry args={[0.13, 0.19, 0.42, 9]} />
        <meshStandardMaterial color={BODY} flatShading />
      </mesh>
      <mesh position={[0, 1.14, 0]}>
        <cylinderGeometry args={[0.145, 0.155, 0.13, 9]} />
        <meshStandardMaterial color={STRIPE} flatShading />
      </mesh>
      <mesh castShadow position={[0, 1.45, 0]}>
        <sphereGeometry args={[0.185, 9, 7]} />
        <meshStandardMaterial color={BODY} flatShading />
      </mesh>
    </>
  )
}

export default function Pins({ deck, x, color }: { deck: Deck; x: number; color: string }) {
  const pivots = useRef<(THREE.Group | null)[]>([])
  const leans = useRef<(THREE.Group | null)[]>([])

  useFrame(() => {
    for (const p of deck.pins) {
      const g = pivots.current[p.i]
      const lean = leans.current[p.i]
      if (!g || !lean) continue
      // The pin turns about its own foot, so the outer group carries where it
      // is on the deck and the inner one carries how far over it has gone.
      // A pin lying on its side is half a radius up off the boards, which is
      // the difference between a fallen pin and one sunk into the lane.
      const a = p.tilt * Math.PI * 0.49
      g.position.set(p.x, PIN_R * Math.sin(a) * 0.9, worldZ(p.z))
      // Whichever way it was shoved, in the deck's own (x, z) — turned into
      // world by flipping z, then crossed with straight-up to get the hinge.
      const dx = Math.sin(p.fall)
      const dz = -Math.cos(p.fall)
      axis.set(dz, 0, -dx)
      if (axis.lengthSq() < 1e-6) axis.set(1, 0, 0)
      axis.normalize()
      quat.setFromAxisAngle(axis, a)
      lean.quaternion.copy(quat)
      lean.rotation.y += p.spin * p.tilt * 0.02
    }
  })

  return (
    <group position={[x, 0.1, 0]}>
      {deck.pins.map((p) => (
        <group
          key={p.i}
          ref={(el) => {
            pivots.current[p.i] = el
          }}
          position={[p.homeX, 0, worldZ(p.homeZ)]}
        >
          <group
            ref={(el) => {
              leans.current[p.i] = el
            }}
          >
            <PinModel color={color} />
          </group>
        </group>
      ))}
    </group>
  )
}
