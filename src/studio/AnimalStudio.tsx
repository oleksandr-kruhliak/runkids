import { useMemo, useRef, useState } from 'react'
import EditorCanvas from './EditorCanvas'
import {
  AnimalDesign,
  Block,
  Clip,
  CLIPS,
  PALETTE,
  ROLES,
  Role,
  Vec3,
  cloneDesign,
  newBlock,
  starterFox,
  structuredCloneSafe,
} from './model'
import {
  deleteDesign,
  exportDesign,
  importDesignFile,
  loadLibrary,
  upsertDesign,
} from './library'
import './studio.css'

const CLIP_META: Record<Clip, { icon: string; label: string }> = {
  idle: { icon: '🧍', label: 'Idle' },
  walk: { icon: '🚶', label: 'Walk' },
  jump: { icon: '🦘', label: 'Jump' },
}

const AXES: Array<0 | 1 | 2> = [0, 1, 2]
const AXIS_LABEL = ['X', 'Y', 'Z']

export default function AnimalStudio({ onExit }: { onExit: () => void }) {
  const [design, setDesign] = useState<AnimalDesign>(() => starterFox())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [clip, setClip] = useState<Clip>('walk')
  const [playing, setPlaying] = useState(true)
  const [library, setLibrary] = useState<AnimalDesign[]>(() => loadLibrary())
  const [showLibrary, setShowLibrary] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const selected = useMemo(
    () => design.blocks.find((b) => b.id === selectedId) ?? null,
    [design.blocks, selectedId],
  )

  // ---- design mutation helpers (immutable) ----
  const patchDesign = (patch: Partial<AnimalDesign>) => setDesign((d) => ({ ...d, ...patch }))

  const patchBlock = (id: string, patch: Partial<Block>) =>
    setDesign((d) => ({
      ...d,
      blocks: d.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    }))

  const setVec = (id: string, field: 'pos' | 'size' | 'rot', axis: number, value: number) =>
    setDesign((d) => ({
      ...d,
      blocks: d.blocks.map((b) => {
        if (b.id !== id) return b
        const next = [...b[field]] as Vec3
        next[axis] = value
        return { ...b, [field]: next }
      }),
    }))

  const addBlock = () => {
    const b = newBlock(selected ?? undefined)
    setDesign((d) => ({ ...d, blocks: [...d.blocks, b] }))
    setSelectedId(b.id)
  }

  const duplicateBlock = (id: string) => {
    const src = design.blocks.find((b) => b.id === id)
    if (!src) return
    const copy: Block = {
      ...structuredCloneSafe(src),
      id: cryptoId(),
      name: src.name + ' copy',
      pos: [src.pos[0] + 0.3, src.pos[1], src.pos[2]] as Vec3,
    }
    setDesign((d) => ({ ...d, blocks: [...d.blocks, copy] }))
    setSelectedId(copy.id)
  }

  const deleteBlock = (id: string) => {
    setDesign((d) => ({ ...d, blocks: d.blocks.filter((b) => b.id !== id) }))
    if (selectedId === id) setSelectedId(null)
  }

  const setAnim = (c: Clip, key: string, value: number) =>
    setDesign((d) => ({
      ...d,
      anim: { ...d.anim, [c]: { ...d.anim[c], [key]: value } },
    }))

  // ---- library actions ----
  const save = () => setLibrary((lib) => upsertDesign(lib, design))
  const loadDesign = (d: AnimalDesign) => {
    setDesign(structuredCloneSafe(d))
    setSelectedId(null)
    setShowLibrary(false)
  }
  const removeFromLibrary = (id: string) => setLibrary((lib) => deleteDesign(lib, id))
  const startNew = (d: AnimalDesign) => {
    setDesign(d)
    setSelectedId(null)
  }
  const onImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    importDesignFile(file)
      .then((d) => {
        setDesign(d)
        setSelectedId(null)
      })
      .catch((err) => alert(err.message))
      .finally(() => {
        if (fileInput.current) fileInput.current.value = ''
      })
  }

  return (
    <div className="studio">
      <header className="studio-top">
        <button className="mini" onClick={onExit} title="Back to the race builder">
          ← Race
        </button>
        <div className="studio-title">
          <span className="logo">🐾</span>
          <input
            className="name-input"
            value={design.name}
            onChange={(e) => patchDesign({ name: e.target.value })}
            aria-label="Animal name"
          />
        </div>
        <div className="studio-actions">
          <button className="mini" onClick={() => startNew(starterFox())} title="Start from the fox">
            🦊 Fox
          </button>
          <button className="mini" onClick={() => startNew({ ...cloneDesign(design), name: 'New Animal', blocks: [] })} title="Empty canvas">
            ＋ New
          </button>
          <button className="mini on" onClick={save} title="Save to your library">
            💾 Save
          </button>
          <button className="mini" onClick={() => exportDesign(design)} title="Download as JSON">
            ⬇︎
          </button>
          <button className="mini" onClick={() => fileInput.current?.click()} title="Import JSON">
            ⬆︎
          </button>
          <button
            className={`mini ${showLibrary ? 'on' : ''}`}
            onClick={() => setShowLibrary((v) => !v)}
            title="Your saved animals"
          >
            📚 {library.length}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            onChange={onImport}
            style={{ display: 'none' }}
          />
        </div>
      </header>

      <div className="studio-stage">
        <EditorCanvas
          blocks={design.blocks}
          anim={design.anim}
          clip={clip}
          playing={playing}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />

        <div className="anim-bar">
          {CLIPS.map((c) => (
            <button
              key={c}
              className={`clip-tab ${clip === c ? 'active' : ''}`}
              onClick={() => setClip(c)}
            >
              <span>{CLIP_META[c].icon}</span>
              {CLIP_META[c].label}
            </button>
          ))}
          <button
            className={`play-btn ${playing ? 'on' : ''}`}
            onClick={() => setPlaying((p) => !p)}
          >
            {playing ? '⏸ Pause' : '▶ Play'}
          </button>
        </div>

        {design.blocks.length === 0 && (
          <div className="hint-overlay">Add a block below to start building</div>
        )}

        {showLibrary && (
          <div className="lib-panel">
            <div className="lib-head">
              <span>Saved animals</span>
              <button className="sbtn" onClick={() => setShowLibrary(false)}>✕</button>
            </div>
            {library.length === 0 && <p className="lib-empty">Nothing saved yet. Hit 💾 Save.</p>}
            <div className="lib-list">
              {library.map((d) => (
                <div key={d.id} className="lib-row">
                  <button className="lib-load" onClick={() => loadDesign(d)}>
                    <b>{d.name}</b>
                    <span>{d.blocks.length} blocks</span>
                  </button>
                  <button className="sbtn" title="Delete" onClick={() => removeFromLibrary(d.id)}>🗑</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="studio-panel">
        {/* Blocks */}
        <section className="panel-section">
          <div className="section-head">
            <span className="group-title">Blocks · {design.blocks.length}</span>
            <button className="sbtn add" onClick={addBlock}>＋ Add block</button>
          </div>
          <div className="block-list">
            {design.blocks.map((b) => (
              <button
                key={b.id}
                className={`block-row ${b.id === selectedId ? 'active' : ''}`}
                onClick={() => setSelectedId(b.id)}
              >
                <span className="block-swatch" style={{ background: b.color }} />
                <span className="block-name">{b.name}</span>
                <span className="block-role">{ROLES.find((r) => r.role === b.role)?.label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Inspector */}
        {selected && (
          <section className="panel-section inspector">
            <div className="section-head">
              <input
                className="block-name-input"
                value={selected.name}
                onChange={(e) => patchBlock(selected.id, { name: e.target.value })}
                aria-label="Block name"
              />
              <div className="inspect-actions">
                <button className="sbtn" onClick={() => duplicateBlock(selected.id)}>⧉ Copy</button>
                <button className="sbtn danger" onClick={() => deleteBlock(selected.id)}>🗑 Delete</button>
              </div>
            </div>

            <label className="field-label">Role (how it animates)</label>
            <select
              className="role-select"
              value={selected.role}
              onChange={(e) => patchBlock(selected.id, { role: e.target.value as Role })}
            >
              {ROLES.map((r) => (
                <option key={r.role} value={r.role}>
                  {r.label} — {r.hint}
                </option>
              ))}
            </select>

            <VecRow label="Position" field="pos" block={selected} step={0.05} onChange={setVec} />
            <VecRow label="Size" field="size" block={selected} step={0.05} min={0.02} onChange={setVec} />
            <VecRow label="Rotation°" field="rot" block={selected} step={5} onChange={setVec} />

            <label className="field-label">Color</label>
            <div className="swatches">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  className={`swatch ${selected.color.toLowerCase() === c.toLowerCase() ? 'active' : ''}`}
                  style={{ background: c }}
                  onClick={() => patchBlock(selected.id, { color: c })}
                  aria-label={c}
                />
              ))}
              <input
                type="color"
                className="swatch color-pick"
                value={selected.color}
                onChange={(e) => patchBlock(selected.id, { color: e.target.value })}
                aria-label="Custom color"
              />
            </div>
          </section>
        )}

        {/* Animation params for the active clip */}
        <section className="panel-section">
          <span className="group-title">
            {CLIP_META[clip].icon} {CLIP_META[clip].label} animation
          </span>
          <div className="sliders">
            {clip === 'idle' && (
              <>
                <Slider label="Bob height" value={design.anim.idle.bob} min={0} max={0.3} step={0.01} onChange={(v) => setAnim('idle', 'bob', v)} />
                <Slider label="Speed" value={design.anim.idle.speed} min={0.2} max={5} step={0.1} onChange={(v) => setAnim('idle', 'speed', v)} />
              </>
            )}
            {clip === 'walk' && (
              <>
                <Slider label="Leg swing°" value={design.anim.walk.legSwing} min={0} max={80} step={1} onChange={(v) => setAnim('walk', 'legSwing', v)} />
                <Slider label="Body bob" value={design.anim.walk.bodyBob} min={0} max={0.3} step={0.01} onChange={(v) => setAnim('walk', 'bodyBob', v)} />
                <Slider label="Speed" value={design.anim.walk.speed} min={0.5} max={6} step={0.1} onChange={(v) => setAnim('walk', 'speed', v)} />
              </>
            )}
            {clip === 'jump' && (
              <>
                <Slider label="Jump height" value={design.anim.jump.height} min={0.2} max={2.5} step={0.05} onChange={(v) => setAnim('jump', 'height', v)} />
                <Slider label="Leg tuck°" value={design.anim.jump.tuck} min={0} max={70} step={1} onChange={(v) => setAnim('jump', 'tuck', v)} />
                <Slider label="Speed" value={design.anim.jump.speed} min={0.3} max={2.5} step={0.05} onChange={(v) => setAnim('jump', 'speed', v)} />
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

function VecRow({
  label,
  field,
  block,
  step,
  min,
  onChange,
}: {
  label: string
  field: 'pos' | 'size' | 'rot'
  block: Block
  step: number
  min?: number
  onChange: (id: string, field: 'pos' | 'size' | 'rot', axis: number, value: number) => void
}) {
  return (
    <div className="vec-row">
      <span className="field-label vec-label">{label}</span>
      <div className="vec-fields">
        {AXES.map((axis) => (
          <NumField
            key={axis}
            axis={AXIS_LABEL[axis]}
            value={block[field][axis]}
            step={step}
            min={min}
            onChange={(v) => onChange(block.id, field, axis, v)}
          />
        ))}
      </div>
    </div>
  )
}

function NumField({
  axis,
  value,
  step,
  min,
  onChange,
}: {
  axis: string
  value: number
  step: number
  min?: number
  onChange: (v: number) => void
}) {
  const clamp = (v: number) => (min != null ? Math.max(min, v) : v)
  const round = (v: number) => Math.round(v * 1000) / 1000
  return (
    <div className="num-field">
      <span className="num-axis">{axis}</span>
      <button className="num-btn" onClick={() => onChange(round(clamp(value - step)))}>−</button>
      <input
        type="number"
        step={step}
        value={round(value)}
        onChange={(e) => {
          const v = parseFloat(e.target.value)
          if (!isNaN(v)) onChange(clamp(v))
        }}
      />
      <button className="num-btn" onClick={() => onChange(round(clamp(value + step)))}>+</button>
    </div>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}) {
  return (
    <label className="slider-row">
      <span className="slider-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <span className="slider-val">{Math.round(value * 100) / 100}</span>
    </label>
  )
}

function cryptoId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return 'id-' + Math.random().toString(36).slice(2)
  }
}
