export type PieceType = 'straight' | 'left' | 'right' | 'rampUp' | 'rampDown'

export interface Piece {
  id: string
  type: PieceType
}

export const PIECE_ORDER: PieceType[] = ['straight', 'left', 'right', 'rampUp', 'rampDown']

export const PIECE_META: Record<PieceType, { label: string; icon: string }> = {
  straight: { label: 'Straight', icon: '▮' },
  left: { label: 'Turn', icon: '◀' },
  right: { label: 'Turn', icon: '▶' },
  rampUp: { label: 'Ramp', icon: '▲' },
  rampDown: { label: 'Ramp', icon: '▼' },
}

// Geometry constants (world units).
export const STRAIGHT_LEN = 6
export const TURN_RADIUS = 6
export const TURN_ANGLE = Math.PI / 2 // 90° per turn piece
export const RAMP_LEN = 8
export const RAMP_HEIGHT = 3

let counter = 0
export function makePiece(type: PieceType): Piece {
  counter += 1
  return { id: `p${counter}`, type }
}
