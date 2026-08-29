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
  color: string
}

const fmt = (t: number | null) => (t == null ? '' : `${t.toFixed(1)}s`)

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
    <div className={`bk-plate ${state ?? ''}`} style={{ ['--lane-color' as string]: racer.color }}>
      <span className="bk-bar" />
      <span className="bk-dot" />
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

  // Connector geometry: slot i's centre sits at (i + 0.5) / n of the column.
  const centre = (i: number) => ((i + 0.5) / n) * 100
  const finalSlots = Math.max(finalists.length, n * tournament.advance)

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

        <div className="bk-tree">
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
              )
            })}
          </div>

          {/* Heats -> final connectors */}
          <svg className="bk-spine" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            {heats.map((_, i) => (
              <line key={i} x1="0" y1={centre(i)} x2="50" y2={centre(i)} vectorEffect="non-scaling-stroke" />
            ))}
            <line x1="50" y1={centre(0)} x2="50" y2={centre(n - 1)} vectorEffect="non-scaling-stroke" />
            <line x1="50" y1="50" x2="100" y2="50" vectorEffect="non-scaling-stroke" />
          </svg>

          {/* Final */}
          <div className="bk-col">
            <div className="bk-slot">
              <div className={`bk-match ${stage.kind === 'final' ? 'next' : ''}`}>
                <div className="bk-match-label">
                  🏁 Final
                  {stage.kind === 'final' && <span className="bk-next">NEXT</span>}
                </div>
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

          {/* Final -> champion connector */}
          <svg className="bk-spine short" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            <line x1="0" y1="50" x2="100" y2="50" vectorEffect="non-scaling-stroke" />
          </svg>

          {/* Champion */}
          <div className="bk-col">
            <div className="bk-slot">
              <div className="bk-champ-wrap">
                <div className="bk-match-label">Champion</div>
                {champion ? (
                  <Plate racer={racers[champion.entrant]} time={champion.finalTime} state="win" />
                ) : (
                  <Plate state="tbd" />
                )}
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
                style={{ ['--lane-color' as string]: racers[r.entrant]?.color }}
              >
                <span className="bk-place">
                  {r.place != null && r.place <= 3 ? ['🥇', '🥈', '🥉'][r.place - 1] : r.place}
                </span>
                <span className="bk-sname">
                  <span className="lane-dot" />
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
