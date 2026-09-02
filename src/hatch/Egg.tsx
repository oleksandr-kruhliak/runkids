import { useCallback, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { BLANK, EggStyle, VOX, buildEgg, crackColor, rng } from './eggGeo'
import { NEST_TOP, PAINT_MS, dropPose } from './model'
import { PaintFill } from './painters'

// One surprise egg: a hollow shell of cubes that rocks in its nest, cracks
// where the hammer lands, and finally bursts into shards that arc out and pile
// up on the ground. The shell is a single instanced mesh, so a stage full of
// eggs is still one draw call each.

const GRAV = -11
/** Chips that spray off the shell on every blow that doesn't break it. */
const CHIP_N = 22
const CHIP_LIFE = 1.0
/**
 * Steps the paint line is quantised to. Rewriting every cube's colour on every
 * frame of the soak would be wasted work — the shell is only 13 cubes tall, so
 * this is finer than the eye can follow anyway.
 */
const PAINT_STEPS = 26

interface Motion {
  v: THREE.Vector3
  spin: THREE.Vector3
  /** Seconds until this cube reaches the ground and stops tumbling. */
  tLand: number
}

interface Props {
  style: EggStyle
  seed: number
  /** Nest position; the shell's base settles exactly here. */
  position: [number, number, number]
  /**
   * performance.now() when this egg was released from the sky. It's hidden
   * until then, falls, bounces and settles into the nest. 0 = already in place
   * (nothing to animate).
   */
  dropAt: number
  /**
   * performance.now() when the base coat reached this egg. Until then the
   * shell is blank; from then its colour spreads over PAINT_MS. 0 = blank.
   */
  paintAt: number
  /** performance.now() when the second pass started stamping the pattern on. */
  patternAt: number
  /** Colour soaks down from the crown, or climbs up from the nest. */
  fill: PaintFill
  /** Which way the pattern pass spreads — the two passes can differ. */
  patternFill: PaintFill
  /** Blows landed so far (cracks creep down as this grows). */
  hits: number
  /** Blows needed to break it. */
  totalHits: number
  /** performance.now() of the last landed blow; 0 before the first. */
  hitAt: number
  /** performance.now() when the shell burst; 0 while it's whole. */
  breakAt: number
}

/** Squash from an impact: hard at the moment of the hit, gone in a third of a second. */
function landSquash(sinceHit: number): number {
  return sinceHit < 0.34 ? (1 - sinceHit / 0.34) * 0.3 : 0
}

export default function Egg({
  style,
  seed,
  position,
  dropAt,
  paintAt,
  patternAt,
  fill,
  patternFill,
  hits,
  totalHits,
  hitAt,
  breakAt,
}: Props) {
  const root = useRef<THREE.Group>(null)
  const shell = useRef<THREE.InstancedMesh>(null)
  const chips = useRef<THREE.InstancedMesh>(null)
  const ring = useRef<THREE.Mesh>(null)
  const wobble = useRef<THREE.Group>(null)

  const mesh = useMemo(() => buildEgg(style, seed), [style, seed])
  const count = mesh.voxels.length

  // The floor, in the egg's own space: the shards fall past the nest and land
  // on the grass below it.
  const floorY = -NEST_TOP + VOX / 2

  /** Per-cube burst velocity, spin and landing time — fixed for the run. */
  const motion = useMemo<Motion[]>(() => {
    const rand = rng(seed * 7919 + 13)
    // A shared push per shard keeps neighbouring cubes travelling together, so
    // the shell reads as broken plates rather than as sand.
    const perShard = Array.from({ length: mesh.shards }, () => ({
      out: 1.0 + rand() * 1.2,
      up: 2.2 + rand() * 1.8,
      spin: new THREE.Vector3(
        (rand() - 0.5) * 14,
        (rand() - 0.5) * 14,
        (rand() - 0.5) * 14,
      ),
    }))
    return mesh.voxels.map((vx) => {
      const s = perShard[vx.shard] ?? perShard[0]
      const dir = new THREE.Vector3(Math.cos(vx.ang), 0, Math.sin(vx.ang))
      const v = new THREE.Vector3(
        dir.x * s.out + (rand() - 0.5) * 0.6,
        s.up * (0.55 + vx.p[1] / 1.6) + (rand() - 0.5) * 0.5,
        dir.z * s.out + (rand() - 0.5) * 0.6,
      )
      // Ballistic landing time on the ground plane.
      const a = 0.5 * GRAV
      const b = v.y
      const c = vx.p[1] - floorY
      const disc = Math.max(0, b * b - 4 * a * c)
      const tLand = (-b - Math.sqrt(disc)) / (2 * a)
      return { v, spin: s.spin, tLand }
    })
  }, [mesh, seed, floorY])

  /** Chip bursts reuse the same maths on a handful of cubes. */
  const chipMotion = useMemo(() => {
    const rand = rng(seed * 104729 + 7)
    return Array.from({ length: CHIP_N }, () => {
      const ang = rand() * Math.PI * 2
      const out = 0.9 + rand() * 1.8
      return {
        v: new THREE.Vector3(Math.cos(ang) * out, 1.8 + rand() * 2.2, Math.sin(ang) * out),
        spin: new THREE.Vector3((rand() - 0.5) * 20, (rand() - 0.5) * 20, (rand() - 0.5) * 20),
        size: 0.5 + rand() * 0.7,
      }
    })
  }, [seed])

  // ---- Colours ----------------------------------------------------------
  // Three states per cube, in priority order: a crack seam, its painted
  // colour, or still blank. Rewritten when a crack opens and, while the rain
  // is falling, each time the paint line moves far enough to matter.
  const paintStep = useRef(-1)
  const paintColors = useCallback(
    (paint: number, patternPaint: number) => {
      const m = shell.current
      if (!m) return
      const seam = new THREE.Color(crackColor(style))
      const c = new THREE.Color()
      // Cracks have reached this far down the shell (0 = only the very top).
      const reach = hits / Math.max(1, totalHits)
      mesh.voxels.forEach((vx, i) => {
        // paintAt is measured from the crown, so a pass that works upward from
        // the nest just reads the same number from the other end.
        const at = fill === 'up' ? 1 - vx.paintAt : vx.paintAt
        const patAt = patternFill === 'up' ? 1 - vx.paintAt : vx.paintAt
        if (hits > 0 && vx.crackAt <= reach) c.copy(seam)
        else if (paint < at) c.set(BLANK)
        // The base coat goes on everywhere; a pattern cube only shows its own
        // colour once the second pass has come back round to it.
        else if (vx.pattern && patternPaint < patAt) c.set(style.base)
        else c.set(vx.color)
        m.setColorAt(i, c)
      })
      if (m.instanceColor) m.instanceColor.needsUpdate = true
      // The shader only picks up per-instance colours once the attribute
      // exists, which is the first time through here.
      const mat = m.material
      if (!Array.isArray(mat)) mat.needsUpdate = true
    },
    [mesh, style, hits, totalHits, fill, patternFill],
  )

  /** How far each pass has spread right now, 0..1. */
  const paintLevel = useCallback(
    (at: number) => (at <= 0 ? 0 : Math.min(1, (performance.now() - at) / PAINT_MS)),
    [],
  )

  useLayoutEffect(() => {
    const base = paintLevel(paintAt)
    const pat = paintLevel(patternAt)
    paintStep.current = Math.round((base + pat) * PAINT_STEPS)
    paintColors(base, pat)
  }, [paintColors, paintLevel, paintAt, patternAt])

  // Whole-egg rest pose: every cube exactly where the model puts it.
  useLayoutEffect(() => {
    const m = shell.current
    if (!m) return
    const mat = new THREE.Matrix4()
    mesh.voxels.forEach((vx, i) => {
      mat.makeTranslation(vx.p[0], vx.p[1], vx.p[2])
      m.setMatrixAt(i, mat)
    })
    m.instanceMatrix.needsUpdate = true
  }, [mesh])

  // Scratch objects, reused every frame so the loop never allocates.
  const tmp = useMemo(
    () => ({
      m: new THREE.Matrix4(),
      q: new THREE.Quaternion(),
      e: new THREE.Euler(),
      p: new THREE.Vector3(),
      s: new THREE.Vector3(1, 1, 1),
    }),
    [],
  )
  const settled = useRef(false)

  useFrame(({ clock }) => {
    const now = performance.now()
    const broken = breakAt > 0
    const t = broken ? (now - breakAt) / 1000 : 0

    // --- The arrival: out of the sky and into the nest ---------------------
    // A dropAt of 0 means "already in place", so a restarted or fast-forwarded
    // show still finds its eggs sitting where they belong.
    let drop = { y: 0, sinceHit: Infinity, landed: true }
    if (dropAt > 0 && !broken) drop = dropPose((now - dropAt) / 1000)
    if (root.current) {
      root.current.position.y = position[1] + drop.y
      root.current.visible = dropAt <= 0 || now >= dropAt
    }

    // --- Colour spreading while a painter is overhead ----------------------
    // Both passes share one quantised counter, so the shell is only repainted
    // while something is actually changing (0..1 for the base coat, 1..2 for
    // the pattern) and never once both are done.
    if (paintStep.current < PAINT_STEPS * 2) {
      const base = paintLevel(paintAt)
      const pat = paintLevel(patternAt)
      const step = Math.round((base + pat) * PAINT_STEPS)
      if (step !== paintStep.current) {
        paintStep.current = step
        paintColors(base, pat)
      }
    }

    // --- The shell itself: rock gently, squash on impact, then fly apart ---
    if (wobble.current) {
      const g = wobble.current
      if (broken) {
        g.rotation.set(0, 0, 0)
        g.scale.set(1, 1, 1)
      } else if (!drop.landed) {
        // Still arriving: no idle rock, just a squash on each bounce.
        const squash = landSquash(drop.sinceHit)
        g.rotation.set(0, 0, 0)
        g.scale.set(1 + squash * 0.7, 1 - squash, 1 + squash * 0.7)
      } else {
        const time = clock.elapsedTime + seed
        g.rotation.z = Math.sin(time * 1.1) * 0.035
        g.rotation.x = Math.cos(time * 0.87) * 0.025
        // A blow squashes the egg down and shakes it out over ~0.45s.
        const dt = hitAt > 0 ? (now - hitAt) / 1000 : 99
        if (dt < 0.5) {
          const decay = Math.max(0, 1 - dt / 0.5)
          const shake = Math.sin(dt * 62) * decay
          const squash = Math.max(0, 1 - dt / 0.22) * 0.24
          g.scale.set(1 + squash * 0.7, 1 - squash, 1 + squash * 0.7)
          g.rotation.z += shake * 0.12
        } else {
          // The very last of the landing squash eases out under the idle rock.
          const settle = landSquash(drop.sinceHit)
          g.scale.set(1 + settle * 0.7, 1 - settle, 1 + settle * 0.7)
        }
      }
    }

    const m = shell.current
    // Once every shard has landed the matrices stop changing, so the loop
    // stops rewriting them.
    if (m && broken && !settled.current) {
      let moving = false
      for (let i = 0; i < count; i++) {
        const vx = mesh.voxels[i]
        const mo = motion[i]
        const tt = Math.min(t, mo.tLand)
        if (t < mo.tLand) moving = true
        tmp.p.set(
          vx.p[0] + mo.v.x * tt,
          vx.p[1] + mo.v.y * tt + 0.5 * GRAV * tt * tt,
          vx.p[2] + mo.v.z * tt,
        )
        tmp.e.set(mo.spin.x * tt, mo.spin.y * tt, mo.spin.z * tt)
        tmp.q.setFromEuler(tmp.e)
        tmp.m.compose(tmp.p, tmp.q, tmp.s)
        m.setMatrixAt(i, tmp.m)
      }
      m.instanceMatrix.needsUpdate = true
      if (!moving) settled.current = true
    }

    // --- Chips: a small spray of shell off every non-fatal blow ------------
    const ch = chips.current
    if (ch) {
      const ct = hitAt > 0 && !broken ? (now - hitAt) / 1000 : 99
      if (ct <= CHIP_LIFE) {
        const fade = 1 - ct / CHIP_LIFE
        for (let i = 0; i < CHIP_N; i++) {
          const mo = chipMotion[i]
          tmp.p.set(
            mo.v.x * ct,
            1.45 + mo.v.y * ct + 0.5 * GRAV * ct * ct,
            mo.v.z * ct,
          )
          tmp.e.set(mo.spin.x * ct, mo.spin.y * ct, mo.spin.z * ct)
          tmp.q.setFromEuler(tmp.e)
          const sc = VOX * mo.size * fade
          tmp.s.set(sc, sc, sc)
          tmp.m.compose(tmp.p, tmp.q, tmp.s)
          ch.setMatrixAt(i, tmp.m)
        }
        tmp.s.set(1, 1, 1)
        ch.instanceMatrix.needsUpdate = true
        ch.visible = true
      } else if (ch.visible) {
        ch.visible = false
      }
    }

    // --- Shockwave ring on the nest at the moment of the burst -------------
    const r = ring.current
    if (r) {
      const life = 0.55
      if (broken && t < life) {
        const k = t / life
        const s = 0.3 + k * 3.4
        r.scale.set(s, s, s)
        r.visible = true
        const mat = r.material as THREE.MeshBasicMaterial
        mat.opacity = (1 - k) * 0.85
      } else if (r.visible) {
        r.visible = false
      }
    }
  })

  // A new egg (or a re-run) starts whole again.
  useLayoutEffect(() => {
    settled.current = false
  }, [breakAt, mesh])

  return (
    <group ref={root} position={position}>
      <group ref={wobble}>
        <instancedMesh
          key={count}
          ref={shell}
          args={[undefined as unknown as THREE.BufferGeometry, undefined as unknown as THREE.Material, count]}
          castShadow
          receiveShadow
          frustumCulled={false}
        >
          <boxGeometry args={[VOX, VOX, VOX]} />
          <meshStandardMaterial flatShading />
        </instancedMesh>
      </group>

      <instancedMesh
        ref={chips}
        args={[undefined as unknown as THREE.BufferGeometry, undefined as unknown as THREE.Material, CHIP_N]}
        visible={false}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={style.base} flatShading />
      </instancedMesh>

      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]} visible={false}>
        <ringGeometry args={[0.42, 0.58, 24]} />
        <meshBasicMaterial color="#fff3b0" transparent opacity={0.8} depthWrite={false} />
      </mesh>
    </group>
  )
}
