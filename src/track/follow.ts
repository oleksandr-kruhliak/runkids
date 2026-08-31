// Which animal the follow camera is watching.
//
// Taking the front runner outright looks obvious and is wrong: in a close race
// the order changes many times a second, and every change moves the camera's
// subject sideways by a lane, which reads as the camera shaking. A challenger
// has to be clearly ahead, and to hold that lead for a moment, before the
// camera goes with them.

export interface LeadHold {
  /** Lane currently being followed, or -1 before the first pick. */
  idx: number
  /** Time before which the camera will not switch again. */
  until: number
}

/** How far clear a challenger must be, in world units, to take the camera. */
export const LEAD_MARGIN = 1.1
/** How long the camera then stays with them, whatever happens behind. */
export const LEAD_DWELL = 1.2

/**
 * Decide who to follow this frame and update `hold` in place.
 *
 * @param hold   persistent state across frames
 * @param best   lane with the highest rank this frame
 * @param ranks  rank per lane; higher is further along
 * @param t      seconds, monotonic
 * @param count  number of lanes
 */
export function stickyLead(
  hold: LeadHold,
  best: number,
  ranks: number[],
  t: number,
  count: number,
): number {
  if (hold.idx < 0 || hold.idx >= count) {
    hold.idx = best
    hold.until = t + LEAD_DWELL
    return hold.idx
  }
  if (best === hold.idx) return hold.idx
  const ahead = (ranks[best] ?? -Infinity) - (ranks[hold.idx] ?? -Infinity)
  if (ahead > LEAD_MARGIN && t >= hold.until) {
    hold.idx = best
    hold.until = t + LEAD_DWELL
  }
  return hold.idx
}
