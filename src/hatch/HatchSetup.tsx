import { useMemo, useState } from 'react'
import { ANIMAL_PALETTES, AnimalColors } from '../track/Animal'
import { AnimalDesign } from '../studio/model'
import { ALL_PRESETS, PARTICLE_META, ParticleKind, cloneParams } from '../env/model'
import { loadEnvLibrary } from '../env/library'
import AnimalAvatar from '../Avatar'
import { EggPick, HatchConfig, MIN_HITS, episodeSecs } from './model'
import { TOOLS } from './tools'
import { PAINTERS } from './painters'
import '../setup.css'
import './hatch.css'

// Setup for an Egg Hatch episode: which animals are hiding in the eggs, how
// many blows each shell takes, and what the meadow looks like.

const DEFAULT_NAMES = ['Fox', 'Bear', 'Frog', 'Koala', 'Duck']
const MAX_EGGS = 8
const MIN_EGGS = 1

interface Option extends EggPick {
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

export default function HatchSetup({
  saved,
  onStart,
  onExit,
}: {
  saved: AnimalDesign[]
  /** `record` asks the browser to capture the tab and films the episode. */
  onStart: (config: HatchConfig, record: boolean) => void
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
    options.slice(0, Math.min(4, options.length)).map((o) => o.key),
  )
  // The toughest an egg can get; every egg rolls its own count from MIN_HITS
  // up to this, so no two eggs give up at the same moment.
  const [maxHits, setMaxHits] = useState(6)
  const [tool, setTool] = useState<string>('random')
  const [painter, setPainter] = useState<string>('random')
  const [auto, setAuto] = useState(true)
  const savedEnvs = useMemo(() => loadEnvLibrary(), [])
  const [envKey, setEnvKey] = useState('preset:summer')
  const [weather, setWeather] = useState<'auto' | ParticleKind>('auto')

  const toggle = (key: string) =>
    setSelected((sel) => {
      if (sel.includes(key)) return sel.filter((k) => k !== key)
      if (sel.length >= MAX_EGGS) return sel
      return [...sel, key]
    })

  const surprise = () => {
    const pool = [...options]
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    setSelected(pool.slice(0, Math.min(4, pool.length)).map((o) => o.key))
  }

  const order = (key: string) => selected.indexOf(key)
  const canPlay = selected.length >= MIN_EGGS
  const lengthSecs = episodeSecs(Math.max(1, selected.length), maxHits)

  const start = (record: boolean) => {
    const byKey = new Map(options.map((o) => [o.key, o]))
    const picks: EggPick[] = selected
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
        maxHits,
        tool: tool === 'random' ? undefined : tool,
        painter: painter === 'random' ? undefined : painter,
        // A filmed episode always runs itself; tapping is for playing along.
        auto: record ? true : auto,
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
          <span className="setup-logo">🥚</span>
          <div>
            <h1>Surprise Eggs</h1>
            <p>Smash the eggs, meet the animals!</p>
          </div>
        </header>

        <section className="setup-section">
          <div className="setup-label-row">
            <span className="setup-label">Who's hiding inside?</span>
            <span className="setup-count">
              {selected.length} / {MAX_EGGS} eggs
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
          <div className="hatch-row">
            <button className="link-mini" onClick={surprise}>
              🎲 Surprise me
            </button>
            <button className="link-mini" onClick={() => setSelected([])}>
              ✕ Clear
            </button>
          </div>
          {!canPlay && <p className="setup-hint">Pick at least one animal to hide in an egg.</p>}
        </section>

        <section className="setup-section">
          <div className="setup-label-row">
            <span className="setup-label">How it plays</span>
          </div>
          <div className="mode-row">
            <button className={`mode-card ${auto ? 'on' : ''}`} onClick={() => setAuto(true)}>
              <span className="mode-icon">🎬</span>
              <span className="mode-name">Auto smash</span>
              <span className="mode-desc">The tools swing by themselves</span>
            </button>
            <button className={`mode-card ${!auto ? 'on' : ''}`} onClick={() => setAuto(false)}>
              <span className="mode-icon">🔨</span>
              <span className="mode-name">Tap to smash</span>
              <span className="mode-desc">Tap or press space to swing</span>
            </button>
          </div>
          <label className="slider-line">
            <span className="slider-name">Toughest egg</span>
            <input
              type="range"
              min={MIN_HITS}
              max={9}
              step={1}
              value={maxHits}
              onChange={(e) => setMaxHits(parseInt(e.target.value))}
            />
            <span className="slider-out">{maxHits}</span>
          </label>
          <p className="setup-note">
            Every egg rolls its own number of hits — {MIN_HITS} to {maxHits} — so
            nobody can guess which one is about to go. Cracks spread further down
            the shell with each one.
          </p>
        </section>

        <section className="setup-section">
          <div className="setup-label-row">
            <span className="setup-label">How they get their colours</span>
          </div>
          <div className="env-row">
            <button
              className={`env-chip ${painter === 'random' ? 'on' : ''}`}
              onClick={() => setPainter('random')}
              title="A different painter every episode"
            >
              <span>🎲</span>
              Surprise painter
            </button>
            {PAINTERS.map((p) => (
              <button
                key={p.key}
                className={`env-chip ${painter === p.key ? 'on' : ''}`}
                onClick={() => setPainter(p.key)}
              >
                <span>{p.icon}</span>
                {p.label}
              </button>
            ))}
          </div>
          <p className="setup-note">
            Every egg starts plain white — the painter works down the row giving
            each one its colour before anything gets smashed.
          </p>
        </section>

        <section className="setup-section">
          <div className="setup-label-row">
            <span className="setup-label">What smashes them</span>
          </div>
          <div className="env-row">
            <button
              className={`env-chip ${tool === 'random' ? 'on' : ''}`}
              onClick={() => setTool('random')}
              title="A different tool for every egg"
            >
              <span>🎲</span>
              Surprise tool
            </button>
            {TOOLS.map((t) => (
              <button
                key={t.key}
                className={`env-chip ${tool === t.key ? 'on' : ''}`}
                onClick={() => setTool(t.key)}
              >
                <span>{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>
        </section>

        <section className="setup-section">
          <div className="setup-label-row">
            <span className="setup-label">Meadow</span>
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
          🔨 Start smashing
        </button>

        <div className="video-block">
          <button className="setup-video" onClick={() => start(true)} disabled={!canPlay}>
            🎥 Generate video
          </button>
          <p className="setup-note video-note">
            Films the whole thing hands-free: title card → egg by egg → the
            line-up at the end. About {fmtLen(lengthSecs)} long.
          </p>
        </div>
        <button className="setup-advanced" onClick={onExit}>
          ← Back to the races
        </button>
      </div>
    </div>
  )
}
