import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import Sky, { sunDirection, sunTint } from '../track/Sky'
import Particles from '../env/Particles'
import { EnvParams } from '../env/model'
import { AnimalDesign } from '../studio/model'
import Egg from './Egg'
import Tool from './Tool'
import HatchAnimal from './HatchAnimal'
import Painter from './Painter'
import Backdrop from './Backdrop'
import { PaintFill, PainterDef } from './painters'
import {
  EggRuntime,
  NEST_TOP,
  PARADE_Z,
  SPACING,
  eggX,
  paintCamXAt,
  paradeSpot,
} from './model'
import { EGG_H, EggStyle, rng } from './eggGeo'
import { ToolDef } from './tools'

// The hatching stage: a row of nests in a sunny meadow, party bunting strung
// above them, and a camera that walks down the line one egg at a time.

export interface StageEgg {
  style: EggStyle
  seed: number
  design: AnimalDesign
  name: string
  /** The tool that opens this one, rolled when the episode starts. */
  tool: ToolDef
  /** Blows this shell takes — also rolled per egg. */
  hits: number
}

/** A stump with a straw nest on top — one per egg. */
function Nest({ x, seed }: { x: number; seed: number }) {
  const straw = useMemo(() => {
    const rand = rng(seed * 31 + 5)
    return Array.from({ length: 14 }, (_, i) => {
      const a = (i / 14) * Math.PI * 2 + rand() * 0.2
      const r = 0.46 + rand() * 0.06
      return {
        pos: [Math.cos(a) * r, 0.54 + rand() * 0.05, Math.sin(a) * r] as [number, number, number],
        rot: [rand() * 0.4 - 0.2, -a, rand() * 0.5 - 0.25] as [number, number, number],
        color: rand() < 0.5 ? '#d6a95c' : '#b98b45',
      }
    })
  }, [seed])

  return (
    <group position={[x, 0, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.21, 0]}>
        <boxGeometry args={[1.05, 0.42, 1.05]} />
        <meshStandardMaterial color="#a9743f" flatShading />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.46, 0]}>
        <boxGeometry args={[1.22, 0.1, 1.22]} />
        <meshStandardMaterial color="#8a5a28" flatShading />
      </mesh>
      {straw.map((s, i) => (
        <mesh key={i} castShadow position={s.pos} rotation={s.rot}>
          <boxGeometry args={[0.34, 0.1, 0.13]} />
          <meshStandardMaterial color={s.color} flatShading />
        </mesh>
      ))}
    </group>
  )
}

/** Party bunting strung across the back of the stage. */
function Bunting({ span }: { span: number }) {
  const flags = useMemo(() => {
    const colors = ['#ff6f91', '#ffd45e', '#7fe0c8', '#8ec7ff', '#b79bff', '#b6e86a']
    const n = Math.max(10, Math.round(span / 0.62) + 8)
    const half = (n - 1) / 2
    return Array.from({ length: n }, (_, i) => {
      const u = (i - half) / Math.max(1, half) // -1..1 across the string
      return {
        pos: [u * (span / 2 + 2.4), 3.05 - (1 - u * u) * 0.55, -2.6] as [number, number, number],
        color: colors[i % colors.length],
        tilt: u * 0.24,
      }
    })
  }, [span])

  return (
    <group>
      {flags.map((f, i) => (
        <mesh key={i} position={f.pos} rotation={[0, 0, f.tilt]}>
          <boxGeometry args={[0.26, 0.34, 0.04]} />
          <meshStandardMaterial color={f.color} flatShading />
        </mesh>
      ))}
    </group>
  )
}


export type CamMode = 'wide' | 'drop' | 'focus' | 'paint' | 'parade' | 'recap'

/**
 * The camera. It settles on whichever egg is up next, rides along with the
 * cloud while the eggs are being painted, pulls back to take in the whole row
 * for the title and the finale, and gets a short kick every time a blow lands.
 */
function StageCam({
  x,
  mode,
  span,
  count,
  paintSince,
  shakeAt,
}: {
  x: number
  mode: CamMode
  span: number
  count: number
  /** performance.now() the painting beat began, for the travelling shot. */
  paintSince: number
  shakeAt: number
}) {
  const { camera } = useThree()
  const look = useRef(new THREE.Vector3(0, NEST_TOP + 0.8, 0))
  const want = useRef(new THREE.Vector3())
  const wantLook = useRef(new THREE.Vector3())

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime
    if (mode === 'wide') {
      want.current.set(Math.sin(t * 0.18) * 0.7, NEST_TOP + 2.7, 5.8 + span * 0.55)
      wantLook.current.set(0, NEST_TOP + 0.85, 0)
    } else if (mode === 'drop') {
      // The whole row at once, framed nearly level so the shot isn't half
      // grass — and no higher than it needs to be, because DROP_H puts the
      // eggs above the top of frame anyway and they should enter from
      // off-screen rather than popping into existence mid-air.
      want.current.set(Math.sin(t * 0.14) * 0.5, NEST_TOP + 2.2, 5.5 + span * 0.5)
      wantLook.current.set(0, NEST_TOP + 1.9, 0)
    } else if (mode === 'parade') {
      // The whole line, from a little lower and closer than the wide shot —
      // the animals have stepped forward, so the framing comes forward too.
      want.current.set(Math.sin(t * 0.16) * 0.6, NEST_TOP + 1.9, 6.6 + span * 0.5)
      wantLook.current.set(0, NEST_TOP + 0.9, PARADE_Z)
    } else if (mode === 'recap') {
      // Walks the line: `x` is whichever animal is being named.
      want.current.set(x + 0.3, NEST_TOP + 1.5, PARADE_Z + 4.4)
      wantLook.current.set(x, NEST_TOP + 0.75, PARADE_Z)
    } else if (mode === 'paint') {
      // Ride along with the cloud (but never past the row), pulled back enough
      // to hold the whole shower from the cloud's belly down to the nest.
      const cx = paintSince > 0 ? paintCamXAt(performance.now() - paintSince, count) : x
      want.current.set(cx + 0.25, NEST_TOP + 2.3, 7.0)
      wantLook.current.set(cx, NEST_TOP + 1.3, 0)
    } else {
      // Framed to hold the whole tool arc, the egg and the nest at once.
      want.current.set(
        x + 0.6 + Math.sin(t * 0.25) * 0.22,
        NEST_TOP + 1.9 + Math.sin(t * 0.19) * 0.09,
        5.5,
      )
      wantLook.current.set(x, NEST_TOP + 1.15, 0)
    }
    // The cloud is a moving target, so the paint shot tracks it closely — lag
    // slides the shower off the egg it's meant to be pouring onto.
    const k = 1 - Math.exp(-delta * (mode === 'paint' ? 7 : 2.6))
    camera.position.lerp(want.current, k)
    look.current.lerp(wantLook.current, k)

    // Impact kick: a short, fast decay so it punches without wobbling.
    const dt = shakeAt > 0 ? (performance.now() - shakeAt) / 1000 : 99
    if (dt < 0.32) {
      const amp = 0.085 * (1 - dt / 0.32)
      camera.position.x += Math.sin(dt * 78) * amp
      camera.position.y += Math.cos(dt * 64) * amp
    }
    camera.lookAt(look.current)
  })

  return null
}

interface Props {
  eggs: StageEgg[]
  state: EggRuntime[]
  /** Index of the egg being smashed; -1 for the title / finale wide shots. */
  active: number
  /** performance.now() of the current swing; 0 when the tool is resting. */
  swingAt: number
  /** Is the tool on stage at all? */
  toolOn: boolean
  /** How the camera is framing things right now. */
  cam: CamMode
  /** The rig currently giving the eggs their colours. */
  painter: PainterDef
  /** Which way the pattern pass spreads. */
  patternFill: PaintFill
  /** performance.now() the current painting pass began; 0 = nothing on stage. */
  paintSince: number
  /** performance.now() the animals set off for the curtain call; 0 = not yet. */
  paradeAt: number
  /** Everyone is on their mark and celebrating. */
  cheering: boolean
  shakeAt: number
  env: EnvParams
}

export default function HatchStage({
  eggs,
  state,
  active,
  swingAt,
  toolOn,
  cam,
  painter,
  patternFill,
  paintSince,
  paradeAt,
  cheering,
  shakeAt,
  env,
}: Props) {
  const n = eggs.length
  const span = Math.max(1, (n - 1) * SPACING)
  const focusX = active >= 0 ? eggX(active, n) : 0

  const sunPos = useMemo<[number, number, number]>(() => {
    const d = sunDirection(env.sunElev ?? 55).multiplyScalar(44)
    return [d.x, Math.max(8, d.y), d.z]
  }, [env.sunElev])

  // The shadow camera has to cover the whole row, not just the origin.
  const shadowSpan = span / 2 + 8
  const weatherCentre = useMemo(
    () => new THREE.Vector3(focusX, 0, 0),
    [focusX],
  )

  return (
    <>
      <color attach="background" args={[env.sky.horizon]} />
      <fog attach="fog" args={[env.sky.horizon, 34, 120]} />
      <Sky
        zenith={env.sky.zenith}
        mid={env.sky.mid}
        horizon={env.sky.horizon}
        clouds={env.clouds}
        night={env.night}
        sunElev={env.sunElev ?? 55}
      />
      <hemisphereLight
        args={env.night ? ['#4a5a8a', '#1c2438', 0.55] : ['#ffffff', '#9db4c0', 0.95]}
      />
      <directionalLight
        position={sunPos}
        intensity={env.sun}
        color={env.night ? '#aebadd' : sunTint(env.sunElev ?? 55)}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-shadowSpan}
        shadow-camera-right={shadowSpan}
        shadow-camera-top={shadowSpan}
        shadow-camera-bottom={-shadowSpan}
        shadow-camera-far={140}
        shadow-bias={-0.0006}
      />

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[300, 300]} />
        <meshStandardMaterial color={env.grass} />
      </mesh>
      <Backdrop span={span} env={env} />
      <Bunting span={span} />

      {eggs.map((e, i) => {
        const x = eggX(i, n)
        const st = state[i] ?? { hits: 0, hitAt: 0, breakAt: 0 }
        return (
          <group key={i}>
            <Nest x={x} seed={e.seed} />
            <Egg
              style={e.style}
              seed={e.seed}
              position={[x, NEST_TOP, 0]}
              dropAt={st.dropAt}
              paintAt={st.paintAt}
              patternAt={st.patternAt}
              fill={painter.fill}
              patternFill={patternFill}
              hits={st.hits}
              totalHits={e.hits}
              hitAt={st.hitAt}
              breakAt={st.breakAt}
            />
            {st.breakAt > 0 && (
              <HatchAnimal
                design={e.design}
                position={[x, NEST_TOP, 0]}
                since={st.breakAt}
                paradeTo={paradeSpot(i, n)}
                paradeAt={paradeAt}
                cheering={cheering}
              />
            )}
          </group>
        )
      })}

      {/* One rig, re-anchored and re-dressed as the show moves down the row. */}
      <Tool
        tool={eggs[Math.max(0, active)]?.tool ?? eggs[0].tool}
        position={[focusX, NEST_TOP, 0]}
        swingAt={swingAt}
        show={toolOn}
      />

      {/* The opening act: whichever painter this episode drew, working its way
          down the row giving each egg its colour. */}
      <Painter
        painter={painter}
        since={paintSince}
        count={n}
        palette={eggs.map((e) => ({ base: e.style.base, accent: e.style.accent }))}
        landY={NEST_TOP + EGG_H * 0.75}
      />

      {env.particles !== 'none' && env.particleDensity > 0 && (
        <Particles
          kind={env.particles}
          density={env.particleDensity}
          center={weatherCentre}
          radius={30}
        />
      )}

      <StageCam
        x={focusX}
        mode={cam}
        span={span}
        count={n}
        paintSince={paintSince}
        shakeAt={shakeAt}
      />
    </>
  )
}
