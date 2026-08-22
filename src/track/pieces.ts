export type PieceType =
  | 'straight'
  | 'left'
  | 'right'
  | 'rampUp'
  | 'rampDown'
  | 'loop'
  | 'gap'
  | 'water'
  | 'mud'
  | 'boost'
  | 'trampoline'
  | 'stopper'
  | 'spinner'
  | 'crates'

export type PieceGroup = 'shape' | 'obstacle'

// Shape pieces build the shared path (all lanes follow it).
export const SHAPE_PIECES: PieceType[] = ['straight', 'left', 'right', 'rampUp', 'rampDown', 'loop']
// Obstacle pieces are placed per-lane.
export const OBSTACLE_PIECES: PieceType[] = [
  'gap',
  'water',
  'mud',
  'boost',
  'trampoline',
  'stopper',
  'spinner',
  'crates',
]

export const PIECE_META: Record<
  PieceType,
  { label: string; icon: string; group: PieceGroup }
> = {
  straight: { label: 'Straight', icon: '▮', group: 'shape' },
  left: { label: 'Turn', icon: '◀', group: 'shape' },
  right: { label: 'Turn', icon: '▶', group: 'shape' },
  rampUp: { label: 'Ramp', icon: '▲', group: 'shape' },
  rampDown: { label: 'Ramp', icon: '▼', group: 'shape' },
  loop: { label: 'Loop', icon: '⭕', group: 'shape' },
  gap: { label: 'Jump', icon: '⤴', group: 'obstacle' },
  water: { label: 'Water', icon: '💧', group: 'obstacle' },
  mud: { label: 'Mud', icon: '🟤', group: 'obstacle' },
  boost: { label: 'Boost', icon: '⚡', group: 'obstacle' },
  trampoline: { label: 'Bounce', icon: '⇈', group: 'obstacle' },
  stopper: { label: 'Stopper', icon: '🛑', group: 'obstacle' },
  spinner: { label: 'Spinner', icon: '🌀', group: 'obstacle' },
  crates: { label: 'Crates', icon: '📦', group: 'obstacle' },
}

// Shape geometry (world units).
export const STRAIGHT_LEN = 7
export const TURN_RADIUS = 13
export const TURN_ANGLE = Math.PI / 2
export const RAMP_LEN = 9
export const RAMP_HEIGHT = 3
export const LOOP_RADIUS = 5
export const LOOP_ADVANCE = 5
export const LOOP_SAMPLES = 52

// How much track length each obstacle occupies (its effect zone).
export const OBSTACLE_LEN: Record<PieceType, number> = {
  straight: 0,
  left: 0,
  right: 0,
  rampUp: 0,
  rampDown: 0,
  loop: 0,
  gap: 6,
  water: 7,
  mud: 6,
  boost: 7,
  trampoline: 4,
  stopper: 3,
  spinner: 3,
  crates: 3,
}

// Rider speed multiplier while inside an obstacle's zone. Stopper and spinner
// are handled by their own timed logic (blocking / knock-back), so they don't
// slow the animal via a flat multiplier.
export const SPEED_MULT: Record<PieceType, number> = {
  straight: 1,
  left: 1,
  right: 1,
  rampUp: 0.85,
  rampDown: 1.15,
  loop: 1,
  gap: 1.25,
  water: 0.45,
  mud: 0.4,
  boost: 2.6,
  trampoline: 0.9,
  stopper: 1,
  spinner: 1,
  crates: 0.8,
}
