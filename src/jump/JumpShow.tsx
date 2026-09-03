import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import AnimalAvatar from '../Avatar'
import Confetti from '../Confetti'
import { AnimalColors } from '../track/Animal'
import { AnimalDesign } from '../studio/model'
import { loadLibrary } from '../studio/library'
import { loadBuiltins, mergeLibraries } from '../studio/builtin'
import { initAudio, setAudioEnabled, sfx } from '../audio'
import { downloadRecording, isRecordingSupported, startTabRecording } from '../recorder'
import { enterFullscreen, exitFullscreen } from '../fullscreen'
import JumpSetup from './JumpSetup'
import JumpStage, { JumpCam } from './JumpStage'
import {
  COUNT_MS,
  JumpBeat,
  JumpConfig,
  JumpEvent,
  CLOSE_M,
  MAX_CLIMB_MS,
  OUTRO_MS,
  READY_MS,
  RESULT_MS,
  Racer,
  STRAGGLER_MAX_MS,
  STRAGGLER_MS,
  STRAGGLER_STEP_MS,
  Sim,
  TITLE_MS,
  WINNER_MS,
  buildSim,
  designFor,
  episodeTitle,
  finishAll,
  pct,
  ranking,
  startClimb,
} from './model'
import '../styles.css'
import './jump.css'

// The Cloud Climb page — doodle jump, played by the animals, filmed in one
// take. Same shape as the other two shows: a chain of timed beats the app
// walks through by itself, with one open-ended beat in the middle (the climb)
// that ends when somebody reaches the top.

/** Portrait tint for a design — its body block's colour. */
function avatarColors(design: AnimalDesign): AnimalColors {
  const body = design.blocks.find((b) => b.role === 'body') ?? design.blocks[0]
  const c = body?.color ?? '#e8734a'
  return { body: c, belly: c, ear: c }
}

/** "23.4s" — a finishing time, which is always under a couple of minutes. */
function fmtTime(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`
}

/** One row of the live leaderboard, sampled off the simulation. */
interface Standing {
  lane: number
  /** How far up the tower, 0-100. */
  pct: number
  stars: number
  saves: number
  /** Freezes, honey pads and fans it has been caught by. */
  bumps: number
  time: number
}

export default function JumpShow({ onExit }: { onExit: () => void }) {
  // --- The animal library (saved designs + the bundled pack) --------------
  const [library, setLibrary] = useState<AnimalDesign[]>(() => loadLibrary())
  useEffect(() => {
    let live = true
    loadBuiltins().then((builtins) => {
      if (live) setLibrary((custom) => mergeLibraries(custom, builtins))
    })
    return () => {
      live = false
    }
  }, [])

  // --- Episode state ------------------------------------------------------
  const [cfg, setCfg] = useState<JumpConfig | null>(null)
  const [sim, setSim] = useState<Sim | null>(null)
  const [designs, setDesigns] = useState<AnimalDesign[]>([])
  const [beat, setBeat] = useState<JumpBeat>('title')
  /** 3, 2, 1, then 0 for GO. */
  const [count, setCount] = useState(3)
  const [standings, setStandings] = useState<Standing[]>([])
  /** The first animal to touch a finish cloud; -1 until somebody does. */
  const [winner, setWinner] = useState(-1)
  const [partyAt, setPartyAt] = useState(0)
  /**
   * The two things worth shouting about mid-climb: somebody taking the lead,
   * and somebody being fished out of the sky by a bubble. Only one is on
   * screen at a time — whichever happened last — and it times itself out.
   */
  const [flash, setFlash] = useState<{ text: string; kind: 'lead' | 'save'; at: number } | null>(
    null,
  )
  /**
   * The show runs with no app chrome on screen at all — it's meant to be
   * filmed, and anything that isn't the show would end up in the video. Esc
   * brings the controls up when someone actually wants them.
   */
  const [chromeOpen, setChromeOpen] = useState(false)
  const [soundOn, setSoundOn] = useState(true)
  const [toast, setToast] = useState<string | null>(null)

  // Mirrors for the timer chain, which outlives any single render.
  const simRef = useRef<Sim | null>(null)
  const cfgRef = useRef<JumpConfig | null>(null)
  const beatRef = useRef<JumpBeat>('title')
  const endedRef = useRef(false)
  /** Who was top of the board last time it was sampled, for the lead callout. */
  const leaderRef = useRef(-1)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }, [])
  const after = useCallback((ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms))
  }, [])
  useEffect(() => clearTimers, [clearTimers])

  const say = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 2600)
  }, [])

  // --- Recording ----------------------------------------------------------
  const recSupported = useMemo(() => isRecordingSupported(), [])
  const [recording, setRecording] = useState(false)
  const stopRec = useRef<(() => void) | null>(null)

  const startRecording = useCallback(
    async (quiet = false) => {
      try {
        const stop = await startTabRecording((blob) => {
          downloadRecording(blob)
          stopRec.current = null
          setRecording(false)
          exitFullscreen()
          say('🎬 Video saved to your downloads')
        })
        stopRec.current = stop
        setRecording(true)
        // Whatever was on screen goes away — it would be in the video.
        setChromeOpen(false)
        if (!quiet) say('⏺ Recording — press R to stop')
        return true
      } catch {
        if (!quiet) say('Recording was cancelled')
        return false
      }
    },
    [say],
  )

  const toggleRecording = useCallback(() => {
    if (stopRec.current) stopRec.current()
    else void startRecording()
  }, [startRecording])

  // --- The director -------------------------------------------------------

  /** The last beats: the champion's cloud, the placings, the sign-off. */
  const finish = useCallback(() => {
    const s = simRef.current
    if (!s || endedRef.current) return
    endedRef.current = true
    // Anyone still bouncing is lifted onto their cloud, so the closing shot has
    // the whole line-up in it rather than one animal and three empty towers.
    finishAll(s)
    beatRef.current = 'winner'
    setBeat('winner')
    setPartyAt(performance.now())
    sfx('fanfare', 1)
    after(3200, () => setPartyAt(0))
    after(WINNER_MS, () => {
      beatRef.current = 'result'
      setBeat('result')
      sfx('chime', 0.7)
    })
    after(WINNER_MS + RESULT_MS, () => {
      beatRef.current = 'outro'
      setBeat('outro')
      setPartyAt(performance.now())
      sfx('fanfare', 1)
    })
    after(WINNER_MS + RESULT_MS + OUTRO_MS, () => {
      if (stopRec.current) {
        stopRec.current()
        say('🎬 Video saved to your downloads')
      }
    })
  }, [after, say])

  /**
   * The end of the climb, once the champion is up: everyone in, or the
   * stragglers' time up. A climber still within touching distance of the
   * finish gets another moment rather than being lifted onto its cloud from
   * three metres below — that shot is indistinguishable from a climber that
   * couldn't get there at all, and it throws away the best bit of the race.
   */
  const stragglers = useCallback(
    (firstAt: number, wasAt = 0) => {
      const s = simRef.current
      if (!s || endedRef.current) return
      const done = s.places.length >= s.racers.length
      const waited = performance.now() - firstAt
      // The highest anyone still climbing has reached.
      const high = s.racers.reduce((m, r) => (r.phase === 'done' ? m : Math.max(m, r.best)), 0)
      // Worth waiting for only while they are both nearly there and still
      // gaining ground. A climber pinned five metres short is not going to make
      // it, and holding the shot on it for another twenty seconds pads the
      // episode with nothing happening.
      const worth = s.goal - high < CLOSE_M && high > wasAt + 0.5
      if (done || waited >= STRAGGLER_MAX_MS || !worth) {
        finish()
        return
      }
      after(STRAGGLER_STEP_MS, () => stragglers(firstAt, high))
    },
    [after, finish],
  )
  const stragglersRef = useRef(stragglers)
  stragglersRef.current = stragglers

  /** Whatever the simulation wants the show to know about. */
  const onEvent = useCallback(
    (lane: number, ev: JumpEvent) => {
      if (ev.kind === 'save') {
        const name = cfgRef.current?.picks[lane]?.name ?? 'Someone'
        setFlash({ text: `🎈 Bubble rescue for ${name}!`, kind: 'save', at: performance.now() })
        return
      }
      // A finish. The first one is the champion; the rest get a little longer
      // to come in before the episode moves on without them.
      const s = simRef.current
      if (!s) return
      if (s.places.length === 1) {
        setWinner(lane)
        sfx('finish', 1)
        const firstAt = performance.now()
        after(STRAGGLER_MS, () => stragglersRef.current(firstAt))
      }
      if (s.places.length >= s.racers.length) after(1400, finish)
    },
    [after, finish],
  )

  const start = useCallback(
    async (config: JumpConfig, record: boolean) => {
      initAudio() // runs from a click, so the browser lets audio start
      clearTimers()
      if (record) {
        // Before the capture picker, not after: it consumes the click's
        // activation, and fullscreen needs a live one.
        enterFullscreen()
        const ok = await startRecording(true)
        if (!ok) {
          exitFullscreen()
          return
        }
      }
      const built = buildSim(config)
      simRef.current = built
      cfgRef.current = config
      endedRef.current = false
      setSim(built)
      setCfg(config)
      setDesigns(config.picks.map((p) => designFor(p, library)))
      setStandings([])
      setWinner(-1)
      setFlash(null)
      leaderRef.current = -1
      setPartyAt(0)
      setCount(3)
      beatRef.current = 'title'
      setBeat('title')
      setChromeOpen(false)
      // Esc is the only way back once the show starts, so say so once — but
      // never while filming, where the hint would land in the video.
      if (!record) after(900, () => say('Press Esc for controls'))

      // Title card, then 3 - 2 - 1 - GO, then they're off.
      after(TITLE_MS, () => {
        beatRef.current = 'ready'
        setBeat('ready')
        for (let i = 0; i < 3; i++) {
          after(i * COUNT_MS, () => {
            setCount(3 - i)
            sfx(i === 2 ? 'beepHi' : 'beep', 0.8)
          })
        }
        after(3 * COUNT_MS, () => {
          setCount(0)
          sfx('go', 1)
        })
      })
      after(TITLE_MS + READY_MS, () => {
        beatRef.current = 'climb'
        setBeat('climb')
        startClimb(built)
      })
      // However badly a climb goes, the episode still ends.
      after(TITLE_MS + READY_MS + MAX_CLIMB_MS, finish)
    },
    [after, clearTimers, finish, library, say, startRecording],
  )

  const backToSetup = useCallback(() => {
    clearTimers()
    if (stopRec.current) stopRec.current()
    exitFullscreen()
    simRef.current = null
    setSim(null)
    setCfg(null)
    setChromeOpen(false)
  }, [clearTimers])

  // --- The leaderboard ----------------------------------------------------
  // Sampled off the simulation a few times a second. Reading it every frame
  // would mean re-rendering the whole page on every bounce, and the numbers
  // are only ever read at walking pace anyway.
  useEffect(() => {
    if (!sim) return
    const tick = () => {
      const order = ranking(sim.racers)
      setStandings(
        order.map((r: Racer) => ({
          lane: r.lane,
          // A climber that didn't reach the cloud never reads as 100%, however
          // close it got: "100%" next to third place and no finishing time
          // looks like a scoring bug rather than a near miss.
          pct: r.finishAt > 0 ? 100 : Math.min(99, pct(r.best, sim.goal)),
          stars: r.stars,
          saves: r.saves,
          bumps: r.bumps,
          time: r.finishAt,
        })),
      )
      // A change at the top of the board is the story of the climb, so it gets
      // called out — but not while the pack is still bunched on the bottom
      // few platforms, where the lead swaps every other bounce.
      const lead = order[0]
      if (!lead || beatRef.current !== 'climb') return
      if (leaderRef.current === -1) {
        leaderRef.current = lead.lane
        return
      }
      if (lead.lane !== leaderRef.current && lead.best > 6 && !lead.finishAt) {
        leaderRef.current = lead.lane
        const name = cfgRef.current?.picks[lead.lane]?.name ?? 'Someone'
        setFlash({ text: `🔥 ${name} takes the lead!`, kind: 'lead', at: performance.now() })
        sfx('boost', 0.5)
      }
    }
    tick()
    const id = setInterval(tick, 160)
    return () => clearInterval(id)
  }, [sim])

  // The mid-climb banner clears itself.
  useEffect(() => {
    if (!flash) return
    const id = setTimeout(() => setFlash((f) => (f === flash ? null : f)), 2200)
    return () => clearTimeout(id)
  }, [flash])

  // --- Input --------------------------------------------------------------
  const soundRef = useRef(soundOn)
  soundRef.current = soundOn
  const toggleSound = useCallback(() => {
    const next = !soundRef.current
    setSoundOn(next)
    setAudioEnabled(next)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') {
        if (recSupported) toggleRecording()
      } else if (e.key === 'm' || e.key === 'M') {
        toggleSound()
      } else if (e.key === 'Escape') {
        // In the show, Esc is the way to the controls rather than the way out —
        // leaving is the Settings chip, which they get to from here.
        if (simRef.current) setChromeOpen((open) => !open)
        else onExit()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onExit, recSupported, toggleRecording, toggleSound])

  // --- Render -------------------------------------------------------------
  if (!cfg || !sim) {
    return <JumpSetup saved={library} onStart={start} onExit={onExit} />
  }

  const colors = designs.map((d) => avatarColors(d).body)
  const cam: JumpCam =
    beat === 'title' || beat === 'ready' ? 'title' : beat === 'climb' ? 'climb' : 'top'
  const order = ranking(sim.racers)
  const champion = winner >= 0 ? winner : order[0]?.lane ?? 0

  return (
    <div className="jump">
      <Canvas shadows camera={{ position: [0, 3, 14], fov: 45 }} dpr={[1, 2]}>
        <JumpStage
          sim={sim}
          designs={designs}
          colors={colors}
          cam={cam}
          env={cfg.env}
          onEvent={onEvent}
        />
      </Canvas>

      {partyAt > 0 && <Confetti key={partyAt} count={beat === 'outro' ? 120 : 90} />}

      {/* Opening card. */}
      {beat === 'title' && (
        <div className="show-overlay">
          <div className="show-card title">
            <div className="show-kicker">Cube Kids</div>
            <h1 className="show-title">{episodeTitle(cfg.picks.length)}</h1>
            <p className="show-sub">First one to the top cloud wins! ☁️</p>
            <div className="show-strip">
              {designs.map((d, i) => (
                <div
                  className="show-face"
                  key={i}
                  style={{ ['--lane-color' as string]: colors[i] }}
                >
                  <AnimalAvatar design={d} colors={avatarColors(d)} size={64} />
                  <span className="show-facename">{cfg.picks[i].name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {beat === 'ready' && (
        <div className="jump-count" key={count}>
          {count === 0 ? 'GO!' : count}
        </div>
      )}

      {/* The climb keeps one line of chrome: how far the leader has got. The
          standings used to run down the right-hand edge, but a column of names
          over a vertical race covers the towers it is describing — the animals
          racing each other up the screen say who is winning better than a
          leaderboard does. The placings still get their card at the end. */}
      {beat === 'climb' && (
        <div className="jump-kicker">
          <span className="jump-goal">☁️ {standings[0]?.pct ?? 0}% of the way up</span>
        </div>
      )}

      {/* Whoever just took the lead, or whoever a bubble just went down for. */}
      {flash && beat === 'climb' && (
        <div className={`jump-flash ${flash.kind}`} key={flash.at}>
          {flash.text}
        </div>
      )}

      {/* The champion, called the moment they touch the cloud. */}
      {winner >= 0 && (beat === 'climb' || beat === 'winner') && designs[winner] && (
        <div
          className="jump-winner"
          style={{ ['--c' as string]: colors[winner] }}
        >
          <AnimalAvatar design={designs[winner]} colors={avatarColors(designs[winner])} size={92} />
          <div className="jump-winner-text">
            <span className="jump-winner-kicker">Top of the sky!</span>
            <span className="jump-winner-name">{cfg.picks[winner].name} wins! 🏆</span>
          </div>
        </div>
      )}

      {/* Placings. */}
      {beat === 'result' && (
        <div className="show-overlay">
          <div className="show-card title">
            <div className="show-kicker">Final standings</div>
            <h1 className="show-title">To the top! 🏁</h1>
            <ol className="jump-results">
              {standings.map((s, place) => (
                <li key={s.lane} style={{ ['--c' as string]: colors[s.lane] }}>
                  <span className="jump-medal">
                    {place === 0 ? '🥇' : place === 1 ? '🥈' : place === 2 ? '🥉' : place + 1}
                  </span>
                  <AnimalAvatar
                    design={designs[s.lane]}
                    colors={avatarColors(designs[s.lane])}
                    size={44}
                  />
                  <span className="jump-name">{cfg.picks[s.lane].name}</span>
                  <span className="jump-score">
                    {s.time > 0 ? fmtTime(s.time) : `${s.pct}%`}
                  </span>
                  <span className="jump-extra">
                    ⭐{s.stars} 🧊{s.bumps} 🎈{s.saves}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}

      {beat === 'outro' && (
        <div className="show-overlay">
          <div className="show-card title">
            <div className="show-kicker">That's a wrap!</div>
            <h1 className="show-title">
              {designs[champion] ? `${cfg.picks[champion].name} touched the sky! ☁️` : 'What a climb!'}
            </h1>
            <div className="show-strip">
              {designs.map((d, i) => (
                <div
                  className="show-face"
                  key={i}
                  style={{ ['--lane-color' as string]: colors[i] }}
                >
                  <AnimalAvatar design={d} colors={avatarColors(d)} size={64} />
                  <span className="show-facename">{cfg.picks[i].name}</span>
                </div>
              ))}
            </div>
            <p className="show-ask">Who would you have picked? Shout it out! 🗣️</p>
            <p className="show-sub">Like &amp; subscribe for more cube climbs ☁️</p>
          </div>
        </div>
      )}

      {toast && <div className="clean-toast">{toast}</div>}

      {/* Hidden until Esc: nothing but the show is on screen otherwise. */}
      {chromeOpen && (
        <div className="play-corner">
          {recSupported && (
            <button
              className={`corner-chip ${recording ? 'rec' : ''}`}
              onClick={() => toggleRecording()}
              title="Record this episode to a video file"
            >
              {recording ? '■ Stop rec' : '⏺ Record'}
            </button>
          )}
          <button
            className={`corner-chip ${soundOn ? 'on' : ''}`}
            onClick={() => toggleSound()}
            title="Sound effects (M)"
          >
            {soundOn ? '🔊 Sound' : '🔇 Muted'}
          </button>
          <button className="corner-chip" onClick={backToSetup} title="Back to the setup screen">
            ⚙ Settings
          </button>
          <button
            className="corner-chip"
            onClick={() => setChromeOpen(false)}
            title="Hide these again (Esc)"
          >
            ✕ Hide
          </button>
        </div>
      )}
    </div>
  )
}
