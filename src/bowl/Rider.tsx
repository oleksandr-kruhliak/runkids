import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import RaceAnimal from '../track/RaceAnimal'
import { AnimalDesign } from '../studio/model'
import { HazardKind, Rider as RiderState, heightAt, laneX, slopeAt, worldZ } from './model'
import { Blob } from './Mountain'

// One animal, one board, down one mountain. The ride itself is the
// simulation's — this reads the rider's state and puts the model where the
// numbers say it is, then adds the things that make a downhill look like a
// downhill: the board pitched to the face, a lean into the turns, a rooster
// tail off the back wheels, and a proper tumble when something is hit.

/** Scale on top of the racer size, so an animal fits on a board. */
const SIZE = 0.72
/** How high the deck of the board sits above the surface. */
const BOARD_Y = 0.16

/**
 * Which way the animal is turned. A board is ridden side-on, so the animal
 * stands across it — turned a little back toward the camera, because a show
 * about animals that only ever shows their shoulder blades is a poor one.
 */
const STANCE = Math.PI / 2 - 0.35

/** How long the hop onto the board takes at GO, in seconds. */
const HOP_S = 0.45
/** Where the animal waits through the countdown, beside its board. */
const WAIT_X = -0.75

/** Rooster tail off the back wheels: how many flecks, and how long each lives. */
const SPRAY_N = 14
const SPRAY_S = 0.5
/** Below this there is nothing to throw up. */
const SPRAY_V = 4

/** The burst when something is hit: how many bits, how long they hang. */
const BURST_N = 12
const BURST_S = 0.8
/** What each hazard throws up. */
const BURST_COLOR: Record<HazardKind, string> = {
  rock: '#8b93a1',
  mud: '#6b4a2a',
  snow: '#ffffff',
  ice: '#bfe9ff',
}

interface Fleck {
  life: number
  vx: number
  vy: number
  vz: number
}

interface Props {
  rider: RiderState
  /** Lane count, so the rider knows where its mountain is. */
  lanes: number
  run: number
  design: AnimalDesign
  color: string
}

export default function Rider({ rider, lanes, run, design, color }: Props) {
  const root = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const spray = useRef<(THREE.Mesh | null)[]>([])
  const burst = useRef<(THREE.Mesh | null)[]>([])
  /** Age and velocity of each fleck; position lives on the mesh itself. */
  const flecks = useRef<Fleck[]>(
    Array.from({ length: SPRAY_N }, () => ({ life: Math.random() * SPRAY_S, vx: 0, vy: 0, vz: 0 })),
  )
  const bits = useRef<Fleck[]>(
    Array.from({ length: BURST_N }, () => ({ life: 0, vx: 0, vy: 0, vz: 0 })),
  )
  /** performance.now() the board was jumped on, or 0 before GO. */
  const hopAt = useRef(0)
  const wasReady = useRef(true)
  /** Hits already thrown a burst for. */
  const seenBumps = useRef(0)
  /** Where the tumble is up to, as a running angle. */
  const tumbleSpin = useRef(0)

  useFrame((_, delta) => {
    const g = root.current
    const inner = body.current
    if (!g || !inner) return
    const dt = Math.min(delta, 1 / 30)
    const base = laneX(rider.lane, lanes)
    const y = heightAt(rider.z, run)
    const slope = slopeAt(rider.z, run)

    g.position.set(base + rider.x, y + BOARD_Y, worldZ(rider.z))
    // Pitched onto the face. The mountain steepens toward the top, so this
    // changes the whole way down rather than being set once.
    g.rotation.x = -Math.atan(slope)

    if (wasReady.current && rider.phase !== 'ready') {
      hopAt.current = performance.now()
      wasReady.current = false
    }

    // The hop on at GO: the animal is standing next to its board through the
    // countdown and jumps onto it as the flag drops, which is the one moment
    // in the episode where it is doing something rather than being carried.
    const hop = hopAt.current === 0 ? 0 : (performance.now() - hopAt.current) / 1000 / HOP_S
    const tumbling = rider.tumbleLeft > 0
    if (hop < 1) {
      const k = Math.max(0, hop)
      inner.position.x = WAIT_X * (1 - k)
      inner.position.y = hopAt.current === 0 ? 0 : Math.sin(k * Math.PI) * 0.55
      inner.rotation.y = STANCE - (1 - k) * 0.5
      inner.rotation.z = 0
    } else if (tumbling) {
      // Thrown: the animal spins right round and bounces on the board, which
      // is what a hit looks like from thirty metres back. The board itself
      // stays on the snow — it is the rider that is having the bad time.
      tumbleSpin.current += dt * 13
      inner.position.x = 0
      inner.position.y = Math.abs(Math.sin(tumbleSpin.current * 0.5)) * 0.6
      inner.rotation.y = STANCE + tumbleSpin.current
      inner.rotation.z = Math.sin(tumbleSpin.current * 0.7) * 0.5
    } else {
      tumbleSpin.current = 0
      inner.position.x = 0
      inner.position.y = 0
      // Wobbles on the ice, where it has no say in where it is going.
      const skidding = rider.skidLeft > 0
      inner.rotation.y = skidding
        ? STANCE + Math.sin(performance.now() / 90) * 0.5
        : STANCE + THREE.MathUtils.clamp(rider.vx * 0.05, -0.35, 0.35)
      // Leans into the turn.
      inner.rotation.z = THREE.MathUtils.clamp(-rider.vx * 0.055, -0.42, 0.42)
    }

    // Crouches into the speed.
    const tuck = THREE.MathUtils.clamp(1 - rider.v * 0.006, 0.88, 1)
    inner.scale.set(SIZE * (2 - tuck), SIZE * tuck, SIZE * (2 - tuck))

    // --- The rooster tail --------------------------------------------------
    // Flecks are thrown in world space rather than parented to the board: a
    // spray that rode along with the rider would be a scarf, not a spray.
    const fast = rider.v > SPRAY_V
    for (let i = 0; i < SPRAY_N; i++) {
      const m = spray.current[i]
      const f = flecks.current[i]
      if (!m) continue
      f.life -= dt
      if (f.life <= 0) {
        if (!fast) {
          m.visible = false
          f.life = 0.08
          continue
        }
        f.life = SPRAY_S * (0.5 + Math.random() * 0.5)
        m.visible = true
        m.position.set(
          base + rider.x + (Math.random() - 0.5) * 0.5,
          y + 0.1,
          worldZ(rider.z) + 0.45,
        )
        // Backwards and up, out of the way of the board.
        f.vx = (Math.random() - 0.5) * 2.2
        f.vy = 1.4 + Math.random() * 2.6
        f.vz = 2.5 + Math.random() * 4.5
      }
      if (!m.visible) continue
      f.vy -= 11 * dt
      m.position.x += f.vx * dt
      m.position.y += f.vy * dt
      m.position.z += f.vz * dt
      m.rotation.x += dt * 5
      m.rotation.z += dt * 4
      // Fades out by shrinking: a hundred transparent materials would cost far
      // more to sort than a hundred that simply get small.
      const k = Math.max(0, f.life / SPRAY_S)
      m.scale.setScalar(k * 0.9 + 0.1)
    }

    // --- The burst ---------------------------------------------------------
    // A new hit throws up a cloud of whatever was hit. It is the loudest thing
    // the rider does all episode, so it is deliberately big and bright.
    if (rider.bumps > seenBumps.current) {
      seenBumps.current = rider.bumps
      const c = BURST_COLOR[rider.lastHit ?? 'snow']
      for (let i = 0; i < BURST_N; i++) {
        const m = burst.current[i]
        const b = bits.current[i]
        if (!m) continue
        ;(m.material as THREE.MeshStandardMaterial).color.set(c)
        b.life = BURST_S * (0.6 + Math.random() * 0.4)
        m.visible = true
        m.position.set(base + rider.x, y + 0.3, worldZ(rider.z))
        const a = Math.random() * Math.PI * 2
        const sp = 2 + Math.random() * 4
        b.vx = Math.cos(a) * sp
        b.vz = Math.sin(a) * sp + 3
        b.vy = 4 + Math.random() * 5
        m.scale.setScalar(1 + Math.random())
      }
    }
    for (let i = 0; i < BURST_N; i++) {
      const m = burst.current[i]
      const b = bits.current[i]
      if (!m || !m.visible) continue
      b.life -= dt
      if (b.life <= 0) {
        m.visible = false
        continue
      }
      b.vy -= 14 * dt
      m.position.x += b.vx * dt
      m.position.y += b.vy * dt
      m.position.z += b.vz * dt
      m.rotation.x += dt * 7
      m.rotation.y += dt * 5
    }
  })

  return (
    <>
      <group ref={root}>
        {/* Pinned to the snow under the board, whatever the sun is doing —
            without it the animal reads as hovering over the face. */}
        <group position={[0, -BOARD_Y, 0]}>
          <Blob r={0.62} opacity={0.26} />
        </group>
        {/* The board stays put; the animal above it is what hops on. */}
        <group position={[0, -BOARD_Y + 0.1, 0]}>
          <mesh castShadow position={[0, 0.06, 0]}>
            <boxGeometry args={[0.52, 0.07, 1.05]} />
            <meshStandardMaterial color={color} flatShading />
          </mesh>
          {/* Kicked up at both ends, which is the whole shape of a deck. */}
          {[-1, 1].map((s) => (
            <mesh key={s} castShadow position={[0, 0.11, s * 0.56]} rotation={[s * 0.5, 0, 0]}>
              <boxGeometry args={[0.5, 0.06, 0.24]} />
              <meshStandardMaterial color={color} flatShading />
            </mesh>
          ))}
          {[-1, 1].flatMap((sx) =>
            [-1, 1].map((sz) => (
              <mesh
                key={`${sx}${sz}`}
                position={[sx * 0.22, -0.02, sz * 0.34]}
                rotation={[0, 0, Math.PI / 2]}
              >
                <cylinderGeometry args={[0.085, 0.085, 0.09, 8]} />
                <meshStandardMaterial color="#f6c453" flatShading />
              </mesh>
            )),
          )}
        </group>
        {/* The stance is driven from this group, not from RaceAnimal's own
            `faceY` — the yaw changes every frame (the lean, the wobble on the
            ice, the tumble) and setting both would turn the animal twice. */}
        <group ref={body} scale={SIZE} rotation={[0, STANCE, 0]}>
          <RaceAnimal design={design} clip="idle" />
        </group>
      </group>

      {Array.from({ length: SPRAY_N }, (_, i) => (
        <mesh
          key={i}
          visible={false}
          ref={(el) => {
            spray.current[i] = el
          }}
        >
          <boxGeometry args={[0.1, 0.1, 0.1]} />
          <meshStandardMaterial
            color="#ffffff"
            emissive="#dbeafe"
            emissiveIntensity={0.25}
            flatShading
          />
        </mesh>
      ))}

      {/* One material each, because each burst recolours them. */}
      {Array.from({ length: BURST_N }, (_, i) => (
        <mesh
          key={`b${i}`}
          visible={false}
          ref={(el) => {
            burst.current[i] = el
          }}
        >
          <boxGeometry args={[0.22, 0.22, 0.22]} />
          <meshStandardMaterial color="#ffffff" flatShading />
        </mesh>
      ))}
    </>
  )
}
