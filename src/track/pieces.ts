export type PieceType =
  | 'straight'
  | 'left'
  | 'right'
  | 'rampUp'
  | 'rampDown'
  | 'gap'
  | 'water'
  | 'mud'
  | 'boost'
  | 'spring'

export type PieceGroup = 'track' | 'obstacle'

export interface Piece {
  id: string
  type: PieceType
}

export const TRACK_PIECES: PieceType[] = ['straight', 'left', 'right', 'rampUp', 'rampDown']
export const OBSTACLE_PIECES: PieceType[] = ['gap', 'water', 'mud', 'boost', 'spring']
export const PIECE_ORDER: PieceType[] = [...TRACK_PIECES, ...OBSTACLE_PIECES]

export const PIECE_META: Record<
  PieceType,
  { label: string; icon: string; group: PieceGroup }
> = {
  straight: { label: 'Straight', icon: '▮', group: 'track' },
  left: { label: 'Turn', icon: '◀', group: 'track' },
  right: { label: 'Turn', icon: '▶', group: 'track' },
  rampUp: { label: 'Ramp', icon: '▲', group: 'track' },
  rampDown: { label: 'Ramp', icon: '▼', group: 'track' },
  gap: { label: 'Jump', icon: '⤴', group: 'obstacle' },
  water: { label: 'Water', icon: '💧', group: 'obstacle' },
  mud: { label: 'Mud', icon: '🟤', group: 'obstacle' },
  boost: { label: 'Boost', icon: '⚡', group: 'obstacle' },
  spring: { label: 'Spring', icon: '⇧', group: 'obstacle' },
}

// Geometry constants (world units).
export const STRAIGHT_LEN = 6
export const TURN_RADIUS = 6
export const TURN_ANGLE = Math.PI / 2 // 90° per turn piece
export const RAMP_LEN = 8
export const RAMP_HEIGHT = 3
export const GAP_LEN = 6
export const WATER_LEN = 8
export const MUD_LEN = 6
export const BOOST_LEN = 7
export const SPRING_LEN = 4

// How each piece type advances the cursor forward (horizontal length).
export const FORWARD_LEN: Record<PieceType, number> = {
  straight: STRAIGHT_LEN,
  left: 0,
  right: 0,
  rampUp: RAMP_LEN,
  rampDown: RAMP_LEN,
  gap: GAP_LEN,
  water: WATER_LEN,
  mud: MUD_LEN,
  boost: BOOST_LEN,
  spring: SPRING_LEN,
}

// Speed multiplier applied to riders while on a piece of this type.
export const SPEED_MULT: Record<PieceType, number> = {
  straight: 1,
  left: 1,
  right: 1,
  rampUp: 0.85,
  rampDown: 1.15,
  gap: 1.25,
  water: 0.45,
  mud: 0.4,
  boost: 2.4,
  spring: 1,
}

let counter = 0
export function makePiece(type: PieceType): Piece {
  counter += 1
  return { id: `p${counter}`, type }
}
