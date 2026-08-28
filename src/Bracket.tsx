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

const fmt = (t: number | null) => (t == null ? '—' : `${t.toFixed(1)}s`)

/**
 * The screen between races: heat cards fill in as they're raced, the final
 * slot fills with qualifiers, and once the final is done it becomes the
 * champion screen with the full tournament leaderboard.
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

  const chip = (e: number, extra?: string, badge?: string) => {
    const r = racers[e]
    return (
      <div key={e} className={`bk-racer ${badge ?? ''}`} style={{ ['--lane-color' as string]: r?.color }}>
        <span className="lane-dot" />
        <span className="bk-name">{r?.name ?? `#${e + 1}`}</span>
        {extra && <span className="bk-time">{extra}</span>}
        {badge === 'adv' && <span className="bk-badge">✅</span>}
      </div>
    )
  }

  return (
    <div className="bracket-overlay">
      <div className="bracket-card">
        {done && champion ? (
          <>
            <div className="bk-kicker">Champion</div>
            <h2 className="bk-champion">
              👑 {racers[champion.entrant]?.name} wins the Cup!
            </h2>
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
                    {r.heatPlace ? ` · P${r.heatPlace}` : ''} · {fmt(r.heatTime)}
                  </span>
                  <span className="bk-stime strong">{fmt(r.finalTime)}</span>
                </div>
              ))}
            </div>
            <div className="bk-actions">
              <button className="bk-go" onClick={onRestart}>
                🔁 New cup
              </button>
              <button className="bk-back" onClick={onExit}>
                ⚙ New setup
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="bk-kicker">Cube Kids Cup</div>
            <h2 className="bk-title">🏆 {stageLabel(tournament, stage)}</h2>

            <div className="bk-heats">
              {tournament.heats.map((h, i) => {
                const ranked = h.entrants
                  .map((e, k) => ({ e, time: h.times[k] }))
                  .sort((a, b) => (a.time ?? 1e9) - (b.time ?? 1e9))
                const isNext = stage.kind === 'heat' && stage.index === i
                return (
                  <div key={i} className={`bk-heat ${h.done ? 'done' : ''} ${isNext ? 'next' : ''}`}>
                    <div className="bk-heat-head">
                      Heat {i + 1}
                      {isNext && <span className="bk-next">NEXT</span>}
                    </div>
                    {ranked.map((r, pos) =>
                      chip(
                        r.e,
                        h.done ? fmt(r.time) : undefined,
                        h.done && pos < tournament.advance ? 'adv' : undefined,
                      ),
                    )}
                  </div>
                )
              })}

              <div className={`bk-heat final ${stage.kind === 'final' ? 'next' : ''}`}>
                <div className="bk-heat-head">
                  🏁 Final
                  {stage.kind === 'final' && <span className="bk-next">NEXT</span>}
                </div>
                {finalists.length === 0 ? (
                  <div className="bk-empty">Winners qualify here</div>
                ) : (
                  finalists.map((e) => chip(e))
                )}
                {finalists.length < tournament.heats.length * tournament.advance &&
                  Array.from(
                    { length: tournament.heats.length * tournament.advance - finalists.length },
                    (_, i) => (
                      <div key={`slot${i}`} className="bk-racer slot">
                        <span className="bk-name">?</span>
                      </div>
                    ),
                  )}
              </div>
            </div>

            <div className="bk-actions">
              <button className="bk-go" onClick={onStart}>
                {stage.kind === 'final' ? '🏁 Start the FINAL' : `▶ Start ${stageLabel(tournament, stage)}`}
              </button>
              <button className="bk-back" onClick={onExit}>
                ← Back to setup
              </button>
            </div>
            {stage.kind === 'final' && (
              <p className="bk-note">The final runs on a longer track at sunset.</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
