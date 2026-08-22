import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { LANE_SPACING, NUM_LANES, Track } from './build'

const GRASS_URL = `${import.meta.env.BASE_URL}models/track/grass_patch.glb`

const STEP = 5.2 // grid spacing between grass tufts
const MARGIN = 7 // how far past the track bounds to keep planting grass
const CORRIDOR = (NUM_LANES / 2) * LANE_SPACING + 1.5 // keep grass off the road
const SCALE = 1.25 // patch scale (footprint ~3.4, blades ~0.6 tall)

// Deterministic pseudo-random so tufts don't jump between renders.
function rnd(n: number) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

/** Merge the grass model's two green materials into one vertex-colored tile. */
function buildGrassGeometry(scene: THREE.Object3D): THREE.BufferGeometry {
  scene.updateMatrixWorld(true)
  const parts: THREE.BufferGeometry[] = []
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const g = mesh.geometry.clone()
    g.applyMatrix4(mesh.matrixWorld)
    const mat = mesh.material as THREE.MeshStandardMaterial
    const c = mat?.color ?? new THREE.Color(0.2, 0.5, 0.1)
    const n = g.attributes.position.count
    const colors = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      colors[i * 3] = c.r
      colors[i * 3 + 1] = c.g
      colors[i * 3 + 2] = c.b
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    for (const attr of Object.keys(g.attributes)) {
      if (attr !== 'position' && attr !== 'color' && attr !== 'normal') g.deleteAttribute(attr)
    }
    parts.push(g)
  })
  return mergeGeometries(parts, false) ?? new THREE.BufferGeometry()
}

/**
 * Fills the field around the track with scattered tufts of the grass-patch
 * model (one InstancedMesh), skipping the strip along the track so the grass
 * doesn't poke through the road. The flat green ground plane shows between
 * tufts, so it reads as a grassy meadow.
 */
export default function GrassField({ track }: { track: Track }) {
  const gltf = useGLTF(GRASS_URL)
  const geometry = useMemo(() => buildGrassGeometry(gltf.scene as THREE.Object3D), [gltf.scene])

  const { instances, count } = useMemo(() => {
    const mats: THREE.Matrix4[] = []
    const cx = track.boundsCenter.x
    const cz = track.boundsCenter.z
    const half = Math.min(track.radius + MARGIN, 46)
    const pts = track.center.points
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    const pos = new THREE.Vector3()
    const scl = new THREE.Vector3()

    let idx = 0
    for (let gx = cx - half; gx <= cx + half; gx += STEP) {
      for (let gz = cz - half; gz <= cz + half; gz += STEP) {
        idx++
        const jx = gx + (rnd(idx) - 0.5) * STEP * 0.7
        const jz = gz + (rnd(idx + 99) - 0.5) * STEP * 0.7
        // Skip tufts that sit on/near the track.
        let near = false
        for (let i = 0; i < pts.length; i += 2) {
          const dx = pts[i].x - jx
          const dz = pts[i].z - jz
          if (dx * dx + dz * dz < CORRIDOR * CORRIDOR) {
            near = true
            break
          }
        }
        if (near) continue
        q.setFromAxisAngle(up, rnd(idx + 7) * Math.PI * 2)
        const s = SCALE * (0.75 + rnd(idx + 33) * 0.6)
        scl.set(s, s * (0.85 + rnd(idx + 51) * 0.5), s)
        pos.set(jx, 0, jz)
        mats.push(new THREE.Matrix4().compose(pos, q, scl))
      }
    }
    return { instances: mats, count: mats.length }
  }, [track])

  return (
    <instancedMesh
      key={count}
      args={[geometry, undefined, count]}
      ref={(inst) => {
        if (!inst) return
        for (let i = 0; i < instances.length; i++) inst.setMatrixAt(i, instances[i])
        inst.instanceMatrix.needsUpdate = true
      }}
    >
      <meshStandardMaterial vertexColors flatShading roughness={0.9} metalness={0} />
    </instancedMesh>
  )
}

useGLTF.preload(GRASS_URL)
