import { useMemo, useState } from 'react'
import { ANIMAL_PALETTES, AnimalColors } from '../track/Animal'
import { AnimalDesign } from '../studio/model'
import { ALL_PRESETS, PARTICLE_META, ParticleKind, cloneParams } from '../env/model'
import { loadEnvLibrary } from '../env/library'
import AnimalAvatar from '../Avatar'
import {
  BowlConfig,
  BowlPick,
  DIFF_META,
  Difficulty,
  HAZARDS_DEFAULT,
  HAZARD_KINDS,
  HAZARD_META,
  Mode,
  dropOf,
  episodeSecs,
  runFor,
} from './model'
import '../setup.css'
import './bowl.css'

// Setup for an Alpine Strike episode: who is riding, how long the mountain is
// and what the weather is doing on it.

const DEFAULT_NAMES = ['Fox', 'Bear', 'Frog', 'Koala', 'Duck']
/** Four mountains side by side is the most a 16:9 shot holds comfortably. */
const MAX_RIDERS = 4
const MIN_RIDERS = 2

interface Option extends BowlPick {
  key: string
  swatch: string
  design: AnimalDesign | null
}

function colorsOf(d: AnimalDesign): AnimalColors {
  const body = d.blocks.find((b) => b.role === 'body') ?? d.blocks[0]
  const c = body?.color ?? '#e8734a'
  return { body: c, belly: c, ear: c }
}

/** "1m 12s" — the estimated length of the finished video. */
function fmtLen(secs: number): string {
  if (secs < 60) return `${secs}s`
  const m = Math.floor(secs / 60)
  const r = secs % 60
  return r === 0 ? `${m}m` : `${m}m ${r}s`
}

export default function BowlSetup({
  saved,
  onStart,
  onExit,
}: {
  saved: AnimalDesign[]
  /** `record` asks the browser to capture the tab and films the episode. */
  onStart: (config: BowlConfig, record: boolean) => void
  onExit: () => void
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
    options.slice(0, Math.min(3, options.length)).map((o) => o.key),
  )
  // How long the leader's ride should last; the mountain is built to match.
  const [avgRide, setAvgRide] = useState(35)
  const [hazards, setHazards] = useState(HAZARDS_DEFAULT)
  const [difficulty, setDifficulty] = useState<Difficulty>('normal')
  const [rubber, setRubber] = useState(true)
  const [mode, setMode] = useState<Mode>('turns')
  const savedEnvs = useMemo(() => loadEnvLibrary(), [])
  const [envKey, setEnvKey] = useState('preset:winter')
  const [weather, setWeather] = useState<'auto' | ParticleKind>('auto')

  const run = runFor(avgRide, difficulty)
  // What that mountain actually comes out as, so the dial isn't a shot in the
  // dark. The pitch is fixed, so a longer course is a taller one.
  const dropM = dropOf(run)

  const toggle = (key: string) =>
    setSelected((sel) => {
      if (sel.includes(key)) return sel.filter((k) => k !== key)
      if (sel.length >= MAX_RIDERS) return sel
      return [...sel, key]
    })

  const surprise = () => {
    const pool = [...options]
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    setSelected(pool.slice(0, Math.min(3, pool.length)).map((o) => o.key))
  }

  const order = (key: string) => selected.indexOf(key)
  const canPlay = selected.length >= MIN_RIDERS
  const lengthSecs = episodeSecs(avgRide, Math.max(MIN_RIDERS, selected.length), mode)

  const start = (record: boolean) => {
    const byKey = new Map(options.map((o) => [o.key, o]))
    const picks: BowlPick[] = selected
      .map((k) => byKey.get(k))
      .filter((o): o is Option => !!o)
      .map((o) => ({ designId: o.designId, colors: o.colors, name: o.name }))
    const preset = ALL_PRESETS.find((pr) => `preset:${pr.key}` === envKey)
    const custom = savedEnvs.find((d) => d.id === envKey)
    const env = cloneParams(custom?.params ?? preset?.params ?? ALL_PRESETS[0].params)
    if (weather !== 'auto') {
      env.particles = weather
      env.particleDensity =
        weather === 'none' ? 0 : env.particleDensity > 0 ? env.particleDensity : 55
    }
    onStart(
      {
        picks,
        mode,
        avgRide,
        hazards,
        difficulty,
        rubber: mode === 'together' && rubber,
        env,
        envName: custom?.name ?? preset?.label ?? ALL_PRESETS[0].label,
        seed: Math.floor(Math.random() * 100000),
      },
      record,
    )
  }

  return (
    <div className="setup">
      <div className="setup-card">
        <header className="setup-head">
          <span className="setup-logo">🎳</span>
          <div>
            <h1>Alpine Strike</h1>
            <p>Ride the mountain, smash the pins — most knocked down wins!</p>
          </div>
        </header>

        <section className="setup-section">
          <div className="setup-label-row">
            <span className="setup-label">Who's riding?</span>
            <span className="setup-count">
              {selected.length} / {MAX_RIDERS} riders
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
          <div className="bowl-row">
            <button className="link-mini" onClick={surprise}>
              🎲 Surprise me
            </button>
            <button className="link-mini" onClick={() => setSelected([])}>
              ✕ Clear
            </button>
          </div>
          {!canPlay && <p className="setup-hint">Pick at least two riders to race.</p>}
        </section>

        <section className="setup-section">
          <div className="setup-label-row">
            <span className="setup-label">How long is the ride?</span>
          </div>
          <label className="slider-line">
            <span className="slider-name">Average ride</span>
            <input
              type="range"
              min={15}
              max={150}
              step={5}
              value={avgRide}
              onChange={(e) => setAvgRide(parseInt(e.target.value))}
            />
            <span className="slider-out">{fmtLen(avgRide)}</span>
          </label>
          <label className="slider-line">
            <span className="slider-name">Hazards</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={hazards}
              onChange={(e) => setHazards(parseInt(e.target.value))}
            />
            <span className="slider-out">{hazards}%</span>
          </label>
          <p className="setup-note">
            The mountain is built to length to hit that time — about {run} m of
            run and a {dropM} m drop. Every rider gets its own mountain and its
            own rack of ten, rolled fresh.
          </p>
          {/* A legend, not a set of choices — which hazards turn up is the
              difficulty's business, and how many of them is the dial above. */}
          {hazards > 0 && (
            <div className="bowl-legend">
              {HAZARD_KINDS.map((k) => (
                <span key={k} className="bowl-legend-chip">
                  <span>{HAZARD_META[k].icon}</span>
                  {HAZARD_META[k].label}
                </span>
              ))}
            </div>
          )}
        </section>

        <section className="setup-section">
          <div className="setup-label-row">
            <span className="setup-label">How tricky?</span>
          </div>
          <div className="mode-row">
            {(['easy', 'normal', 'wild'] as Difficulty[]).map((d) => (
              <button
                key={d}
                className={`mode-card ${difficulty === d ? 'on' : ''}`}
                onClick={() => setDifficulty(d)}
              >
                <span className="mode-icon">{DIFF_META[d].icon}</span>
                <span className="mode-name">{DIFF_META[d].label}</span>
                <span className="mode-desc">{DIFF_META[d].desc}</span>
              </button>
            ))}
          </div>
          <div className="env-row">
            <button
              className={`env-chip ${mode === 'turns' ? 'on' : ''}`}
              onClick={() => setMode('turns')}
              title="Each animal rides alone; the next drops in when the pins have settled"
            >
              <span>1️⃣</span>
              One at a time
            </button>
            <button
              className={`env-chip ${mode === 'together' ? 'on' : ''}`}
              onClick={() => setMode('together')}
              title="Everyone rides at once, side by side"
            >
              <span>🏁</span>
              All together
            </button>
            {mode === 'together' && (
              <button
                className={`env-chip ${rubber ? 'on' : ''}`}
                onClick={() => setRubber(!rubber)}
                title="Keep the riders close together"
              >
                <span>🧲</span>
                Keep it close
              </button>
            )}
          </div>
          <p className="setup-note">
            Nobody is ever knocked out: hitting something costs speed, and speed
            is what scatters the pins — so a rider that clips every boulder on
            the mountain still gets its roll, it just arrives too slowly to do
            much with it.
            {mode === 'turns'
              ? ' One at a time, the camera rides down with each animal and the next one drops in once the pins have stopped.'
              : rubber
                ? ' With “keep it close” on, whoever is behind rides a little faster, so the whole pack stays in one shot.'
                : ' With “keep it close” off, one clean run can disappear over the horizon.'}
          </p>
        </section>

        <section className="setup-section">
          <div className="setup-label-row">
            <span className="setup-label">Mountain</span>
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
          <div className="env-row">
            <button
              className={`env-chip ${weather === 'auto' ? 'on' : ''}`}
              onClick={() => setWeather('auto')}
            >
              <span>🌈</span>
              Auto weather
            </button>
            {(['none', 'snow', 'petals', 'sprinkles'] as ParticleKind[]).map((k) => (
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

        <button className="setup-go" onClick={() => start(false)} disabled={!canPlay}>
          🎳 Drop in
        </button>

        <div className="video-block">
          <button className="setup-video" onClick={() => start(true)} disabled={!canPlay}>
            🎥 Generate video
          </button>
          <p className="setup-note video-note">
            Films the whole thing hands-free: title card → countdown → the ride
            → the pins going over. About {fmtLen(lengthSecs)} long.
          </p>
        </div>
        <button className="setup-advanced" onClick={onExit}>
          ← Back to the races
        </button>
      </div>
    </div>
  )
}
