import { MutableRefObject, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { ParticleKind } from './model'

// Falling weather particles (snow / autumn leaves / petals / rain) over a
// circular area. One instanced mesh; positions advance every frame and wrap
// from the ground back to the top.

interface Props {
  kind: ParticleKind
  /** 0–100 density. */
  density: number
  center: THREE.Vector3
  radius: number
}

const HEIGHT = 26 // how high above the ground particles spawn

interface Spec {
  geometry: () => THREE.BufferGeometry
  colors: string[]
  fall: [number, number] // min/max fall speed
  sway: number // horizontal sway amplitude
  tumble: number // rotation speed factor
  opacity: number
  max: number
}

const SPECS: Record<Exclude<ParticleKind, 'none'>, Spec> = {
  snow: {
    geometry: () => new THREE.SphereGeometry(0.09, 6, 5),
    colors: ['#ffffff', '#f2f8ff', '#e8f2fb'],
    fall: [1.6, 3.2],
    sway: 1.4,
    tumble: 0,
    opacity: 0.95,
    max: 650,
  },
  leaves: {
    geometry: () => new THREE.PlaneGeometry(0.34, 0.24),
    colors: ['#d9822b', '#c2571b', '#e0a33e', '#a8542e', '#caa02c'],
    fall: [1.2, 2.4],
    sway: 2.2,
    tumble: 2.4,
    opacity: 1,
    max: 450,
  },
  petals: {
    geometry: () => new THREE.PlaneGeometry(0.2, 0.15),
    colors: ['#ffc4d8', '#ffdbe7', '#ff9ec2', '#fff0f5'],
    fall: [0.9, 1.8],
    sway: 2.6,
    tumble: 2.0,
    opacity: 0.95,
    max: 450,
  },
  rain: {
    geometry: () => new THREE.CylinderGeometry(0.012, 0.012, 0.8, 4),
    colors: ['#9db8d8', '#b3c9e2'],
    fall: [16, 22],
    sway: 0,
    tumble: 0,
    opacity: 0.45,
    max: 700,
  },
  embers: {
    // negative fall speed = they rise, drifting up from the ground
    geometry: () => new THREE.BoxGeometry(0.1, 0.1, 0.1),
    colors: ['#ff8a2e', '#ffb52e', '#ff5e2e', '#ffd21a'],
    fall: [-1.8, -0.8],
    sway: 1.2,
    tumble: 1.5,
    opacity: 0.95,
    max: 450,
  },
  storm: {
    geometry: () => new THREE.CylinderGeometry(0.014, 0.014, 1.1, 4),
    colors: ['#8ba6c9', '#a3bcd9', '#7d95b8'],
    fall: [24, 32],
    sway: 0,
    tumble: 0,
    opacity: 0.55,
    max: 900,
  },
  sprinkles: {
    geometry: () => new THREE.BoxGeometry(0.06, 0.06, 0.2),
    colors: ['#ff5e8a', '#4aa3f0', '#59c94f', '#f2b53c', '#b07ce8', '#ffffff'],
    fall: [2.2, 3.6],
    sway: 1.6,
    tumble: 2.6,
    opacity: 1,
    max: 500,
  },
}

const rnd = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

export default function Particles({ kind, density, center, radius }: Props) {
  const ref = useRef<THREE.InstancedMesh>(null)

  const data = useMemo(() => {
    if (kind === 'none' || density <= 0) return null
    const spec = SPECS[kind]
    // Scale count with area so big tracks don't look sparse, capped for perf.
    const areaScale = Math.min(2.2, (radius * radius) / 900)
    const count = Math.max(20, Math.min(spec.max, Math.round(density * 5 * Math.max(0.5, areaScale))))
    const parts = Array.from({ length: count }, (_, i) => {
      const a = rnd(i + 1) * Math.PI * 2
      const r = Math.sqrt(rnd(i + 50)) * radius
      return {
        x: Math.cos(a) * r,
        z: Math.sin(a) * r,
        y: rnd(i + 200) * HEIGHT,
        fall: spec.fall[0] + rnd(i + 300) * (spec.fall[1] - spec.fall[0]),
        phase: rnd(i + 400) * Math.PI * 2,
        scale: 0.7 + rnd(i + 500) * 0.7,
      }
    })
    const geometry = spec.geometry()
    return { spec, parts, count, geometry }
  }, [kind, density, radius])

  const dummy = useMemo(() => new THREE.Object3D(), [])

  useFrame((state) => {
    const inst = ref.current
    if (!inst || !data) return
    const t = state.clock.elapsedTime
    const { spec, parts } = data
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i]
      // Wrap by time so pausing/resuming stays consistent (negative fall
      // speeds rise instead — embers).
      let y = (p.y - t * p.fall) % HEIGHT
      if (y < 0) y += HEIGHT
      const sx = spec.sway ? Math.sin(t * 0.8 + p.phase) * spec.sway : 0
      const sz = spec.sway ? Math.cos(t * 0.6 + p.phase * 1.3) * spec.sway * 0.7 : 0
      dummy.position.set(center.x + p.x + sx, y, center.z + p.z + sz)
      if (spec.tumble) {
        dummy.rotation.set(t * spec.tumble + p.phase, p.phase * 2, t * spec.tumble * 0.7)
      } else {
        dummy.rotation.set(0, 0, 0)
      }
      dummy.scale.setScalar(p.scale)
      dummy.updateMatrix()
      inst.setMatrixAt(i, dummy.matrix)
    }
    inst.instanceMatrix.needsUpdate = true
  })

  if (!data) return null

  return (
    <instancedMesh
      key={`${kind}-${data.count}`}
      ref={(inst) => {
        ;(ref as MutableRefObject<THREE.InstancedMesh | null>).current = inst
        if (!inst) return
        // Per-particle colour variation.
        const c = new THREE.Color()
        for (let i = 0; i < data.count; i++) {
          c.set(data.spec.colors[i % data.spec.colors.length])
          inst.setColorAt(i, c)
        }
        if (inst.instanceColor) inst.instanceColor.needsUpdate = true
      }}
      args={[data.geometry, undefined, data.count]}
      frustumCulled={false}
    >
      <meshBasicMaterial
        transparent
        opacity={data.spec.opacity}
        side={THREE.DoubleSide}
        fog={false}
      />
    </instancedMesh>
  )
}
