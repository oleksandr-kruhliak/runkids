// Which animal the follow camera is watching.
//
// Two things are going on here. Who counts as the leader has to be sticky:
// taking the front runner outright looks obvious and is wrong, because in a
// close race the order changes many times a second and every change moves the
// camera's subject sideways by a lane, which reads as the camera shaking.
//
// On top of that, a race is more watchable if the camera does not stare at the
// leader for the whole of it — so between stints on the leader it cuts away to
// the best duel further back. That stops once the leader is inside the closing
// stretch, where the finish is the only thing worth being on.

export interface FollowState {
  /** Lane the camera is on. */
  idx: number
  /** Lane currently accepted as the leader. */
  leader: number
  /** Time before which the leader will not change again. */
  leaderUntil: number
  /** Time the current stint (on the leader, or away from them) ends. */
  until: number
  /** True while the camera has cut away from the leader. */
  visiting: boolean
  /** Stint counter, used to vary the stint lengths. */
  n: number
}

/** How far clear a challenger must be, in world units, to take the camera. */
export const LEAD_MARGIN = 1.1
/** How long the camera then stays with them, whatever happens behind. */
export const LEAD_DWELL = 1.2

/** Fraction of the course after which the camera stays on the leader. */
export const ENDGAME = 0.9
/** Seconds on the leader between cutaways. */
export const LEADER_STINT: [number, number] = [13, 19]
/** Seconds spent on the duel behind before returning. */
export const VISIT_STINT: [number, number] = [5.5, 8]
/** Ranks at or below this mean the racer has finished and is parked. */
const RACING = -1e8

export function newFollowState(): FollowState {
  return { idx: -1, leader: -1, leaderUntil: 0, until: 0, visiting: false, n: 0 }
}

/** Deterministic 0..1 from the stint counter, so stints vary but replay. */
function jitter(n: number): number {
  const x = Math.sin(n * 12.9898 + 4.1414) * 43758.5453
  return x - Math.floor(x)
}

const span = (r: [number, number], n: number) => r[0] + jitter(n) * (r[1] - r[0])

/**
 * Accept a new leader only once they are clearly ahead and have held it.
 * Exported for its own sake — this is the rule that stops the shaking.
 */
export function stickyLead(
  st: FollowState,
  best: number,
  ranks: number[],
  t: number,
  count: number,
): number {
  if (st.leader < 0 || st.leader >= count) {
    st.leader = best
    st.leaderUntil = t + LEAD_DWELL
    // Open on the leader: the clock is the app's, not the race's, so without
    // this the first frame is already past a stint boundary and cuts away.
    st.until = t + span(LEADER_STINT, st.n++)
    return st.leader
  }
  if (best === st.leader) return st.leader
  const ahead = (ranks[best] ?? -Infinity) - (ranks[st.leader] ?? -Infinity)
  if (ahead > LEAD_MARGIN && t >= st.leaderUntil) {
    st.leader = best
    st.leaderUntil = t + LEAD_DWELL
  }
  return st.leader
}

/**
 * The closest fight that does not involve `leader`: of every adjacent pair in
 * the running order, the chaser in the tightest one. That is the racer with
 * something to prove, which makes the better cutaway.
 */
export function bestDuel(ranks: number[], count: number, leader: number): number {
  const order = []
  for (let l = 0; l < count; l++) if ((ranks[l] ?? RACING) > RACING) order.push(l)
  order.sort((a, b) => ranks[b] - ranks[a])
  let pick = -1
  let tightest = Infinity
  for (let i = 1; i < order.length; i++) {
    const chaser = order[i]
    if (chaser === leader) continue
    const gap = ranks[order[i - 1]] - ranks[chaser]
    if (gap < tightest) {
      tightest = gap
      pick = chaser
    }
  }
  return pick
}

/**
 * Decide who the camera is on this frame, updating `st` in place.
 *
 * @param progress    how far through the course the leader is, 0..1
 * @param allowVisits false when there is nobody else worth cutting to
 */
export function pickSubject(
  st: FollowState,
  best: number,
  ranks: number[],
  t: number,
  count: number,
  progress: number,
  allowVisits: boolean,
): number {
  const leader = stickyLead(st, best, ranks, t, count)

  // Closing stretch: the finish is the story, so stay on the leader.
  if (!allowVisits || progress >= ENDGAME) {
    if (st.visiting) {
      st.visiting = false
      st.until = t + span(LEADER_STINT, st.n++)
    }
    st.idx = leader
    return st.idx
  }

  // A cutaway ends early if its subject finishes or drops out of the running.
  if (st.visiting && (st.idx < 0 || (ranks[st.idx] ?? RACING) <= RACING)) {
    st.visiting = false
    st.until = t + span(LEADER_STINT, st.n++)
  }

  if (t >= st.until) {
    if (st.visiting) {
      st.visiting = false
      st.until = t + span(LEADER_STINT, st.n++)
    } else {
      const duel = bestDuel(ranks, count, leader)
      if (duel >= 0) {
        st.visiting = true
        st.idx = duel
        st.until = t + span(VISIT_STINT, st.n++)
        return st.idx
      }
      // Nobody to cut to — try again after another stint on the leader.
      st.until = t + span(LEADER_STINT, st.n++)
    }
  }

  if (!st.visiting) st.idx = leader
  return st.idx
}
