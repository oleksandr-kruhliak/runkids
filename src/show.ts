// Auto-show director: the data behind the setup screen's "Generate video"
// button. A show is a fixed sequence of beats — title card, lineup, race,
// results, standings — that the app steps through on its own, so a whole
// episode films itself without anyone touching the keyboard.

/**
 * `race` is the only open-ended beat: it ends when the racers finish, every
 * other beat holds for a fixed number of seconds so the viewer can read it.
 */
export type ShowBeat = 'title' | 'lineup' | 'race' | 'result' | 'standings' | 'outro'

/** How long each card stays on screen (ms). Brisk — the races are the show. */
export const BEAT_MS: Record<Exclude<ShowBeat, 'race'>, number> = {
  title: 4000,
  lineup: 4000,
  result: 4000,
  standings: 4000,
  // The sign-off is the call to action, so it gets the longest hold.
  outro: 10000,
}

/** The last leaderboard of the episode is the payoff — it holds longer. */
export const CHAMPION_MS = 8000

/** Championship points by finishing place, winner first. */
export const POINTS = [10, 8, 6, 5, 4, 3, 2, 1]

export interface SeriesRow {
  /** Lane index, which is also the racer's index in the episode line-up. */
  lane: number
  points: number
  wins: number
  /** Fastest lap across the episode so far. */
  best: number | null
}

export interface ShowState {
  beat: ShowBeat
  /** 0-based index of the race being introduced / run / just finished. */
  race: number
  /** Races in this episode (1 for a tournament, which paces itself). */
  total: number
  tournament: boolean
}

export function emptySeries(count: number): SeriesRow[] {
  return Array.from({ length: count }, (_, lane) => ({ lane, points: 0, wins: 0, best: null }))
}

/** Fold one race's finishing order into the running championship table. */
export function scoreRace(
  rows: SeriesRow[],
  ranking: { lane: number; time: number }[],
): SeriesRow[] {
  const next = rows.map((r) => ({ ...r }))
  ranking.forEach((r, place) => {
    const row = next.find((x) => x.lane === r.lane)
    if (!row) return
    row.points += POINTS[place] ?? 0
    if (place === 0) row.wins += 1
    if (row.best == null || r.time < row.best) row.best = r.time
  })
  return next
}

/** Most points first; ties break on wins, then on the fastest single lap. */
export function rankSeries(rows: SeriesRow[]): SeriesRow[] {
  return [...rows].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    if (b.wins !== a.wins) return b.wins - a.wins
    if (a.best == null) return 1
    if (b.best == null) return -1
    return a.best - b.best
  })
}

/** Ordinal used in the card kickers: "Race 2 of 3". */
export function raceLabel(race: number, total: number): string {
  return total > 1 ? `Race ${race + 1} of ${total}` : 'Race day'
}
