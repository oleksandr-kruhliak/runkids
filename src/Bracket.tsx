import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import AnimalAvatar from './Avatar'
import { clockUnit } from './format'
import { AnimalDesign } from './studio/model'
import { AnimalColors } from './track/Animal'
import {
  Stage,
  Tournament,
  nextStage,
  qualifiers,
  stageLabel,
  standings,
} from './tournament'

export interface BracketRacer {
  name: string
  colors: AnimalColors
  design: AnimalDesign | null
}

const fmt = (t: number | null) => (t == null ? '' : clockUnit(t))

/** One name plate: accent bar, racer name, and a time once they've raced. */
function Plate({
  racer,
  time,
  state,
}: {
  racer?: BracketRacer
  time?: number | null
  /** 'adv' = qualified, 'out' = eliminated, 'win' = champion. */
  state?: 'adv' | 'out' | 'win' | 'tbd'
}) {
  if (state === 'tbd' || !racer) {
    return (
      <div className="bk-plate tbd">
        <span className="bk-bar" />
        <span className="bk-pname">?</span>
      </div>
    )
  }
  return (
    <div
      className={`bk-plate ${state ?? ''}`}
      style={{ ['--lane-color' as string]: racer.colors.body }}
    >
      <span className="bk-bar" />
      <AnimalAvatar design={racer.design} colors={racer.colors} size={22} />
      <span className="bk-pname">{racer.name}</span>
      {time != null && <span className="bk-ptime">{fmt(time)}</span>}
    </div>
  )
}

/**
 * The screen between races, drawn as a tournament tree: heats on the left,
 * the final in the middle, the champion and trophy on the right, joined by
 * connector lines. Once the final is raced it also lists full standings.
 */
export default function Bracket({
  tournament,
  racers,
  onStart,
  onRestart,
  onExit,
}: {
  tournament: Tournament
  racers: BracketRacer[]
  onStart: () => void
  onRestart: () => void
  onExit: () => void
}) {
  const stage: Stage = nextStage(tournament)
  const done = stage.kind === 'done'
  const finalists = tournament.final?.entrants ?? qualifiers(tournament)
  const rows = standings(tournament)
  const champion = done ? rows[0] : null
  const heats = tournament.heats
  const n = heats.length
  const finalSlots = Math.max(finalists.length, n * tournament.advance)

  // Connectors are measured from the laid-out boxes rather than assumed from
  // the grid, so they stay centred on the plates whatever the labels do.
  const treeRef = useRef<HTMLDivElement>(null)
  const heatRefs = useRef<(HTMLDivElement | null)[]>([])
  const finalRef = useRef<HTMLDivElement>(null)
  const champRef = useRef<HTMLDivElement>(null)
  const [paths, setPaths] = useState<string[]>([])

  const measure = useCallback(() => {
    const root = treeRef.current
    const fin = finalRef.current
    const champ = champRef.current
    if (!root || !fin || !champ) return
    const base = root.getBoundingClientRect()
    const rel = (el: Element) => {
      const b = el.getBoundingClientRect()
      return {
        left: b.left - base.left,
        right: b.right - base.left,
        cy: b.top - base.top + b.height / 2,
      }
    }
    const sources = heatRefs.current.filter(Boolean).map((el) => rel(el as Element))
    if (sources.length === 0) return
    const f = rel(fin)
    const c = rel(champ)
    const out: string[] = []

    // heats -> final: stubs, a shared vertical spine, then into the final
    const midA = (Math.max(...sources.map((s2) => s2.right)) + f.left) / 2
    for (const s2 of sources) out.push(`M ${s2.right} ${s2.cy} H ${midA}`)
    const ys = [...sources.map((s2) => s2.cy), f.cy]
    out.push(`M ${midA} ${Math.min(...ys)} V ${Math.max(...ys)}`)
    out.push(`M ${midA} ${f.cy} H ${f.left}`)

    // final -> champion, stepping to the champion plate's own centre
    const midB = (f.right + c.left) / 2
    out.push(`M ${f.right} ${f.cy} H ${midB} V ${c.cy} H ${c.left}`)
    setPaths(out)
  }, [])

  useLayoutEffect(() => {
    measure()
    const root = treeRef.current
    if (!root || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(root)
    return () => ro.disconnect()
  }, [measure, tournament, finalSlots])

  return (
    <div className="bracket-overlay">
      <div className={`bracket-card wide ${done ? 'done' : ''}`}>
        <div className="bk-head">
          <div>
            <div className="bk-kicker">Cube Kids Cup</div>
            <h2 className="bk-title">
              {done ? `👑 ${racers[champion!.entrant]?.name} wins the Cup!` : `🏆 ${stageLabel(tournament, stage)}`}
            </h2>
          </div>
        </div>

        <div className="bk-tree" ref={treeRef}>
          <svg className="bk-links" aria-hidden>
            {paths.map((d, i) => (
              <path key={i} d={d} />
            ))}
          </svg>

          {/* Heats */}
          <div className="bk-col">
            {heats.map((h, i) => {
              const ranked = h.entrants
                .map((e, k) => ({ e, time: h.times[k] }))
                .sort((a, b) => (a.time ?? 1e9) - (b.time ?? 1e9))
              const isNext = stage.kind === 'heat' && stage.index === i
              return (
                <div className="bk-slot" key={i}>
                  <div className={`bk-match ${isNext ? 'next' : ''}`}>
                    <div className="bk-match-label">
                      Heat {i + 1}
                      {isNext && <span className="bk-next">NEXT</span>}
                    </div>
                    <div
                      className="bk-plates"
                      ref={(el) => {
                        heatRefs.current[i] = el
                      }}
                    >
                    {ranked.map((r, pos) => (
                      <Plate
                        key={r.e}
                        racer={racers[r.e]}
                        time={r.time}
                        state={h.done ? (pos < tournament.advance ? 'adv' : 'out') : undefined}
                      />
                    ))}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="bk-gap" />

          {/* Final */}
          <div className="bk-col">
            <div className="bk-slot">
              <div className={`bk-match ${stage.kind === 'final' ? 'next' : ''}`}>
                <div className="bk-match-label">
                  🏁 Final
                  {stage.kind === 'final' && <span className="bk-next">NEXT</span>}
                </div>
                <div className="bk-plates" ref={finalRef}>
                {Array.from({ length: finalSlots }, (_, i) => {
                  const e = finalists[i]
                  if (e == null) return <Plate key={`slot${i}`} state="tbd" />
                  const k = tournament.final?.entrants.indexOf(e) ?? -1
                  const time = k >= 0 ? (tournament.final?.times[k] ?? null) : null
                  const isChamp = done && champion?.entrant === e
                  return (
                    <Plate
                      key={e}
                      racer={racers[e]}
                      time={time}
                      state={done ? (isChamp ? 'adv' : 'out') : undefined}
                    />
                  )
                })}
                </div>
              </div>
            </div>
          </div>

          <div className="bk-gap short" />

          {/* Champion */}
          <div className="bk-col">
            <div className="bk-slot">
              <div className="bk-champ-wrap">
                <div className="bk-match-label">Champion</div>
                <div className="bk-plates" ref={champRef}>
                  {champion ? (
                    <Plate racer={racers[champion.entrant]} time={champion.finalTime} state="win" />
                  ) : (
                    <Plate state="tbd" />
                  )}
                </div>
                <div className={`bk-trophy ${done ? 'won' : ''}`}>🏆</div>
              </div>
            </div>
          </div>
        </div>

        {done && (
          <div className="bk-standings">
            <div className="bk-srow bk-shead">
              <span>#</span>
              <span>Racer</span>
              <span>Heat</span>
              <span>Final</span>
            </div>
            {rows.map((r) => (
              <div
                key={r.entrant}
                className={`bk-srow ${r.status}`}
                style={{ ['--lane-color' as string]: racers[r.entrant]?.colors.body }}
              >
                <span className="bk-place">
                  {r.place != null && r.place <= 3 ? ['🥇', '🥈', '🥉'][r.place - 1] : r.place}
                </span>
                <span className="bk-sname">
                  {racers[r.entrant] && (
                    <AnimalAvatar
                      design={racers[r.entrant].design}
                      colors={racers[r.entrant].colors}
                      size={20}
                    />
                  )}
                  {racers[r.entrant]?.name}
                </span>
                <span className="bk-stime">
                  H{r.heatIndex + 1}
                  {r.heatPlace ? ` · P${r.heatPlace}` : ''} · {fmt(r.heatTime) || '—'}
                </span>
                <span className="bk-stime strong">{fmt(r.finalTime) || '—'}</span>
              </div>
            ))}
          </div>
        )}

        <div className="bk-actions">
          {done ? (
            <>
              <button className="bk-go" onClick={onRestart}>
                🔁 New cup
              </button>
              <button className="bk-back" onClick={onExit}>
                ⚙ New setup
              </button>
            </>
          ) : (
            <>
              <button className="bk-go" onClick={onStart}>
                {stage.kind === 'final' ? '🏁 Start the FINAL' : `▶ Start ${stageLabel(tournament, stage)}`}
              </button>
              <button className="bk-back" onClick={onExit}>
                ← Back to setup
              </button>
            </>
          )}
        </div>
        {stage.kind === 'final' && <p className="bk-note">The final runs on a longer track at sunset.</p>}
      </div>
    </div>
  )
}
