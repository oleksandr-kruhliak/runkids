// Tournament state machine: entrants are split into heats, the top finishers
// of each heat qualify, and the qualifiers meet in a final. Pure functions
// over entrant indices — no React, no rendering, so the whole bracket is
// easy to reason about and test.

export interface TournamentOpts {
  /** Racers per heat (2-4). */
  heatSize: number
  /** How many of each heat advance to the final (1-2). */
  advance: number
}

export interface Heat {
  /** Indices into the entrant list. */
  entrants: number[]
  /** Finish time per entrant, same order; null until raced. */
  times: (number | null)[]
  done: boolean
}

export interface Tournament {
  entrantCount: number
  heatSize: number
  advance: number
  heats: Heat[]
  /** Built when the final is raced. */
  final: Heat | null
}

export type Stage =
  | { kind: 'heat'; index: number }
  | { kind: 'final' }
  | { kind: 'done' }

export const MIN_ENTRANTS = 4
export const MAX_FINALISTS = 8

/** Split entrants into balanced heats, in selection order. */
export function buildTournament(entrantCount: number, opts: TournamentOpts): Tournament {
  const heatSize = Math.max(2, Math.min(4, Math.round(opts.heatSize)))
  const advance = Math.max(1, Math.min(heatSize - 1, Math.round(opts.advance)))
  const heatCount = Math.max(2, Math.ceil(entrantCount / heatSize))
  const base = Math.floor(entrantCount / heatCount)
  const extra = entrantCount % heatCount

  const heats: Heat[] = []
  let next = 0
  for (let h = 0; h < heatCount; h++) {
    const size = base + (h < extra ? 1 : 0)
    const entrants = Array.from({ length: size }, () => next++)
    heats.push({ entrants, times: entrants.map(() => null), done: false })
  }
  return { entrantCount, heatSize, advance, heats, final: null }
}

/** The stage that should be raced next. */
export function nextStage(t: Tournament): Stage {
  const i = t.heats.findIndex((h) => !h.done)
  if (i >= 0) return { kind: 'heat', index: i }
  if (!t.final?.done) return { kind: 'final' }
  return { kind: 'done' }
}

/** Entrant indices that qualified, in heat order (heat 1's winner first). */
export function qualifiers(t: Tournament): number[] {
  const out: number[] = []
  for (const h of t.heats) {
    if (!h.done) continue
    const ranked = h.entrants
      .map((e, i) => ({ e, time: h.times[i] }))
      .filter((r): r is { e: number; time: number } => r.time != null)
      .sort((a, b) => a.time - b.time)
    for (const r of ranked.slice(0, t.advance)) out.push(r.e)
  }
  return out.slice(0, MAX_FINALISTS)
}

/** Who races in a given stage. */
export function stageEntrants(t: Tournament, stage: Stage): number[] {
  if (stage.kind === 'heat') return t.heats[stage.index]?.entrants ?? []
  if (stage.kind === 'final') return t.final?.entrants ?? qualifiers(t)
  return []
}

/** Record finish times for a stage (times parallel to stageEntrants). */
export function recordStage(t: Tournament, stage: Stage, times: (number | null)[]): Tournament {
  if (stage.kind === 'heat') {
    const heats = t.heats.map((h, i) =>
      i === stage.index ? { ...h, times: h.entrants.map((_, k) => times[k] ?? null), done: true } : h,
    )
    return { ...t, heats }
  }
  if (stage.kind === 'final') {
    const entrants = t.final?.entrants ?? qualifiers(t)
    return {
      ...t,
      final: { entrants, times: entrants.map((_, k) => times[k] ?? null), done: true },
    }
  }
  return t
}

/** Freeze the finalist list before the final is raced (so the bracket shows it). */
export function lockFinal(t: Tournament): Tournament {
  if (t.final) return t
  const entrants = qualifiers(t)
  return { ...t, final: { entrants, times: entrants.map(() => null), done: false } }
}

export type RowStatus = 'champion' | 'finalist' | 'eliminated' | 'racing'

export interface StandingRow {
  entrant: number
  /** 1-based overall place, or null while still undecided. */
  place: number | null
  heatIndex: number
  /** 1-based finishing position within their heat. */
  heatPlace: number | null
  heatTime: number | null
  finalTime: number | null
  status: RowStatus
}

/** Full leaderboard: finalists by final time, then the rest by heat time. */
export function standings(t: Tournament): StandingRow[] {
  const heatOf = new Map<number, { index: number; time: number | null; place: number | null }>()
  t.heats.forEach((h, index) => {
    const order = h.entrants
      .map((e, i) => ({ e, time: h.times[i] }))
      .filter((r): r is { e: number; time: number } => r.time != null)
      .sort((a, b) => a.time - b.time)
    h.entrants.forEach((e, i) => {
      const pos = order.findIndex((r) => r.e === e)
      heatOf.set(e, { index, time: h.times[i], place: pos >= 0 ? pos + 1 : null })
    })
  })

  const finalists = new Set(t.final?.entrants ?? [])
  const finalTime = new Map<number, number | null>()
  t.final?.entrants.forEach((e, i) => finalTime.set(e, t.final!.times[i]))

  const rows: StandingRow[] = []
  const push = (entrant: number, status: RowStatus, place: number | null) => {
    const h = heatOf.get(entrant)
    rows.push({
      entrant,
      place,
      heatIndex: h?.index ?? -1,
      heatPlace: h?.place ?? null,
      heatTime: h?.time ?? null,
      finalTime: finalTime.get(entrant) ?? null,
      status,
    })
  }

  // Finalists first, ranked by final time when it exists.
  const fin = [...finalists].sort((a, b) => {
    const ta = finalTime.get(a)
    const tb = finalTime.get(b)
    if (ta != null && tb != null) return ta - tb
    if (ta != null) return -1
    if (tb != null) return 1
    return 0
  })
  fin.forEach((e, i) => {
    const raced = t.final?.done === true
    push(e, raced ? (i === 0 ? 'champion' : 'finalist') : 'racing', raced ? i + 1 : null)
  })

  // Everyone else: by finishing position in their heat (all the runners-up,
  // then all the third places...), ties broken on time. Each heat draws its
  // own obstacles, so raw times aren't directly comparable across heats.
  const rest = Array.from({ length: t.entrantCount }, (_, i) => i)
    .filter((e) => !finalists.has(e))
    .sort((a, b) => {
      const ha = heatOf.get(a)
      const hb = heatOf.get(b)
      const pa = ha?.place ?? 99
      const pb = hb?.place ?? 99
      if (pa !== pb) return pa - pb
      const ta = ha?.time
      const tb = hb?.time
      if (ta != null && tb != null) return ta - tb
      if (ta != null) return -1
      if (tb != null) return 1
      return 0
    })
  rest.forEach((e, i) => {
    const raced = heatOf.get(e)?.time != null
    push(e, raced ? 'eliminated' : 'racing', raced ? fin.length + i + 1 : null)
  })

  return rows
}

/** Human label for the stage, e.g. "Heat 2 of 3". */
export function stageLabel(t: Tournament, stage: Stage): string {
  if (stage.kind === 'heat') return `Heat ${stage.index + 1} of ${t.heats.length}`
  if (stage.kind === 'final') return 'The Final'
  return 'Tournament complete'
}
