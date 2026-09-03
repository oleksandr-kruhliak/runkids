import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import Sky, { sunDirection, sunTint } from '../track/Sky'
import Particles from '../env/Particles'
import { EnvParams } from '../env/model'
import { AnimalDesign } from '../studio/model'
import { sfx } from '../audio'
import Mountain, { SKIRT_Y, Shoulders } from './Mountain'
import Pins from './Pins'
import Rider from './Rider'
import {
  BowlEvent,
  DECK_LEN,
  LANE_W,
  PIN_Z0,
  START_Z,
  Sim,
  heightAt,
  laneX,
  stepSim,
  worldZ,
} from './model'

// The ride, in three dimensions: a row of mountains falling away from the
// camera, an animal on a board down each of them, and ten pins waiting at the
// bottom of every one.
//
// This is also where the simulation is actually driven. One useFrame steps
// every rider and every deck, turns whatever happened into sound, and hands the
// numbers to the mountains and the pins to draw — so a falling pin never costs
// a render.

export type BowlCam = 'title' | 'ride' | 'smash' | 'result'

/** Reused for the snow blend below; a Color per render would be wasteful. */
const WHITE = new THREE.Color('#ffffff')
const DARK = new THREE.Color('#2a3140')

/**
 * The sun, and more to the point its shadow camera, riding down with the pack.
 * A fixed shadow frustum around the origin would leave a mountain a hundred
 * units tall almost entirely outside the depth map, which renders as if it were
 * in shadow — the whole face would go grey.
 */
function RideSun({
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
    l.position.set(base[0], base[1] + sim.camY, base[2] + sim.camZ)
    l.target.position.set(0, sim.camY, sim.camZ)
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
      shadow-camera-far={220}
      shadow-bias={-0.0006}
    />
  )
}

/**
 * Lifts the sky dome to whatever height the camera is at.
 *
 * `Sky` follows the camera across the ground but deliberately not up it, which
 * is right for a race on the flat — riding every small camera bob would see-saw
 * the horizon. A mountain is the case it was not written for: the chase shot
 * starts a hundred and seventy units up and ends at zero, and with the dome
 * pinned to the ground the opening shot looks out at the dark top of the
 * gradient and the episode appears to begin at night. A sky is infinitely far
 * away, so its horizon belongs at eye level wherever the eye is.
 */
function SkyAtAltitude({ children }: { children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null)
  useFrame(({ camera }) => {
    if (g.current) g.current.position.y = camera.position.y
  })
  return <group ref={g}>{children}</group>
}

/**
 * Roughly the share of the frame's half-width the leaderboard covers down the
 * right-hand edge. The mountains are framed left of centre by that much so they
 * never run along behind it.
 */
const BOARD_FRAC = 0.2

/** How much world width half the frame spans, one unit of distance out. */
function halfWidthPerUnit(camera: THREE.PerspectiveCamera): number {
  return Math.max(0.05, Math.tan((camera.fov * Math.PI) / 360) * camera.aspect)
}

/**
 * The closest the camera can be and still hold the whole row across the frame.
 *
 * A three.js field of view is the vertical one, so how much width a given
 * distance buys depends entirely on the shape of the window: the distance that
 * frames four mountains on a 16:9 screen cuts the outer two off in a portrait
 * one. The show gets filmed at both, so this is worked out from the live aspect
 * rather than assumed.
 */
function fitDistance(camera: THREE.PerspectiveCamera, span: number, pad: number): number {
  return (span / 2 + pad) / halfWidthPerUnit(camera)
}

/**
 * The same, for the chase shot, which is also framed left of centre to keep
 * clear of the leaderboard. The shift is a share of the half-frame and the
 * half-frame is what the distance buys, so the two have to be solved together —
 * fitting the row first and then sliding it sideways pushed the outermost
 * mountain straight off the left edge.
 */
function fitShifted(camera: THREE.PerspectiveCamera, span: number, pad: number): number {
  return fitDistance(camera, span, pad) / (1 - BOARD_FRAC)
}

/** How far the camera trails the tail of the pack, at the very least. */
const CHASE_BACK = 12
/**
 * How far the chase shot floats above the surface it is over. High enough to
 * look down onto the lanes rather than along them: at half this the near
 * mountain filled two thirds of the frame edge-on, the run ahead was hidden
 * behind its own lip, and a downhill read as a flat grey road.
 */
const CHASE_UP = 7
/**
 * The widest the chase shot will stretch to hold the pack. Past this the tail
 * is left to catch up rather than the shot pulling back until nobody in it is
 * bigger than a pixel.
 */
const SPREAD_CAP = 46

/**
 * The rig. Four shots, and it cuts between them rather than gliding: the jump
 * from halfway up a mountain to beyond the pin deck is several hundred units
 * straight through solid rock, and a lerp would film every inch of it.
 */
function RideCam({
  sim,
  mode,
  span,
  focus,
}: {
  sim: Sim
  mode: BowlCam
  span: number
  /** In turns: the lane the shot is about, and the only one it need frame. */
  focus: number | null
}) {
  const n = sim.riders.length
  const { camera } = useThree()
  const look = useRef(new THREE.Vector3())
  const want = useRef(new THREE.Vector3())
  const wantLook = useRef(new THREE.Vector3())
  const was = useRef<BowlCam | null>(null)

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime
    const persp = camera as THREE.PerspectiveCamera
    const { run } = sim
    const deckZ = run + DECK_LEN

    if (mode === 'title') {
      // Behind the launch pad and above it, looking down the whole mountain —
      // or, between turns, down the one mountain whose rider is next.
      const cx = focus === null ? 0 : laneX(focus, n)
      const dist = focus === null ? Math.max(14, fitDistance(persp, span, 4)) : 13
      const top = heightAt(0, run)
      want.current.set(cx + Math.sin(t * 0.15) * 1.2, top + 5.5, worldZ(START_Z) + dist)
      wantLook.current.set(cx, top - 0.5, worldZ(24))
      sim.camY = top
      sim.camZ = 0
    } else if (mode === 'smash' || mode === 'result') {
      // Past the far end of the deck, looking back up at the racks — so the
      // pins scatter toward the lens and the stragglers come down the last of
      // the face straight at it. It is the only shot in the episode that faces
      // up the hill, and it is the one the whole thing has been building to.
      // The wide version of the same shot, not a different one: the placings
      // card sits over it, and a camera that climbed for a plan view of the
      // decks put nothing behind the card but shadowed rock.
      const wide = mode === 'result'
      const cx = focus === null || wide ? 0 : laneX(focus, n)
      const dist =
        focus !== null && !wide
          ? 15
          : Math.max(wide ? 23 : 17, fitDistance(persp, span, wide ? 5 : 3))
      want.current.set(cx + Math.sin(t * 0.12) * 0.8, wide ? 8 : 6.4, worldZ(deckZ) - dist)
      wantLook.current.set(cx, wide ? 1.4 : 1.1, worldZ(run + PIN_Z0 + 1))
      sim.camY = 2
      sim.camZ = worldZ(run)
    } else {
      let lead = -Infinity
      let tail = Infinity
      for (const r of sim.riders) {
        if (focus !== null && r.lane !== focus) continue
        lead = Math.max(lead, r.z)
        tail = Math.min(tail, r.z)
      }
      // Behind the tail, but never so far behind that the leader is a speck.
      // When the field strings out the shot drops back and widens rather than
      // abandoning whoever is last — with "keep it close" off, that is most of
      // what stops an episode becoming a solo.
      tail = Math.max(tail, lead - SPREAD_CAP)
      const spread = THREE.MathUtils.clamp(lead - tail, 0, SPREAD_CAP)
      // Fitted to the riding surfaces, not the berms: the outer lanes'
      // banking may leave the frame. Anything looser and four riders are ants.
      const back =
        focus !== null
          ? CHASE_BACK + 1
          : Math.max(CHASE_BACK, fitShifted(persp, span, 2.2)) + spread * 0.35
      const camZ = tail - back
      // The leaderboard lives down the right-hand edge, so the mountains are
      // framed left of centre to stay out from behind it — by a share of the
      // frame rather than a fixed number of world units, because that is what
      // the board itself covers.
      const shift = BOARD_FRAC * halfWidthPerUnit(persp) * back + (focus === null ? 0 : laneX(focus, n))
      want.current.set(
        shift + Math.sin(t * 0.13) * 0.5,
        heightAt(camZ, run) + CHASE_UP,
        worldZ(camZ),
      )
      // Looks ahead of the leader rather than at it, so the mountain the pack
      // is about to ride is the thing filling the frame.
      const aim = Math.min(lead + 9, deckZ)
      wantLook.current.set(shift, heightAt(aim, run) + 1.2, worldZ(aim))
      sim.camY = heightAt(tail, run)
      sim.camZ = worldZ(tail)
    }

    if (was.current !== mode) {
      // A cut, not a move.
      was.current = mode
      camera.position.copy(want.current)
      look.current.copy(wantLook.current)
    } else {
      const k = 1 - Math.exp(-delta * (mode === 'ride' ? 3.2 : 2.0))
      camera.position.lerp(want.current, k)
      look.current.lerp(wantLook.current, k)
    }
    camera.lookAt(look.current)
  })

  return null
}

/** Sound for whatever the last frame of simulation threw up. */
function play(ev: BowlEvent): void {
  if (ev.kind === 'hazard') {
    // Each hazard has its own voice, so the viewer knows what just went wrong
    // without having to read the mountain.
    if (ev.haz === 'rock') sfx('thud', 0.9)
    else if (ev.haz === 'mud') sfx('mud', 0.85)
    else if (ev.haz === 'snow') sfx('gush', 0.6)
    else sfx('slip', 0.8)
  } else if (ev.kind === 'arrive') {
    sfx('skid', Math.min(1, 0.4 + ev.speed / 24))
  } else if (ev.kind === 'pins') {
    // Louder the more of them went over at once, which is what makes a rack
    // opening up sound different from a single wobbler falling in late.
    sfx('smash', Math.min(1, 0.35 + ev.n * 0.14))
  }
}

/**
 * Steps the simulation once per frame and reports what came of it. Hazards and
 * pins stay down here — they only ever become a sound — while the beats the
 * show has something to say about are passed up.
 */
function Director({ sim, onEvent }: { sim: Sim; onEvent: (lane: number, ev: BowlEvent) => void }) {
  useFrame((_, delta) => {
    // A long frame (a tab coming back from the background, a hitch during
    // recording) must not teleport a board through a rack, so the step is
    // capped and the leftover time is simply lost.
    const dt = Math.min(delta, 1 / 30)
    for (const { lane, ev } of stepSim(sim, dt)) {
      play(ev)
      if (ev.kind === 'arrive' || ev.kind === 'strike') onEvent(lane, ev)
    }
  })
  return null
}

interface Props {
  sim: Sim
  designs: AnimalDesign[]
  colors: string[]
  cam: BowlCam
  /** The lane the shot is about, in turns mode; null frames everyone. */
  focus: number | null
  env: EnvParams
  onEvent: (lane: number, ev: BowlEvent) => void
}

export default function BowlStage({ sim, designs, colors, cam, focus, env, onEvent }: Props) {
  const n = sim.riders.length
  const span = Math.max(1, (n - 1) * LANE_W)

  // The riding surface is the environment's ground cover pulled most of the way
  // to white. The presets were written for a meadow, and a meadow green makes a
  // mountain face read as a lawn on a hill — but taking the colour outright and
  // hard-coding snow would throw away the environment the user picked, so the
  // tint survives and only the value changes.
  const surface = useMemo(() => new THREE.Color(env.grass).lerp(WHITE, 0.86).getStyle(), [env.grass])
  // And the rock is the environment's ground pulled the other way, so the
  // flanks read as something under the snow rather than more of it.
  const rock = useMemo(() => new THREE.Color(env.ground).lerp(DARK, 0.45).getStyle(), [env.ground])

  const sunPos = useMemo<[number, number, number]>(() => {
    const d = sunDirection(env.sunElev ?? 55).multiplyScalar(70)
    return [d.x, Math.max(20, d.y), d.z]
  }, [env.sunElev])

  // The weather follows the pack down the mountain rather than staying at the
  // top of it.
  const weatherCentre = useRef(new THREE.Vector3())
  useFrame(() => weatherCentre.current.set(0, sim.camY - 4, sim.camZ - 6))

  const shadowSpan = span / 2 + 22

  return (
    <>
      <color attach="background" args={[env.sky.horizon]} />
      {/* Far enough out to leave the whole chase shot clear, near enough that
          the bottom of a long mountain fades rather than hanging there in full
          detail a quarter of a mile away. */}
      <fog attach="fog" args={[env.sky.horizon, 80, 400]} />
      <SkyAtAltitude>
        <Sky
          zenith={env.sky.zenith}
          mid={env.sky.mid}
          horizon={env.sky.horizon}
          clouds={env.clouds}
          night={env.night}
          sunElev={env.sunElev ?? 55}
        />
      </SkyAtAltitude>
      <hemisphereLight
        args={env.night ? ['#4a5a8a', '#1c2438', 0.6] : ['#ffffff', '#9db4c0', 1.0]}
      />
      <RideSun sim={sim} base={sunPos} span={shadowSpan} env={env} />

      {/* The valley floor the ridges stand out of. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, SKIRT_Y - 0.2, 0]} receiveShadow>
        <planeGeometry args={[4000, 4000]} />
        <meshLambertMaterial color={rock} />
      </mesh>

      <Shoulders
        lanes={n}
        run={sim.run}
        seed={sim.seed}
        surface={surface}
        rock={rock}
        tree={env.scenery.tree}
        density={env.scenery.density}
      />

      {sim.riders.map((_, i) => (
        <Mountain
          key={i}
          hazards={sim.hazards[i]}
          run={sim.run}
          x={laneX(i, n)}
          color={colors[i]}
          surface={surface}
        />
      ))}

      {sim.decks.map((d, i) => (
        <Pins key={i} deck={d} x={laneX(i, n)} color={colors[i]} />
      ))}

      {sim.riders.map((r, i) => (
        <Rider
          key={i}
          rider={r}
          lanes={n}
          run={sim.run}
          design={designs[i]}
          color={colors[i]}
        />
      ))}

      {env.particles !== 'none' && env.particleDensity > 0 && (
        <Particles
          kind={env.particles}
          density={env.particleDensity}
          center={weatherCentre.current}
          radius={34}
        />
      )}

      <Director sim={sim} onEvent={onEvent} />
      <RideCam sim={sim} mode={cam} span={span} focus={focus} />
    </>
  )
}
