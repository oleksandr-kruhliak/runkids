import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { OBSTACLE_PIECES, SHAPE_PIECES, PIECE_META, PieceType } from './track/pieces'
import { LANE_SPACING, LANE_WIDTH, NUM_LANES, buildTrack, sampleCenter } from './track/build'
import { ANIMAL_PALETTES } from './track/Animal'
import Riders, { LeadState } from './track/Riders'
import Obstacles from './track/Obstacles'
import StoneRoad from './track/StoneRoad'
import GrassField from './track/GrassField'
import CameraRig, { FollowCam } from './track/CameraRig'
import './styles.css'

interface Action {
  id: number
  kind: 'shape' | 'obstacle'
  pt: PieceType
  lane?: number
}

const LANE_NAMES = ['Fox', 'Bear', 'Frog', 'Koala', 'Duck']

const DEFAULT_CAM: FollowCam = { dist: 3.7, azim: 0.35, elev: 0.4 }
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** A button that repeats its action while held down (touch-friendly). */
function HoldButton({
  onStep,
  className,
  children,
  ariaLabel,
}: {
  onStep: () => void
  className?: string
  children: React.ReactNode
  ariaLabel: string
}) {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const stop = () => {
    if (timer.current) {
      clearInterval(timer.current)
      timer.current = null
    }
  }
  const start = (e: React.PointerEvent) => {
    e.preventDefault()
    onStep()
    stop()
    timer.current = setInterval(onStep, 55)
  }
  useEffect(() => stop, [])
  return (
    <button
      className={className}
      aria-label={ariaLabel}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
    >
      {children}
    </button>
  )
}

let actionId = 0
const mk = (kind: 'shape' | 'obstacle', pt: PieceType, lane?: number): Action => ({
  id: actionId++,
  kind,
  pt,
  lane,
})

// Default: a long serpentine (with a loop) shared by all lanes, packed with a
// dense, per-lane obstacle run so the five animals race and diverge.
function defaultShape(): PieceType[] {
  const s: PieceType[] = []
  for (let row = 0; row < 6; row++) {
    for (let i = 0; i < 5; i++) {
      s.push('straight')
      if (row === 2 && i === 2) s.push('loop') // one Hot Wheels loop
    }
    if (row < 5) {
      const turn: PieceType = row % 2 === 0 ? 'left' : 'right'
      s.push(turn, turn) // U-turn to snake back
    }
  }
  return s
}

// Dense obstacle run per lane (~20 each ≈ 10x the previous course), cycling a
// varied pool with a per-lane offset so no two lanes are the same.
const OBS_POOL: PieceType[] = [
  'boost', 'water', 'crates', 'mud', 'gap', 'spinner', 'trampoline', 'stopper', 'crates', 'spinner',
]
const PER_LANE = 30

function defaultLaneObs(): PieceType[][] {
  return Array.from({ length: NUM_LANES }, (_, lane) =>
    Array.from({ length: PER_LANE }, (_, j) => OBS_POOL[(j + lane * 3) % OBS_POOL.length]),
  )
}

function defaultActions(): Action[] {
  const a: Action[] = defaultShape().map((pt) => mk('shape', pt))
  defaultLaneObs().forEach((obs, lane) => obs.forEach((pt) => a.push(mk('obstacle', pt, lane))))
  return a
}

export default function App() {
  const [actions, setActions] = useState<Action[]>(() => defaultActions())
  const [selectedLane, setSelectedLane] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [follow, setFollow] = useState(false)
  const [followTarget, setFollowTarget] = useState(-1) // -1 = leader
  const [fitSignal, setFitSignal] = useState(0)
  const [use3d, setUse3d] = useState(false)
  const [animalModels, setAnimalModels] = useState<{ name: string; file: string }[]>([])

  const { shape, laneObstacles } = useMemo(() => {
    const shape = actions.filter((a) => a.kind === 'shape').map((a) => a.pt)
    const laneObstacles: PieceType[][] = Array.from({ length: NUM_LANES }, () => [])
    for (const a of actions) {
      if (a.kind === 'obstacle' && a.lane != null) laneObstacles[a.lane].push(a.pt)
    }
    return { shape, laneObstacles }
  }, [actions])

  const track = useMemo(() => buildTrack(shape, laneObstacles), [shape, laneObstacles])

  const leadRef = useRef<LeadState>({
    active: false,
    pos: new THREE.Vector3(),
    tangent: new THREE.Vector3(0, 0, 1),
    up: new THREE.Vector3(0, 1, 0),
    right: new THREE.Vector3(1, 0, 0),
  })
  const distancesRef = useRef<number[]>(Array.from({ length: NUM_LANES }, () => 0))
  const camCtrlRef = useRef<FollowCam>({ ...DEFAULT_CAM })

  const cam = camCtrlRef.current
  const camZoom = (d: number) => () => (cam.dist = clamp(cam.dist + d, 1.6, 14))
  const camRotate = (d: number) => () => (cam.azim += d)
  const camTilt = (d: number) => () => (cam.elev = clamp(cam.elev + d, -0.1, 1.35))
  const camReset = () => Object.assign(cam, DEFAULT_CAM)

  useEffect(() => {
    const lanes = track.lanes
    return () => lanes.forEach((l) => l.geometry.dispose())
  }, [track])

  // Load the optional 3D animal model set (added under public/models/animals).
  const base = import.meta.env.BASE_URL
  useEffect(() => {
    fetch(`${base}models/animals/manifest.json`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list: { name: string; file: string }[]) =>
        setAnimalModels(Array.isArray(list) ? list : []),
      )
      .catch(() => setAnimalModels([]))
  }, [base])

  const animalUrls = useMemo(
    () => animalModels.map((m) => `${base}models/animals/${m.file}`),
    [animalModels, base],
  )
  useEffect(() => {
    animalUrls.forEach((u) => useGLTF.preload(u))
  }, [animalUrls])
  const has3d = animalUrls.length > 0

  const obstacleCount = actions.filter((a) => a.kind === 'obstacle').length
  const addShape = (pt: PieceType) => setActions((a) => [...a, mk('shape', pt)])
  const addObstacle = (pt: PieceType) => setActions((a) => [...a, mk('obstacle', pt, selectedLane)])
  const undo = () => setActions((a) => a.slice(0, -1))
  const clear = () => {
    setActions([])
    setPlaying(false)
    setFollow(false)
  }
  const fit = () => {
    setFollow(false)
    setFitSignal((n) => n + 1)
  }

  // Start/finish gate spanning all lanes, oriented to the track start.
  const gate = useMemo(() => {
    const f = sampleCenter(track.center, 0)
    const x = new THREE.Vector3().crossVectors(f.up, f.tangent).normalize()
    const y = new THREE.Vector3().crossVectors(f.tangent, x).normalize()
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, f.tangent))
    const halfW = ((NUM_LANES - 1) / 2) * LANE_SPACING + LANE_WIDTH / 2 + 0.6
    return {
      pos: [f.pos.x, f.pos.y, f.pos.z] as [number, number, number],
      quaternion: [q.x, q.y, q.z, q.w] as [number, number, number, number],
      halfW,
    }
  }, [track])

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">🏁</span>
          <div>
            <h1>Runkids</h1>
            <p>Race Builder</p>
          </div>
        </div>
        <div className="topbar-right">
          {has3d && (
            <button
              className={`mini ${use3d ? 'on' : ''}`}
              onClick={() => setUse3d((v) => !v)}
              title="Use the 3D animal models"
            >
              🐮 3D Animals
            </button>
          )}
          <button className="mini" onClick={fit} disabled={shape.length === 0}>
            ⤢ Fit
          </button>
          <button
            className={`mini ${follow ? 'on' : ''}`}
            onClick={() => setFollow((f) => !f)}
            disabled={track.length === 0}
          >
            🎥 Follow
          </button>
        </div>
      </header>

      <div className="stage">
        <Canvas shadows camera={{ position: [26, 20, 30], fov: 50 }} dpr={[1, 2]}>
          <color attach="background" args={['#dfeffb']} />
          <fog attach="fog" args={['#dfeffb', 70, 220]} />
          <hemisphereLight args={['#ffffff', '#9db4c0', 0.9]} />
          <directionalLight
            position={[24, 34, 14]}
            intensity={1.5}
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-camera-left={-90}
            shadow-camera-right={90}
            shadow-camera-top={90}
            shadow-camera-bottom={-90}
          />

          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
            <planeGeometry args={[1000, 1000]} />
            <meshStandardMaterial color="#a5d6a7" />
          </mesh>
          <Grid
            args={[1000, 1000]}
            cellSize={2}
            cellColor="#8bc48f"
            sectionSize={10}
            sectionColor="#6aa870"
            fadeDistance={180}
          />

          <GrassField track={track} />
          <StoneRoad track={track} />

          <Obstacles placements={track.placements} distancesRef={distancesRef} length={track.length} />

          {shape.length > 0 && (
            <group position={gate.pos} quaternion={gate.quaternion}>
              <mesh position={[-gate.halfW, 1.1, 0]} castShadow>
                <boxGeometry args={[0.25, 2.2, 0.25]} />
                <meshStandardMaterial color="#ffffff" />
              </mesh>
              <mesh position={[gate.halfW, 1.1, 0]} castShadow>
                <boxGeometry args={[0.25, 2.2, 0.25]} />
                <meshStandardMaterial color="#ffffff" />
              </mesh>
              <mesh position={[0, 2.3, 0]} castShadow>
                <boxGeometry args={[gate.halfW * 2, 0.4, 0.25]} />
                <meshStandardMaterial color="#e53935" />
              </mesh>
            </group>
          )}

          {track.length > 0 && (
            <Riders
              track={track}
              playing={playing}
              leadRef={leadRef}
              followTarget={followTarget}
              distancesRef={distancesRef}
              use3d={use3d && has3d}
              animalUrls={animalUrls}
              faceY={0}
            />
          )}

          <CameraRig
            center={track.boundsCenter}
            radius={track.radius}
            follow={follow}
            fitSignal={fitSignal}
            leadRef={leadRef}
            camCtrlRef={camCtrlRef}
          />
          <OrbitControls makeDefault enabled={!follow} enableDamping maxPolarAngle={Math.PI / 2.05} />
        </Canvas>

        {shape.length === 0 && (
          <div className="hint-overlay">Tap a Track piece below to start building</div>
        )}

        {follow && (
          <div className="follow-bar">
            <span className="follow-label">Following</span>
            <button
              className={`follow-chip ${followTarget === -1 ? 'active' : ''}`}
              onClick={() => setFollowTarget(-1)}
            >
              🏆 Leader
            </button>
            {Array.from({ length: NUM_LANES }, (_, l) => (
              <button
                key={l}
                className={`follow-chip ${followTarget === l ? 'active' : ''}`}
                style={{ ['--lane-color' as string]: ANIMAL_PALETTES[l].body }}
                onClick={() => setFollowTarget(l)}
              >
                <span className="lane-dot" />
                {LANE_NAMES[l]}
              </button>
            ))}
          </div>
        )}

        {follow && (
          <div className="cam-controls">
            <div className="cam-group">
              <span className="cam-label">Zoom</span>
              <HoldButton className="cam-btn" ariaLabel="Zoom in" onStep={camZoom(-0.18)}>
                ＋
              </HoldButton>
              <HoldButton className="cam-btn" ariaLabel="Zoom out" onStep={camZoom(0.18)}>
                －
              </HoldButton>
            </div>
            <div className="cam-group">
              <span className="cam-label">Rotate</span>
              <HoldButton className="cam-btn" ariaLabel="Rotate left" onStep={camRotate(-0.05)}>
                ↺
              </HoldButton>
              <HoldButton className="cam-btn" ariaLabel="Rotate right" onStep={camRotate(0.05)}>
                ↻
              </HoldButton>
            </div>
            <div className="cam-group">
              <span className="cam-label">Tilt</span>
              <HoldButton className="cam-btn" ariaLabel="Tilt up" onStep={camTilt(0.035)}>
                ▲
              </HoldButton>
              <HoldButton className="cam-btn" ariaLabel="Tilt down" onStep={camTilt(-0.035)}>
                ▼
              </HoldButton>
            </div>
            <button className="cam-btn reset" aria-label="Reset camera" onClick={camReset}>
              ⟳
            </button>
          </div>
        )}
      </div>

      <div className="toolbar">
        <div className="palette-group">
          <span className="group-title">Track shape (all lanes)</span>
          <div className="pieces">
            {SHAPE_PIECES.map((type) => (
              <button key={type} className={`piece-btn ${type}`} onClick={() => addShape(type)}>
                <span className="piece-icon">{PIECE_META[type].icon}</span>
                <span className="piece-label">{PIECE_META[type].label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="palette-group">
          <span className="group-title">Lane to edit</span>
          <div className="lanes">
            {Array.from({ length: NUM_LANES }, (_, l) => (
              <button
                key={l}
                className={`lane-chip ${selectedLane === l ? 'active' : ''}`}
                style={{ ['--lane-color' as string]: ANIMAL_PALETTES[l].body }}
                onClick={() => setSelectedLane(l)}
              >
                <span className="lane-dot" />
                {LANE_NAMES[l]}
              </button>
            ))}
          </div>
        </div>

        <div className="palette-group">
          <span className="group-title">
            Add obstacle to <b style={{ color: ANIMAL_PALETTES[selectedLane].body }}>{LANE_NAMES[selectedLane]}</b>
          </span>
          <div className="pieces">
            {OBSTACLE_PIECES.map((type) => (
              <button
                key={type}
                className={`piece-btn obstacle ${type}`}
                onClick={() => addObstacle(type)}
              >
                <span className="piece-icon">{PIECE_META[type].icon}</span>
                <span className="piece-label">{PIECE_META[type].label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="actions">
          <button className="action" onClick={undo} disabled={actions.length === 0}>
            ↶ Undo
          </button>
          <button className="action" onClick={clear} disabled={actions.length === 0}>
            ✕ Clear
          </button>
          <span className="action-count">
            {shape.length} shape · {obstacleCount} obs
          </span>
          <button
            className={`action play ${playing ? 'on' : ''}`}
            onClick={() => setPlaying((p) => !p)}
            disabled={track.length === 0}
          >
            {playing ? '■ Stop' : '▶ Race'}
          </button>
        </div>
      </div>
    </div>
  )
}
