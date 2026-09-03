import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import Sky, { sunDirection, sunTint } from '../track/Sky'
import Particles from '../env/Particles'
import { EnvParams } from '../env/model'
import { AnimalDesign } from '../studio/model'
import { sfx } from '../audio'
import Tower from './Tower'
import Jumper from './Jumper'
import { JumpEvent, LANE_HALF, LANE_W, Sim, laneX, stepSim } from './model'

// The climb, in three dimensions: a row of towers standing in a meadow, one
// animal bouncing up each of them, and a camera that rides the leader.
//
// This is also where the simulation is actually driven. One useFrame steps
// every racer, turns whatever happened into sound, and hands the numbers to
// the towers and the animals to draw — so a bounce never costs a render.

export type JumpCam = 'title' | 'climb' | 'top'

/**
 * The sun, and more to the point its shadow camera, riding up with the climb.
 * A fixed shadow frustum around the origin leaves everything above about
 * twenty units outside the depth map, which renders it as if it were in
 * shadow — an animal that has climbed into the sky would go grey.
 */
function ClimbSun({
  sim,
  base,
  span,
  env,
}: {
  sim: Sim
  base: [number, number, number]
  span: number
  env: EnvParams
}) {
  const light = useRef<THREE.DirectionalLight>(null)

  useFrame(() => {
    const l = light.current
    if (!l) return
    l.position.set(base[0], base[1] + sim.camY, base[2])
    l.target.position.set(0, sim.camY, 0)
    l.target.updateMatrixWorld()
  })

  return (
    <directionalLight
      ref={light}
      position={base}
      intensity={env.sun}
      color={env.night ? '#aebadd' : sunTint(env.sunElev ?? 55)}
      castShadow
      shadow-mapSize={[2048, 2048]}
      shadow-camera-left={-span}
      shadow-camera-right={span}
      shadow-camera-top={span}
      shadow-camera-bottom={-span}
      shadow-camera-far={160}
      shadow-bias={-0.0006}
    />
  )
}

/** How far the camera sits behind the towers for a row of `n` lanes. */
function camDistance(n: number): number {
  return 10.5 + Math.max(0, n - 1) * LANE_W * 0.62
}

/**
 * Roughly the share of the frame's half-width the leaderboard covers down the
 * right-hand edge. The towers are framed left of centre by that much so they
 * never climb behind it.
 */
const BOARD_FRAC = 0.2

/** How much world width half the frame spans, one unit of distance out. */
function halfWidthPerUnit(camera: THREE.PerspectiveCamera): number {
  return Math.max(0.05, Math.tan((camera.fov * Math.PI) / 360) * camera.aspect)
}

/**
 * The closest the camera can be and still hold the whole row across the frame,
 * with the leaderboard's slice of it left over.
 *
 * A three.js field of view is the vertical one, so how much width a given
 * distance buys depends entirely on the shape of the window: the distance that
 * frames four towers on a 16:9 screen cuts the outer two off in a portrait one.
 * The climb gets filmed at both — a tower is a natural fit for a phone-shaped
 * video — so this is worked out from the live aspect rather than assumed.
 */
function fitDistance(camera: THREE.PerspectiveCamera, span: number): number {
  const halfSpan = span / 2 + LANE_HALF + 1.4
  return halfSpan / (halfWidthPerUnit(camera) * (1 - BOARD_FRAC))
}

/**
 * The rig. It centres between the leader and the tail of the field — clamped
 * so the leader always sits high in frame rather than pinned to the middle —
 * and pulls back when the field spreads out. The height it settles on is
 * written back into the sim, because that's what decides when an animal has
 * fallen out of shot and needs a bubble.
 */
function ClimbCam({
  sim,
  mode,
  lanes,
  span,
  goal,
}: {
  sim: Sim
  mode: JumpCam
  lanes: number
  /** World width from the first lane centre to the last. */
  span: number
  goal: number
}) {
  const { camera } = useThree()
  const look = useRef(new THREE.Vector3(0, 2.4, 0))
  const want = useRef(new THREE.Vector3())
  const wantLook = useRef(new THREE.Vector3())

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime
    const persp = camera as THREE.PerspectiveCamera
    const dist = Math.max(camDistance(lanes), fitDistance(persp, span))
    if (mode === 'title') {
      // Low and close on the starting line, looking up the towers.
      want.current.set(Math.sin(t * 0.18) * 0.8, 3.0, dist * 0.86)
      wantLook.current.set(0, 2.6, 0)
      sim.camY = 2.4
    } else if (mode === 'top') {
      // Level with the winners' clouds and a touch closer than the climb, so
      // the line-up fills the frame for the card that lands over it.
      want.current.set(Math.sin(t * 0.16) * 0.7, goal + 1.6, dist * 0.86)
      wantLook.current.set(0, goal + 0.25, 0)
      sim.camY = goal
    } else {
      let hi = -Infinity
      let lo = Infinity
      for (const r of sim.racers) {
        hi = Math.max(hi, r.y)
        lo = Math.min(lo, r.y)
      }
      // Between the two, but never so low that the leader leaves the top of
      // frame — it is the one the viewer is watching. When the field strings
      // out the shot drops back and widens rather than abandoning the tail:
      // an animal off the bottom of the frame is one a bubble has to fetch.
      const mid = (hi + lo) / 2
      const centre = THREE.MathUtils.clamp(mid, hi - 7.5, hi - 1.6)
      const spread = THREE.MathUtils.clamp(hi - lo, 0, 14)
      // The leaderboard lives down the right-hand edge, so the towers are
      // framed left of centre to stay out from behind it — by a share of the
      // frame, not a fixed number of world units, because that is what the
      // board itself covers. A constant here pushed the outermost tower off
      // the left of a narrow window.
      const shift = BOARD_FRAC * halfWidthPerUnit(persp) * dist
      want.current.set(shift + Math.sin(t * 0.13) * 0.35, centre + 1.1, dist + spread * 0.7)
      wantLook.current.set(shift, centre + 0.5, 0)
      sim.camY = centre
    }
    // Loose enough to glide, tight enough that a spring doesn't leave frame.
    const k = 1 - Math.exp(-delta * (mode === 'climb' ? 3.6 : 2.2))
    camera.position.lerp(want.current, k)
    look.current.lerp(wantLook.current, k)
    camera.lookAt(look.current)
  })

  return null
}

/** Sound for whatever the last frame of simulation threw up. */
function play(ev: JumpEvent): void {
  if (ev.kind === 'bounce') {
    if (ev.pad === 'spring') sfx('boing', 0.95)
    else if (ev.pad === 'cloud') sfx('pop', 0.5)
    else if (ev.pad === 'sticky') sfx('mud', 0.6)
    else sfx('jump', 0.5)
  } else if (ev.kind === 'caught') {
    // Each trick platform has its own voice, so the viewer knows what just
    // happened without having to read the platform.
    if (ev.pad === 'ice') sfx('slip', 0.8)
    else if (ev.pad === 'sticky') sfx('mud', 0.9)
    else sfx('gush', 0.55)
  } else if (ev.kind === 'star') sfx('chime', 0.7)
  else if (ev.kind === 'save') sfx('warp', 0.6)
  else if (ev.kind === 'finish') sfx('finish', 1)
}

/**
 * Steps the simulation once per frame and reports what came of it. Bounces and
 * stars stay down here — they happen several times a second and only ever
 * become a sound — while the two beats the show has something to say about are
 * passed up.
 */
function Director({ sim, onEvent }: { sim: Sim; onEvent: (lane: number, ev: JumpEvent) => void }) {
  useFrame((_, delta) => {
    // A long frame (a tab coming back from the background, a hitch during
    // recording) must not teleport anyone through a platform, so the step is
    // capped and the leftover time is simply lost.
    const dt = Math.min(delta, 1 / 30)
    for (const { lane, ev } of stepSim(sim, dt)) {
      play(ev)
      if (ev.kind === 'finish' || ev.kind === 'save') onEvent(lane, ev)
    }
  })
  return null
}

interface Props {
  sim: Sim
  designs: AnimalDesign[]
  colors: string[]
  cam: JumpCam
  env: EnvParams
  onEvent: (lane: number, ev: JumpEvent) => void
}

export default function JumpStage({ sim, designs, colors, cam, env, onEvent }: Props) {
  const n = sim.racers.length
  const span = Math.max(1, (n - 1) * LANE_W)

  const sunPos = useMemo<[number, number, number]>(() => {
    const d = sunDirection(env.sunElev ?? 55).multiplyScalar(44)
    return [d.x, Math.max(8, d.y), d.z]
  }, [env.sunElev])

  // The weather follows the climb up the sky rather than staying in the field.
  const weatherCentre = useRef(new THREE.Vector3())
  useFrame(() => weatherCentre.current.set(0, sim.camY - 9, 0))

  const shadowSpan = span / 2 + 9

  return (
    <>
      <color attach="background" args={[env.sky.horizon]} />
      <fog attach="fog" args={[env.sky.horizon, 40, 150]} />
      <Sky
        zenith={env.sky.zenith}
        mid={env.sky.mid}
        horizon={env.sky.horizon}
        clouds={env.clouds}
        night={env.night}
        sunElev={env.sunElev ?? 55}
      />
      <hemisphereLight
        args={env.night ? ['#4a5a8a', '#1c2438', 0.6] : ['#ffffff', '#9db4c0', 1.0]}
      />
      <ClimbSun sim={sim} base={sunPos} span={shadowSpan} env={env} />

      {/* The meadow the towers stand in. It drops away below the climb, which
          is most of what sells the height. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.2, 0]} receiveShadow>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color={env.grass} />
      </mesh>

      {sim.racers.map((r, i) => (
        <Tower
          key={i}
          pads={sim.pads[i]}
          x={laneX(i, n)}
          racer={r}
          color={colors[i]}
          goal={sim.goal}
        />
      ))}

      {sim.racers.map((r, i) => (
        <Jumper key={i} racer={r} lanes={n} design={designs[i]} color={colors[i]} />
      ))}

      {env.particles !== 'none' && env.particleDensity > 0 && (
        <Particles
          kind={env.particles}
          density={env.particleDensity}
          center={weatherCentre.current}
          radius={30}
        />
      )}

      <Director sim={sim} onEvent={onEvent} />
      <ClimbCam sim={sim} mode={cam} lanes={n} span={span} goal={sim.goal} />
    </>
  )
}
