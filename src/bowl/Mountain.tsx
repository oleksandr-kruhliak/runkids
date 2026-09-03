import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import {
  DECK_LEN,
  Hazard,
  LANE_EDGE,
  LANE_SURF,
  PIN_Z0,
  START_PAD,
  heightAt,
  laneX,
  rngOf,
  slopeAt,
  worldZ,
} from './model'

// The mountain, in two parts. `Mountain` is one lane of it: the riding surface,
// the berms banked up either side, and everything scattered down it to be
// dodged. `Shoulders` is the rest of the face — the tree-lined ridges between
// the lanes and the wide snowfields outside the outer two — which is what turns
// four ribbons hanging in the sky into one mountain with four runs cut into it.
//
// Every surface is a hand-built BufferGeometry rather than a pile of boxes. A
// face long enough for a minute's riding is a few hundred steps, and a few
// hundred meshes per lane would cost more than the rest of the show put
// together — as one geometry it is a single draw call whatever length the dial
// asks for.

/** How high the berms stand above the riding surface. */
export const BERM = 1.3
/** How wide the flat, lane-coloured cap along the top of a berm is. */
const CAP_W = 0.5
/**
 * Where the flanks of the mountain stop, with the valley floor just under it.
 *
 * Deep, and it has to be: the deck at the bottom of the run sits at zero, so a
 * shallow skirt ends in a hard horizontal line a few units under it and the
 * whole pin deck reads as a table floating in the sky. Twenty-odd units of rock
 * under the boards is what makes it a mountain instead.
 */
export const SKIRT_Y = -24
/** How far the snowfield reaches beyond the outermost lane. */
const SHOULDER = 18

/** A unit disc already lying flat, for the instanced tree shadows. */
const FLAT_DISC = new THREE.CircleGeometry(0.85, 10).rotateX(-Math.PI / 2)

/** How far apart the marker poles down each berm stand. */
const MARKER_GAP = 22

/** Longest the face is ever cut into — past this it is subdivided coarser. */
const MAX_STEPS = 520
/** Ideal distance between two cuts across the face. */
const STEP = 3

/**
 * Columns across a lane, and how far each sits above the riding surface. The
 * outer pair on each side is the flat cap along the berm, which is what carries
 * the lane's colour; between them the berm ramps down to the surface the rider
 * is actually on.
 */
const COL_X = [
  -LANE_EDGE,
  -LANE_EDGE + CAP_W,
  -LANE_SURF,
  LANE_SURF,
  LANE_EDGE - CAP_W,
  LANE_EDGE,
]
const COL_Y = [BERM, BERM, 0, 0, BERM, BERM]

/** Where the face is cut, from the launch pad to the far end of the deck. */
function cuts(run: number): number[] {
  const total = run + DECK_LEN + START_PAD
  const n = Math.min(MAX_STEPS, Math.max(24, Math.round(total / STEP)))
  const out: number[] = []
  for (let j = 0; j <= n; j++) out.push(-START_PAD + (total * j) / n)
  return out
}

/**
 * Relief for the snow: a small, deterministic bump per vertex, from where the
 * vertex is. A face that is one flat plane renders under flat shading as one
 * unbroken tone from the lip to the deck — no facets, no grain, nothing for
 * the eye to hold — and a rider on it looks like a rider over a void. A few
 * centimetres of lumpiness is what turns that into ground.
 */
function relief(x: number, z: number, amp: number): number {
  const h = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453
  return (h - Math.floor(h) - 0.5) * 2 * amp
}

/**
 * A strip down the face: `cols` x positions and `lift` heights above the
 * surface, one per column. Every surface on the mountain — a riding surface,
 * a berm cap, a ridge between two lanes — is the same thing at a different
 * width, so they all come out of here. Interior columns get `amp` of relief;
 * the two edge columns never do, so strips meet their neighbours exactly.
 */
function ribbon(
  zs: number[],
  run: number,
  cols: number[],
  lift: number[],
  amp = 0,
  /** Per-triangle tone: how far each facet strays from the material colour. */
  grain = 0,
  /** Darken the outermost column of faces — the berm ramps of a lane. */
  rim = 1,
): THREE.BufferGeometry {
  const n = cols.length
  const pos = new Float32Array(zs.length * n * 3)
  let p = 0
  for (const z of zs) {
    const y = heightAt(z, run)
    const wz = worldZ(z)
    for (let c = 0; c < n; c++) {
      const edge = c === 0 || c === n - 1
      pos[p++] = cols[c]
      pos[p++] = y + lift[c] + (edge ? 0 : relief(cols[c], z, amp))
      pos[p++] = wz
    }
  }
  // Wound counter-clockwise seen from above, so the normal is +Y and the face
  // is the front. The run goes down -Z, which is easy to get backwards: the
  // first cut of this had every ribbon facing the ground, the front-face cull
  // threw the whole mountain away, and what showed in its place was the fogged
  // valley through the hole — a lane that looked like nothing was under it.
  const idx: number[] = []
  for (let j = 0; j < zs.length - 1; j++) {
    for (let c = 0; c < n - 1; c++) {
      const a = j * n + c
      const b = a + 1
      const d = a + n
      const e = d + 1
      idx.push(a, b, d, b, e, d)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setIndex(idx)
  if (grain === 0 && rim === 1) {
    geo.computeVertexNormals()
    return geo
  }
  // Facets painted, not just lit. A bump of a few centimetres changes a
  // triangle's normal by a degree or two, which under a low winter sun is no
  // change in brightness at all — the relief is there and cannot be seen. So
  // each triangle also gets its own tone, which needs its own vertices: the
  // geometry is unshared so a colour can belong to one face and not bleed
  // across its neighbours.
  const flat = geo.toNonIndexed()
  geo.dispose()
  const count = flat.getAttribute('position').count
  const col = new Float32Array(count * 3)
  const facesPerRow = (n - 1) * 2
  for (let f = 0; f < count / 3; f++) {
    const c = Math.floor((f % facesPerRow) / 2)
    const isRim = c === 0 || c === n - 2
    const tone = (isRim ? rim : 1) + relief(f * 0.37, f * 1.13, grain)
    for (let v = 0; v < 3; v++) {
      col[(f * 3 + v) * 3] = tone
      col[(f * 3 + v) * 3 + 1] = tone
      col[(f * 3 + v) * 3 + 2] = tone
    }
  }
  flat.setAttribute('color', new THREE.BufferAttribute(col, 3))
  flat.computeVertexNormals()
  return flat
}

/** `a`..`b` cut into columns about `step` apart, ends included. */
function across(a: number, b: number, step: number): number[] {
  const n = Math.max(1, Math.round((b - a) / step))
  const out: number[] = []
  for (let i = 0; i <= n; i++) out.push(a + ((b - a) * i) / n)
  return out
}

/**
 * A flank: the edge of the face at `x` dropped straight down to the valley
 * floor. Only the two outermost edges of the whole mountain have one — the
 * ridges between lanes are solid ground, not gaps.
 */
function flank(zs: number[], run: number, x: number, outward: -1 | 1): THREE.BufferGeometry {
  const pos = new Float32Array(zs.length * 2 * 3)
  let p = 0
  for (const z of zs) {
    const wz = worldZ(z)
    pos[p++] = x
    pos[p++] = heightAt(z, run) + BERM
    pos[p++] = wz
    pos[p++] = x
    pos[p++] = SKIRT_Y
    pos[p++] = wz
  }
  const idx: number[] = []
  for (let j = 0; j < zs.length - 1; j++) {
    const a = j * 2
    // Wound so the outward face is the front, which differs by side — and
    // checked by cross product this time, not by eye: with the run on -Z the
    // obvious order faces inward, and an inward flank is a wall seen from the
    // wrong side of the mountain.
    if (outward < 0) idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    else idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  return geo
}

function useDisposed<T extends Record<string, THREE.BufferGeometry>>(geo: T): T {
  useEffect(() => {
    return () => {
      for (const g of Object.values(geo)) g.dispose()
    }
  }, [geo])
  return geo
}

// ---- Piste markers -------------------------------------------------------

/**
 * Piste markers down both berms. They are the only thing on the mountain that
 * stands still, which is exactly why they are here: a face of unbroken snow
 * gives the eye nothing to measure against, and a board doing sixteen down it
 * looks like a board sitting still. A row of poles going past is what makes it
 * read as speed.
 *
 * They carry the lane's colour, which is the other job they do. The berm caps
 * carry it too, but the chase shot looks almost straight down the barrel of the
 * run and sees them nearly edge-on — a row of poles standing up out of the snow
 * is the one marking on a mountain that stays visible from behind it.
 *
 * One instanced mesh per lane rather than a hundred little ones — the whole
 * point of a marker is that there are a lot of them.
 */
function Markers({ run, zs, color }: { run: number; zs: number[]; color: string }) {
  const mesh = useRef<THREE.InstancedMesh>(null)

  useLayoutEffect(() => {
    const im = mesh.current
    if (!im) return
    const o = new THREE.Object3D()
    let i = 0
    for (const z of zs) {
      for (const s of [-1, 1]) {
        o.position.set(s * (LANE_EDGE - CAP_W / 2), heightAt(z, run) + BERM + 0.62, worldZ(z))
        o.rotation.set(-Math.atan(slopeAt(z, run)), 0, 0)
        o.updateMatrix()
        im.setMatrixAt(i++, o.matrix)
      }
    }
    im.instanceMatrix.needsUpdate = true
  }, [run, zs])

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, zs.length * 2]} castShadow>
      <boxGeometry args={[0.17, 1.35, 0.17]} />
      <meshStandardMaterial color={color} flatShading />
    </instancedMesh>
  )
}

// ---- Trees ---------------------------------------------------------------

interface Tree {
  x: number
  z: number
  s: number
  spin: number
}

/**
 * Pines along a set of strips of the face. Three instanced meshes — trunks,
 * foliage, and the snow sitting on top — however many trees there are. Like the
 * markers they are mostly here to be gone past: a forest streaming by either
 * side of the run is what a mountain looks like from a board.
 */
function Pines({ trees, run, color }: { trees: Tree[]; run: number; color: string }) {
  const trunks = useRef<THREE.InstancedMesh>(null)
  const tops = useRef<THREE.InstancedMesh>(null)
  const caps = useRef<THREE.InstancedMesh>(null)
  const blobs = useRef<THREE.InstancedMesh>(null)

  useLayoutEffect(() => {
    const o = new THREE.Object3D()
    const place = (im: THREE.InstancedMesh | null, lift: number) => {
      if (!im) return
      trees.forEach((t, i) => {
        o.position.set(t.x, heightAt(t.z, run) + BERM + lift * t.s, worldZ(t.z))
        o.rotation.set(0, t.spin, 0)
        o.scale.setScalar(t.s)
        o.updateMatrix()
        im.setMatrixAt(i, o.matrix)
      })
      im.instanceMatrix.needsUpdate = true
    }
    place(trunks.current, 0.3)
    place(tops.current, 1.7)
    place(caps.current, 2.45)
    place(blobs.current, 0.03)
  }, [trees, run])

  if (trees.length === 0) return null
  return (
    <>
      <instancedMesh ref={trunks} args={[undefined, undefined, trees.length]} castShadow>
        <cylinderGeometry args={[0.14, 0.2, 0.7, 6]} />
        <meshStandardMaterial color="#5b3f2a" flatShading />
      </instancedMesh>
      <instancedMesh ref={tops} args={[undefined, undefined, trees.length]} castShadow>
        <coneGeometry args={[0.95, 2.6, 6]} />
        <meshStandardMaterial color={color} flatShading />
      </instancedMesh>
      <instancedMesh ref={caps} args={[undefined, undefined, trees.length]} castShadow>
        <coneGeometry args={[0.5, 1.1, 6]} />
        <meshStandardMaterial color="#ffffff" flatShading />
      </instancedMesh>
      <instancedMesh ref={blobs} args={[undefined, undefined, trees.length]}>
        <primitive object={FLAT_DISC} attach="geometry" />
        <meshBasicMaterial color="#0b1220" transparent opacity={0.18} depthWrite={false} />
      </instancedMesh>
    </>
  )
}

// ---- The things in the way ----------------------------------------------

/** A boulder: three lumps, leaned over so it never reads as a crate. */
function Rock({ w, phase }: { w: number; phase: number }) {
  return (
    <group rotation={[0, phase, 0]}>
      <mesh castShadow receiveShadow position={[0, w * 0.72, 0]} rotation={[0.2, 0.4, 0.15]}>
        <boxGeometry args={[w * 1.7, w * 1.5, w * 1.6]} />
        <meshStandardMaterial color="#6f7784" flatShading />
      </mesh>
      <mesh castShadow position={[-w * 0.7, w * 0.4, w * 0.4]} rotation={[0.4, 0.9, 0]}>
        <boxGeometry args={[w * 0.9, w * 0.8, w * 0.85]} />
        <meshStandardMaterial color="#5c6472" flatShading />
      </mesh>
      <mesh castShadow position={[w * 0.75, w * 0.35, -w * 0.3]} rotation={[0.1, 0.3, 0.5]}>
        <boxGeometry args={[w * 0.8, w * 0.7, w * 0.8]} />
        <meshStandardMaterial color="#7d8593" flatShading />
      </mesh>
    </group>
  )
}

/** A mud wallow: a shallow puddle with a couple of splats around the rim. */
function Mud({ w, phase }: { w: number; phase: number }) {
  return (
    <group rotation={[0, phase, 0]}>
      <mesh receiveShadow position={[0, 0.04, 0]}>
        <cylinderGeometry args={[w, w * 1.05, 0.12, 9]} />
        <meshStandardMaterial color="#5c4025" roughness={0.35} flatShading />
      </mesh>
      <mesh position={[0, 0.11, 0]}>
        <cylinderGeometry args={[w * 0.68, w * 0.72, 0.06, 9]} />
        <meshStandardMaterial color="#7a5730" roughness={0.2} flatShading />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * w * 0.85, 0.08, s * w * 0.5]} rotation={[0, s * 0.6, 0]}>
          <boxGeometry args={[w * 0.4, 0.1, w * 0.3]} />
          <meshStandardMaterial color="#4a331d" flatShading />
        </mesh>
      ))}
    </group>
  )
}

/** A drift: a soft mound, the cheapest of the four to clip. */
function Drift({ w, phase }: { w: number; phase: number }) {
  return (
    <group rotation={[0, phase * 0.3, 0]}>
      <mesh castShadow receiveShadow position={[0, w * 0.2, 0]}>
        <boxGeometry args={[w * 1.9, w * 0.5, w * 1.1]} />
        <meshStandardMaterial color="#f2f7ff" emissive="#dce9ff" emissiveIntensity={0.16} flatShading />
      </mesh>
      <mesh castShadow position={[-w * 0.35, w * 0.5, 0]}>
        <boxGeometry args={[w * 0.9, w * 0.4, w * 0.8]} />
        <meshStandardMaterial color="#ffffff" emissive="#dce9ff" emissiveIntensity={0.16} flatShading />
      </mesh>
      <mesh castShadow position={[w * 0.5, w * 0.42, w * 0.1]}>
        <boxGeometry args={[w * 0.7, w * 0.3, w * 0.7]} />
        <meshStandardMaterial color="#f6faff" emissive="#dce9ff" emissiveIntensity={0.16} flatShading />
      </mesh>
    </group>
  )
}

/** An ice slick: glassy, and flat enough that the board goes straight over it. */
function Slick({ w, phase }: { w: number; phase: number }) {
  return (
    <group rotation={[0, phase * 0.4, 0]}>
      <mesh receiveShadow position={[0, 0.05, 0]}>
        <cylinderGeometry args={[w, w * 0.94, 0.1, 7]} />
        <meshStandardMaterial
          color="#bfe9ff"
          emissive="#7fd6ff"
          emissiveIntensity={0.32}
          roughness={0.06}
          metalness={0.15}
          transparent
          opacity={0.82}
          flatShading
        />
      </mesh>
      {/* Shards standing proud of it, so the slick reads from up the hill
          rather than only from directly overhead. */}
      {[-0.55, 0.15, 0.62].map((dx, i) => (
        <mesh key={i} castShadow position={[dx * w, 0.16, (i - 1) * w * 0.4]} rotation={[0, i * 0.7, 0.12]}>
          <boxGeometry args={[w * 0.2, 0.28 - i * 0.05, w * 0.2]} />
          <meshStandardMaterial
            color="#dff6ff"
            emissive="#8fdcff"
            emissiveIntensity={0.4}
            transparent
            opacity={0.85}
            flatShading
          />
        </mesh>
      ))}
    </group>
  )
}

/**
 * A soft dark disc on the ground under something. Real shadows depend on the
 * sun's angle and the shadow map's reach, and on a low-sun winter preset an
 * object can throw none at all — at which point it floats. This one always
 * lands directly underneath, which is the one shadow that says "touching".
 */
export function Blob({ r, opacity = 0.2 }: { r: number; opacity?: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
      <circleGeometry args={[r, 14]} />
      <meshBasicMaterial
        color="#0b1220"
        transparent
        opacity={opacity}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-2}
      />
    </mesh>
  )
}

function HazardModel({ haz }: { haz: Hazard }) {
  // The slick is flat ice: a shadow under it would read as a hole.
  const blob = haz.kind === 'ice' ? null : <Blob r={haz.w * 1.15} opacity={0.22} />
  if (haz.kind === 'rock') return <>{blob}<Rock w={haz.w} phase={haz.phase} /></>
  if (haz.kind === 'mud') return <>{blob}<Mud w={haz.w} phase={haz.phase} /></>
  if (haz.kind === 'snow') return <>{blob}<Drift w={haz.w} phase={haz.phase} /></>
  return <Slick w={haz.w} phase={haz.phase} />
}

// ---- One lane ------------------------------------------------------------

interface Props {
  hazards: Hazard[]
  run: number
  /** Lane centre in world space. */
  x: number
  color: string
  /** Riding surface colour, taken from the chosen environment. */
  surface: string
}

export default function Mountain({ hazards, run, x, color, surface }: Props) {
  const markers = useMemo(() => {
    const zs: number[] = []
    for (let z = 6; z < run - 4; z += MARKER_GAP) zs.push(z)
    return zs
  }, [run])

  const geo = useDisposed(
    useMemo(() => {
      const zs = cuts(run)
      // The surface is cut into columns so its relief has facets to show on,
      // with the berm ramps as the outer column either side. The relief stays
      // well under the board's ride height, so the simulation's flat surface
      // and the drawn one never visibly disagree.
      const surf = across(-LANE_SURF, LANE_SURF, 1.15)
      const cols = [COL_X[1], ...surf, COL_X[4]]
      const lift = [BERM, ...surf.map(() => 0), BERM]
      return {
        face: ribbon(zs, run, cols, lift, 0.09, 0.085, 0.8),
        capL: ribbon(zs, run, COL_X.slice(0, 2), COL_Y.slice(0, 2)),
        capR: ribbon(zs, run, COL_X.slice(4, 6), COL_Y.slice(4, 6)),
      }
    }, [run]),
  )

  return (
    <group position={[x, 0, 0]}>
      {/* A touch of glow: the chase camera looks down the face with the sun
          mostly behind it, and unlit snow renders as concrete. */}
      {/* Lambert, not Standard: a Standard material keeps a specular lobe even
          at full roughness, and on a smooth face seen at a grazing angle it
          reflects the sun as a sheen that washes the whole lane toward white —
          and moves as the camera does. Snow and grass are matte. */}
      <mesh geometry={geo.face} receiveShadow>
        <meshLambertMaterial
          color={surface}
          emissive={surface}
          emissiveIntensity={0.04}
          vertexColors
          flatShading
        />
      </mesh>
      {/* The berm caps carry the lane's colour. Four white runs side by side
          would be impossible to tell apart down the barrel of the shot, and a
          rail is a quieter way of saying whose is whose than a stripe painted
          down the middle of the run. */}
      <mesh geometry={geo.capL} receiveShadow castShadow>
        <meshStandardMaterial color={color} flatShading />
      </mesh>
      <mesh geometry={geo.capR} receiveShadow castShadow>
        <meshStandardMaterial color={color} flatShading />
      </mesh>

      {/* The bowling deck: a flat apron under the rack, so the bottom of the
          mountain reads as somewhere the pins were deliberately put. */}
      <mesh position={[0, 0.04, worldZ(run + DECK_LEN / 2)]} receiveShadow>
        <boxGeometry args={[LANE_SURF * 2, 0.1, DECK_LEN]} />
        <meshStandardMaterial color="#e8d5ae" flatShading />
      </mesh>
      {/* A foul line where the face runs out, which is what the camera reads
          the arrival off. */}
      <mesh position={[0, 0.1, worldZ(run + 0.4)]}>
        <boxGeometry args={[LANE_SURF * 2, 0.04, 0.3]} />
        <meshStandardMaterial color={color} flatShading />
      </mesh>

      <Markers run={run} zs={markers} color={color} />

      {hazards.map((h) => (
        <group
          key={h.i}
          position={[h.x, heightAt(h.z, run), worldZ(h.z)]}
          rotation={[-Math.atan(slopeAt(h.z, run)), 0, 0]}
        >
          <HazardModel haz={h} />
        </group>
      ))}

      {/* A marker post either side of the rack: it frames the pins in the
          approach shot, which is otherwise a long way of looking at nothing. */}
      {[-1, 1].map((s) => (
        <mesh
          key={s}
          position={[s * (LANE_SURF - 0.34), 1.0, worldZ(run + PIN_Z0)]}
          castShadow
        >
          <boxGeometry args={[0.16, 2.0, 0.16]} />
          <meshStandardMaterial color={color} flatShading />
        </mesh>
      ))}
    </group>
  )
}

// ---- The rest of the face ------------------------------------------------

interface ShouldersProps {
  lanes: number
  run: number
  seed: number
  surface: string
  rock: string
  /** Foliage colour and 0-100 density, from the environment's scenery. */
  tree: string
  density: number
}

/**
 * Everything that isn't a lane: the ridges between them, the snowfields either
 * side, the two outer flanks down to the valley floor, and the caps that close
 * the top and bottom of the whole thing. Plus the trees, which stand on all of
 * it except the deck end, where they would be between the camera and the pins.
 */
export function Shoulders({ lanes, run, seed, surface, rock, tree, density }: ShouldersProps) {
  const strips = useMemo(() => {
    const out: [number, number][] = []
    const left = laneX(0, lanes) - LANE_EDGE
    const right = laneX(lanes - 1, lanes) + LANE_EDGE
    out.push([left - SHOULDER, left])
    for (let i = 0; i < lanes - 1; i++) {
      out.push([laneX(i, lanes) + LANE_EDGE, laneX(i + 1, lanes) - LANE_EDGE])
    }
    out.push([right, right + SHOULDER])
    return out
  }, [lanes])

  const geo = useDisposed(
    useMemo(() => {
      const zs = cuts(run)
      const out: Record<string, THREE.BufferGeometry> = {}
      strips.forEach(([a, b], i) => {
        const cols = across(a, b, 2.4)
        out[`strip${i}`] = ribbon(zs, run, cols, cols.map(() => BERM), 0.32, 0.11)
      })
      out.flankL = flank(zs, run, strips[0][0], -1)
      out.flankR = flank(zs, run, strips[strips.length - 1][1], 1)
      return out
    }, [run, strips]),
  )

  const trees = useMemo<Tree[]>(() => {
    if (density <= 0) return []
    const rand = rngOf(seed + 977)
    // Spacing down the run: a thicket at 100, a tree here and there at 20.
    const gap = 3 + (1 - Math.min(1, density / 100)) * 14
    const out: Tree[] = []
    for (const [a, b] of strips) {
      const inset = 0.9
      if (b - a < inset * 2 + 0.2) continue
      // The shoulders are wide; only the part of them near the run gets trees,
      // so the far side of the snowfield stays a snowfield.
      const isGap = b - a < SHOULDER
      const lo = isGap ? a + inset : Math.max(a + inset, b - inset - 9)
      const hi = isGap ? b - inset : Math.min(b - inset, a + inset + 9)
      for (let z = -START_PAD + 3 + rand() * gap; z < run - 6; z += gap * (0.6 + rand() * 0.8)) {
        out.push({ x: lo + rand() * (hi - lo), z, s: 0.75 + rand() * 0.7, spin: rand() * Math.PI * 2 })
      }
    }
    return out
  }, [density, run, seed, strips])

  const width = strips[strips.length - 1][1] - strips[0][0]
  const centre = (strips[strips.length - 1][1] + strips[0][0]) / 2
  const top = heightAt(-START_PAD, run) + BERM

  return (
    <group>
      {strips.map((_, i) => (
        <mesh key={i} geometry={geo[`strip${i}`]} receiveShadow>
          <meshLambertMaterial
            color={surface}
            emissive={surface}
            emissiveIntensity={0.04}
            vertexColors
            flatShading
          />
        </mesh>
      ))}
      <mesh geometry={geo.flankL}>
        <meshStandardMaterial color={rock} flatShading />
      </mesh>
      <mesh geometry={geo.flankR}>
        <meshStandardMaterial color={rock} flatShading />
      </mesh>
      {/* The cut end above the launch pad, and the wall at the bottom of the
          decks. Without them the face and the flanks are open surfaces, and
          both the opening shot and the smash look straight into a hollow. */}
      <mesh position={[centre, (top + SKIRT_Y) / 2, worldZ(-START_PAD) + 0.2]} receiveShadow>
        <boxGeometry args={[width, top - SKIRT_Y, 0.4]} />
        <meshStandardMaterial color={rock} flatShading />
      </mesh>
      <mesh
        position={[centre, (BERM + SKIRT_Y) / 2, worldZ(run + DECK_LEN) - 0.25]}
        receiveShadow
        castShadow
      >
        <boxGeometry args={[width, BERM - SKIRT_Y, 0.5]} />
        <meshStandardMaterial color={rock} flatShading />
      </mesh>
      {/* The snowfield past the decks. The end wall drops to the valley floor
          like the flanks do, and the smash is filmed from out here looking
          back at it — without ground at deck level in front of it, that shot
          was a third rock face by area. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[centre, -0.12, worldZ(run + DECK_LEN + 150)]}
        receiveShadow
      >
        <planeGeometry args={[width + 600, 300]} />
        <meshLambertMaterial color={surface} emissive={surface} emissiveIntensity={0.04} />
      </mesh>
      <Pines trees={trees} run={run} color={tree} />
    </group>
  )
}
