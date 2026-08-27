import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { OBSTACLE_PIECES, SHAPE_PIECES, PIECE_META, PieceType } from './track/pieces'
import { LANE_SPACING, LANE_WIDTH, NUM_LANES, buildTrack, sampleCenter } from './track/build'
import { ANIMAL_PALETTES, AnimalColors } from './track/Animal'
import { AnimalDesign } from './studio/model'
import { loadLibrary } from './studio/library'
import { loadBuiltins, mergeLibraries } from './studio/builtin'
import Riders, { LeadState } from './track/Riders'
import Podium, { PodiumEntry } from './track/Podium'
import PlaySetup, { PlayConfig, RaceMode } from './PlaySetup'
import Confetti from './Confetti'
import { BASE_SPEED, generateLaneObstacles, generateShape } from './track/generate'
import Obstacles from './track/Obstacles'
import VoxelRoad from './track/VoxelRoad'
import Sky, { sunDirection, sunTint } from './track/Sky'
import Particles from './env/Particles'
import Scenery from './env/Scenery'
import { Birds, Lightning } from './env/Weather'
import { EnvParams, SUMMER, cloneParams } from './env/model'
import { downloadRecording, isRecordingSupported, startTabRecording } from './recorder'
import { initAudio, setAudioEnabled, setCrowd, sfx } from './audio'
import CameraRig, { FocusSpec, FollowCam } from './track/CameraRig'
import { Fireworks, Grandstands, StartGate, Trackside } from './track/Stadium'
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
  const refreshSaved = () => loadBuiltins().then((b) => setSaved(mergeLibraries(loadLibrary(), b)))
  useEffect(() => {
    refreshSaved()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // App view: the quick-play setup screen, the classic builder, or immersive play.
  const [mode, setMode] = useState<'setup' | 'build' | 'play'>('setup')
  // Quick-play: the chosen racers and the generated course.
  const [picks, setPicks] = useState<PlayConfig['picks']>([])
  const [generated, setGenerated] = useState<{ shape: PieceType[]; laneObstacles: PieceType[][] } | null>(null)

  const laneDesigns = useMemo(
    () => laneAnimalIds.map((id) => saved.find((d) => d.id === id) ?? null),
    [laneAnimalIds, saved],
  )

  // Unified racer list for the active mode: name, colours, and optional custom
  // design. Play uses the picked racers; the builder uses the five lanes.
  const racers = useMemo(() => {
    if (mode === 'play') {
      return picks.map((p) => ({
        name: p.name,
        colors: p.colors,
        design: p.designId ? saved.find((d) => d.id === p.designId) ?? null : null,
      }))
    }
    return Array.from({ length: NUM_LANES }, (_, l) => ({
      name: laneDesigns[l]?.name ?? LANE_NAMES[l],
      colors: ANIMAL_PALETTES[l] as AnimalColors,
      design: laneDesigns[l],
    }))
  }, [mode, picks, saved, laneDesigns])

  const racerCount = racers.length
  const label = (l: number) => racers[l]?.name ?? LANE_NAMES[l % LANE_NAMES.length]
  const laneHex = (l: number) => racers[l]?.colors.body ?? ANIMAL_PALETTES[l % ANIMAL_PALETTES.length].body

  const { shape, laneObstacles } = useMemo(() => {
    if (mode === 'play' && generated) return generated
    const shape = actions.filter((a) => a.kind === 'shape').map((a) => a.pt)
    const laneObstacles: PieceType[][] = Array.from({ length: NUM_LANES }, () => [])
    for (const a of actions) {
      if (a.kind === 'obstacle' && a.lane != null) laneObstacles[a.lane].push(a.pt)
    }
    return { shape, laneObstacles }
  }, [mode, generated, actions])

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
  // 'solo' runs one racer at a time; 'together' is a grand prix (all at once).
  const [trialMode, setTrialMode] = useState<RaceMode>('solo')
  const [trialLane, setTrialLane] = useState(-1) // lane currently running, -1 = none / everyone
  const [trialTimes, setTrialTimes] = useState<(number | null)[]>(() => Array(NUM_LANES).fill(null))
  const [trialDone, setTrialDone] = useState(false)
  const [displayTime, setDisplayTime] = useState(0)
  const [armed, setArmed] = useState(false) // false during the 3-2-1 countdown
  const [countdown, setCountdown] = useState<number | null>(null) // 3,2,1,0(GO),null
  const trialTimeRef = useRef(0)
  const gapTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [paused, setPaused] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  // Pre-race intro card (racer lineup); the race starts from its button.
  const [introOpen, setIntroOpen] = useState(false)
  // Auto-director: broadcast-style camera cuts during quick-play races.
  const [director, setDirector] = useState(true)
  // Procedural sound effects (M to mute; the tab recorder captures them).
  const [soundOn, setSoundOn] = useState(true)
  const toggleSound = () => {
    setSoundOn((on) => {
      setAudioEnabled(!on)
      return !on
    })
  }
  const toggleSoundRef = useRef(toggleSound)
  toggleSoundRef.current = toggleSound
  // Active environment (season) skinning the whole race scene.
  const [env, setEnv] = useState<EnvParams>(() => cloneParams(SUMMER))
  // Recording mode: hide every control except the broadcast overlay (H key).
  const [clean, setClean] = useState(false)
  const cleanRef = useRef(clean)
  cleanRef.current = clean
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showToast = (msg: string) => {
    setToastMsg(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastMsg(null), 2600)
  }

  // In-app tab recording (⏺ button / R key): saves a .webm when stopped.
  const recSupported = useMemo(() => isRecordingSupported(), [])
  const [recording, setRecording] = useState(false)
  const stopRecRef = useRef<(() => void) | null>(null)
  const startRecording = async () => {
    try {
      const stop = await startTabRecording((blob) => {
        downloadRecording(blob)
        stopRecRef.current = null
        setRecording(false)
        showToast('🎬 Video saved to your downloads')
      })
      stopRecRef.current = stop
      setRecording(true)
      setClean(true) // hide controls so they stay out of the video
      showToast('⏺ Recording — press R to stop')
    } catch {
      showToast('Recording was cancelled')
    }
  }
  const toggleRecording = () => {
    if (stopRecRef.current) stopRecRef.current()
    else startRecording()
  }
  const toggleRecordingRef = useRef(toggleRecording)
  toggleRecordingRef.current = toggleRecording

  const trialProp = useMemo(
    () => ({ active: trialActive, lane: trialLane, armed }),
    [trialActive, trialLane, armed],
  )

  const clearTimers = () => {
    if (gapTimer.current) clearTimeout(gapTimer.current)
    if (cdTimer.current) clearTimeout(cdTimer.current)
    gapTimer.current = null
    cdTimer.current = null
  }

  // Run a 3-2-1-GO! countdown, then fire `onGo`.
  const runCountdown = (onGo: () => void) => {
    setArmed(false)
    let n = 3
    setCountdown(3)
    sfx('beep')
    setCrowd(0.35)
    const tick = () => {
      n -= 1
      if (n >= 0) {
        setCountdown(n) // 2, 1, then 0 = "GO!"
        if (n === 0) {
          sfx('go')
          setCrowd(0.95, 0.15) // the stands erupt
        } else {
          sfx(n === 1 ? 'beepHi' : 'beep')
        }
        cdTimer.current = setTimeout(tick, 700)
      } else {
        setCountdown(null)
        onGo() // GO — racing starts and the clock runs
        setCrowd(0.4, 1.4) // settle to a racing murmur
      }
    }
    cdTimer.current = setTimeout(tick, 700)
  }

  // Bring a racer to the line, count down, then let it go (time trial).
  const startRacer = (lane: number) => {
    setTrialLane(lane)
    trialTimeRef.current = 0
    setDisplayTime(0)
    runCountdown(() => setArmed(true))
  }

  // Line everyone up, count down, then release the whole field (grand prix).
  const startAllRacers = () => {
    setTrialLane(-1)
    trialTimeRef.current = 0
    setDisplayTime(0)
    runCountdown(() => setArmed(true))
  }

  const startTrial = (count = racerCount, mode: RaceMode = trialMode) => {
    clearTimers()
    setTrialMode(mode)
    setPaused(false)
    setMenuOpen(false)
    setRunning(Array(NUM_LANES).fill(false))
    setResetSignal((n) => n + 1)
    setTrialTimes(Array(count).fill(null))
    setTrialDone(false)
    setTrialActive(true)
    setFollow(true)
    setFollowTarget(-1) // follow whoever is running / leading
    if (mode === 'together') startAllRacers()
    else startRacer(0)
  }

  const exitTrial = () => {
    clearTimers()
    setTrialActive(false)
    setTrialLane(-1)
    setArmed(false)
    setCountdown(null)
    setTrialDone(false)
    setPaused(false)
    setMenuOpen(false)
    setFollow(false)
    setResetSignal((n) => n + 1)
  }

  // Called from Riders when an animal crosses the finish.
  const onTrialFinish = (lane: number, time: number) => {
    sfx('finish')
    setCrowd(0.9, 0.15)
    setTimeout(() => setCrowd(0.45, 1.2), 900)
    setTrialTimes((prev) => {
      const n = [...prev]
      n[lane] = time
      return n
    })
    if (trialMode === 'together') return // everyone keeps racing to the line
    setArmed(false)
    setTrialLane(-1) // brief pause on the finish line before the next racer
    clearTimers()
    gapTimer.current = setTimeout(() => {
      const next = lane + 1
      if (next < racerCount) {
        startRacer(next)
      } else {
        setTrialDone(true)
        setFollow(false)
        setFitSignal((n) => n + 1)
      }
    }, 1100)
  }

  // Victory fanfare when the podium appears.
  useEffect(() => {
    if (trialActive && trialDone) {
      sfx('fanfare')
      setCrowd(0.85, 0.25)
    }
  }, [trialActive, trialDone])

  // Fade the stadium murmur out whenever we leave a race.
  useEffect(() => {
    if (mode !== 'play' && !trialActive) setCrowd(0, 0.8)
  }, [mode, trialActive])

  // Grand prix: once every racer has crossed the line, show the podium.
  useEffect(() => {
    if (!trialActive || trialDone || trialMode !== 'together') return
    if (trialTimes.length === 0 || !trialTimes.every((t) => t != null)) return
    gapTimer.current = setTimeout(() => {
      setArmed(false)
      setTrialDone(true)
      setFollow(false)
      setFitSignal((n) => n + 1)
    }, 1300)
    return () => {
      if (gapTimer.current) clearTimeout(gapTimer.current)
    }
  }, [trialActive, trialDone, trialMode, trialTimes])

  useEffect(() => clearTimers, [])

  // ---- Quick play: generate a course from the setup screen and auto-run ----
  const handleGenerate = (config: PlayConfig) => {
    const targetLen = Math.max(20, config.avgTime * BASE_SPEED)
    const shape = generateShape(targetLen)
    const laneObstacles = generateLaneObstacles(config.picks.length, targetLen, config.obstaclePct)
    initAudio() // this runs from a click, so the browser lets audio start
    setCrowd(0.2)
    setPicks(config.picks)
    setGenerated({ shape, laneObstacles })
    setMode('play')
    setTrialMode(config.raceMode)
    setEnv(cloneParams(config.env))
    // Show the starting-line intro; the race starts from its button.
    setResetSignal((n) => n + 1)
    setFollow(false)
    setIntroOpen(true)
    setFitSignal((n) => n + 1)
  }

  const backToSetup = () => {
    setIntroOpen(false)
    setClean(false)
    setCrowd(0, 0.5)
    exitTrial()
    setGenerated(null)
    setMode('setup')
  }

  // ESC pauses immersive play and opens the menu; resume closes it.
  const togglePauseMenu = () => {
    if (!trialActive) return
    setMenuOpen((open) => {
      const next = !open
      setPaused(next)
      return next
    })
  }
  const resumePlay = () => {
    setMenuOpen(false)
    setPaused(false)
  }
  useEffect(() => {
    if (mode !== 'play') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        togglePauseMenu()
      } else if (e.key === 'h' || e.key === 'H') {
        const next = !cleanRef.current
        setClean(next)
        showToast(next ? 'Recording mode — press H to show controls' : 'Controls shown — press H to hide')
      } else if (e.key === 'r' || e.key === 'R') {
        toggleRecordingRef.current()
      } else if (e.key === 'm' || e.key === 'M') {
        toggleSoundRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, trialActive])

  // Live-update the big timer while an animal is running.
  useEffect(() => {
    if (!trialActive || trialDone) return
    if (trialMode === 'solo' && trialLane < 0) return
    let raf = 0
    const tick = () => {
      const v = Math.round(trialTimeRef.current * 10) / 10
      setDisplayTime((prev) => (prev === v ? prev : v))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [trialActive, trialLane, trialMode, trialDone])

  // Live standings ladder: finished racers ranked by time, then everyone else
  // by how far along the course they are. Polled from the sim's distance refs.
  interface LadderRow {
    lane: number
    pct: number
    time: number | null
  }
  const [ladder, setLadder] = useState<LadderRow[]>([])
  const trialTimesRef = useRef(trialTimes)
  trialTimesRef.current = trialTimes
  useEffect(() => {
    if (!trialActive || trialDone) {
      setLadder([])
      return
    }
    const len = track.length || 1
    const compute = () => {
      const times = trialTimesRef.current
      const rows: LadderRow[] = Array.from({ length: racerCount }, (_, lane) => ({
        lane,
        pct: Math.max(0, Math.min(100, (distancesRef.current[lane] / len) * 100)),
        time: times[lane] ?? null,
      }))
      rows.sort((a, b) => {
        if (a.time != null && b.time != null) return a.time - b.time
        if (a.time != null) return -1
        if (b.time != null) return 1
        return b.pct - a.pct
      })
      setLadder(rows)
    }
    compute()
    const id = setInterval(compute, 200)
    return () => clearInterval(id)
  }, [trialActive, trialDone, racerCount, track.length])

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
    const halfW = ((racerCount - 1) / 2) * LANE_SPACING + LANE_WIDTH / 2 + 0.6
    return {
      pos: [f.pos.x, f.pos.y, f.pos.z] as [number, number, number],
      quaternion: [q.x, q.y, q.z, q.w] as [number, number, number, number],
      halfW,
    }
  }, [track, racerCount])

  // Winners' podium sits just past the finish line, oriented down-track: the
  // follow-camera parks in front of its target, so the animals face the lens.
  const podiumSpot = useMemo(() => {
    const f = sampleCenter(track.center, track.length)
    const x = new THREE.Vector3().crossVectors(f.up, f.tangent).normalize()
    const y = new THREE.Vector3().crossVectors(f.tangent, x).normalize()
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, f.tangent))
    return {
      pos: f.pos.clone().addScaledVector(f.tangent, 7),
      quaternion: q,
      tangent: f.tangent.clone(),
      up: y,
      right: x,
    }
  }, [track])

  const podiumEntries = useMemo<PodiumEntry[]>(
    () =>
      ranking.slice(0, 3).map((r, i) => ({
        place: i,
        design: racers[r.lane]?.design ?? null,
        colors: racers[r.lane]?.colors ?? ANIMAL_PALETTES[r.lane % ANIMAL_PALETTES.length],
      })),
    [ranking, racers],
  )

  // Key light follows the environment's sun elevation (golden hour!).
  const sunPos = useMemo<[number, number, number]>(() => {
    const d = sunDirection(env.sunElev ?? 55).multiplyScalar(44)
    return [d.x, Math.max(8, d.y), d.z]
  }, [env.sunElev])

  // While the intro card is up, frame the starting line so the racers are in
  // shot behind the card.
  const introFocus = useMemo<FocusSpec | null>(() => {
    if (!introOpen || track.length === 0) return null
    const f = sampleCenter(track.center, 0)
    return {
      pos: f.pos.clone(),
      dir: f.tangent.clone(),
      dist: 12,
      elev: 0.34,
      lookY: 0.6,
    }
  }, [introOpen, track])

  // Frame the podium head-on once the results are in.
  const podiumFocus = useMemo<FocusSpec | null>(
    () =>
      trialDone
        ? { pos: podiumSpot.pos, dir: podiumSpot.tangent, dist: 13, elev: 0.28, lookY: 1.8 }
        : null,
    [trialDone, podiumSpot],
  )

  // The quick-play setup screen is the landing view.
  if (mode === 'setup') {
    return <PlaySetup saved={saved} onGenerate={handleGenerate} onAdvanced={() => setMode('build')} />
  }

  const playing = mode === 'play'
  const laneDesignsOut = racers.map((r) => r.design)
  const laneColorsOut = racers.map((r) => r.colors)

  return (
    <div className={`app ${playing ? 'immersive' : ''} ${clean ? 'clean' : ''}`}>
      {!playing && (
      <header className="topbar">
        <div className="brand">
          <span className="logo">🏁</span>
          <div>
            <h1>Runkids</h1>
            <p>Race Builder</p>
          </div>
        </div>
        <div className="topbar-right">
          <button className="mini" onClick={backToSetup} title="Quick-play setup">
            🏠 Setup
          </button>
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
      )}

      <div className={playing ? 'stage stage-169' : 'stage'}>
        <Canvas shadows camera={{ position: [26, 20, 30], fov: 50 }} dpr={[1, 2]}>
          <color attach="background" args={[env.sky.horizon]} />
          <fog attach="fog" args={[env.sky.horizon, 70, 220]} />
          <Sky
            zenith={env.sky.zenith}
            mid={env.sky.mid}
            horizon={env.sky.horizon}
            clouds={env.clouds}
            night={env.night}
            sunElev={env.sunElev ?? 55}
          />
          <hemisphereLight args={env.night ? ['#4a5a8a', '#1c2438', 0.5] : ['#ffffff', '#9db4c0', 0.9]} />
          <directionalLight
            position={sunPos}
            color={env.night ? '#aebadd' : sunTint(env.sunElev ?? 55)}
            intensity={env.sun}
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-camera-left={-90}
            shadow-camera-right={90}
            shadow-camera-top={90}
            shadow-camera-bottom={-90}
          />

          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
            <planeGeometry args={[1000, 1000]} />
            <meshStandardMaterial color={env.ground} />
          </mesh>
          <Scenery track={track} env={env} />
          <VoxelRoad track={track} />

          <Obstacles placements={track.placements} distancesRef={distancesRef} length={track.length} />

          {shape.length > 0 && (
            <>
              <StartGate
                position={gate.pos}
                quaternion={gate.quaternion}
                halfW={gate.halfW}
                countdown={countdown}
                armed={armed && trialActive}
              />
              <Grandstands position={gate.pos} quaternion={gate.quaternion} halfW={gate.halfW} />
              <Trackside track={track} halfW={gate.halfW} />
            </>
          )}

          {trialDone && podiumEntries.length > 0 && (
            <Podium
              position={podiumSpot.pos}
              quaternion={podiumSpot.quaternion}
              entries={podiumEntries}
            />
          )}
          <Fireworks center={podiumSpot.pos} back={podiumSpot.tangent} active={trialDone} />

          {track.length > 0 && !trialDone && (
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
              laneDesigns={laneDesignsOut}
              laneColors={laneColorsOut}
              trial={trialProp}
              trialTimeRef={trialTimeRef}
              onTrialFinish={onTrialFinish}
              paused={paused}
              names={racers.map((r) => r.name)}
              showTags={playing && !introOpen}
              jumpScale={env.jump ?? 1}
            />
          )}

          <Particles
            kind={env.particles}
            density={env.particleDensity}
            center={track.boundsCenter}
            radius={track.radius + 18}
          />
          <Birds
            center={track.boundsCenter}
            radius={track.radius}
            flocks={env.birds ?? (env.night ? 0 : 2)}
          />
          {env.particles === 'storm' && (
            <Lightning center={track.boundsCenter} radius={track.radius} />
          )}

          <CameraRig
            center={track.boundsCenter}
            radius={track.radius}
            follow={follow}
            fitSignal={fitSignal}
            leadRef={leadRef}
            camCtrlRef={camCtrlRef}
            focus={podiumFocus ?? introFocus}
            director={director && playing}
          />
          <OrbitControls
            makeDefault
            enabled={!follow && !podiumFocus && !introFocus}
            enableDamping
            maxPolarAngle={Math.PI / 2.05}
          />
        </Canvas>

        {/* Time-trial: big kid-friendly running timer */}
        {trialActive && !trialDone && !introOpen && (
          <div className="trial-hud">
            <button className="trial-close" onClick={exitTrial} aria-label="Stop time trial">
              ✕
            </button>
            {trialMode === 'together' ? (
              countdown !== null ? (
                <>
                  <div className="trial-now">🏁 Get ready, everyone!</div>
                  <div key={countdown} className={`trial-count ${countdown === 0 ? 'go' : ''}`}>
                    {countdown === 0 ? 'GO!' : countdown}
                  </div>
                  <div className="trial-progress">{racerCount} racers on the line</div>
                </>
              ) : (
                <>
                  <div className="trial-now">🏁 Grand Prix!</div>
                  <div className="trial-time">
                    {displayTime.toFixed(1)}
                    <span className="unit">s</span>
                  </div>
                  <div className="trial-progress">
                    {trialRunningCount} of {racerCount} finished
                  </div>
                </>
              )
            ) : countdown !== null && trialLane >= 0 ? (
              <>
                <div className="trial-now">
                  <span className="lane-dot" style={{ ['--lane-color' as string]: laneHex(trialLane)}} />
                  Get ready, {label(trialLane)}!
                </div>
                <div key={countdown} className={`trial-count ${countdown === 0 ? 'go' : ''}`}>
                  {countdown === 0 ? 'GO!' : countdown}
                </div>
                <div className="trial-progress">Racer {trialLane + 1} of {racerCount}</div>
              </>
            ) : trialLane >= 0 ? (
              <>
                <div className="trial-now">
                  <span className="lane-dot" style={{ ['--lane-color' as string]: laneHex(trialLane)}} />
                  {label(trialLane)} is running!
                </div>
                <div className="trial-time">
                  {displayTime.toFixed(1)}
                  <span className="unit">s</span>
                </div>
                <div className="trial-progress">Racer {trialLane + 1} of {racerCount}</div>
              </>
            ) : (
              <>
                <div className="trial-now">🏁 {label(trialRunningCount - 1)} finished!</div>
                <div className="trial-time done">
                  {(trialTimes[trialRunningCount - 1] ?? 0).toFixed(1)}
                  <span className="unit">s</span>
                </div>
                <div className="trial-progress">
                  {trialRunningCount < racerCount ? `Get ready, ${label(trialRunningCount)}…` : 'Adding up the winners…'}
                </div>
              </>
            )}
          </div>
        )}

        {/* Broadcast overlay: live standings ladder */}
        {trialActive && !trialDone && !introOpen && ladder.length > 0 && (
          <div className="ladder">
            <div className="ladder-title">{trialMode === 'together' ? '🏁 Positions' : '⏱ Times'}</div>
            {ladder.map((row, i) => (
              <div
                key={row.lane}
                className={`ladder-row ${row.time != null ? 'done' : ''} ${
                  trialMode === 'solo' && trialLane === row.lane ? 'live' : ''
                }`}
                style={{ ['--lane-color' as string]: laneHex(row.lane) }}
              >
                <span className="ladder-bar" style={{ width: `${row.pct}%` }} />
                <span className="ladder-pos">{row.time != null ? ['🥇', '🥈', '🥉'][i] ?? i + 1 : i + 1}</span>
                <span className="lane-dot" />
                <span className="ladder-name">{label(row.lane)}</span>
                <span className="ladder-val">
                  {row.time != null
                    ? `${row.time.toFixed(1)}s`
                    : trialMode === 'together' || trialLane === row.lane
                      ? `${Math.round(row.pct)}%`
                      : '—'}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Broadcast overlay: pre-race intro / lineup card */}
        {playing && introOpen && (
          <div className="intro-overlay">
            <div className="intro-card">
              <div className="intro-kicker">Today's race</div>
              <h2 className="intro-title">
                {trialMode === 'together' ? '🏆 Grand Prix' : '⏱ Time Trial'}
              </h2>
              <div className="intro-racers">
                {racers.map((r, i) => (
                  <div
                    key={i}
                    className="intro-racer"
                    style={{ ['--lane-color' as string]: r.colors.body }}
                  >
                    <span className="intro-num">{i + 1}</span>
                    <span className="lane-dot" />
                    <span className="intro-name">{r.name}</span>
                  </div>
                ))}
              </div>
              <div className="intro-question">Who will win? Leave your guess in the comments! 👇</div>
              <button
                className="intro-go"
                onClick={() => {
                  initAudio()
                  setIntroOpen(false)
                  startTrial()
                }}
              >
                🏁 Start the race!
              </button>
              {recSupported && (
                <button className="intro-rec" onClick={toggleRecording}>
                  {recording ? '⏺ Recording… press R to stop' : '⏺ Record this race to a video'}
                </button>
              )}
              <button className="intro-back" onClick={backToSetup}>
                ← Back to setup
              </button>
            </div>
          </div>
        )}

        {/* Time-trial: results podium */}
        {trialDone && ranking.length > 0 && (
          <div className="results-overlay">
            <Confetti />
            <div className="results-card">
              <h2 className="results-title">
                🏆 {label(ranking[0].lane)} wins!
              </h2>
              <ol className="results-list">
                {ranking.map((r, i) => (
                  <li key={r.lane}>
                    <span className="rank-num">{['🥇', '🥈', '🥉'][i] ?? i + 1}</span>
                    <span className="lane-dot" style={{ ['--lane-color' as string]: laneHex(r.lane)}} />
                    <span className="rank-name">{label(r.lane)}</span>
                    {i > 0 && <span className="rank-gap">+{(r.time - ranking[0].time).toFixed(1)}s</span>}
                    <span className="rank-time">{r.time.toFixed(1)}s</span>
                  </li>
                ))}
              </ol>
              <div className="results-actions">
                <button className="results-btn again" onClick={() => startTrial()}>🔁 Race again</button>
                <button className="results-btn" onClick={playing ? backToSetup : exitTrial}>
                  {playing ? '⚙ New setup' : '✕ Done'}
                </button>
              </div>
            </div>
          </div>
        )}

        {shape.length === 0 && !playing && (
          <div className="hint-overlay">Tap a Track piece below to start building</div>
        )}

        {/* ESC pause menu (immersive play) */}
        {playing && menuOpen && (
          <div className="pause-overlay">
            <div className="pause-card">
              <h2 className="pause-title">Paused</h2>
              <button className="pause-btn primary" onClick={resumePlay}>▶ Resume</button>
              <button className="pause-btn" onClick={() => startTrial()}>↻ Restart</button>
              <button className="pause-btn" onClick={backToSetup}>⟲ Reset</button>
              <button className="pause-btn" onClick={backToSetup}>⚙ Open settings</button>
            </div>
          </div>
        )}

        {playing && toastMsg && <div className="clean-toast">{toastMsg}</div>}
        {playing && !menuOpen && !trialDone && !introOpen && (
          <div className="play-corner">
            {recSupported && (
              <button
                className={`corner-chip ${recording ? 'rec' : ''}`}
                onClick={toggleRecording}
                title="Record the race to a video file"
              >
                {recording ? '■ Stop rec' : '⏺ Record'}
              </button>
            )}
            <button
              className={`corner-chip ${director ? 'on' : ''}`}
              onClick={() => setDirector((d) => !d)}
              title="Cinematic camera cuts"
            >
              🎬 Auto cam
            </button>
            <button
              className={`corner-chip ${soundOn ? 'on' : ''}`}
              onClick={toggleSound}
              title="Sound effects (M)"
            >
              {soundOn ? '🔊 Sound' : '🔇 Muted'}
            </button>
            <button className="corner-chip" onClick={togglePauseMenu}>⏸ Menu (Esc)</button>
          </div>
        )}

        {follow && !playing && (
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

        {follow && !playing && (
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

      {!playing && (
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
            onClick={() => startTrial(racerCount, 'solo')}
            disabled={track.length === 0 || trialActive}
          >
            ⏱ Time Trial
          </button>
          <button
            className="action trial"
            onClick={() => startTrial(racerCount, 'together')}
            disabled={track.length === 0 || trialActive}
          >
            🏆 Grand Prix
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
      )}
    </div>
  )
}
