import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid } from '@react-three/drei'
import * as THREE from 'three'
import {
  OBSTACLE_PIECES,
  TRACK_PIECES,
  PIECE_META,
  Piece,
  PieceType,
  makePiece,
} from './track/pieces'
import { buildTrack } from './track/build'
import Riders, { LeadState } from './track/Riders'
import Obstacles from './track/Obstacles'
import CameraRig from './track/CameraRig'
import './styles.css'

// A long (~5x) serpentine starter course that folds back on itself so it stays
// compact on screen, showing off every obstacle along the way.
const DEFAULT_TRACK: PieceType[] = [
  // row 1
  'straight', 'boost', 'straight', 'water', 'straight',
  'left', 'left',
  // row 2
  'straight', 'mud', 'straight', 'gap', 'straight',
  'right', 'right',
  // row 3
  'straight', 'spring', 'straight', 'boost', 'straight',
  'left', 'left',
  // row 4
  'straight', 'water', 'rampUp', 'rampDown', 'straight',
  'right', 'right',
  // row 5
  'straight', 'mud', 'straight', 'gap', 'straight',
  'left', 'left',
  // row 6
  'straight', 'boost', 'spring', 'straight', 'water', 'straight',
]

export default function App() {
  const [pieces, setPieces] = useState<Piece[]>(() => DEFAULT_TRACK.map(makePiece))
  const [playing, setPlaying] = useState(false)
  const [follow, setFollow] = useState(false)
  const [fitSignal, setFitSignal] = useState(0)

  const track = useMemo(() => buildTrack(pieces), [pieces])

  const leadRef = useRef<LeadState>({
    active: false,
    pos: new THREE.Vector3(),
    tangent: new THREE.Vector3(0, 0, 1),
    up: new THREE.Vector3(0, 1, 0),
  })

  useEffect(() => {
    const geo = track.geometry
    return () => geo.dispose()
  }, [track])

  const add = (type: PieceType) => setPieces((p) => [...p, makePiece(type)])
  const undo = () => setPieces((p) => p.slice(0, -1))
  const clear = () => {
    setPieces([])
    setPlaying(false)
    setFollow(false)
  }
  const fit = () => {
    setFollow(false)
    setFitSignal((n) => n + 1)
  }

  const startPoint = track.points[0] ?? new THREE.Vector3()

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">🏁</span>
          <div>
            <h1>Runkids</h1>
            <p>Track Builder</p>
          </div>
        </div>
        <div className="topbar-right">
          <button className="mini" onClick={fit} disabled={pieces.length === 0}>
            ⤢ Fit
          </button>
          <button
            className={`mini ${follow ? 'on' : ''}`}
            onClick={() => setFollow((f) => !f)}
            disabled={track.length === 0}
          >
            🎥 Follow
          </button>
          <span className="counts">{pieces.length} pcs</span>
        </div>
      </header>

      <div className="stage">
        <Canvas shadows camera={{ position: [22, 18, 26], fov: 50 }} dpr={[1, 2]}>
          <color attach="background" args={['#dfeffb']} />
          <fog attach="fog" args={['#dfeffb', 60, 200]} />
          <hemisphereLight args={['#ffffff', '#9db4c0', 0.9]} />
          <directionalLight
            position={[20, 30, 12]}
            intensity={1.5}
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-camera-left={-70}
            shadow-camera-right={70}
            shadow-camera-top={70}
            shadow-camera-bottom={-70}
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
            fadeDistance={160}
          />

          {track.points.length > 1 && (
            <mesh geometry={track.geometry} castShadow receiveShadow>
              <meshStandardMaterial color="#ff7a1a" side={THREE.DoubleSide} flatShading />
            </mesh>
          )}

          <Obstacles segments={track.segments} />

          {track.points.length > 1 && (
            <group position={[startPoint.x, startPoint.y, startPoint.z]}>
              <mesh position={[-1.7, 1.1, 0]} castShadow>
                <boxGeometry args={[0.25, 2.2, 0.25]} />
                <meshStandardMaterial color="#ffffff" />
              </mesh>
              <mesh position={[1.7, 1.1, 0]} castShadow>
                <boxGeometry args={[0.25, 2.2, 0.25]} />
                <meshStandardMaterial color="#ffffff" />
              </mesh>
              <mesh position={[0, 2.3, 0]} castShadow>
                <boxGeometry args={[3.9, 0.4, 0.25]} />
                <meshStandardMaterial color="#e53935" />
              </mesh>
            </group>
          )}

          {track.length > 0 && (
            <Riders track={track} playing={playing} count={5} leadRef={leadRef} />
          )}

          <CameraRig
            center={track.center}
            radius={track.radius}
            follow={follow}
            fitSignal={fitSignal}
            leadRef={leadRef}
          />
          <OrbitControls
            makeDefault
            enabled={!follow}
            enableDamping
            maxPolarAngle={Math.PI / 2.05}
          />
        </Canvas>

        {pieces.length === 0 && (
          <div className="hint-overlay">Tap a piece below to start building</div>
        )}
      </div>

      <div className="toolbar">
        <div className="palette">
          <div className="palette-group">
            <span className="group-title">Track</span>
            <div className="pieces">
              {TRACK_PIECES.map((type) => (
                <button key={type} className={`piece-btn ${type}`} onClick={() => add(type)}>
                  <span className="piece-icon">{PIECE_META[type].icon}</span>
                  <span className="piece-label">{PIECE_META[type].label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="palette-group">
            <span className="group-title">Obstacles</span>
            <div className="pieces">
              {OBSTACLE_PIECES.map((type) => (
                <button
                  key={type}
                  className={`piece-btn obstacle ${type}`}
                  onClick={() => add(type)}
                >
                  <span className="piece-icon">{PIECE_META[type].icon}</span>
                  <span className="piece-label">{PIECE_META[type].label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="actions">
          <button className="action" onClick={undo} disabled={pieces.length === 0}>
            ↶ Undo
          </button>
          <button className="action" onClick={clear} disabled={pieces.length === 0}>
            ✕ Clear
          </button>
          <button
            className={`action play ${playing ? 'on' : ''}`}
            onClick={() => setPlaying((p) => !p)}
            disabled={track.length === 0}
          >
            {playing ? '■ Stop' : '▶ Play'}
          </button>
        </div>
      </div>
    </div>
  )
}
