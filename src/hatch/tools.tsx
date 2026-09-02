import { ReactNode } from 'react'
import { SfxName } from '../audio'

// The toolbox. Every egg is opened by one of these, picked at random, and each
// one brings its own silhouette, swing and sound so a five-egg episode never
// repeats itself.
//
// Three rigs cover the lot:
//   chop  — hangs from a pivot above the egg and falls on it (mallet, pickaxe…)
//   sweep — held out sideways and swung around horizontally (the bat)
//   punch — shoots straight in from the side on a spring (the glove)
//
// Chop tools are all built to roughly the same length, so one camera framing
// holds the whole arc whichever one is on stage.

export type SwingKind = 'chop' | 'sweep' | 'punch'

export interface ToolDef {
  key: string
  label: string
  /** Shown next to "Egg 2 of 5" while this tool is up. */
  icon: string
  kind: SwingKind
  /** A full swing, and how far into it the blow lands (ms). */
  swingMs: number
  impactMs: number
  /**
   * chop: how far above the egg's base the tool is hinged.
   * sweep / punch: how far to the side of the egg the rig sits.
   */
  reach: number
  /** Resting, wound-up and striking poses — radians for chop/sweep, world units for punch. */
  rest: number
  wind: number
  strike: number
  /** Sound the blow makes. */
  hit: SfxName
  /** Geometry, hanging down -Y (chop/punch reach out along +X). */
  body: ReactNode
}

// Shared cube-art palette, so the tools look like they came from one toybox.
const WOOD = '#c9873f'
const DARK_WOOD = '#8a5a28'
const STEEL = '#8d99a6'
const DARK_STEEL = '#5c6773'
const STONE = '#7b8a95'
const RED = '#e8443a'
const DARK_RED = '#c2352c'
const CREAM = '#fff0d6'

/** The wooden shaft every chop tool hangs from. */
function Handle({ len, color = WOOD }: { len: number; color?: string }) {
  return (
    <>
      <mesh castShadow position={[0, -len / 2, 0]}>
        <boxGeometry args={[0.15, len, 0.15]} />
        <meshStandardMaterial color={color} flatShading />
      </mesh>
      {/* Grip bands at the top, where a hand would be */}
      <mesh position={[0, -0.2, 0]}>
        <boxGeometry args={[0.18, 0.16, 0.18]} />
        <meshStandardMaterial color={DARK_WOOD} flatShading />
      </mesh>
      <mesh position={[0, -0.02, 0]}>
        <boxGeometry args={[0.23, 0.16, 0.23]} />
        <meshStandardMaterial color={DARK_WOOD} flatShading />
      </mesh>
    </>
  )
}

export const TOOLS: ToolDef[] = [
  {
    key: 'mallet',
    label: 'Toy mallet',
    icon: '🔨',
    kind: 'chop',
    swingMs: 760,
    impactMs: 430,
    reach: 2.84,
    rest: -1.2,
    wind: -1.7,
    strike: 0.02,
    hit: 'clank',
    body: (
      <>
        <Handle len={1.0} />
        <mesh castShadow position={[0, -1.15, 0]}>
          <boxGeometry args={[0.78, 0.6, 0.6]} />
          <meshStandardMaterial color={RED} flatShading />
        </mesh>
        {/* Cream stripe, so the swing reads as motion even at speed */}
        <mesh position={[0, -1.15, 0]}>
          <boxGeometry args={[0.22, 0.62, 0.62]} />
          <meshStandardMaterial color={CREAM} flatShading />
        </mesh>
        <mesh castShadow position={[0, -1.44, 0]}>
          <boxGeometry args={[0.66, 0.1, 0.5]} />
          <meshStandardMaterial color={DARK_RED} flatShading />
        </mesh>
      </>
    ),
  },
  {
    key: 'sledge',
    label: 'Sledgehammer',
    icon: '⚒️',
    kind: 'chop',
    // Heavy: a long, laboured wind-up and a slow recovery.
    swingMs: 1020,
    impactMs: 640,
    reach: 2.9,
    rest: -1.25,
    wind: -1.78,
    strike: 0.02,
    hit: 'clank',
    body: (
      <>
        <Handle len={1.15} color={DARK_WOOD} />
        <mesh castShadow position={[0, -1.32, 0]}>
          <boxGeometry args={[1.0, 0.44, 0.44]} />
          <meshStandardMaterial color={STEEL} flatShading />
        </mesh>
        {/* Darker caps on both faces */}
        <mesh castShadow position={[-0.46, -1.32, 0]}>
          <boxGeometry args={[0.12, 0.48, 0.48]} />
          <meshStandardMaterial color={DARK_STEEL} flatShading />
        </mesh>
        <mesh castShadow position={[0.46, -1.32, 0]}>
          <boxGeometry args={[0.12, 0.48, 0.48]} />
          <meshStandardMaterial color={DARK_STEEL} flatShading />
        </mesh>
        <mesh position={[0, -1.5, 0]}>
          <boxGeometry args={[0.9, 0.08, 0.4]} />
          <meshStandardMaterial color={DARK_STEEL} flatShading />
        </mesh>
      </>
    ),
  },
  {
    key: 'pickaxe',
    label: 'Pickaxe',
    icon: '⛏️',
    kind: 'chop',
    swingMs: 720,
    impactMs: 420,
    reach: 2.86,
    rest: -1.3,
    wind: -1.75,
    strike: 0.02,
    hit: 'smash',
    body: (
      <>
        <Handle len={1.15} />
        <mesh castShadow position={[0, -1.26, 0]}>
          <boxGeometry args={[0.86, 0.24, 0.24]} />
          <meshStandardMaterial color={STONE} flatShading />
        </mesh>
        {/* Two points, angled down like a real pick */}
        <mesh castShadow position={[-0.52, -1.36, 0]} rotation={[0, 0, 0.42]}>
          <boxGeometry args={[0.42, 0.2, 0.2]} />
          <meshStandardMaterial color={DARK_STEEL} flatShading />
        </mesh>
        <mesh castShadow position={[0.52, -1.36, 0]} rotation={[0, 0, -0.42]}>
          <boxGeometry args={[0.42, 0.2, 0.2]} />
          <meshStandardMaterial color={DARK_STEEL} flatShading />
        </mesh>
      </>
    ),
  },
  {
    key: 'pan',
    label: 'Frying pan',
    icon: '🍳',
    kind: 'chop',
    // Light and quick — a flat, silly bonk.
    swingMs: 700,
    impactMs: 400,
    reach: 2.8,
    rest: -1.15,
    wind: -1.72,
    strike: 0.02,
    hit: 'clank',
    body: (
      <>
        <mesh castShadow position={[0, -0.55, 0]}>
          <boxGeometry args={[0.13, 1.1, 0.13]} />
          <meshStandardMaterial color="#3a3a3a" flatShading />
        </mesh>
        <mesh position={[0, -0.3, 0]}>
          <boxGeometry args={[0.17, 0.34, 0.17]} />
          <meshStandardMaterial color={DARK_WOOD} flatShading />
        </mesh>
        {/* Pan: a wide, shallow slab that smacks flat onto the shell, with a
            lighter inside so it reads as a pan and not another hammer */}
        <mesh castShadow position={[0, -1.3, 0]}>
          <boxGeometry args={[1.06, 0.16, 1.06]} />
          <meshStandardMaterial color="#2b2b2b" flatShading />
        </mesh>
        <mesh position={[0, -1.2, 0]}>
          <boxGeometry args={[0.84, 0.08, 0.84]} />
          <meshStandardMaterial color="#4a4a4a" flatShading />
        </mesh>
        <mesh castShadow position={[0, -1.42, 0]}>
          <boxGeometry args={[0.86, 0.1, 0.86]} />
          <meshStandardMaterial color="#1f1f1f" flatShading />
        </mesh>
      </>
    ),
  },
  {
    key: 'lollipop',
    label: 'Giant lollipop',
    icon: '🍭',
    kind: 'chop',
    swingMs: 820,
    impactMs: 470,
    reach: 2.88,
    rest: -1.22,
    wind: -1.68,
    strike: 0.02,
    hit: 'boing',
    body: (
      <>
        <mesh castShadow position={[0, -0.44, 0]}>
          <boxGeometry args={[0.11, 0.88, 0.11]} />
          <meshStandardMaterial color="#ffffff" flatShading />
        </mesh>
        {/* Candy: concentric squares, which is how a swirl reads in cubes */}
        <mesh castShadow position={[0, -1.16, 0]}>
          <boxGeometry args={[0.82, 0.82, 0.22]} />
          <meshStandardMaterial color="#ff6f91" flatShading />
        </mesh>
        <mesh position={[0, -1.16, 0.02]}>
          <boxGeometry args={[0.56, 0.56, 0.24]} />
          <meshStandardMaterial color="#ffffff" flatShading />
        </mesh>
        <mesh position={[0, -1.16, 0.04]}>
          <boxGeometry args={[0.3, 0.3, 0.26]} />
          <meshStandardMaterial color="#ff6f91" flatShading />
        </mesh>
      </>
    ),
  },
  {
    key: 'bat',
    label: 'Baseball bat',
    icon: '⚾',
    kind: 'sweep',
    swingMs: 900,
    impactMs: 520,
    reach: 1.85,
    rest: -1.5,
    wind: -2.05,
    strike: 0,
    hit: 'thud',
    // Lies along +X, tip at the far end — the rig sweeps it around Y.
    body: (
      <>
        <mesh castShadow position={[0.09, 0, 0]}>
          <boxGeometry args={[0.18, 0.2, 0.2]} />
          <meshStandardMaterial color={DARK_WOOD} flatShading />
        </mesh>
        <mesh castShadow position={[0.5, 0, 0]}>
          <boxGeometry args={[0.64, 0.14, 0.14]} />
          <meshStandardMaterial color="#e0b070" flatShading />
        </mesh>
        <mesh castShadow position={[0.98, 0, 0]}>
          <boxGeometry args={[0.34, 0.22, 0.22]} />
          <meshStandardMaterial color="#d99a4e" flatShading />
        </mesh>
        <mesh castShadow position={[1.48, 0, 0]}>
          <boxGeometry args={[0.68, 0.32, 0.32]} />
          <meshStandardMaterial color={WOOD} flatShading />
        </mesh>
        <mesh position={[1.79, 0, 0]}>
          <boxGeometry args={[0.08, 0.34, 0.34]} />
          <meshStandardMaterial color={DARK_WOOD} flatShading />
        </mesh>
      </>
    ),
  },
  {
    key: 'glove',
    label: 'Boxing glove',
    icon: '🥊',
    kind: 'punch',
    // Snappy: it coils back and fires. The rig sits far enough out that the
    // glove is clear of the shell at rest and only just bites it on the punch.
    swingMs: 660,
    impactMs: 370,
    reach: 2.3,
    rest: -0.55,
    wind: -0.95,
    strike: 0.35,
    hit: 'boing',
    // Reaches out along +X: spring first, glove at the far end.
    body: (
      <>
        {[0, 1, 2, 3, 4].map((i) => (
          <mesh
            key={i}
            castShadow
            position={[0.12 + i * 0.19, i % 2 === 0 ? 0.07 : -0.07, 0]}
          >
            <boxGeometry args={[0.16, 0.2, 0.2]} />
            <meshStandardMaterial color={STEEL} flatShading />
          </mesh>
        ))}
        <mesh castShadow position={[1.03, 0, 0]}>
          <boxGeometry args={[0.14, 0.5, 0.5]} />
          <meshStandardMaterial color="#ffffff" flatShading />
        </mesh>
        <mesh castShadow position={[1.33, 0, 0]}>
          <boxGeometry args={[0.5, 0.56, 0.56]} />
          <meshStandardMaterial color={RED} flatShading />
        </mesh>
        <mesh castShadow position={[1.22, -0.2, 0.24]}>
          <boxGeometry args={[0.24, 0.24, 0.2]} />
          <meshStandardMaterial color={DARK_RED} flatShading />
        </mesh>
      </>
    ),
  },
]

export const TOOL_BY_KEY = new Map(TOOLS.map((t) => [t.key, t]))

/** Average swing length, for the episode-length estimate on the setup screen. */
export const AVG_SWING_MS = Math.round(
  TOOLS.reduce((sum, t) => sum + t.swingMs, 0) / TOOLS.length,
)

/**
 * Pick a tool for each egg. `forced` pins every egg to one tool; otherwise it's
 * random, never twice in a row — the variety is the point.
 */
export function pickTools(count: number, rand: () => number, forced?: string): ToolDef[] {
  const only = forced ? TOOL_BY_KEY.get(forced) : undefined
  if (only) return Array.from({ length: count }, () => only)
  const out: ToolDef[] = []
  let last = -1
  for (let i = 0; i < count; i++) {
    let n = Math.floor(rand() * TOOLS.length) % TOOLS.length
    if (n === last && TOOLS.length > 1) n = (n + 1 + Math.floor(rand() * (TOOLS.length - 1))) % TOOLS.length
    last = n
    out.push(TOOLS[n])
  }
  return out
}
