import { useMemo, useState } from 'react'
import { ANIMAL_PALETTES, AnimalColors } from './track/Animal'
import { AnimalDesign } from './studio/model'
import './setup.css'

const DEFAULT_NAMES = ['Fox', 'Bear', 'Frog', 'Koala', 'Duck']
const MAX_RACERS = 8
const MIN_RACERS = 2

export interface Pick {
  designId: string | null
  colors: AnimalColors
  name: string
}
export interface PlayConfig {
  picks: Pick[]
  avgTime: number
  obstaclePct: number
}

interface Option extends Pick {
  key: string
  swatch: string
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
    }))
    const defaults: Option[] = DEFAULT_NAMES.map((name, i) => ({
      key: `default:${i}`,
      designId: null,
      colors: ANIMAL_PALETTES[i],
      name,
      swatch: ANIMAL_PALETTES[i].body,
    }))
    return [...customs, ...defaults]
  }, [saved])

  const [selected, setSelected] = useState<string[]>(() =>
    options.slice(0, Math.min(4, options.length)).map((o) => o.key),
  )
  const [avgTime, setAvgTime] = useState(8)
  const [obstaclePct, setObstaclePct] = useState(40)

  const toggle = (key: string) =>
    setSelected((sel) => {
      if (sel.includes(key)) return sel.filter((k) => k !== key)
      if (sel.length >= MAX_RACERS) return sel
      return [...sel, key]
    })

  const order = (key: string) => selected.indexOf(key)
  const canPlay = selected.length >= MIN_RACERS

  const generate = () => {
    const byKey = new Map(options.map((o) => [o.key, o]))
    const picks: Pick[] = selected
      .map((k) => byKey.get(k))
      .filter((o): o is Option => !!o)
      .map((o) => ({ designId: o.designId, colors: o.colors, name: o.name }))
    onGenerate({ picks, avgTime, obstaclePct })
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
            <span className="setup-count">{selected.length} selected</span>
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
                  <span className="racer-swatch" />
                  <span className="racer-cardname">{o.name}</span>
                  {o.designId === null && <span className="racer-tag">default</span>}
                </button>
              )
            })}
          </div>
          {!canPlay && <p className="setup-hint">Pick at least {MIN_RACERS} racers.</p>}
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
          🎬 Generate &amp; Play
        </button>
        <button className="setup-advanced" onClick={onAdvanced}>
          Advanced track builder →
        </button>
      </div>
    </div>
  )
}
