import { useEffect, useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid } from '@react-three/drei'
import * as THREE from 'three'
import { PIECE_ORDER, PIECE_META, Piece, PieceType, makePiece } from './track/pieces'
import { buildTrack } from './track/build'
import Riders from './track/Riders'
import './styles.css'

const DEFAULT_TRACK: PieceType[] = [
  'straight',
  'right',
  'straight',
  'rampUp',
  'rampDown',
  'right',
  'straight',
  'left',
  'straight',
]

export default function App() {
  const [pieces, setPieces] = useState<Piece[]>(() => DEFAULT_TRACK.map(makePiece))
  const [playing, setPlaying] = useState(false)

  const track = useMemo(() => buildTrack(pieces), [pieces])

  // Dispose old geometry when the track changes.
  useEffect(() => {
    const geo = track.geometry
    return () => geo.dispose()
  }, [track])

  const add = (type: PieceType) => setPieces((p) => [...p, makePiece(type)])
  const undo = () => setPieces((p) => p.slice(0, -1))
  const clear = () => {
    setPieces([])
    setPlaying(false)
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
        <div className="counts">{pieces.length} pieces</div>
      </header>

      <div className="stage">
        <Canvas shadows camera={{ position: [14, 12, 18], fov: 50 }} dpr={[1, 2]}>
          <color attach="background" args={['#dfeffb']} />
          <fog attach="fog" args={['#dfeffb', 40, 120]} />
          <hemisphereLight args={['#ffffff', '#9db4c0', 0.9]} />
          <directionalLight
            position={[12, 20, 8]}
            intensity={1.5}
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-camera-left={-40}
            shadow-camera-right={40}
            shadow-camera-top={40}
            shadow-camera-bottom={-40}
          />

          {/* Ground */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
            <planeGeometry args={[400, 400]} />
            <meshStandardMaterial color="#a5d6a7" />
          </mesh>
          <Grid
            args={[400, 400]}
            cellSize={2}
            cellColor="#8bc48f"
            sectionSize={10}
            sectionColor="#6aa870"
            fadeDistance={90}
            position={[0, 0, 0]}
          />

          {/* Track */}
          {track.points.length > 1 && (
            <mesh geometry={track.geometry} castShadow receiveShadow>
              <meshStandardMaterial color="#ff7a1a" side={THREE.DoubleSide} flatShading />
            </mesh>
          )}

          {/* Start / finish gate */}
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

          {track.length > 0 && <Riders track={track} playing={playing} count={4} />}

          <OrbitControls makeDefault enableDamping target={[0, 1, 6]} maxPolarAngle={Math.PI / 2.05} />
        </Canvas>

        {pieces.length === 0 && (
          <div className="hint-overlay">Tap a track piece below to start building</div>
        )}
      </div>

      <div className="toolbar">
        <div className="pieces">
          {PIECE_ORDER.map((type) => (
            <button key={type} className={`piece-btn ${type}`} onClick={() => add(type)}>
              <span className="piece-icon">{PIECE_META[type].icon}</span>
              <span className="piece-label">{PIECE_META[type].label}</span>
            </button>
          ))}
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
