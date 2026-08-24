// Procedural track + obstacle generation for the quick-play setup screen.

import { OBSTACLE_PIECES, PieceType, STRAIGHT_LEN, TURN_ANGLE, TURN_RADIUS } from './pieces'

export const BASE_SPEED = 8 // matches Riders' BASE_SPEED (units per second)

const STRAIGHT = STRAIGHT_LEN
const TURN = TURN_RADIUS * TURN_ANGLE // arc length of a 90° turn

/**
 * Build a windy track shape whose length roughly matches `targetLen` world
 * units. Mostly straights with periodic U-turns so the course snakes back on
 * itself and stays compact.
 */
export function generateShape(targetLen: number): PieceType[] {
  const shape: PieceType[] = []
  let len = 0
  let turns = 0
  // Lead-in so nobody starts on a corner.
  shape.push('straight', 'straight')
  len += 2 * STRAIGHT

  while (len < targetLen) {
    const run = 3 + Math.floor(Math.random() * 3) // 3–5 straights between turns
    for (let i = 0; i < run && len < targetLen; i++) {
      shape.push('straight')
      len += STRAIGHT
    }
    if (len < targetLen) {
      // Alternate turn direction to serpentine; two 90° turns make a U.
      const dir: PieceType = turns % 2 === 0 ? 'left' : 'right'
      shape.push(dir, dir)
      len += 2 * TURN
      turns++
    }
  }
  return shape
}

/**
 * Rough number of obstacle slots a track of this length can hold. The ceiling
 * scales with length so the density slider keeps its meaning on long laps.
 */
export function obstacleCapacity(targetLen: number): number {
  return Math.max(1, Math.min(45, Math.round(targetLen / 11)))
}

/**
 * One obstacle list per lane, each a different random mix, so every animal
 * meets a different course. `pct` (0–100) scales how many obstacles appear.
 */
export function generateLaneObstacles(
  laneCount: number,
  targetLen: number,
  pct: number,
): PieceType[][] {
  const cap = obstacleCapacity(targetLen)
  const base = Math.round((cap * pct) / 100)
  const lanes: PieceType[][] = []
  for (let l = 0; l < laneCount; l++) {
    // Vary the count a little per lane so the fields differ in density too.
    const jitter = base > 0 ? Math.floor(Math.random() * 3) - 1 : 0
    const count = Math.max(0, Math.min(cap, base + jitter))
    const list: PieceType[] = []
    for (let i = 0; i < count; i++) {
      list.push(OBSTACLE_PIECES[Math.floor(Math.random() * OBSTACLE_PIECES.length)])
    }
    lanes.push(list)
  }
  return lanes
}
