import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { CLOUD_BACK_S, LANE_HALF, Pad, Racer, padX } from './model'

// One lane of the climb: the platforms themselves, the stars hovering over
// them, and the finish cloud at the top. The tower is built once and then only
// mutated — movers slide, clouds vanish underfoot, stars spin and get eaten —
// so a sixty-rung tower costs one render, not one per bounce.

/** Platform colours, by kind. Movers and springs are loud on purpose: the
 *  viewer should read what a platform does before an animal lands on it. */
const TOP: Record<string, string> = {
  normal: '#7ad35a',
  mover: '#57b6ff',
  spring: '#ffd24a',
  cloud: '#ffffff',
  ice: '#a8e8ff',
  sticky: '#ffb43c',
  fan: '#c9a2ff',
}
const SIDE: Record<string, string> = {
  normal: '#4e9a37',
  mover: '#2f7fc4',
  spring: '#d99b1c',
  cloud: '#dfe9f5',
  ice: '#63c3e8',
  sticky: '#c9761a',
  fan: '#8f5fd6',
}

const PAD_D = 1.15 // depth, front to back
const PAD_H = 0.3

/** One platform. Anything that moves about it is done through the ref above. */
function Platform({ pad, lane }: { pad: Pad; lane: string }) {
  return (
    <group>
      <mesh castShadow receiveShadow position={[0, -PAD_H / 2, 0]}>
        <boxGeometry args={[pad.w, PAD_H, PAD_D]} />
        <meshStandardMaterial color={SIDE[pad.kind]} flatShading />
      </mesh>
      {/* A brighter cap, so the landing surface reads from any angle. */}
      <mesh receiveShadow position={[0, 0.01, 0]}>
        <boxGeometry args={[pad.w + 0.06, 0.1, PAD_D + 0.06]} />
        <meshStandardMaterial color={TOP[pad.kind]} flatShading />
      </mesh>
      {/* The lane's colour along the front lip. Three towers of green
          platforms would be impossible to tell apart from the front, and this
          is a quieter way of saying whose is whose than a pole up the middle. */}
      <mesh position={[0, -0.12, PAD_D / 2 + 0.02]}>
        <boxGeometry args={[pad.w + 0.02, 0.14, 0.06]} />
        <meshStandardMaterial color={lane} flatShading />
      </mesh>

      {pad.kind === 'spring' && (
        <group position={[0, 0.06, 0]}>
          {[0, 1, 2].map((i) => (
            <mesh key={i} castShadow position={[0, 0.1 + i * 0.11, 0]}>
              <boxGeometry args={[0.3 - i * 0.03, 0.07, 0.3 - i * 0.03]} />
              <meshStandardMaterial color="#e2e8f0" flatShading />
            </mesh>
          ))}
          <mesh castShadow position={[0, 0.46, 0]}>
            <boxGeometry args={[0.52, 0.1, 0.52]} />
            <meshStandardMaterial color="#ff5d73" flatShading />
          </mesh>
        </group>
      )}

      {pad.kind === 'mover' && (
        // Chevrons pointing the way it slides.
        <>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * (pad.w / 2 - 0.16), 0.08, 0]} rotation={[0, 0, s * 0.78]}>
              <boxGeometry args={[0.16, 0.16, 0.05]} />
              <meshStandardMaterial color="#eaf6ff" flatShading />
            </mesh>
          ))}
        </>
      )}

      {pad.kind === 'ice' && (
        // Frost shards standing up out of the surface: whatever lands here is
        // getting stuck to it for a moment.
        <>
          {[-0.42, 0.06, 0.5].map((dx, i) => (
            <mesh key={i} position={[dx * pad.w * 0.8, 0.16 + i * 0.02, i === 1 ? 0.12 : -0.1]} castShadow>
              <boxGeometry args={[0.2, 0.3 - i * 0.05, 0.2]} />
              <meshStandardMaterial
                color="#dff6ff"
                emissive="#8fdcff"
                emissiveIntensity={0.35}
                transparent
                opacity={0.85}
                flatShading
              />
            </mesh>
          ))}
        </>
      )}

      {pad.kind === 'sticky' && (
        // Honey pooled on top and running over the lip.
        <>
          <mesh position={[0, 0.08, 0]}>
            <boxGeometry args={[pad.w - 0.16, 0.12, PAD_D - 0.16]} />
            <meshStandardMaterial color="#ffc14d" roughness={0.25} flatShading />
          </mesh>
          {[-0.3, 0.25].map((dx, i) => (
            <mesh key={i} position={[dx * pad.w, -0.2, PAD_D / 2 - 0.14]}>
              <boxGeometry args={[0.17, 0.34, 0.14]} />
              <meshStandardMaterial color="#f0a72e" roughness={0.25} flatShading />
            </mesh>
          ))}
        </>
      )}

      {pad.kind === 'fan' && (
        // A blade on top, spun by the tower's clock, and an arrow showing which
        // way it throws. Both point the same way, so the trap is readable
        // before an animal lands in it rather than after.
        <group position={[0, 0.2, 0]}>
          <FanBlade />
          <mesh position={[pad.dir * (pad.w / 2 - 0.2), 0.02, 0]} rotation={[0, 0, pad.dir * -0.9]}>
            <boxGeometry args={[0.22, 0.22, 0.05]} />
            <meshStandardMaterial color="#efe4ff" flatShading />
          </mesh>
        </group>
      )}

      {pad.kind === 'cloud' && (
        // Puffs, so the one platform that gives way looks like it would.
        <>
          <mesh position={[-pad.w * 0.3, 0.06, 0.1]} castShadow>
            <boxGeometry args={[0.5, 0.36, 0.5]} />
            <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.3} flatShading />
          </mesh>
          <mesh position={[pad.w * 0.28, 0.1, -0.08]} castShadow>
            <boxGeometry args={[0.58, 0.42, 0.52]} />
            <meshStandardMaterial color="#f4f8ff" emissive="#ffffff" emissiveIntensity={0.3} flatShading />
          </mesh>
        </>
      )}
    </group>
  )
}

/** The fan's blade, in its own component so that only the handful of platforms
 *  that actually have one pay for a per-frame callback. */
function FanBlade() {
  const blade = useRef<THREE.Mesh>(null)
  useFrame((_, delta) => {
    if (blade.current) blade.current.rotation.y += delta * 6
  })
  return (
    <mesh ref={blade} castShadow>
      <boxGeometry args={[0.62, 0.08, 0.16]} />
      <meshStandardMaterial color="#efe4ff" flatShading />
    </mesh>
  )
}

/** The spinning star that hovers over some platforms: two crossed cubes, which
 *  is as close to a five-point star as a voxel world gets. */
function Star() {
  return (
    <group>
      <mesh castShadow>
        <boxGeometry args={[0.34, 0.34, 0.12]} />
        <meshStandardMaterial color="#ffd24a" emissive="#ffb300" emissiveIntensity={0.35} flatShading />
      </mesh>
      <mesh castShadow rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[0.34, 0.34, 0.12]} />
        <meshStandardMaterial color="#ffe680" emissive="#ffb300" emissiveIntensity={0.35} flatShading />
      </mesh>
    </group>
  )
}

interface Props {
  pads: Pad[]
  /** Lane centre in world space. */
  x: number
  /** The racer climbing this tower — its crumbled clouds and eaten stars. */
  racer: Racer
  color: string
  goal: number
}

export default function Tower({ pads, x, racer, color, goal }: Props) {
  const padRefs = useRef<(THREE.Group | null)[]>([])
  const starRefs = useRef<(THREE.Group | null)[]>([])
  const tRef = useRef(0)

  useFrame((_, delta) => {
    tRef.current += Math.min(delta, 0.05)
    const t = tRef.current
    for (const p of pads) {
      const g = padRefs.current[p.i]
      if (!g) continue
      if (p.kind === 'mover') g.position.x = padX(p, t)
      // A cloud that has been stood on drops away — and then puffs back into
      // place, because a tower with a permanent hole in it is a tower nobody
      // below the hole can finish climbing. The timing comes from the same
      // stamp the simulation lands on, so what is drawn is what is solid.
      if (p.kind === 'cloud') {
        const at = racer.brokenAt[p.i]
        const age = at > 0 ? (performance.now() - at) / 1000 : Infinity
        if (age >= CLOUD_BACK_S) {
          g.visible = true
          g.scale.setScalar(1)
          g.position.y = p.y
        } else if (age > CLOUD_BACK_S - 0.5) {
          // Swelling back: nearly there, and solid again on the last frame.
          const k = (age - (CLOUD_BACK_S - 0.5)) / 0.5
          g.visible = true
          g.scale.setScalar(0.2 + k * 0.8)
          g.position.y = p.y - (1 - k) * 0.35
        } else if (age < 0.45) {
          // Coming apart under the animal that just left it.
          const k = age / 0.45
          g.visible = true
          g.scale.setScalar(Math.max(0.001, 1 - k))
          g.position.y = p.y - k * 1.1
        } else {
          g.visible = false
        }
      }
      const s = starRefs.current[p.i]
      if (s) {
        if (racer.taken[p.i]) s.visible = false
        else {
          s.rotation.y = t * 2.4
          s.position.x = padX(p, t)
          s.position.y = p.y + 1.15 + Math.sin(t * 2 + p.phase) * 0.12
        }
      }
    }
  })

  return (
    <group position={[x, 0, 0]}>
      {pads.map((p) => (
        <group
          key={p.i}
          ref={(el) => {
            padRefs.current[p.i] = el
          }}
          position={[p.x, p.y, 0]}
        >
          <Platform pad={p} lane={color} />
        </group>
      ))}

      {pads.map((p) =>
        p.star ? (
          <group
            key={`s${p.i}`}
            ref={(el) => {
              starRefs.current[p.i] = el
            }}
            position={[p.x, p.y + 1.15, 0]}
          >
            <Star />
          </group>
        ) : null,
      )}

      {/* The finish: a cloud with this lane's flag planted at one end of it —
          the middle is where the animal lands and takes its bow. */}
      <group position={[0, goal, 0]}>
        {[-0.75, 0, 0.75].map((dx, i) => (
          <mesh key={i} position={[dx, -0.38 + (i === 1 ? 0.14 : 0), 0]} castShadow>
            <boxGeometry args={[1.2, 0.64, 1.2]} />
            {/* A cloud lit only from the side goes grey on the face pointing at
                the camera, which is the one the whole finale is shot on — the
                glow keeps it white from every angle. */}
            <meshStandardMaterial
              color="#ffffff"
              emissive="#ffffff"
              emissiveIntensity={0.34}
              flatShading
            />
          </mesh>
        ))}
        <mesh position={[-1.15, 0.8, 0]}>
          <boxGeometry args={[0.09, 1.7, 0.09]} />
          <meshStandardMaterial color="#9aa5b1" flatShading />
        </mesh>
        <mesh position={[-0.72, 1.35, 0]}>
          <boxGeometry args={[0.8, 0.52, 0.05]} />
          <meshStandardMaterial color={color} flatShading />
        </mesh>
      </group>

      {/* A plinth in the lane's colour under the starting platform, which is
          what the opening shot reads the line-up off. */}
      <mesh position={[0, -0.75, 0]} castShadow receiveShadow>
        <boxGeometry args={[LANE_HALF * 2 + 0.6, 0.5, 1.6]} />
        <meshStandardMaterial color={color} flatShading />
      </mesh>
    </group>
  )
}
