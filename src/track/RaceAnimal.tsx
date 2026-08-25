import { MutableRefObject, useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { AnimalDesign, Block } from '../studio/model'
import { blockPose, legPivots, pivotFor, rootPose } from '../studio/animate'

const DEG = Math.PI / 180
const TARGET = 2.0 // world units the animal's largest dimension is scaled to
const RUN_REF_SPEED = 8 // speed at which the walk cadence plays at natural rate

interface Props {
  design: AnimalDesign
  /** Per-lane current forward speed; drives walk-vs-idle + cadence. */
  speedRef?: MutableRefObject<number[]>
  laneIndex?: number
  /** Local Y offset so the model's feet rest on the road. */
  groundDrop?: number
  /** Yaw so the model faces forward along the track (designs face +Z). */
  faceY?: number
}

/** Merge a set of blocks into one vertex-coloured geometry (origin-relative). */
function mergedGeometry(blocks: Block[], origin: [number, number, number]): THREE.BufferGeometry | null {
  if (blocks.length === 0) return null
  const parts: THREE.BufferGeometry[] = []
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  const one = new THREE.Vector3(1, 1, 1)
  const v = new THREE.Vector3()
  const c = new THREE.Color()
  for (const b of blocks) {
    const g = new THREE.BoxGeometry(b.size[0], b.size[1], b.size[2])
    e.set(b.rot[0] * DEG, b.rot[1] * DEG, b.rot[2] * DEG)
    q.setFromEuler(e)
    v.set(b.pos[0] - origin[0], b.pos[1] - origin[1], b.pos[2] - origin[2])
    m.compose(v, q, one)
    g.applyMatrix4(m)
    c.set(b.color)
    const n = g.attributes.position.count
    const colors = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      colors[i * 3] = c.r
      colors[i * 3 + 1] = c.g
      colors[i * 3 + 2] = c.b
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    parts.push(g)
  }
  const merged = mergeGeometries(parts, false)
  parts.forEach((p) => p.dispose())
  return merged
}

/**
 * Renders a saved cube-animal design as a track racer. High-detail designs
 * (hundreds of voxels) stay cheap: blocks that never rotate (body/static) are
 * merged into one mesh, the head is merged and rotates rigidly about a shared
 * neck pivot, and only the animated limbs remain individual meshes.
 */
export default function RaceAnimal({
  design,
  speedRef,
  laneIndex = 0,
  groundDrop = 0,
  faceY = 0,
}: Props) {
  const bobRef = useRef<THREE.Group>(null)
  const headRef = useRef<THREE.Group>(null)
  const outer = useRef<Record<string, THREE.Group | null>>({})
  const tRef = useRef(0)

  const { staticGeom, headGeom, headPivot, dynamicBlocks, pivots, scale, offset } = useMemo(() => {
    // Bounding box over every block corner.
    const min = new THREE.Vector3(Infinity, Infinity, Infinity)
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity)
    for (const b of design.blocks) {
      const [px, py, pz] = b.pos
      const [sx, sy, sz] = b.size
      min.set(Math.min(min.x, px - sx / 2), Math.min(min.y, py - sy / 2), Math.min(min.z, pz - sz / 2))
      max.set(Math.max(max.x, px + sx / 2), Math.max(max.y, py + sy / 2), Math.max(max.z, pz + sz / 2))
    }
    const size = new THREE.Vector3().subVectors(max, min)
    const maxDim = Math.max(size.x, size.y, size.z) || 1
    const scale = TARGET / maxDim
    // Center on X/Z, drop feet (min.y) to the group origin.
    const offset: [number, number, number] = [
      -(min.x + max.x) / 2,
      -min.y,
      -(min.z + max.z) / 2,
    ]

    const statics: Block[] = []
    const heads: Block[] = []
    const dynamicBlocks: Block[] = []
    for (const b of design.blocks) {
      if (b.role === 'body' || b.role === 'none') statics.push(b)
      else if (b.role === 'head') heads.push(b)
      else dynamicBlocks.push(b)
    }

    // The whole head nods about one shared neck pivot (back-bottom of its
    // bounding box) — same convention as pivotFor, minus per-block shear.
    const headPivot: [number, number, number] = [0, 0, 0]
    if (heads.length > 0) {
      let hy = Infinity
      let hz = Infinity
      let hx = 0
      for (const b of heads) {
        hy = Math.min(hy, b.pos[1] - b.size[1] / 2)
        hz = Math.min(hz, b.pos[2] - b.size[2] / 2)
        hx += b.pos[0]
      }
      headPivot[0] = hx / heads.length
      headPivot[1] = hy
      headPivot[2] = hz
    }

    const legs = legPivots(design.blocks)
    const pivots: Record<string, [number, number, number]> = {}
    for (const b of dynamicBlocks) pivots[b.id] = legs[b.role] ?? pivotFor(b)

    return {
      staticGeom: mergedGeometry(statics, [0, 0, 0]),
      headGeom: mergedGeometry(heads, headPivot),
      headPivot,
      dynamicBlocks,
      pivots,
      scale,
      offset,
    }
  }, [design])

  // Dispose merged geometries when the design changes / unmounts.
  useEffect(() => {
    return () => {
      staticGeom?.dispose()
      headGeom?.dispose()
    }
  }, [staticGeom, headGeom])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const speed = Math.abs(speedRef?.current?.[laneIndex] ?? 0)
    const moving = speed > 0.2
    const clip = moving ? 'walk' : 'idle'
    // Advance the clock, speeding the walk cadence up/down with velocity.
    const cadence = moving ? THREE.MathUtils.clamp(speed / RUN_REF_SPEED, 0.6, 1.8) : 1
    tRef.current += dt * cadence
    const t = tRef.current

    const rp = rootPose(clip, t, design.anim)
    if (bobRef.current) {
      bobRef.current.position.y = rp.y
      bobRef.current.rotation.x = rp.pitch
    }
    if (headRef.current) {
      const hp = blockPose('head', clip, t, design.anim)
      headRef.current.rotation.set(hp.rx, hp.ry, hp.rz)
    }
    for (const b of dynamicBlocks) {
      const g = outer.current[b.id]
      if (!g) continue
      const bp = blockPose(b.role, clip, t, design.anim)
      g.rotation.set(bp.rx, bp.ry, bp.rz)
    }
  })

  return (
    <group scale={scale} position={[0, groundDrop, 0]} rotation={[0, faceY, 0]}>
      <group ref={bobRef}>
        <group position={offset}>
          {staticGeom && (
            <mesh geometry={staticGeom} castShadow>
              <meshStandardMaterial vertexColors flatShading />
            </mesh>
          )}
          {headGeom && (
            <group ref={headRef} position={headPivot}>
              <mesh geometry={headGeom} castShadow>
                <meshStandardMaterial vertexColors flatShading />
              </mesh>
            </group>
          )}
          {dynamicBlocks.map((b) => {
            const pv = pivots[b.id] ?? b.pos
            return (
              <group
                key={b.id}
                ref={(el) => {
                  outer.current[b.id] = el
                }}
                position={pv}
              >
                <mesh
                  position={[b.pos[0] - pv[0], b.pos[1] - pv[1], b.pos[2] - pv[2]]}
                  rotation={[b.rot[0] * DEG, b.rot[1] * DEG, b.rot[2] * DEG]}
                  castShadow
                >
                  <boxGeometry args={b.size} />
                  <meshStandardMaterial color={b.color} flatShading />
                </mesh>
              </group>
            )
          })}
        </group>
      </group>
    </group>
  )
}
