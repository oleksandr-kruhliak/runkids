import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Track, sampleCenter } from './track/build'

// Top-down mini-map of the course with a live dot per animal. The path is
// static for a given track, so it is built once; the dots are moved
// imperatively from the sim's distance refs on every frame, which keeps the
// map perfectly in step with the race without re-rendering React at 60 Hz.

const W = 208
const H = 132
const PAD = 14
/** Cap on path points — a five-minute course has thousands of samples. */
const MAX_PTS = 360

export interface TrackMapProps {
  track: Track
  /** Body colour per lane, used for the dots. */
  colors: string[]
  names: string[]
  /** Live distance along the course per lane, written by the sim. */
  distancesRef: React.MutableRefObject<number[]>
  count: number
  /** Finish time per lane, or null while still running. */
  times: (number | null)[]
}

export default function TrackMap({
  track,
  colors,
  names,
  distancesRef,
  count,
  times,
}: TrackMapProps) {
  const geo = useMemo(() => {
    const pts = track.center.points
    if (pts.length < 2) return null
    // Courses serpentine, so they are usually long in one axis and thin in the
    // other. Try the map both ways up and keep whichever fills the box better.
    const fit = (turned: boolean) => {
      const ax = (v: THREE.Vector3) => (turned ? v.z : v.x)
      const ay = (v: THREE.Vector3) => (turned ? -v.x : v.z)
      let minX = Infinity
      let maxX = -Infinity
      let minY = Infinity
      let maxY = -Infinity
      for (const p of pts) {
        minX = Math.min(minX, ax(p))
        maxX = Math.max(maxX, ax(p))
        minY = Math.min(minY, ay(p))
        maxY = Math.max(maxY, ay(p))
      }
      const w = maxX - minX || 1
      const h = maxY - minY || 1
      const s = Math.min((W - 2 * PAD) / w, (H - 2 * PAD) / h)
      const ox = (W - w * s) / 2 - minX * s
      const oy = (H - h * s) / 2 - minY * s
      const project = (v: THREE.Vector3): [number, number] => [ax(v) * s + ox, ay(v) * s + oy]
      return { s, project }
    }
    const flat = fit(false)
    const turned = fit(true)
    const { project } = turned.s > flat.s ? turned : flat

    const step = Math.max(1, Math.ceil(pts.length / MAX_PTS))
    const parts: string[] = []
    for (let i = 0; i < pts.length; i += step) {
      const [x, y] = project(pts[i])
      parts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`)
    }
    const [lx, ly] = project(pts[pts.length - 1])
    parts.push(`L${lx.toFixed(1)} ${ly.toFixed(1)}`)
    return { d: parts.join(' '), project, start: project(pts[0]), finish: [lx, ly] as [number, number] }
  }, [track])

  const dots = useRef<(SVGGElement | null)[]>([])
  const timesRef = useRef(times)
  timesRef.current = times

  useEffect(() => {
    if (!geo) return
    let raf = 0
    const len = track.length || 1
    const tick = () => {
      // The halo marks whoever is winning the race that is still on — a
      // finisher already reads as finished, so it moves past them.
      let lead = -1
      let best = -Infinity
      for (let l = 0; l < count; l++) {
        if (timesRef.current[l] != null) continue
        const d = distancesRef.current[l] ?? 0
        if (d > best) {
          best = d
          lead = l
        }
      }
      for (let l = 0; l < count; l++) {
        const g = dots.current[l]
        if (!g) continue
        // sampleCenter wraps past the end; park finishers on the line instead.
        const d = Math.min(distancesRef.current[l] ?? 0, len - 0.001)
        const [x, y] = geo.project(sampleCenter(track.center, d).pos)
        g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`)
        g.setAttribute('data-lead', l === lead ? '1' : '0')
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [geo, track, count, distancesRef])

  if (!geo) return null

  return (
    <div className="track-map">
      <div className="tm-title">🗺 Track</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="tm-svg" role="img" aria-label="Course map">
        {/* The road: a wide casing with a dashed centre line on top. */}
        <path d={geo.d} className="tm-road" />
        <path d={geo.d} className="tm-lane" />

        <g transform={`translate(${geo.start[0]} ${geo.start[1]})`}>
          <circle r={4} className="tm-start" />
        </g>
        <text x={geo.finish[0]} y={geo.finish[1] + 4} className="tm-finish">
          🏁
        </text>

        {Array.from({ length: count }, (_, l) => (
          <g
            key={l}
            ref={(el) => {
              dots.current[l] = el
            }}
            className={`tm-dot ${times[l] != null ? 'done' : ''}`}
          >
            <title>{names[l] ?? `Racer ${l + 1}`}</title>
            <circle r={7.8} className="tm-halo" />
            <circle r={5.8} className="tm-ring" />
            <circle r={4.2} fill={colors[l] ?? '#fff'} />
          </g>
        ))}
      </svg>
    </div>
  )
}
