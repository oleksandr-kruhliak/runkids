import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { LANE_WIDTH, Track, sampleCenter } from './build'

const MODEL_URL = `${import.meta.env.BASE_URL}models/track/path_straight.glb`

const STEP = 0.95 // arc-length each tile covers along the track
const THICK = 0.2 // world thickness of the stone slab
const LINE_W = 0.16 // width of the colored lane centre line
const LINE_LIFT = 0.015 // how far the lane line sits above the stone

// The GLB's stone materials are quite dark; lift them to a readable gray.
const LIGHT_STONE = new THREE.Color(0.177, 0.211, 0.231).multiplyScalar(2.4)
const DARK_STONE = new THREE.Color(0.124, 0.146, 0.181).multiplyScalar(2.4)

/**
 * Bake the loaded path model into a single unit tile: node transform applied,
 * both stone materials merged into one geometry with vertex colors, centered in
 * X/Z with its TOP at y=0 and a unit footprint so per-instance scaling maps it
 * to (lane width x slab thickness x tile step).
 */
function buildTileGeometry(scene: THREE.Object3D): THREE.BufferGeometry {
  scene.updateMatrixWorld(true)
  const parts: THREE.BufferGeometry[] = []
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const g = mesh.geometry.clone()
    g.applyMatrix4(mesh.matrixWorld)
    // Colour each vertex by which stone material this primitive used.
    const name = (mesh.material as THREE.Material)?.name ?? ''
    const c = /dark/i.test(name) ? DARK_STONE : LIGHT_STONE
    const n = g.attributes.position.count
    const colors = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      colors[i * 3] = c.r
      colors[i * 3 + 1] = c.g
      colors[i * 3 + 2] = c.b
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    // Keep only position + color so the merge is clean.
    for (const attr of Object.keys(g.attributes)) {
      if (attr !== 'position' && attr !== 'color' && attr !== 'normal') g.deleteAttribute(attr)
    }
    parts.push(g)
  })

  const merged = mergeGeometries(parts, false) ?? new THREE.BufferGeometry()
  merged.computeBoundingBox()
  const bb = merged.boundingBox as THREE.Box3
  const size = new THREE.Vector3()
  bb.getSize(size)
  const cx = (bb.min.x + bb.max.x) / 2
  const cz = (bb.min.z + bb.max.z) / 2
  const sx = size.x || 1
  const sy = size.y || 1
  const sz = size.z || 1
  // Center X/Z, drop top to y=0, and normalize to a unit box.
  merged.translate(-cx, -bb.max.y, -cz)
  merged.scale(1 / sx, 1 / sy, 1 / sz)
  merged.computeVertexNormals()
  return merged
}

/** Colored centre-line ribbon for one lane, following the spline, skipping gaps. */
function buildLaneLine(
  track: Track,
  offset: number,
  gaps: [number, number][],
  color: THREE.Color,
): THREE.BufferGeometry | null {
  const { center } = track
  const len = center.length
  if (len <= 0) return null
  const half = LINE_W / 2
  const pos: number[] = []
  const col: number[] = []
  const inGap = (d: number) => gaps.some(([s, e]) => d >= s && d <= e)

  let prev: { l: THREE.Vector3; r: THREE.Vector3 } | null = null
  const N = Math.max(2, Math.round(len / 0.5))
  for (let i = 0; i <= N; i++) {
    const d = (len * i) / N
    const f = sampleCenter(center, d)
    const c = f.pos.clone().addScaledVector(f.right, offset).addScaledVector(f.up, LINE_LIFT)
    const l = c.clone().addScaledVector(f.right, -half)
    const r = c.clone().addScaledVector(f.right, half)
    if (prev && !inGap(d) && !inGap((len * (i - 1)) / N)) {
      const a = prev.l
      const b = prev.r
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z, r.x, r.y, r.z)
      pos.push(a.x, a.y, a.z, r.x, r.y, r.z, l.x, l.y, l.z)
      for (let k = 0; k < 6; k++) col.push(color.r, color.g, color.b)
    }
    prev = { l, r }
  }
  if (!pos.length) return null
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.computeVertexNormals()
  return g
}

/**
 * Renders the track as a tiled stone road: the uploaded path model is baked to a
 * unit tile and instanced along each lane's centreline (skipping jump gaps), with
 * a thin colored centre line per lane so each animal's lane stays readable.
 */
export default function StoneRoad({ track }: { track: Track }) {
  const gltf = useGLTF(MODEL_URL)

  const tile = useMemo(() => buildTileGeometry(gltf.scene as THREE.Object3D), [gltf.scene])

  const { instances, count } = useMemo(() => {
    const mats: THREE.Matrix4[] = []
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const basis = new THREE.Matrix4()
    const scl = new THREE.Vector3(LANE_WIDTH, THICK, STEP * 1.04)
    const posV = new THREE.Vector3()
    const xAxis = new THREE.Vector3()
    const yAxis = new THREE.Vector3()
    const len = track.center.length
    for (const lane of track.lanes) {
      // Leave a hole in the road for jump gaps AND water (the water tile sits
      // in the hole rather than on top of the road).
      const holes = lane.obstacles
        .filter((o) => o.type === 'gap' || o.type === 'water')
        .map((o) => [o.start, o.end] as [number, number])
      // Skip a tile if any part of it overlaps a hole, so no road shows under
      // the water's edges.
      const tileInHole = (d: number) =>
        holes.some(([s, e]) => d - STEP / 2 < e && d + STEP / 2 > s)
      const steps = Math.max(1, Math.floor(len / STEP))
      for (let i = 0; i < steps; i++) {
        const d = (i + 0.5) * STEP
        if (tileInHole(d)) continue
        const f = sampleCenter(track.center, d)
        // Basis: X across (right), Y up, Z along (tangent).
        xAxis.copy(f.right)
        yAxis.copy(f.up)
        basis.makeBasis(xAxis, yAxis, f.tangent)
        q.setFromRotationMatrix(basis)
        posV.copy(f.pos).addScaledVector(f.right, lane.offset)
        mats.push(new THREE.Matrix4().compose(posV, q, scl))
      }
    }
    return { instances: mats, count: mats.length }
  }, [track])

  const lines = useMemo(() => {
    const geoms: THREE.BufferGeometry[] = []
    for (const lane of track.lanes) {
      const holes = lane.obstacles
        .filter((o) => o.type === 'gap' || o.type === 'water')
        .map((o) => [o.start, o.end] as [number, number])
      const g = buildLaneLine(track, lane.offset, holes, new THREE.Color(lane.color))
      if (g) geoms.push(g)
    }
    return geoms.length ? (mergeGeometries(geoms, false) ?? null) : null
  }, [track])

  return (
    <group>
      <instancedMesh
        key={count}
        args={[tile, undefined, count]}
        receiveShadow
        ref={(inst) => {
          if (!inst) return
          for (let i = 0; i < instances.length; i++) inst.setMatrixAt(i, instances[i])
          inst.instanceMatrix.needsUpdate = true
        }}
      >
        <meshStandardMaterial vertexColors flatShading roughness={0.95} metalness={0.05} />
      </instancedMesh>

      {lines && (
        <mesh geometry={lines} renderOrder={1}>
          <meshStandardMaterial vertexColors roughness={0.6} metalness={0} />
        </mesh>
      )}
    </group>
  )
}

useGLTF.preload(MODEL_URL)
