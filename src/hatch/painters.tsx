import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { SfxName } from '../audio'
import { EGG_H, rng } from './eggGeo'
import { NEST_TOP } from './model'

// The opening act's cast: six different ways to get colour onto a blank egg.
// One painter is chosen per episode and travels the row, so the show's opening
// isn't the same every time.
//
// Every rig is drawn in the same local space: the group is carried along the
// row for it, y = 0 is the grass, and the egg it's working on stands at
// NEST_TOP. All a rig has to do is animate itself in place.

/** Which way the colour spreads over the shell once it lands. */
export type PaintFill = 'down' | 'up'

export interface EggColors {
  base: string
  accent: string
}

export interface RigProps {
  /** The colours of the egg being painted right now. */
  colors: EggColors
  /** Height the paint meets the shell. */
  landY: number
}

export interface PainterDef {
  key: string
  label: string
  icon: string
  /** Colour soaks down from the crown, or climbs up from the nest. */
  fill: PaintFill
  /** Looping sound while it works. */
  sfx: SfxName
  Rig: (props: RigProps) => JSX.Element
}

const EGG_TOP = NEST_TOP + EGG_H

// ---- Shared particle spout ----------------------------------------------

interface SpoutProps {
  n: number
  color: string
  accent: string
  /** Where the stream leaves the rig, and where it ends up. */
  from: number
  to: number
  /** Half-width of the emitter mouth. */
  spread: number
  /** How much wider the stream gets on the way (0 = a column, 1 = a cone). */
  flare?: number
  speed: number
  /** Particle size: [thickness, length]. */
  size: [number, number]
  /** 'fall' runs from -> to; 'arc' throws up and falls back down again. */
  mode?: 'fall' | 'arc'
  seed: number
}

/**
 * A looping stream of little cubes — rain, a pour, a mist or a fountain jet,
 * depending on how it's parameterised. One instanced mesh, so a thick shower
 * still costs a single draw call.
 */
function Spout({
  n,
  color,
  accent,
  from,
  to,
  spread,
  flare = 0,
  speed,
  size,
  mode = 'fall',
  seed,
}: SpoutProps) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const bits = useMemo(() => {
    const rand = rng(seed)
    return Array.from({ length: n }, () => ({
      x: (rand() - 0.5) * 2 * spread,
      z: (rand() - 0.5) * 2 * spread * 0.6,
      phase: rand(),
      rate: 0.8 + rand() * 0.5,
      len: 0.7 + rand() * 0.6,
    }))
  }, [n, spread, seed])

  // Repaint whenever the egg under the rig changes colour.
  useLayoutEffect(() => {
    const m = mesh.current
    if (!m) return
    const c = new THREE.Color()
    for (let i = 0; i < n; i++) {
      c.set(i % 4 === 0 ? accent : color)
      m.setColorAt(i, c)
    }
    if (m.instanceColor) m.instanceColor.needsUpdate = true
    const mat = m.material
    if (!Array.isArray(mat)) mat.needsUpdate = true
  }, [color, accent, n])

  const tmp = useMemo(
    () => ({
      m: new THREE.Matrix4(),
      p: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      s: new THREE.Vector3(),
    }),
    [],
  )

  useFrame(({ clock }) => {
    const m = mesh.current
    if (!m) return
    const t = clock.elapsedTime
    for (let i = 0; i < n; i++) {
      const b = bits[i]
      const u = (t * speed * b.rate + b.phase) % 1
      // 'arc' throws the particle up and lets it fall back; 'fall' just drops.
      const h = mode === 'arc' ? 1 - (2 * u - 1) ** 2 : u
      const wide = 1 + flare * u
      tmp.p.set(b.x * wide, from + (to - from) * h, b.z * wide)
      // Fade out at the end of the run rather than blinking away.
      const k = u > 0.88 ? (1 - u) / 0.12 : 1
      tmp.s.set(size[0], size[1] * b.len * k, size[0])
      tmp.m.compose(tmp.p, tmp.q, tmp.s)
      m.setMatrixAt(i, tmp.m)
    }
    m.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={mesh}
      args={[
        undefined as unknown as THREE.BufferGeometry,
        undefined as unknown as THREE.Material,
        n,
      ]}
      frustumCulled={false}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial flatShading />
    </instancedMesh>
  )
}

// ---- The rigs ------------------------------------------------------------

/** 1. A cube cloud raining colour. */
function CloudRig({ colors, landY }: RigProps) {
  const body = useRef<THREE.Group>(null)
  const glow = useRef<THREE.Mesh>(null)
  const y = NEST_TOP + 2.8

  useLayoutEffect(() => {
    const g = glow.current
    if (g) (g.material as THREE.MeshBasicMaterial).color.set(colors.base)
  }, [colors])

  useFrame(({ clock }) => {
    if (body.current) body.current.position.y = y + Math.sin(clock.elapsedTime * 0.9) * 0.07
  })

  const puffs: { p: [number, number, number]; s: [number, number, number]; c: string }[] = [
    { p: [0, 0, 0], s: [1.7, 0.62, 1.05], c: '#ffffff' },
    { p: [-0.78, 0.06, 0.06], s: [1.0, 0.52, 0.92], c: '#f2f7ff' },
    { p: [0.82, 0.02, -0.06], s: [1.05, 0.56, 0.9], c: '#f2f7ff' },
    { p: [0.12, 0.34, 0.08], s: [0.9, 0.44, 0.8], c: '#ffffff' },
    { p: [-0.42, 0.36, -0.1], s: [0.72, 0.4, 0.7], c: '#e8f0fa' },
    { p: [-0.2, -0.28, 0], s: [1.2, 0.24, 0.8], c: '#dde7f4' },
  ]

  return (
    <>
      <group ref={body} position={[0, y, 0]}>
        {puffs.map((p, i) => (
          <mesh key={i} castShadow position={p.p} scale={p.s}>
            <boxGeometry />
            <meshStandardMaterial color={p.c} flatShading />
          </mesh>
        ))}
        {/* The cloud's belly glows in the colour it's pouring. */}
        <mesh ref={glow} position={[-0.2, -0.37, 0]}>
          <boxGeometry args={[1.1, 0.08, 0.72]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      </group>
      <Spout
        n={64}
        color={colors.base}
        accent={colors.accent}
        from={y - 0.34}
        to={landY}
        spread={0.95}
        speed={1}
        size={[0.07, 0.3]}
        seed={90210}
      />
    </>
  )
}

/** 2. A giant brush stroking colour down the shell. */
function BrushRig({ colors, landY }: RigProps) {
  const arm = useRef<THREE.Group>(null)
  const bristles = useRef<THREE.Mesh>(null)

  useLayoutEffect(() => {
    const b = bristles.current
    if (b) (b.material as THREE.MeshStandardMaterial).color.set(colors.base)
  }, [colors])

  useFrame(({ clock }) => {
    const g = arm.current
    if (!g) return
    // A repeating stroke: down the shell, lift, back to the top.
    const u = (clock.elapsedTime * 1.15) % 1
    const stroke = u < 0.62 ? u / 0.62 : 0
    const lift = u < 0.62 ? 0 : Math.sin(((u - 0.62) / 0.38) * Math.PI) * 0.34
    g.position.y = EGG_TOP + 0.42 - stroke * 1.15 + lift
    g.rotation.z = -0.22 + stroke * 0.44
  })

  return (
    <>
      <group ref={arm} position={[0, EGG_TOP + 0.42, 0]}>
        {/* Short and fat, like a nursery paintbrush — a long handle just runs
            off the top of the shot. */}
        <mesh castShadow position={[0, 0.86, 0]}>
          <boxGeometry args={[0.22, 1.0, 0.22]} />
          <meshStandardMaterial color="#c9873f" flatShading />
        </mesh>
        {/* Ferrule */}
        <mesh castShadow position={[0, 0.26, 0]}>
          <boxGeometry args={[0.36, 0.4, 0.3]} />
          <meshStandardMaterial color="#b9c2cc" flatShading />
        </mesh>
        {/* Bristles, loaded with the colour they're laying down */}
        <mesh ref={bristles} castShadow position={[0, -0.1, 0]}>
          <boxGeometry args={[0.5, 0.5, 0.34]} />
          <meshStandardMaterial color="#ffffff" flatShading />
        </mesh>
      </group>
      {/* A few dribbles running off the bristles */}
      <Spout
        n={14}
        color={colors.base}
        accent={colors.accent}
        from={EGG_TOP + 0.1}
        to={landY - 0.3}
        spread={0.3}
        speed={0.7}
        size={[0.07, 0.24]}
        seed={5150}
      />
    </>
  )
}

/** 3. A watering can pouring colour water. */
function CanRig({ colors, landY }: RigProps) {
  const can = useRef<THREE.Group>(null)
  const stream = useRef<THREE.Mesh>(null)
  const y = NEST_TOP + 3.0

  useLayoutEffect(() => {
    const s = stream.current
    if (s) (s.material as THREE.MeshStandardMaterial).color.set(colors.base)
  }, [colors])

  useFrame(({ clock }) => {
    const g = can.current
    if (g) {
      // Tipped over and pouring, with a gentle bob.
      g.rotation.z = 0.95 + Math.sin(clock.elapsedTime * 2.2) * 0.05
      g.position.y = y + Math.sin(clock.elapsedTime * 1.4) * 0.05
    }
  })

  const spoutY = y - 0.5
  const streamLen = spoutY - landY

  return (
    <>
      <group ref={can} position={[0, y, 0]} rotation={[0, 0, 0.95]}>
        <mesh castShadow position={[0.25, 0, 0]}>
          <boxGeometry args={[0.9, 0.8, 0.8]} />
          <meshStandardMaterial color="#5bc8d8" flatShading />
        </mesh>
        <mesh castShadow position={[0.25, 0.46, 0]}>
          <boxGeometry args={[0.7, 0.14, 0.7]} />
          <meshStandardMaterial color="#3ba7b8" flatShading />
        </mesh>
        {/* Spout, angled so it points at the egg once the can is tipped */}
        <mesh castShadow position={[-0.42, -0.22, 0]} rotation={[0, 0, 0.5]}>
          <boxGeometry args={[0.66, 0.22, 0.22]} />
          <meshStandardMaterial color="#3ba7b8" flatShading />
        </mesh>
        {/* Handle */}
        <mesh position={[0.62, 0.34, 0]} rotation={[0, 0, -0.5]}>
          <boxGeometry args={[0.6, 0.12, 0.14]} />
          <meshStandardMaterial color="#3ba7b8" flatShading />
        </mesh>
      </group>
      {/* One solid ribbon of colour water, not a shower */}
      <mesh ref={stream} position={[0, landY + streamLen / 2, 0]}>
        <boxGeometry args={[0.26, streamLen, 0.26]} />
        <meshStandardMaterial color="#ffffff" flatShading />
      </mesh>
      {/* Splashes where it meets the shell */}
      <Spout
        n={18}
        color={colors.base}
        accent={colors.accent}
        from={landY}
        to={landY - 0.55}
        spread={0.34}
        flare={1.6}
        speed={1.6}
        size={[0.09, 0.14]}
        seed={31337}
      />
    </>
  )
}

/** 4. A spray can misting colour over the shell. */
function SprayRig({ colors, landY }: RigProps) {
  const can = useRef<THREE.Group>(null)
  const y = NEST_TOP + 3.1

  useFrame(({ clock }) => {
    const g = can.current
    if (!g) return
    // Shaken as it sprays.
    const t = clock.elapsedTime
    g.position.set(Math.sin(t * 14) * 0.035, y + Math.sin(t * 1.6) * 0.06, 0)
    g.rotation.z = 0.18 + Math.sin(t * 12) * 0.03
  })

  return (
    <>
      <group ref={can} position={[0, y, 0]} rotation={[0, 0, 0.18]}>
        <mesh castShadow position={[0, 0, 0]}>
          <boxGeometry args={[0.44, 0.95, 0.44]} />
          <meshStandardMaterial color={colors.base} flatShading />
        </mesh>
        <mesh position={[0, 0.1, 0]}>
          <boxGeometry args={[0.47, 0.22, 0.47]} />
          <meshStandardMaterial color="#ffffff" flatShading />
        </mesh>
        {/* Cap and nozzle */}
        <mesh castShadow position={[0, -0.56, 0]}>
          <boxGeometry args={[0.3, 0.2, 0.3]} />
          <meshStandardMaterial color="#4a4a4a" flatShading />
        </mesh>
        <mesh position={[0, -0.7, 0]}>
          <boxGeometry args={[0.14, 0.12, 0.14]} />
          <meshStandardMaterial color="#2b2b2b" flatShading />
        </mesh>
      </group>
      {/* A widening cone of mist: many small, fast, short-lived specks */}
      <Spout
        n={90}
        color={colors.base}
        accent={colors.accent}
        from={y - 0.78}
        to={landY - 0.15}
        spread={0.16}
        flare={4.5}
        speed={2.1}
        size={[0.085, 0.085]}
        seed={777}
      />
    </>
  )
}

/** 5. A bucket tipping a whole load of paint over the egg. */
function BucketRig({ colors, landY }: RigProps) {
  const bucket = useRef<THREE.Group>(null)
  const paint = useRef<THREE.Mesh>(null)
  const pour = useRef<THREE.Group>(null)
  const y = NEST_TOP + 3.2

  useLayoutEffect(() => {
    const p = paint.current
    if (p) (p.material as THREE.MeshStandardMaterial).color.set(colors.base)
  }, [colors])

  useFrame(({ clock }) => {
    // Tips right over, holds, comes back up — one dump per second or so.
    const u = (clock.elapsedTime * 0.8) % 1
    const tip = u < 0.25 ? u / 0.25 : u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3
    const g = bucket.current
    if (g) {
      g.rotation.z = tip * 2.1
      g.position.y = y + tip * 0.12
    }
    // The paint only exists while the bucket is actually tipped, and runs down
    // from the rim rather than appearing all at once.
    const p = pour.current
    if (p) {
      const flow = Math.max(0, (tip - 0.35) / 0.65)
      p.scale.y = flow
      p.visible = flow > 0.01
    }
  })

  const fallLen = y - 0.7 - landY

  return (
    <>
      <group ref={bucket} position={[0, y, 0]}>
        <mesh castShadow position={[0, 0, 0]}>
          <boxGeometry args={[0.95, 0.85, 0.85]} />
          <meshStandardMaterial color="#d8493c" flatShading />
        </mesh>
        <mesh position={[0, 0.44, 0]}>
          <boxGeometry args={[1.02, 0.14, 0.92]} />
          <meshStandardMaterial color="#b23a2f" flatShading />
        </mesh>
        <mesh position={[0, 0.62, 0]} rotation={[0, 0, 0.15]}>
          <boxGeometry args={[1.0, 0.09, 0.1]} />
          <meshStandardMaterial color="#8a8f96" flatShading />
        </mesh>
      </group>
      {/* A thick slab of paint rather than droplets, anchored at the rim so it
          grows downward as the bucket goes over. */}
      <group ref={pour} position={[0, y - 0.7, 0]} visible={false}>
        <mesh ref={paint} position={[0, -fallLen / 2, 0]}>
          <boxGeometry args={[0.5, fallLen, 0.42]} />
          <meshStandardMaterial color="#ffffff" flatShading />
        </mesh>
      </group>
      <Spout
        n={26}
        color={colors.base}
        accent={colors.accent}
        from={landY + 0.2}
        to={landY - 0.7}
        spread={0.4}
        flare={1.8}
        speed={1.2}
        size={[0.12, 0.18]}
        seed={4242}
      />
    </>
  )
}

/** 6. A fountain in the nest, washing colour up the shell from below. */
function FountainRig({ colors }: RigProps) {
  const jet = useRef<THREE.Group>(null)

  useFrame(({ clock }) => {
    const g = jet.current
    if (g) g.rotation.y = clock.elapsedTime * 0.9
  })

  return (
    <>
      {/* Spouts around the rim of the nest */}
      <group ref={jet} position={[0, NEST_TOP - 0.04, 0]}>
        {[0, 1, 2, 3].map((i) => {
          const a = (i / 4) * Math.PI * 2
          return (
            <mesh key={i} position={[Math.cos(a) * 0.62, 0, Math.sin(a) * 0.62]}>
              <boxGeometry args={[0.16, 0.18, 0.16]} />
              <meshStandardMaterial color="#8d99a6" flatShading />
            </mesh>
          )
        })}
      </group>
      {/* Jets arcing up around the egg and falling back. Kept just short of
          the crown: a taller spout stops reading as a fountain and starts
          looking like a hedge behind the nest. */}
      <Spout
        n={100}
        color={colors.base}
        accent={colors.accent}
        from={NEST_TOP}
        to={EGG_TOP - 0.15}
        spread={0.5}
        flare={0.45}
        speed={0.95}
        size={[0.09, 0.17]}
        mode="arc"
        seed={1234}
      />
    </>
  )
}

// ---- The roster ----------------------------------------------------------

export const PAINTERS: PainterDef[] = [
  { key: 'rain', label: 'Colour rain', icon: '☁️', fill: 'down', sfx: 'gush', Rig: CloudRig },
  { key: 'brush', label: 'Paint brush', icon: '🖌️', fill: 'down', sfx: 'skid', Rig: BrushRig },
  { key: 'can', label: 'Colour water', icon: '🚿', fill: 'down', sfx: 'gush', Rig: CanRig },
  { key: 'spray', label: 'Spray can', icon: '🎨', fill: 'down', sfx: 'wind', Rig: SprayRig },
  { key: 'bucket', label: 'Paint bucket', icon: '🪣', fill: 'down', sfx: 'splash', Rig: BucketRig },
  { key: 'fountain', label: 'Colour fountain', icon: '⛲', fill: 'up', sfx: 'gush', Rig: FountainRig },
]

export const PAINTER_BY_KEY = new Map(PAINTERS.map((p) => [p.key, p]))

/**
 * One painter per pass — it travels the row without stopping, so swapping rigs
 * mid-pass would read as a glitch rather than as variety.
 */
export function pickPainter(rand: () => number, forced?: string): PainterDef {
  const only = forced ? PAINTER_BY_KEY.get(forced) : undefined
  return only ?? PAINTERS[Math.floor(rand() * PAINTERS.length) % PAINTERS.length]
}

/**
 * The rig for the second pass, which stamps the patterns on. Deliberately not
 * the one that laid the base coat — seeing a different tool come back for the
 * detail work is the whole point of splitting the job in two.
 */
export function pickPatternPainter(
  rand: () => number,
  base: PainterDef,
  forced?: string,
): PainterDef {
  const only = forced ? PAINTER_BY_KEY.get(forced) : undefined
  if (only) return only
  const others = PAINTERS.filter((p) => p.key !== base.key)
  return others[Math.floor(rand() * others.length) % others.length]
}
