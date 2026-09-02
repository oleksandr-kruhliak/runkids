import { useEffect, useMemo, useRef } from 'react'
import { useFrame, ThreeEvent } from '@react-three/fiber'
import { Edges } from '@react-three/drei'
import * as THREE from 'three'
import { AnimParams, Block, Clip, Vec3 } from './model'
import { blockPose, limbPivots, parentRole, pivotFor, rootPose } from './animate'

const DEG = Math.PI / 180

interface Props {
  blocks: Block[]
  anim: AnimParams
  clip: Clip
  playing: boolean
  selectedId?: string | null
  onSelect?: (id: string) => void
}

/**
 * Renders a cube animal and animates it procedurally. Each block sits inside a
 * group placed at its pivot so the animation can rotate legs/ears/tail about a
 * natural hinge; the whole animal bobs/arcs via a root group. Per-frame updates
 * are applied imperatively to avoid re-rendering React on every tick.
 */
export default function AnimalView({
  blocks,
  anim,
  clip,
  playing,
  selectedId,
  onSelect,
}: Props) {
  const rootRef = useRef<THREE.Group>(null)
  const outer = useRef<Record<string, THREE.Group | null>>({})
  const inner = useRef<Record<string, THREE.Group | null>>({})
  const tRef = useRef(0)
  const prevClip = useRef<Clip>(clip)

  // Restart the clock when the clip changes so jumps begin from a clean crouch.
  useEffect(() => {
    tRef.current = 0
  }, [clip])

  /**
   * Where each block hinges. A block below a knee/elbow gets two hinges: the
   * hip/shoulder it inherits from the segment above, and its own joint.
   */
  const rig = useMemo(() => {
    const limbs = limbPivots(blocks)
    const m: Record<string, { hinge: Vec3; joint?: Vec3; parent?: ReturnType<typeof parentRole> }> = {}
    for (const b of blocks) {
      const parent = parentRole(b.role)
      const own = limbs[b.role] ?? pivotFor(b)
      if (parent) m[b.id] = { hinge: limbs[parent] ?? own, joint: own, parent }
      else m[b.id] = { hinge: own }
    }
    return m
  }, [blocks])

  useFrame((_, delta) => {
    if (prevClip.current !== clip) prevClip.current = clip
    if (playing) tRef.current += Math.min(delta, 0.05)
    const t = tRef.current

    const rp = rootPose(clip, t, anim)
    if (rootRef.current) {
      rootRef.current.position.y = rp.y
      rootRef.current.rotation.x = rp.pitch
    }

    for (const b of blocks) {
      const g = outer.current[b.id]
      if (!g) continue
      const r = rig[b.id]
      // Below a joint, the outer group carries the parent segment's swing and
      // the inner group adds the knee/elbow bend on top of it.
      const bp = blockPose(r?.parent ?? b.role, clip, t, anim)
      g.rotation.set(bp.rx, bp.ry, bp.rz)
      const j = inner.current[b.id]
      if (j) {
        const jp = blockPose(b.role, clip, t, anim)
        j.rotation.set(jp.rx, jp.ry, jp.rz)
      }
    }
  })

  return (
    <group ref={rootRef}>
      {blocks.map((b) => {
        const r = rig[b.id]
        const hinge = r?.hinge ?? b.pos
        const joint = r?.joint ?? hinge
        const selected = b.id === selectedId
        const handleClick = (e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation()
          onSelect?.(b.id)
        }
        const mesh = (
          <mesh
            position={[b.pos[0] - joint[0], b.pos[1] - joint[1], b.pos[2] - joint[2]]}
            rotation={[b.rot[0] * DEG, b.rot[1] * DEG, b.rot[2] * DEG]}
            onClick={handleClick}
            castShadow
            receiveShadow
          >
            <boxGeometry args={b.size} />
            <meshStandardMaterial
              color={b.color}
              flatShading
              emissive={selected ? '#ffffff' : '#000000'}
              emissiveIntensity={selected ? 0.28 : 0}
            />
            {selected && <Edges scale={1.02} threshold={1} color="#ffffff" />}
          </mesh>
        )
        return (
          <group
            key={b.id}
            ref={(el) => {
              outer.current[b.id] = el
            }}
            position={hinge}
          >
            {r?.joint ? (
              <group
                ref={(el) => {
                  inner.current[b.id] = el
                }}
                position={[joint[0] - hinge[0], joint[1] - hinge[1], joint[2] - hinge[2]]}
              >
                {mesh}
              </group>
            ) : (
              mesh
            )}
          </group>
        )
      })}
    </group>
  )
}
