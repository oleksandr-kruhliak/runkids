import { useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { RIDE_OFFSET, buildTrack, sampleCenter } from '../track/build'
import { PieceType } from '../track/pieces'
import StoneRoad from '../track/StoneRoad'
import GrassField from '../track/GrassField'
import Sky from '../track/Sky'
import Animal, { ANIMAL_PALETTES } from '../track/Animal'
import Particles from './Particles'
import Scenery from './Scenery'
import {
  ALL_PRESETS,
  EnvDesign,
  EnvParams,
  EXTRA_META,
  PARTICLE_META,
  PRESETS,
  ParticleKind,
  SET_META,
  SceneryExtra,
  ScenerySet,
  WORLDS,
  cloneParams,
  newEnvDesign,
} from './model'
import { deleteEnv, loadEnvLibrary, upsertEnv } from './library'
import '../studio/studio.css'

// A small looping course so the preview shows road, grass, and field exactly
// as the race renders them.
const PREVIEW_SHAPE: PieceType[] = [
  'straight', 'straight', 'left', 'left',
  'straight', 'straight', 'left', 'left',
]
const PREVIEW_LANES: PieceType[][] = [[], [], []]

const KINDS: ParticleKind[] = ['none', 'snow', 'leaves', 'petals', 'rain']
const EXTRAS: SceneryExtra[] = ['none', 'snowman', 'pumpkin', 'flowers']
const SETS: ScenerySet[] = ['classic', 'forest', 'savanna', 'snowy', 'city']

/** Multiply a hex colour towards dark (for grid lines derived from ground). */
export function shade(hex: string, k: number): string {
  return `#${new THREE.Color(hex).multiplyScalar(k).getHexString()}`
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="env-color-row">
      <span className="env-color-name">{label}</span>
      <span className="env-color-val">{value}</span>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

function SliderRow({
  label,
  min,
  max,
  step,
  value,
  format,
  onChange,
}: {
  label: string
  min: number
  max: number
  step: number
  value: number
  format: (v: number) => string
  onChange: (v: number) => void
}) {
  return (
    <label className="env-slider-row">
      <span className="env-color-name">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <span className="env-slider-out">{format(value)}</span>
    </label>
  )
}

export default function EnvStudio({
  onExit,
  onAnimals,
}: {
  onExit: () => void
  onAnimals: () => void
}) {
  const [design, setDesign] = useState<EnvDesign>(() => newEnvDesign())
  const [library, setLibrary] = useState<EnvDesign[]>(() => loadEnvLibrary())
  const [showLibrary, setShowLibrary] = useState(false)

  const p = design.params
  const patch = (part: Partial<EnvParams>) =>
    setDesign((d) => ({ ...d, params: { ...d.params, ...part } }))
  const patchSky = (part: Partial<EnvParams['sky']>) =>
    setDesign((d) => ({ ...d, params: { ...d.params, sky: { ...d.params.sky, ...part } } }))

  const applyPreset = (key: string) => {
    const preset = ALL_PRESETS.find((pr) => pr.key === key)
    if (preset) patch(cloneParams(preset.params))
  }

  const save = () => setLibrary((lib) => upsertEnv(lib, design))
  const loadDesign = (d: EnvDesign) => {
    setDesign({ ...d, params: cloneParams(d.params) })
    setShowLibrary(false)
  }
  const removeFromLibrary = (id: string) => setLibrary((lib) => deleteEnv(lib, id))
  const startNew = () => setDesign(newEnvDesign())

  const track = useMemo(() => buildTrack(PREVIEW_SHAPE, PREVIEW_LANES), [])

  // A couple of animals standing on the road, for colour/scale reference.
  const stand = useMemo(() => {
    return [3, 9].map((d, i) => {
      const f = sampleCenter(track.center, d)
      const x = new THREE.Vector3().crossVectors(f.up, f.tangent).normalize()
      const y = new THREE.Vector3().crossVectors(f.tangent, x).normalize()
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, f.tangent))
      return {
        key: i,
        pos: f.pos.clone().addScaledVector(f.up, RIDE_OFFSET),
        quaternion: q,
        colors: ANIMAL_PALETTES[i],
      }
    })
  }, [track])

  return (
    <div className="studio">
      <header className="studio-top">
        <button className="mini" onClick={onExit} title="Back to the race builder">
          ← Race
        </button>
        <button className="mini" onClick={onAnimals} title="Animal studio">
          🐾 Animals
        </button>
        <div className="studio-title">
          <span className="logo">🌦</span>
          <input
            className="name-input"
            value={design.name}
            onChange={(e) => setDesign((d) => ({ ...d, name: e.target.value }))}
            aria-label="Environment name"
          />
        </div>
        <div className="studio-actions">
          <button className="mini" onClick={startNew} title="New environment">
            ＋ New
          </button>
          <button className="mini on" onClick={save} title="Save to your library">
            💾 Save
          </button>
          <button
            className={`mini ${showLibrary ? 'on' : ''}`}
            onClick={() => setShowLibrary((v) => !v)}
            title="Your saved environments"
          >
            📚 {library.length}
          </button>
        </div>
      </header>

      <div className="studio-stage">
        <Canvas shadows camera={{ position: [22, 14, 26], fov: 50 }} dpr={[1, 2]}>
          <color attach="background" args={[p.sky.horizon]} />
          <fog attach="fog" args={[p.sky.horizon, 70, 220]} />
          <Sky zenith={p.sky.zenith} mid={p.sky.mid} horizon={p.sky.horizon} clouds={p.clouds} />
          <hemisphereLight args={['#ffffff', '#9db4c0', 0.9]} />
          <directionalLight
            position={[24, 34, 14]}
            intensity={p.sun}
            castShadow
            shadow-mapSize={[1024, 1024]}
            shadow-camera-left={-60}
            shadow-camera-right={60}
            shadow-camera-top={60}
            shadow-camera-bottom={-60}
          />
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
            <planeGeometry args={[1000, 1000]} />
            <meshStandardMaterial color={p.ground} />
          </mesh>
          <GrassField track={track} color={p.grass} />
          <Scenery track={track} env={p} />
          <StoneRoad track={track} />
          {stand.map((a) => (
            <group key={a.key} position={a.pos} quaternion={a.quaternion} scale={0.82}>
              <Animal colors={a.colors} />
            </group>
          ))}
          <Particles
            kind={p.particles}
            density={p.particleDensity}
            center={track.boundsCenter}
            radius={track.radius + 14}
          />
          <OrbitControls
            makeDefault
            enableDamping
            target={[track.boundsCenter.x, 0, track.boundsCenter.z]}
            maxPolarAngle={Math.PI / 2.05}
          />
        </Canvas>

        {showLibrary && (
          <div className="lib-panel">
            <div className="lib-head">
              <span>Saved environments</span>
              <button className="sbtn" onClick={() => setShowLibrary(false)}>✕</button>
            </div>
            {library.length === 0 && <p className="lib-empty">Nothing saved yet. Hit 💾 Save.</p>}
            <div className="lib-list">
              {library.map((d) => (
                <div key={d.id} className="lib-row">
                  <button className="lib-load" onClick={() => loadDesign(d)}>
                    <b>{d.name}</b>
                    <span>
                      {PARTICLE_META[d.params.particles].icon} {PARTICLE_META[d.params.particles].label}
                    </span>
                  </button>
                  <button className="sbtn" title="Delete" onClick={() => removeFromLibrary(d.id)}>🗑</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="studio-panel">
        <section className="panel-section">
          <div className="section-head">
            <span className="group-title">Generate a world</span>
          </div>
          <div className="env-presets">
            {WORLDS.map((pr) => (
              <button key={pr.key} className="env-preset world" onClick={() => applyPreset(pr.key)}>
                <span>{pr.icon}</span>
                {pr.label}
              </button>
            ))}
          </div>
          <div className="section-head" style={{ marginTop: 10 }}>
            <span className="group-title">Or start from a season</span>
          </div>
          <div className="env-presets">
            {PRESETS.map((pr) => (
              <button key={pr.key} className="env-preset" onClick={() => applyPreset(pr.key)}>
                <span>{pr.icon}</span>
                {pr.label}
              </button>
            ))}
          </div>
        </section>

        <section className="panel-section">
          <div className="section-head">
            <span className="group-title">Sky &amp; light</span>
          </div>
          <ColorRow label="Sky top" value={p.sky.zenith} onChange={(v) => patchSky({ zenith: v })} />
          <ColorRow label="Sky middle" value={p.sky.mid} onChange={(v) => patchSky({ mid: v })} />
          <ColorRow label="Horizon" value={p.sky.horizon} onChange={(v) => patchSky({ horizon: v })} />
          <SliderRow
            label="Sunlight"
            min={0.4}
            max={2.2}
            step={0.05}
            value={p.sun}
            format={(v) => v.toFixed(2)}
            onChange={(v) => patch({ sun: v })}
          />
          <SliderRow
            label="Clouds"
            min={0}
            max={20}
            step={1}
            value={p.clouds}
            format={(v) => `${v}`}
            onChange={(v) => patch({ clouds: Math.round(v) })}
          />
        </section>

        <section className="panel-section">
          <div className="section-head">
            <span className="group-title">Ground</span>
          </div>
          <ColorRow label="Ground" value={p.ground} onChange={(v) => patch({ ground: v })} />
          <ColorRow label="Grass" value={p.grass} onChange={(v) => patch({ grass: v })} />
        </section>

        <section className="panel-section">
          <div className="section-head">
            <span className="group-title">Scenery (trees, rocks &amp; friends)</span>
          </div>
          <div className="env-presets" style={{ marginBottom: 8 }}>
            {SETS.map((k) => (
              <button
                key={k}
                className={`env-preset ${p.scenery.set === k ? 'on' : ''}`}
                onClick={() => patch({ scenery: { ...p.scenery, set: k } })}
              >
                <span>{SET_META[k].icon}</span>
                {SET_META[k].label}
              </button>
            ))}
          </div>
          <SliderRow
            label="Amount"
            min={0}
            max={100}
            step={5}
            value={p.scenery.density}
            format={(v) => `${v}%`}
            onChange={(v) =>
              patch({ scenery: { ...p.scenery, density: Math.round(v) } })
            }
          />
          <ColorRow
            label="Tree leaves"
            value={p.scenery.tree}
            onChange={(v) => patch({ scenery: { ...p.scenery, tree: v } })}
          />
          <div className="env-presets">
            {EXTRAS.map((x) => (
              <button
                key={x}
                className={`env-preset ${p.scenery.extra === x ? 'on' : ''}`}
                onClick={() => patch({ scenery: { ...p.scenery, extra: x } })}
              >
                <span>{EXTRA_META[x].icon}</span>
                {EXTRA_META[x].label}
              </button>
            ))}
          </div>
        </section>

        <section className="panel-section">
          <div className="section-head">
            <span className="group-title">Falling from the sky</span>
          </div>
          <div className="env-presets">
            {KINDS.map((k) => (
              <button
                key={k}
                className={`env-preset ${p.particles === k ? 'on' : ''}`}
                onClick={() => patch({ particles: k, particleDensity: p.particleDensity || (k !== 'none' ? 50 : 0) })}
              >
                <span>{PARTICLE_META[k].icon}</span>
                {PARTICLE_META[k].label}
              </button>
            ))}
          </div>
          {p.particles !== 'none' && (
            <SliderRow
              label="Amount"
              min={5}
              max={100}
              step={5}
              value={p.particleDensity}
              format={(v) => `${v}%`}
              onChange={(v) => patch({ particleDensity: Math.round(v) })}
            />
          )}
        </section>
      </div>
    </div>
  )
}
