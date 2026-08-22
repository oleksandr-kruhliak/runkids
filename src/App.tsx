import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Environment, Grid, Html } from '@react-three/drei'
import Model, { formatFromUrl, type ModelFormat } from './Model'

interface ModelEntry {
  name: string
  url: string
  format: ModelFormat
  /** Object URL created from a dropped/picked file — revoke when replaced. */
  objectUrl?: boolean
}

interface ManifestItem {
  name: string
  file: string
}

const ACCEPTED = '.glb,.gltf,.obj,.stl,.fbx'

function Loading() {
  return (
    <Html center>
      <div className="loading">Loading model…</div>
    </Html>
  )
}

export default function App() {
  const [builtIns, setBuiltIns] = useState<ModelEntry[]>([])
  const [userModels, setUserModels] = useState<ModelEntry[]>([])
  const [selected, setSelected] = useState<ModelEntry | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load the built-in model manifest, if present.
  useEffect(() => {
    fetch('/models/manifest.json')
      .then((r) => (r.ok ? r.json() : []))
      .then((items: ManifestItem[]) => {
        const entries = items
          .map((it) => {
            const url = `/models/${it.file}`
            const format = formatFromUrl(url)
            return format ? { name: it.name, url, format } : null
          })
          .filter(Boolean) as ModelEntry[]
        setBuiltIns(entries)
        if (entries.length > 0) setSelected((cur) => cur ?? entries[0])
      })
      .catch(() => setBuiltIns([]))
  }, [])

  const addFiles = useCallback((files: FileList | File[]) => {
    const next: ModelEntry[] = []
    for (const file of Array.from(files)) {
      const format = formatFromUrl(file.name)
      if (!format) {
        setError(`Unsupported file: ${file.name}. Use ${ACCEPTED}.`)
        continue
      }
      next.push({
        name: file.name,
        url: URL.createObjectURL(file),
        format,
        objectUrl: true,
      })
    }
    if (next.length > 0) {
      setError(null)
      setUserModels((prev) => [...next, ...prev])
      setSelected(next[0])
    }
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files)
    },
    [addFiles],
  )

  const allModels = useMemo(() => [...userModels, ...builtIns], [userModels, builtIns])

  return (
    <div
      className="app"
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <aside className="sidebar">
        <header className="brand">
          <span className="logo">◆</span>
          <div>
            <h1>Runkids</h1>
            <p>3D Model Viewer</p>
          </div>
        </header>

        <button className="upload-btn" onClick={() => fileInputRef.current?.click()}>
          + Open model file
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED}
          multiple
          hidden
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />

        {error && <p className="error">{error}</p>}

        <nav className="model-list">
          {allModels.length === 0 && (
            <p className="empty">
              No models yet. Drag a <code>.glb</code>, <code>.gltf</code>, <code>.obj</code>,{' '}
              <code>.stl</code>, or <code>.fbx</code> file anywhere, or click “Open model file”.
            </p>
          )}
          {userModels.length > 0 && <p className="group-label">Your files</p>}
          {userModels.map((m) => (
            <ModelButton key={m.url} model={m} selected={selected} onSelect={setSelected} />
          ))}
          {builtIns.length > 0 && <p className="group-label">Included</p>}
          {builtIns.map((m) => (
            <ModelButton key={m.url} model={m} selected={selected} onSelect={setSelected} />
          ))}
        </nav>

        <footer className="hints">
          <p>Drag to orbit · scroll to zoom · right-drag to pan</p>
        </footer>
      </aside>

      <main className="stage">
        {dragging && <div className="drop-overlay">Drop model to view</div>}
        <Canvas shadows camera={{ position: [3, 2, 4], fov: 50 }} dpr={[1, 2]}>
          <color attach="background" args={['#12151c']} />
          <ambientLight intensity={0.4} />
          <directionalLight
            position={[5, 8, 5]}
            intensity={1.2}
            castShadow
            shadow-mapSize={[2048, 2048]}
          />
          <Suspense fallback={<Loading />}>
            {selected && (
              <ErrorReset key={selected.url}>
                <Model url={selected.url} format={selected.format} />
                <Environment preset="city" />
              </ErrorReset>
            )}
          </Suspense>
          <Grid
            args={[20, 20]}
            cellColor="#2a2f3a"
            sectionColor="#3a4152"
            fadeDistance={30}
            infiniteGrid
            position={[0, -1.001, 0]}
          />
          <OrbitControls makeDefault enableDamping />
        </Canvas>

        {!selected && (
          <div className="placeholder">
            <div className="placeholder-inner">
              <div className="placeholder-icon">◆</div>
              <p>Select or drop a 3D model to get started</p>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function ModelButton({
  model,
  selected,
  onSelect,
}: {
  model: ModelEntry
  selected: ModelEntry | null
  onSelect: (m: ModelEntry) => void
}) {
  return (
    <button
      className={`model-item ${selected?.url === model.url ? 'active' : ''}`}
      onClick={() => onSelect(model)}
    >
      <span className="badge">{model.format}</span>
      <span className="model-name">{model.name}</span>
    </button>
  )
}

/** Small boundary so a failed load doesn't blank the whole canvas. */
class ErrorReset extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (this.state.failed) {
      return (
        <Html center>
          <div className="loading error-load">Couldn’t load this model.</div>
        </Html>
      )
    }
    return this.props.children
  }
}
