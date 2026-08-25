import { useMemo } from 'react'
import * as THREE from 'three'
import { LANE_SPACING, LANE_WIDTH, Track, sampleCenter } from './build'

// Voxel-block racing road, matching the Cube Kids style: chunky light tiles
// with a checker shade, raised darker border blocks, and dashed lane lines in
// each racer's colour. Everything is one instanced draw call; ramps come out
// stepped, exactly like block-game terrain.

const STEP = 0.48 // sampling step along/across the road
const SIZE = 0.74 // block footprint — bigger than STEP so curves stay gap-free
const THICK = 0.22

const rnd = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

export default function VoxelRoad({ track }: { track: Track }) {
  const data = useMemo(() => {
    if (track.length === 0) return null
    const laneCount = track.lanes.length
    const halfW = ((laneCount - 1) / 2) * LANE_SPACING + LANE_WIDTH / 2 + 0.35
    const laneOffsets = track.lanes.map((l) => l.offset)
    const laneColors = track.lanes.map((l) => new THREE.Color(l.color).lerp(new THREE.Color('#ffffff'), 0.25))
    const base = new THREE.Color('#b3bac2')
    const baseAlt = new THREE.Color('#a5adb6')
    const border = new THREE.Color('#7d8894')

    const mats: THREE.Matrix4[] = []
    const cols: THREE.Color[] = []
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion() // identity: axis-aligned voxel blocks
    const v = new THREE.Vector3()
    const s = new THREE.Vector3()
    const c = new THREE.Color()

    const steps = Math.ceil(track.length / STEP)
    for (let i = 0; i < steps; i++) {
      const d = i * STEP
      const f = sampleCenter(track.center, d)
      for (let lat = -halfW; lat <= halfW + 0.001; lat += STEP) {
        const j = Math.round((lat + halfW) / STEP)
        const edge = lat < -halfW + STEP * 0.9 || lat > halfW - STEP * 0.9
        v.copy(f.pos).addScaledVector(f.right, lat)
        const li = laneOffsets.findIndex((o) => Math.abs(lat - o) < STEP * 0.5)
        // Tiny deterministic height offset: overlapping tiles read as stone
        // relief instead of z-fighting.
        const relief = (rnd(i * 3 + j * 17) - 0.5) * 0.05
        if (edge) {
          c.copy(border)
          s.set(SIZE, THICK * 2.2, SIZE)
          v.y += -0.02 + relief
        } else if (li >= 0 && i % 6 < 4) {
          c.copy(laneColors[li]) // dashed lane line
          s.set(SIZE, THICK, SIZE)
          v.y += -0.07 + relief
        } else {
          c.copy((i + j) % 2 === 0 ? base : baseAlt)
          s.set(SIZE, THICK, SIZE)
          v.y += -0.07 + relief
        }
        c.multiplyScalar(0.95 + rnd(i * 7 + j * 13) * 0.1)
        m.compose(v, q, s)
        mats.push(m.clone())
        cols.push(c.clone())
      }
    }
    return { mats, cols, count: mats.length }
  }, [track])

  if (!data) return null

  return (
    <instancedMesh
      key={data.count}
      args={[undefined, undefined, data.count]}
      receiveShadow
      ref={(inst) => {
        if (!inst) return
        for (let i = 0; i < data.count; i++) {
          inst.setMatrixAt(i, data.mats[i])
          inst.setColorAt(i, data.cols[i])
        }
        inst.instanceMatrix.needsUpdate = true
        if (inst.instanceColor) inst.instanceColor.needsUpdate = true
      }}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.9} />
    </instancedMesh>
  )
}
