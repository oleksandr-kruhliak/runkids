import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { LANE_WIDTH, Track, sampleCenter } from './build'

const MODEL_URL = `${import.meta.env.BASE_URL}models/track/path_straight.glb`

const STEP = 0.4 // arc-length each tile covers along the track (fine, for smooth curves)
const THICK = 0.2 // world thickness of the stone slab
const LINE_W = 0.16 // width of the colored lane centre line
const LINE_LIFT = 0.015 // how far the lane line sits above the stone
const WATER_Y = 0.08 // height of the water surface above the road base

// The GLB's stone materials are quite dark; lift them to a readable gray.
const LIGHT_STONE = new THREE.Color(0.177, 0.211, 0.231).multiplyScalar(2.4)
const DARK_STONE = new THREE.Color(0.124, 0.146, 0.181).multiplyScalar(2.4)

// Shared time uniform driving the water ripple in the vertex shader.
const waveTime = { value: 0 }

function makeWaterMaterial() {
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.12, 0.28, 0.5),
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    roughness: 0.22,
    metalness: 0.1,
    side: THREE.DoubleSide,
  })
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = waveTime
    shader.vertexShader =
      'uniform float uTime;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         transformed.y +=
           sin(position.x * 1.6 + uTime * 1.5) * cos(position.z * 1.3 + uTime) * 0.05 +
           sin(position.z * 3.0 + uTime * 2.0) * 0.02;`,
      )
  }
  return m
}

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
  merged.translate(-cx, -bb.max.y, -cz)
  merged.scale(1 / sx, 1 / sy, 1 / sz)
  merged.computeVertexNormals()
  return merged
}

/** A ribbon swept along a lane's spline between arc-lengths, skipping holes. */
function buildRibbon(
  track: Track,
  offset: number,
  halfWidth: number,
  yLift: number,
  ranges: [number, number][] | null,
  skipRanges: [number, number][],
  color?: THREE.Color,
): THREE.BufferGeometry | null {
  const { center } = track
  const len = center.length
  if (len <= 0) return null
  const pos: number[] = []
  const col: number[] = []
  const inSkip = (d: number) => skipRanges.some(([s, e]) => d >= s && d <= e)

  const emit = (from: number, to: number) => {
    const span = to - from
    const n = Math.max(2, Math.round(span / 0.35))
    let prev: { l: THREE.Vector3; r: THREE.Vector3; d: number } | null = null
    for (let i = 0; i <= n; i++) {
      const d = from + (span * i) / n
      const f = sampleCenter(center, d)
      const c = f.pos.clone().addScaledVector(f.right, offset).addScaledVector(f.up, yLift)
      const l = c.clone().addScaledVector(f.right, -halfWidth)
      const r = c.clone().addScaledVector(f.right, halfWidth)
      if (prev && !inSkip((prev.d + d) / 2)) {
        const a = prev.l
        const b = prev.r
        pos.push(a.x, a.y, a.z, b.x, b.y, b.z, r.x, r.y, r.z)
        pos.push(a.x, a.y, a.z, r.x, r.y, r.z, l.x, l.y, l.z)
        if (color) for (let k = 0; k < 6; k++) col.push(color.r, color.g, color.b)
      }
      prev = { l, r, d }
    }
  }

  if (ranges) ranges.forEach(([s, e]) => emit(s, e))
  else emit(0, len)

  if (!pos.length) return null
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  if (color) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.computeVertexNormals()
  return g
}

/**
 * Renders the track as a tiled stone road: the uploaded path model is baked to a
 * unit tile and instanced along each lane's centreline (finely, so curves stay
 * smooth), with a thin colored centre line per lane. Water obstacles are swept as
 * a curved translucent, rippling surface that follows the lane, sitting in a hole
 * cut in the road.
 */
export default function StoneRoad({ track }: { track: Track }) {
  const gltf = useGLTF(MODEL_URL)
  const waterMat = useMemo(() => makeWaterMaterial(), [])

  const tile = useMemo(() => buildTileGeometry(gltf.scene as THREE.Object3D), [gltf.scene])

  // Per-lane hole ranges (jump gaps + water) shared by the tiler and lines.
  const laneHoles = useMemo(
    () =>
      track.lanes.map((lane) =>
        lane.obstacles
          .filter((o) => o.type === 'gap' || o.type === 'water')
          .map((o) => [o.start, o.end] as [number, number]),
      ),
    [track],
  )

  const { instances, count } = useMemo(() => {
    const mats: THREE.Matrix4[] = []
    const q = new THREE.Quaternion()
    const basis = new THREE.Matrix4()
    const scl = new THREE.Vector3(LANE_WIDTH * 1.04, THICK, STEP * 1.9)
    const posV = new THREE.Vector3()
    const len = track.center.length
    track.lanes.forEach((lane, li) => {
      const holes = laneHoles[li]
      const tileInHole = (d: number) =>
        holes.some(([s, e]) => d - STEP / 2 < e && d + STEP / 2 > s)
      const steps = Math.max(1, Math.floor(len / STEP))
      for (let i = 0; i < steps; i++) {
        const d = (i + 0.5) * STEP
        if (tileInHole(d)) continue
        const f = sampleCenter(track.center, d)
        basis.makeBasis(f.right, f.up, f.tangent)
        q.setFromRotationMatrix(basis)
        posV.copy(f.pos).addScaledVector(f.right, lane.offset)
        mats.push(new THREE.Matrix4().compose(posV, q, scl))
      }
    })
    return { instances: mats, count: mats.length }
  }, [track, laneHoles])

  const lines = useMemo(() => {
    const geoms: THREE.BufferGeometry[] = []
    track.lanes.forEach((lane, li) => {
      const g = buildRibbon(track, lane.offset, LINE_W / 2, LINE_LIFT, null, laneHoles[li], new THREE.Color(lane.color))
      if (g) geoms.push(g)
    })
    return geoms.length ? (mergeGeometries(geoms, false) ?? null) : null
  }, [track, laneHoles])

  const water = useMemo(() => {
    const geoms: THREE.BufferGeometry[] = []
    track.lanes.forEach((lane) => {
      const spans = lane.obstacles
        .filter((o) => o.type === 'water')
        .map((o) => [o.start - 0.2, o.end + 0.2] as [number, number])
      if (!spans.length) return
      const g = buildRibbon(track, lane.offset, LANE_WIDTH / 2, WATER_Y, spans, [])
      if (g) geoms.push(g)
    })
    return geoms.length ? (mergeGeometries(geoms, false) ?? null) : null
  }, [track])

  useFrame((state) => {
    waveTime.value = state.clock.elapsedTime
  })

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

      {water && <mesh geometry={water} material={waterMat} renderOrder={2} />}
    </group>
  )
}

useGLTF.preload(MODEL_URL)
