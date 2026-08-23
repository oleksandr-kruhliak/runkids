import * as THREE from 'three'
import Animal, { AnimalColors } from './Animal'
import RaceAnimal from './RaceAnimal'
import { AnimalDesign } from '../studio/model'

export interface PodiumEntry {
  /** 0 = winner, 1 = second, 2 = third. */
  place: number
  design: AnimalDesign | null
  colors: AnimalColors
}

const BASE = { w: 8.4, h: 0.3, d: 3.2 }
const STEP = { w: 2.4, d: 2.6 }
// Step heights and side offsets by place: winner centre and tallest.
const PLACES = [
  { x: 0, h: 1.55, color: '#ffc53d', trim: '#e0a21b' },
  { x: -2.6, h: 1.05, color: '#cbd3dc', trim: '#9aa7b5' },
  { x: 2.6, h: 0.68, color: '#dda36f', trim: '#b97e4a' },
]

// Lift the primitive animal so its feet (lowest leg face) rest on the step.
const PRIMITIVE_FEET = 0.62
const PRIMITIVE_SCALE = 1.15

/**
 * A winners' podium built in the scene: a plinth with three coloured steps and
 * the top three animals standing on them, idling. Modelled facing +Z so the
 * follow-camera (which sits in front of its target) frames the animals' faces.
 */
export default function Podium({
  position,
  quaternion,
  entries,
}: {
  position: THREE.Vector3
  quaternion: THREE.Quaternion
  entries: PodiumEntry[]
}) {
  return (
    <group position={position} quaternion={quaternion}>
      {/* Plinth */}
      <mesh position={[0, BASE.h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[BASE.w, BASE.h, BASE.d]} />
        <meshStandardMaterial color="#6b5b8a" flatShading />
      </mesh>

      {entries.map((e) => {
        const p = PLACES[e.place]
        if (!p) return null
        const topY = BASE.h + p.h
        return (
          <group key={e.place} position={[p.x, 0, 0]}>
            {/* Step block */}
            <mesh position={[0, BASE.h + p.h / 2, 0]} castShadow receiveShadow>
              <boxGeometry args={[STEP.w, p.h, STEP.d]} />
              <meshStandardMaterial color={p.color} flatShading />
            </mesh>
            {/* Front trim so the steps read as separate blocks */}
            <mesh position={[0, BASE.h + p.h / 2, STEP.d / 2 + 0.02]} castShadow>
              <boxGeometry args={[STEP.w * 0.82, p.h * 0.3, 0.08]} />
              <meshStandardMaterial color={p.trim} flatShading />
            </mesh>
            {/* The animal, standing on top and idling */}
            <group position={[0, topY, 0]}>
              {e.design ? (
                <RaceAnimal design={e.design} />
              ) : (
                <group position={[0, PRIMITIVE_FEET * PRIMITIVE_SCALE, 0]} scale={PRIMITIVE_SCALE}>
                  <Animal colors={e.colors} />
                </group>
              )}
            </group>
          </group>
        )
      })}
    </group>
  )
}
