import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { LANE_SPACING, NUM_LANES, Track } from './build'

const GRASS_URL = `${import.meta.env.BASE_URL}models/track/grass_patch.glb`

const STEP = 4.2 // grid spacing between grass tufts (dense -> full field)
const REACH = 40 // how far past the track bounds to keep planting grass
const MAX_HALF = 58 // cap on the field half-size
// Let grass come right up to the road edge (and slightly onto it) so the road
// blends into the green rather than having a hard clean border.
const CORRIDOR = ((NUM_LANES - 1) / 2) * LANE_SPACING + 0.2
const KEEP = 0.55 // fraction of each patch's blades kept (thins it for density)

// Default bright green for the grass (the model's own greens are dark/olive).
export const GRASS_DEFAULT = '#83e05a'

// Deterministic pseudo-random so tufts don't jump between renders.
function rnd(n: number) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

/** Merge the grass model's two greens into one vertex-colored tile, thinned. */
function buildGrassGeometry(scene: THREE.Object3D, colorHex: string): THREE.BufferGeometry {
  const light = new THREE.Color(colorHex)
  const dark = light.clone().multiplyScalar(0.74)
  scene.updateMatrixWorld(true)
  const parts: THREE.BufferGeometry[] = []
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const g = mesh.geometry.clone()
    g.applyMatrix4(mesh.matrixWorld)
    // The model has two greens; map them to the environment's grass colour.
    const name = (mesh.material as THREE.Material)?.name ?? ''
    const c = /10/.test(name) ? dark : light
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

  const merged = mergeGeometries(parts, false) ?? new THREE.BufferGeometry()
  return decimate(merged.toNonIndexed(), KEEP)
}

/** Keep a deterministic fraction of triangles to lighten the mesh. */
function decimate(geo: THREE.BufferGeometry, keep: number): THREE.BufferGeometry {
  const pos = geo.attributes.position.array as ArrayLike<number>
  const col = geo.attributes.color?.array as ArrayLike<number> | undefined
  const nor = geo.attributes.normal?.array as ArrayLike<number> | undefined
  const tris = Math.floor(pos.length / 9)
  const np: number[] = []
  const nc: number[] = []
  const nn: number[] = []
  for (let t = 0; t < tris; t++) {
    if (rnd(t + 1) > keep) continue
    for (let v = 0; v < 9; v++) {
      np.push(pos[t * 9 + v])
      if (col) nc.push(col[t * 9 + v])
      if (nor) nn.push(nor[t * 9 + v])
    }
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.Float32BufferAttribute(np, 3))
  if (col) out.setAttribute('color', new THREE.Float32BufferAttribute(nc, 3))
  if (nor) out.setAttribute('normal', new THREE.Float32BufferAttribute(nn, 3))
  return out
}

/**
 * Fills the whole field with short grass: the grass-patch model (thinned) is
 * scattered as dense instanced tufts across the field around the track, up to
 * and slightly onto the road edges so the road blends into the green. The flat
 * green ground shows between tufts.
 */
export default function GrassField({ track, color = GRASS_DEFAULT }: { track: Track; color?: string }) {
  const gltf = useGLTF(GRASS_URL)
  const geometry = useMemo(
    () => buildGrassGeometry(gltf.scene as THREE.Object3D, color),
    [gltf.scene, color],
  )

  const { instances, count } = useMemo(() => {
    const mats: THREE.Matrix4[] = []
    const cx = track.boundsCenter.x
    const cz = track.boundsCenter.z
    const half = Math.min(track.radius + REACH, MAX_HALF)
    const pts = track.center.points
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    const pos = new THREE.Vector3()
    const scl = new THREE.Vector3()

    let idx = 0
    for (let gx = cx - half; gx <= cx + half; gx += STEP) {
      for (let gz = cz - half; gz <= cz + half; gz += STEP) {
        idx++
        const jx = gx + (rnd(idx) - 0.5) * STEP * 0.8
        const jz = gz + (rnd(idx + 99) - 0.5) * STEP * 0.8
        // Skip tufts sitting on the road interior (keep them to the edges out).
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
        // Short tufts: modest footprint, low height.
        const foot = 0.9 * (0.8 + rnd(idx + 33) * 0.5)
        scl.set(foot, foot * 0.55, foot)
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
