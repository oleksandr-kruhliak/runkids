import { useMemo } from 'react'

export interface AnimalColors {
  body: string
  belly: string
  ear: string
}

export const ANIMAL_PALETTES: AnimalColors[] = [
  { body: '#e8734a', belly: '#ffd9b3', ear: '#c2542f' }, // fox
  { body: '#8d6e63', belly: '#efe0d0', ear: '#5d4037' }, // bear
  { body: '#9ccc65', belly: '#e6ffcf', ear: '#689f38' }, // frog
  { body: '#90a4ae', belly: '#eceff1', ear: '#546e7a' }, // koala
  { body: '#f6bf42', belly: '#fff2c2', ear: '#d99a1c' }, // duckling
]

/**
 * A cute low-poly animal built from primitives, modeled facing +Z (its nose
 * points along +Z so it can be oriented along the track tangent).
 */
export default function Animal({ colors }: { colors: AnimalColors }) {
  // Small deterministic eye/leg placement — memoized for stability.
  const legs = useMemo(
    () => [
      [-0.32, -0.45, 0.35],
      [0.32, -0.45, 0.35],
      [-0.32, -0.45, -0.35],
      [0.32, -0.45, -0.35],
    ] as const,
    [],
  )

  return (
    <group>
      {/* Body */}
      <mesh castShadow position={[0, 0, 0]}>
        <boxGeometry args={[0.9, 0.8, 1.4]} />
        <meshStandardMaterial color={colors.body} flatShading />
      </mesh>
      {/* Belly */}
      <mesh position={[0, -0.18, 0.2]}>
        <boxGeometry args={[0.7, 0.5, 1.0]} />
        <meshStandardMaterial color={colors.belly} flatShading />
      </mesh>
      {/* Head */}
      <mesh castShadow position={[0, 0.35, 0.72]}>
        <boxGeometry args={[0.78, 0.72, 0.7]} />
        <meshStandardMaterial color={colors.body} flatShading />
      </mesh>
      {/* Snout */}
      <mesh position={[0, 0.22, 1.08]}>
        <boxGeometry args={[0.4, 0.34, 0.26]} />
        <meshStandardMaterial color={colors.belly} flatShading />
      </mesh>
      {/* Nose */}
      <mesh position={[0, 0.28, 1.22]}>
        <boxGeometry args={[0.14, 0.12, 0.1]} />
        <meshStandardMaterial color="#3a2a25" flatShading />
      </mesh>
      {/* Ears */}
      <mesh castShadow position={[-0.28, 0.78, 0.62]}>
        <boxGeometry args={[0.22, 0.28, 0.12]} />
        <meshStandardMaterial color={colors.ear} flatShading />
      </mesh>
      <mesh castShadow position={[0.28, 0.78, 0.62]}>
        <boxGeometry args={[0.22, 0.28, 0.12]} />
        <meshStandardMaterial color={colors.ear} flatShading />
      </mesh>
      {/* Eyes */}
      <mesh position={[-0.2, 0.42, 1.06]}>
        <boxGeometry args={[0.1, 0.12, 0.06]} />
        <meshStandardMaterial color="#1c1c1c" />
      </mesh>
      <mesh position={[0.2, 0.42, 1.06]}>
        <boxGeometry args={[0.1, 0.12, 0.06]} />
        <meshStandardMaterial color="#1c1c1c" />
      </mesh>
      {/* Legs */}
      {legs.map((l, i) => (
        <mesh key={i} castShadow position={[l[0], l[1], l[2]]}>
          <boxGeometry args={[0.22, 0.34, 0.22]} />
          <meshStandardMaterial color={colors.ear} flatShading />
        </mesh>
      ))}
      {/* Tail */}
      <mesh position={[0, 0.1, -0.82]}>
        <boxGeometry args={[0.24, 0.24, 0.4]} />
        <meshStandardMaterial color={colors.ear} flatShading />
      </mesh>
    </group>
  )
}
