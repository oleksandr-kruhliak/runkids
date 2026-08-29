import { useMemo, useState } from 'react'
import { ANIMAL_PALETTES, AnimalColors } from './track/Animal'
import { AnimalDesign } from './studio/model'
import { ALL_PRESETS, EnvParams, PARTICLE_META, ParticleKind, cloneParams } from './env/model'
import { loadEnvLibrary } from './env/library'
import { MIN_ENTRANTS } from './tournament'
import AnimalAvatar from './Avatar'
import './setup.css'

const DEFAULT_NAMES = ['Fox', 'Bear', 'Frog', 'Koala', 'Duck']
const MAX_RACERS = 8
// A tournament only runs one heat at a time, so the field can be much bigger
// than the lane limit — more entrants just means more heats.
const MAX_ENTRANTS = 16
const MIN_RACERS = 2

export interface Pick {
  designId: string | null
  colors: AnimalColors
  name: string
}
export type RaceMode = 'together' | 'solo' | 'tournament'

export interface PlayConfig {
  picks: Pick[]
  avgTime: number
  obstaclePct: number
  raceMode: RaceMode
  env: EnvParams
  /** Tournament only: racers per heat and how many advance. */
  heatSize: number
  advance: number
}

interface Option extends Pick {
  key: string
  swatch: string
  design: AnimalDesign | null
}

function colorsOf(d: AnimalDesign): AnimalColors {
  const body = d.blocks.find((b) => b.role === 'body') ?? d.blocks[0]
  const c = body?.color ?? '#e8734a'
  return { body: c, belly: c, ear: c }
}

export default function PlaySetup({
  saved,
  onGenerate,
  onAdvanced,
}: {
  saved: AnimalDesign[]
  onGenerate: (config: PlayConfig) => void
  onAdvanced: () => void
}) {
  const options = useMemo<Option[]>(() => {
    const customs: Option[] = saved.map((d) => ({
      key: d.id,
      designId: d.id,
      colors: colorsOf(d),
      name: d.name,
      swatch: colorsOf(d).body,
      design: d,
    }))
    const defaults: Option[] = DEFAULT_NAMES.map((name, i) => ({
      key: `default:${i}`,
      designId: null,
      colors: ANIMAL_PALETTES[i],
      name,
      swatch: ANIMAL_PALETTES[i].body,
      design: null,
    }))
    return [...customs, ...defaults]
  }, [saved])

  const [selected, setSelected] = useState<string[]>(() =>
    options.slice(0, Math.min(4, options.length)).map((o) => o.key),
  )
  const [avgTime, setAvgTime] = useState(8)
  const [obstaclePct, setObstaclePct] = useState(40)
  const [raceMode, setRaceMode] = useState<RaceMode>('together')
  const [heatSize, setHeatSize] = useState(3)
  const [advance, setAdvance] = useState(1)
  const pickMode = (m: RaceMode) => {
    setRaceMode(m)
    // Leaving a tournament: drop back to the lane limit.
    if (m !== 'tournament') setSelected((sel) => sel.slice(0, MAX_RACERS))
  }
  // Environment: built-in seasons plus anything saved in the Env Studio.
  const savedEnvs = useMemo(() => loadEnvLibrary(), [])
  const [envKey, setEnvKey] = useState('preset:summer')
  // Weather: 'auto' keeps the world's own sky, 'random' rolls one at generate.
  const [weather, setWeather] = useState<'auto' | 'random' | ParticleKind>('auto')

  const maxPick = raceMode === 'tournament' ? MAX_ENTRANTS : MAX_RACERS
  const toggle = (key: string) =>
    setSelected((sel) => {
      if (sel.includes(key)) return sel.filter((k) => k !== key)
      if (sel.length >= maxPick) return sel
      return [...sel, key]
    })

  const order = (key: string) => selected.indexOf(key)
  const minNeeded = raceMode === 'tournament' ? MIN_ENTRANTS : MIN_RACERS
  const canPlay = selected.length >= minNeeded
  // How the field splits up, previewed live under the tournament controls.
  const heatPreview = useMemo(() => {
    if (raceMode !== 'tournament' || selected.length < MIN_ENTRANTS) return null
    const heats = Math.max(2, Math.ceil(selected.length / heatSize))
    const base = Math.floor(selected.length / heats)
    const extra = selected.length % heats
    const sizes = Array.from({ length: heats }, (_, i) => base + (i < extra ? 1 : 0))
    const adv = Math.min(advance, heatSize - 1)
    return { heats, sizes, finalists: Math.min(8, heats * adv) }
  }, [raceMode, selected.length, heatSize, advance])

  const generate = () => {
    const byKey = new Map(options.map((o) => [o.key, o]))
    const picks: Pick[] = selected
      .map((k) => byKey.get(k))
      .filter((o): o is Option => !!o)
      .map((o) => ({ designId: o.designId, colors: o.colors, name: o.name }))
    const preset = ALL_PRESETS.find((pr) => `preset:${pr.key}` === envKey)
    const saved = savedEnvs.find((d) => d.id === envKey)
    const env = cloneParams(saved?.params ?? preset?.params ?? ALL_PRESETS[0].params)
    // Apply the weather choice over the world's default.
    if (weather === 'random') {
      const options: ParticleKind[] = ['none', 'snow', 'rain', 'storm', 'leaves', 'petals', 'sprinkles']
      env.particles = options[Math.floor(Math.random() * options.length)]
      env.particleDensity = env.particles === 'none' ? 0 : 40 + Math.floor(Math.random() * 35)
    } else if (weather !== 'auto') {
      env.particles = weather
      env.particleDensity = weather === 'none' ? 0 : env.particleDensity > 0 ? env.particleDensity : 55
    }
    onGenerate({ picks, avgTime, obstaclePct, raceMode, env, heatSize, advance })
  }

  return (
    <div className="setup">
      <div className="setup-card">
        <header className="setup-head">
          <span className="setup-logo">🏁</span>
          <div>
            <h1>Runkids Race</h1>
            <p>Pick your racers and go!</p>
          </div>
        </header>

        <section className="setup-section">
          <div className="setup-label-row">
            <span className="setup-label">Racers</span>
            <span className="setup-count">
              {selected.length} / {maxPick} selected
            </span>
          </div>
          <div className="racer-grid">
            {options.map((o) => {
              const idx = order(o.key)
              const on = idx >= 0
              return (
                <button
                  key={o.key}
                  className={`racer-card ${on ? 'on' : ''}`}
                  style={{ ['--c' as string]: o.swatch }}
                  onClick={() => toggle(o.key)}
                >
                  {on && <span className="racer-order">{idx + 1}</span>}
                  <AnimalAvatar design={o.design} colors={o.colors} size={46} />
                  <span className="racer-cardname">{o.name}</span>
                  {o.designId === null && <span className="racer-tag">default</span>}
                </button>
              )
            })}
          </div>
          {!canPlay && (
            <p className="setup-hint">
              Pick at least {minNeeded} racers{raceMode === 'tournament' ? ' for a tournament' : ''}.
            </p>
          )}
        </section>

        <section className="setup-section">
          <div className="setup-label-row">
            <span className="setup-label">Race style</span>
          </div>
          <div className="mode-row">
            <button
              className={`mode-card ${raceMode === 'together' ? 'on' : ''}`}
              onClick={() => pickMode('together')}
            >
              <span className="mode-icon">🏆</span>
              <span className="mode-name">Grand Prix</span>
              <span className="mode-desc">Everyone races at once</span>
            </button>
            <button
              className={`mode-card ${raceMode === 'solo' ? 'on' : ''}`}
              onClick={() => pickMode('solo')}
            >
              <span className="mode-icon">⏱</span>
              <span className="mode-name">Time Trial</span>
              <span className="mode-desc">One racer at a time</span>
            </button>
            <button
              className={`mode-card ${raceMode === 'tournament' ? 'on' : ''}`}
              onClick={() => pickMode('tournament')}
            >
              <span className="mode-icon">🏆</span>
              <span className="mode-name">Tournament</span>
              <span className="mode-desc">Heats, then a final</span>
            </button>
          </div>

          {raceMode === 'tournament' && (
            <div className="tourney-opts">
              <label className="slider-line">
                <span className="slider-name">Racers per heat</span>
                <input
                  type="range"
                  min={2}
                  max={4}
                  step={1}
                  value={heatSize}
                  onChange={(e) => {
                    const v = parseInt(e.target.value)
                    setHeatSize(v)
                    setAdvance((a) => Math.min(a, v - 1))
                  }}
                />
                <span className="slider-out">{heatSize}</span>
              </label>
              <label className="slider-line">
                <span className="slider-name">Advance per heat</span>
                <input
                  type="range"
                  min={1}
                  max={Math.max(1, heatSize - 1)}
                  step={1}
                  value={advance}
                  onChange={(e) => setAdvance(parseInt(e.target.value))}
                />
                <span className="slider-out">{advance}</span>
              </label>
              {heatPreview && (
                <p className="setup-note">
                  {heatPreview.heats} heats ({heatPreview.sizes.join(' + ')}) →{' '}
                  <b>{heatPreview.finalists}-racer final</b> on a longer track at sunset.
                </p>
              )}
            </div>
          )}
        </section>

        <section className="setup-section">
          <div className="setup-label-row">
            <span className="setup-label">Falling from the sky</span>
          </div>
          <div className="env-row">
            <button
              className={`env-chip ${weather === 'auto' ? 'on' : ''}`}
              onClick={() => setWeather('auto')}
              title="Whatever the chosen world brings"
            >
              <span>🌈</span>
              Auto
            </button>
            <button
              className={`env-chip ${weather === 'random' ? 'on' : ''}`}
              onClick={() => setWeather('random')}
              title="Roll a surprise on every generate"
            >
              <span>🎲</span>
              Random
            </button>
            {(['none', 'snow', 'rain', 'storm', 'leaves', 'petals', 'embers', 'sprinkles'] as ParticleKind[]).map((k) => (
              <button
                key={k}
                className={`env-chip ${weather === k ? 'on' : ''}`}
                onClick={() => setWeather(k)}
              >
                <span>{PARTICLE_META[k].icon}</span>
                {PARTICLE_META[k].label}
              </button>
            ))}
          </div>
        </section>

        <section className="setup-section">
          <div className="setup-label-row">
            <span className="setup-label">Environment</span>
            <button className="link-mini" onClick={() => (window.location.hash = '#/env')}>
              🌦 Environment builder →
            </button>
          </div>
          <div className="env-row">
            {ALL_PRESETS.map((pr) => (
              <button
                key={pr.key}
                className={`env-chip ${envKey === `preset:${pr.key}` ? 'on' : ''}`}
                onClick={() => setEnvKey(`preset:${pr.key}`)}
              >
                <span>{pr.icon}</span>
                {pr.label}
              </button>
            ))}
            {savedEnvs.map((d) => (
              <button
                key={d.id}
                className={`env-chip custom ${envKey === d.id ? 'on' : ''}`}
                onClick={() => setEnvKey(d.id)}
              >
                <span>🎨</span>
                {d.name}
              </button>
            ))}
          </div>
        </section>

        <section className="setup-section">
          <label className="slider-line">
            <span className="slider-name">Average lap</span>
            <input
              type="range"
              min={3}
              max={60}
              step={1}
              value={avgTime}
              onChange={(e) => setAvgTime(parseInt(e.target.value))}
            />
            <span className="slider-out">{avgTime}s</span>
          </label>
          <label className="slider-line">
            <span className="slider-name">Obstacles</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={obstaclePct}
              onChange={(e) => setObstaclePct(parseInt(e.target.value))}
            />
            <span className="slider-out">{obstaclePct}%</span>
          </label>
          <p className="setup-note">Each racer gets its own random obstacles.</p>
        </section>

        <button className="setup-go" onClick={generate} disabled={!canPlay}>
          {raceMode === 'tournament' ? '🏆 Start the Cup' : '🎬 Generate & Play'}
        </button>
        <button className="setup-advanced" onClick={onAdvanced}>
          Advanced track builder →
        </button>
      </div>
    </div>
  )
}
