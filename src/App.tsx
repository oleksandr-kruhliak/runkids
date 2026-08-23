import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { OBSTACLE_PIECES, SHAPE_PIECES, PIECE_META, PieceType } from './track/pieces'
import { LANE_SPACING, LANE_WIDTH, NUM_LANES, buildTrack, sampleCenter } from './track/build'
import { ANIMAL_PALETTES } from './track/Animal'
import { AnimalDesign } from './studio/model'
import { loadLibrary } from './studio/library'
import Riders, { LeadState } from './track/Riders'
import AnimalBadge from './track/AnimalBadge'
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

const DEFAULT_CAM: FollowCam = { dist: 6.76, azim: -0.98, elev: 0.44 }
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

// Default: a long serpentine shared by all lanes, packed with a dense, per-lane
// obstacle run so the five animals race and diverge.
function defaultShape(): PieceType[] {
  const s: PieceType[] = []
  for (let row = 0; row < 6; row++) {
    for (let i = 0; i < 5; i++) {
      s.push('straight')
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

export default function App({ onOpenStudio }: { onOpenStudio?: () => void }) {
  const [actions, setActions] = useState<Action[]>(() => defaultActions())
  const [selectedLane, setSelectedLane] = useState(0)
  const [running, setRunning] = useState<boolean[]>(() => Array(NUM_LANES).fill(false))
  const [resetSignal, setResetSignal] = useState(0)
  const [follow, setFollow] = useState(false)
  const [followTarget, setFollowTarget] = useState(-1) // -1 = leader
  const [fitSignal, setFitSignal] = useState(0)
  const [use3d, setUse3d] = useState(false)
  const [animalModels, setAnimalModels] = useState<{ name: string; file: string }[]>([])
  // Custom cube-animals saved in the Studio, and the per-lane pick (design id
  // or '' for that lane's default racer).
  const [saved, setSaved] = useState<AnimalDesign[]>(() => loadLibrary())
  const [laneAnimalIds, setLaneAnimalIds] = useState<string[]>(() => Array(NUM_LANES).fill(''))
  const refreshSaved = () => setSaved(loadLibrary())

  const laneDesigns = useMemo(
    () => laneAnimalIds.map((id) => saved.find((d) => d.id === id) ?? null),
    [laneAnimalIds, saved],
  )

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
  const [camView, setCamView] = useState<FollowCam>({ ...DEFAULT_CAM })
  // Show a live readout of the follow-camera values so the best defaults can be
  // read off while adjusting. azim is normalized to [-π, π] for readability.
  const syncCam = () =>
    setCamView({
      dist: cam.dist,
      azim: Math.atan2(Math.sin(cam.azim), Math.cos(cam.azim)),
      elev: cam.elev,
    })
  const camZoom = (d: number) => () => {
    cam.dist = clamp(cam.dist + d, 1.6, 14)
    syncCam()
  }
  const camRotate = (d: number) => () => {
    cam.azim += d
    syncCam()
  }
  const camTilt = (d: number) => () => {
    cam.elev = clamp(cam.elev + d, -0.1, 1.35)
    syncCam()
  }
  const camReset = () => {
    Object.assign(cam, DEFAULT_CAM)
    syncCam()
  }

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
    setRunning(Array(NUM_LANES).fill(false))
    setResetSignal((n) => n + 1)
    setFollow(false)
  }

  const anyRunning = running.some(Boolean)
  const toggleLane = (l: number) => setRunning((r) => r.map((v, i) => (i === l ? !v : v)))
  const startAll = () => setRunning(Array(NUM_LANES).fill(true))
  const stopAll = () => setRunning(Array(NUM_LANES).fill(false))
  const resetRace = () => {
    setRunning(Array(NUM_LANES).fill(false))
    setResetSignal((n) => n + 1)
  }
  const fit = () => {
    setFollow(false)
    setFitSignal((n) => n + 1)
  }

  // ---- Time trial: run one animal at a time, timed, then show a podium ----
  const [trialActive, setTrialActive] = useState(false)
  const [trialLane, setTrialLane] = useState(-1) // lane currently running, -1 = none
  const [trialTimes, setTrialTimes] = useState<(number | null)[]>(() => Array(NUM_LANES).fill(null))
  const [trialDone, setTrialDone] = useState(false)
  const [displayTime, setDisplayTime] = useState(0)
  const [armed, setArmed] = useState(false) // false during the 3-2-1 countdown
  const [countdown, setCountdown] = useState<number | null>(null) // 3,2,1,0(GO),null
  const trialTimeRef = useRef(0)
  const gapTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const trialProp = useMemo(
    () => ({ active: trialActive, lane: trialLane, armed }),
    [trialActive, trialLane, armed],
  )

  const label = (l: number) => laneDesigns[l]?.name ?? LANE_NAMES[l]

  const clearTimers = () => {
    if (gapTimer.current) clearTimeout(gapTimer.current)
    if (cdTimer.current) clearTimeout(cdTimer.current)
    gapTimer.current = null
    cdTimer.current = null
  }

  // Bring a racer to the line, run a 3-2-1-GO! countdown, then let it go.
  const startRacer = (lane: number) => {
    setTrialLane(lane)
    setArmed(false)
    trialTimeRef.current = 0
    setDisplayTime(0)
    let n = 3
    setCountdown(3)
    const tick = () => {
      n -= 1
      if (n >= 0) {
        setCountdown(n) // 2, 1, then 0 = "GO!"
        cdTimer.current = setTimeout(tick, 700)
      } else {
        setCountdown(null)
        setArmed(true) // GO — the racer starts and the clock runs
      }
    }
    cdTimer.current = setTimeout(tick, 700)
  }

  const startTrial = () => {
    clearTimers()
    setRunning(Array(NUM_LANES).fill(false))
    setResetSignal((n) => n + 1)
    setTrialTimes(Array(NUM_LANES).fill(null))
    setTrialDone(false)
    setTrialActive(true)
    setFollow(true)
    setFollowTarget(-1) // follow whoever is running
    startRacer(0)
  }

  const exitTrial = () => {
    clearTimers()
    setTrialActive(false)
    setTrialLane(-1)
    setArmed(false)
    setCountdown(null)
    setTrialDone(false)
    setFollow(false)
    setResetSignal((n) => n + 1)
  }

  // Called from Riders when the running animal crosses the finish.
  const onTrialFinish = (lane: number, time: number) => {
    setTrialTimes((prev) => {
      const n = [...prev]
      n[lane] = time
      return n
    })
    setArmed(false)
    setTrialLane(-1) // brief pause on the finish line before the next racer
    clearTimers()
    gapTimer.current = setTimeout(() => {
      const next = lane + 1
      if (next < NUM_LANES) {
        startRacer(next)
      } else {
        setTrialDone(true)
        setFollow(false)
        setFitSignal((n) => n + 1)
      }
    }, 1100)
  }

  useEffect(() => clearTimers, [])

  // Live-update the big timer while an animal is running.
  useEffect(() => {
    if (!trialActive || trialLane < 0) return
    let raf = 0
    const tick = () => {
      const v = Math.round(trialTimeRef.current * 10) / 10
      setDisplayTime((prev) => (prev === v ? prev : v))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [trialActive, trialLane])

  // Ranking (fastest first) once every racer has a time.
  const ranking = useMemo(
    () =>
      trialTimes
        .map((time, lane) => ({ lane, time }))
        .filter((r): r is { lane: number; time: number } => r.time != null)
        .sort((a, b) => a.time - b.time),
    [trialTimes],
  )

  const trialRunningCount = trialTimes.filter((t) => t != null).length

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
          {onOpenStudio && (
            <button className="mini" onClick={onOpenStudio} title="Build your own cube animals">
              🐾 Studio
            </button>
          )}
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
            <meshStandardMaterial color="#7ed957" />
          </mesh>
          <Grid
            args={[1000, 1000]}
            cellSize={2}
            cellColor="#74cc4e"
            sectionSize={10}
            sectionColor="#5fb83c"
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
              running={running}
              resetSignal={resetSignal}
              leadRef={leadRef}
              followTarget={followTarget}
              distancesRef={distancesRef}
              use3d={use3d && has3d}
              animalUrls={animalUrls}
              faceY={0}
              laneDesigns={laneDesigns}
              trial={trialProp}
              trialTimeRef={trialTimeRef}
              onTrialFinish={onTrialFinish}
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

        {/* Time-trial: big kid-friendly running timer */}
        {trialActive && !trialDone && (
          <div className="trial-hud">
            <button className="trial-close" onClick={exitTrial} aria-label="Stop time trial">
              ✕
            </button>
            {countdown !== null && trialLane >= 0 ? (
              <>
                <div className="trial-now">
                  <span className="lane-dot" style={{ ['--lane-color' as string]: ANIMAL_PALETTES[trialLane].body }} />
                  Get ready, {label(trialLane)}!
                </div>
                <div key={countdown} className={`trial-count ${countdown === 0 ? 'go' : ''}`}>
                  {countdown === 0 ? 'GO!' : countdown}
                </div>
                <div className="trial-progress">Racer {trialLane + 1} of {NUM_LANES}</div>
              </>
            ) : trialLane >= 0 ? (
              <>
                <div className="trial-now">
                  <span className="lane-dot" style={{ ['--lane-color' as string]: ANIMAL_PALETTES[trialLane].body }} />
                  {label(trialLane)} is running!
                </div>
                <div className="trial-time">
                  {displayTime.toFixed(1)}
                  <span className="unit">s</span>
                </div>
                <div className="trial-progress">Racer {trialLane + 1} of {NUM_LANES}</div>
              </>
            ) : (
              <>
                <div className="trial-now">🏁 {label(trialRunningCount - 1)} finished!</div>
                <div className="trial-time done">
                  {(trialTimes[trialRunningCount - 1] ?? 0).toFixed(1)}
                  <span className="unit">s</span>
                </div>
                <div className="trial-progress">
                  {trialRunningCount < NUM_LANES ? `Get ready, ${label(trialRunningCount)}…` : 'Adding up the winners…'}
                </div>
              </>
            )}
            {ranking.length > 0 && (
              <div className="trial-splits">
                {ranking.map((r, i) => (
                  <span key={r.lane} className="split">
                    <b>{i + 1}.</b>
                    <span className="lane-dot" style={{ ['--lane-color' as string]: ANIMAL_PALETTES[r.lane].body }} />
                    {label(r.lane)} · {r.time.toFixed(1)}s
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Time-trial: results podium */}
        {trialDone && ranking.length > 0 && (
          <div className="results-overlay">
            <div className="results-card">
              <h2 className="results-title">🏆 Winners!</h2>
              <div className="podium">
                {[1, 0, 2].map((pos) => {
                  const r = ranking[pos]
                  if (!r) return <div key={pos} className="podium-col empty" />
                  const medal = ['🥇', '🥈', '🥉'][pos]
                  return (
                    <div key={pos} className={`podium-col place-${pos + 1}`}>
                      <div className="podium-badge">
                        <AnimalBadge design={laneDesigns[r.lane]} colors={ANIMAL_PALETTES[r.lane]} />
                      </div>
                      <div className="podium-name">
                        <span className="lane-dot" style={{ ['--lane-color' as string]: ANIMAL_PALETTES[r.lane].body }} />
                        {label(r.lane)}
                      </div>
                      <div className="podium-step">
                        <span className="podium-medal">{medal}</span>
                        <span className="podium-time">{r.time.toFixed(1)}s</span>
                      </div>
                    </div>
                  )
                })}
              </div>
              <ol className="results-list">
                {ranking.map((r, i) => (
                  <li key={r.lane}>
                    <span className="rank-num">{i + 1}</span>
                    <span className="lane-dot" style={{ ['--lane-color' as string]: ANIMAL_PALETTES[r.lane].body }} />
                    <span className="rank-name">{label(r.lane)}</span>
                    <span className="rank-time">{r.time.toFixed(1)}s</span>
                  </li>
                ))}
              </ol>
              <div className="results-actions">
                <button className="results-btn again" onClick={startTrial}>🔁 Race again</button>
                <button className="results-btn" onClick={exitTrial}>✕ Done</button>
              </div>
            </div>
          </div>
        )}

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
            <div className="cam-readout">
              <span>Zoom {camView.dist.toFixed(2)}</span>
              <span>Rotate {camView.azim.toFixed(2)}</span>
              <span>Tilt {camView.elev.toFixed(2)}</span>
            </div>
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

        <div className="palette-group">
          <span className="group-title">
            Racer animals{' '}
            <button className="link-btn" onClick={refreshSaved} title="Reload animals saved in the Studio">
              ↻ refresh ({saved.length})
            </button>
          </span>
          <div className="lanes">
            {Array.from({ length: NUM_LANES }, (_, l) => (
              <label
                key={l}
                className="racer-pick"
                style={{ ['--lane-color' as string]: ANIMAL_PALETTES[l].body }}
              >
                <span className="lane-dot" />
                <span className="racer-lane-name">{LANE_NAMES[l]}</span>
                <select
                  value={laneAnimalIds[l]}
                  onChange={(e) =>
                    setLaneAnimalIds((ids) => ids.map((v, i) => (i === l ? e.target.value : v)))
                  }
                >
                  <option value="">Default</option>
                  {saved.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </div>

        <div className="palette-group">
          <span className="group-title">Start racers (tap an animal to run / pause it)</span>
          <div className="lanes">
            {Array.from({ length: NUM_LANES }, (_, l) => (
              <button
                key={l}
                className={`lane-chip start ${running[l] ? 'active' : ''}`}
                style={{ ['--lane-color' as string]: ANIMAL_PALETTES[l].body }}
                onClick={() => toggleLane(l)}
                disabled={track.length === 0}
              >
                <span className="lane-dot" />
                {running[l] ? '⏸' : '▶'} {LANE_NAMES[l]}
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
          <button className="action" onClick={resetRace} disabled={track.length === 0}>
            ⟲ Reset
          </button>
          <button
            className="action trial"
            onClick={startTrial}
            disabled={track.length === 0 || trialActive}
          >
            ⏱ Time Trial
          </button>
          <button
            className={`action play ${anyRunning ? 'on' : ''}`}
            onClick={anyRunning ? stopAll : startAll}
            disabled={track.length === 0 || trialActive}
          >
            {anyRunning ? '■ Stop all' : '▶ Race all'}
          </button>
        </div>
      </div>
    </div>
  )
}
