import AnimalAvatar from './Avatar'
import { BracketRacer } from './Bracket'
import { SeriesRow } from './show'
import { clockUnit } from './format'

// Full-screen broadcast cards for the auto-show. They sit between the races
// of a recorded episode, so everything on them is sized to be read from a
// phone screen: no dense tables, no small print, one idea per card.

/** Big number / medal for a finishing place. */
const medal = (i: number) => ['🥇', '🥈', '🥉'][i] ?? `${i + 1}`

export function TitleCard({
  title,
  subtitle,
  racers,
}: {
  title: string
  subtitle: string
  racers: BracketRacer[]
}) {
  return (
    <div className="show-overlay">
      <div className="show-card title">
        <div className="show-kicker">Cube Kids</div>
        <h1 className="show-title">{title}</h1>
        <p className="show-sub">{subtitle}</p>
        <div className="show-strip">
          {racers.map((r, i) => (
            <div className="show-face" key={i} style={{ ['--lane-color' as string]: r.colors.body }}>
              <AnimalAvatar design={r.design} colors={r.colors} size={64} />
              <span className="show-facename">{r.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function LineupCard({
  kicker,
  title,
  racers,
  note,
}: {
  kicker: string
  title: string
  racers: BracketRacer[]
  note?: string
}) {
  return (
    <div className="show-overlay">
      <div className="show-card">
        <div className="show-kicker">{kicker}</div>
        <h1 className="show-title">{title}</h1>
        <div className="show-lineup">
          {racers.map((r, i) => (
            <div className="show-line" key={i} style={{ ['--lane-color' as string]: r.colors.body }}>
              <span className="show-lane">{i + 1}</span>
              <AnimalAvatar design={r.design} colors={r.colors} size={44} />
              <span className="show-name">{r.name}</span>
            </div>
          ))}
        </div>
        <p className="show-ask">{note ?? 'Who will win? Say it out loud! 👇'}</p>
      </div>
    </div>
  )
}

export function StandingsCard({
  kicker,
  title,
  rows,
  racers,
  showPoints = true,
}: {
  kicker: string
  title: string
  rows: SeriesRow[]
  racers: BracketRacer[]
  showPoints?: boolean
}) {
  return (
    <div className="show-overlay">
      <div className="show-card">
        <div className="show-kicker">{kicker}</div>
        <h1 className="show-title">{title}</h1>
        <div className="show-table">
          {rows.map((row, i) => {
            const r = racers[row.lane]
            if (!r) return null
            return (
              <div
                className={`show-trow ${i === 0 ? 'lead' : ''}`}
                key={row.lane}
                style={{ ['--lane-color' as string]: r.colors.body }}
              >
                <span className="show-place">{medal(i)}</span>
                <AnimalAvatar design={r.design} colors={r.colors} size={38} />
                <span className="show-name">{r.name}</span>
                <span className="show-best">{row.best != null ? clockUnit(row.best) : '—'}</span>
                {showPoints && <span className="show-pts">{row.points}</span>}
              </div>
            )
          })}
        </div>
        {showPoints && <p className="show-foot">Points: 10 · 8 · 6 · 5 · 4 · 3 · 2 · 1</p>}
      </div>
    </div>
  )
}

export function OutroCard({
  champion,
  title,
}: {
  champion: BracketRacer | null
  title: string
}) {
  return (
    <div className="show-overlay">
      <div className="show-card title">
        <div className="show-kicker">That's a wrap!</div>
        <h1 className="show-title">{title}</h1>
        {champion && (
          <div className="show-champ" style={{ ['--lane-color' as string]: champion.colors.body }}>
            <AnimalAvatar design={champion.design} colors={champion.colors} size={132} />
            <span className="show-champname">👑 {champion.name}</span>
          </div>
        )}
        <p className="show-ask">Who should race next time? Tell us below! 👇</p>
        <p className="show-sub">Like &amp; subscribe for more cube races 🏁</p>
      </div>
    </div>
  )
}
