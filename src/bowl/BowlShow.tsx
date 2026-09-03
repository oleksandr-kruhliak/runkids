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
import BowlSetup from './BowlSetup'
import BowlStage, { BowlCam } from './BowlStage'
import {
  BowlBeat,
  BowlConfig,
  BowlEvent,
  COUNT_MS,
  MAX_RIDE_MS,
  MAX_SMASH_MS,
  NEXT_MS,
  OUTRO_MS,
  PIN_COUNT,
  READY_MS,
  RESULT_MS,
  Rider,
  SMASH_HOLD_MS,
  Sim,
  TITLE_MS,
  WINNER_MS,
  allSettled,
  buildSim,
  callIt,
  designFor,
  episodeTitle,
  finishAll,
  pct,
  ranking,
  riderSettled,
  settleAll,
  startRide,
  startRider,
} from './model'
import '../styles.css'
import './bowl.css'

// The Alpine Strike page — ten-pin bowling, played by the animals off the side
// of a mountain, filmed in one take. Same shape as the other three shows: a
// chain of timed beats the app walks through by itself, with two open-ended
// ones in the middle — the ride, which ends at the first arrival, and the
// smash, which ends when the last pin stops rolling.

/** Portrait tint for a design — its body block's colour. */
function avatarColors(design: AnimalDesign): AnimalColors {
  const body = design.blocks.find((b) => b.role === 'body') ?? design.blocks[0]
  const c = body?.color ?? '#e8734a'
  return { body: c, belly: c, ear: c }
}

/** One row of the live leaderboard, sampled off the simulation. */
interface Standing {
  lane: number
  /** How far down the mountain, 0-100. */
  pct: number
  /** How fast it is going right now — the number that decides the score. */
  speed: number
  pins: number
  /** Hazards clipped on the way down. */
  bumps: number
  /** Has it reached the deck? */
  rolled: boolean
  /** Has it set off at all? False while it waits its turn on the summit. */
  started: boolean
}

export default function BowlShow({ onExit }: { onExit: () => void }) {
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
  const [cfg, setCfg] = useState<BowlConfig | null>(null)
  const [sim, setSim] = useState<Sim | null>(null)
  const [designs, setDesigns] = useState<AnimalDesign[]>([])
  const [beat, setBeat] = useState<BowlBeat>('title')
  /** 3, 2, 1, then 0 for GO — or -1 for the "next up" card between turns. */
  const [count, setCount] = useState(3)
  /** In turns: whose ride it is, or -1 before the first drops in. */
  const [turn, setTurn] = useState(-1)
  const [standings, setStandings] = useState<Standing[]>([])
  /** Top of the board once the pins have settled; -1 until then. */
  const [winner, setWinner] = useState(-1)
  const [partyAt, setPartyAt] = useState(0)
  /**
   * The things worth shouting about mid-episode: a board reaching the deck and
   * a rack going over clean. Only one is on screen at a time — whichever
   * happened last — and it times itself out.
   */
  const [flash, setFlash] = useState<{
    text: string
    kind: 'roll' | 'strike'
    at: number
  } | null>(null)
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
  const cfgRef = useRef<BowlConfig | null>(null)
  const beatRef = useRef<BowlBeat>('title')
  const endedRef = useRef(false)
  const smashRef = useRef(false)
  const turnRef = useRef(-1)
  /** performance.now() of the most recent arrival — the smash beat's watchdog. */
  const lastArrival = useRef(0)
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

  /** The last beats: the champion's deck, the placings, the sign-off. */
  const finish = useCallback(() => {
    const s = simRef.current
    if (!s || endedRef.current) return
    endedRef.current = true
    // Whatever is still rolling stops where it stands, so the score on the
    // card is the score in the shot.
    settleAll(s)
    const top = ranking(s.riders, s.decks)[0]
    setWinner(top ? top.lane : -1)
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
   * The smash beat, polled: it runs until every board has stopped and every
   * pin with it, then holds a moment on the deck before the score card covers
   * it up. The hold is the point — the rack going over is the punchline of the
   * whole episode, and cutting on the last pin would step on it.
   */
  const watchDeck = useCallback(() => {
    const s = simRef.current
    if (!s || endedRef.current) return
    // The cap is measured from the last thing that happened, not from the first
    // board over the line. With "keep it close" off the field can string out
    // over ten seconds on a long mountain, and a cap counted from the first
    // arrival would cut the last rider off before it had rolled at all — the
    // beat should give up on nothing happening, not on a slow queue of things
    // happening.
    if (performance.now() - lastArrival.current >= MAX_SMASH_MS) {
      finish()
      return
    }
    const t = turnRef.current
    const done = s.mode === 'turns' ? riderSettled(s, t) : allSettled(s)
    if (done) {
      const more = s.mode === 'turns' && t + 1 < s.riders.length
      after(SMASH_HOLD_MS, () => (more ? nextTurnRef.current(t + 1) : finish()))
      return
    }
    after(180, watchDeck)
  }, [after, finish])
  const watchRef = useRef(watchDeck)
  watchRef.current = watchDeck
  const nextTurnRef = useRef<(i: number) => void>(() => {})

  /** Cut to the deck. The first board over the foul line triggers it. */
  const toSmash = useCallback(() => {
    if (smashRef.current || endedRef.current) return
    smashRef.current = true
    beatRef.current = 'smash'
    setBeat('smash')
    // Starts the watchdog even on the give-up path, where the ride ran out of
    // clock and nobody raised an arrival to stamp it.
    lastArrival.current = performance.now()
    after(120, () => watchRef.current())
  }, [after])

  /** One animal drops in. Its ride, then its smash, then whoever is next. */
  const startTurn = useCallback(
    (i: number) => {
      const s = simRef.current
      const c = cfgRef.current
      if (!s || !c || endedRef.current) return
      turnRef.current = i
      setTurn(i)
      smashRef.current = false
      startRider(s, i)
      beatRef.current = 'ride'
      setBeat('ride')
      setFlash({ text: `🛹 ${c.picks[i].name} drops in!`, kind: 'roll', at: performance.now() })
      // However badly this ride goes, the turn still ends — and only this
      // turn: a later one has its own clock.
      after(MAX_RIDE_MS, () => {
        if (turnRef.current !== i || endedRef.current) return
        finishAll(s)
        toSmash()
      })
    },
    [after, toSmash],
  )

  /** The card between turns: who is next, then GO. */
  const nextTurn = useCallback(
    (i: number) => {
      if (endedRef.current) return
      turnRef.current = i
      setTurn(i)
      beatRef.current = 'ready'
      setBeat('ready')
      setCount(-1)
      sfx('chime', 0.6)
      after(NEXT_MS, () => {
        setCount(0)
        sfx('go', 1)
      })
      after(NEXT_MS + COUNT_MS, () => startTurn(i))
    },
    [after, startTurn],
  )
  nextTurnRef.current = nextTurn

  /** Whatever the simulation wants the show to know about. */
  const onEvent = useCallback(
    (lane: number, ev: BowlEvent) => {
      const name = cfgRef.current?.picks[lane]?.name ?? 'Someone'
      if (ev.kind === 'strike') {
        setFlash({ text: `🎳 STRIKE! ${name} cleans up!`, kind: 'strike', at: performance.now() })
        sfx('fanfare', 0.8)
        setPartyAt(performance.now())
        after(2400, () => setPartyAt(0))
        return
      }
      if (ev.kind === 'arrive') {
        lastArrival.current = performance.now()
        setFlash({ text: `🛹 ${name} hits the deck!`, kind: 'roll', at: performance.now() })
        toSmash()
      }
    },
    [after, toSmash],
  )

  const start = useCallback(
    async (config: BowlConfig, record: boolean) => {
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
      smashRef.current = false
      lastArrival.current = 0
      setSim(built)
      setCfg(config)
      setDesigns(config.picks.map((p) => designFor(p, library)))
      setStandings([])
      setWinner(-1)
      setFlash(null)
      setPartyAt(0)
      setCount(3)
      turnRef.current = -1
      setTurn(-1)
      beatRef.current = 'title'
      setBeat('title')
      setChromeOpen(false)
      // Esc is the only way back once the show starts, so say so once — but
      // never while filming, where the hint would land in the video.
      if (!record) after(900, () => say('Press Esc for controls'))

      // Title card, then 3 - 2 - 1 - GO, then they're away.
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
        if (config.mode === 'turns') {
          startTurn(0)
          return
        }
        beatRef.current = 'ride'
        setBeat('ride')
        startRide(built)
        // However badly a ride goes, the episode still ends: everyone still on
        // the mountain is put on their deck at the speed they were carrying, so
        // they get the roll they earned rather than no roll at all.
        after(MAX_RIDE_MS, () => {
          const s = simRef.current
          if (!s || endedRef.current) return
          finishAll(s)
          toSmash()
        })
      })
    },
    [after, clearTimers, library, say, startRecording, startTurn, toSmash],
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
  // would mean re-rendering the whole page on every falling pin, and the
  // numbers are only ever read at walking pace anyway.
  useEffect(() => {
    if (!sim) return
    const tick = () => {
      setStandings(
        ranking(sim.riders, sim.decks).map((r: Rider) => ({
          lane: r.lane,
          pct: pct(r.z, sim.run),
          speed: r.v,
          pins: sim.decks[r.lane]?.score ?? 0,
          bumps: r.bumps,
          rolled: r.arriveAt > 0,
          started: r.phase !== 'ready',
        })),
      )
    }
    tick()
    const id = setInterval(tick, 160)
    return () => clearInterval(id)
  }, [sim])

  // The mid-episode banner clears itself.
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
    return <BowlSetup saved={library} onStart={start} onExit={onExit} />
  }

  const colors = designs.map((d) => avatarColors(d).body)
  const cam: BowlCam =
    beat === 'title' || beat === 'ready' ? 'title' : beat === 'ride' ? 'ride' : beat === 'smash' ? 'smash' : 'result'
  const champion = winner >= 0 ? winner : standings[0]?.lane ?? 0
  const leader = standings[0]
  // In turns the kicker follows whoever is riding, and the cameras frame only
  // that lane — except on the cards, which are about everyone.
  const onCards = beat === 'title' || beat === 'winner' || beat === 'result' || beat === 'outro'
  const focus = cfg.mode === 'turns' && !onCards && turn >= 0 ? turn : null
  const active = focus === null ? leader : standings.find((s) => s.lane === focus)

  return (
    <div className="bowl">
      <Canvas shadows camera={{ position: [0, 3, 14], fov: 45 }} dpr={[1, 2]}>
        <BowlStage
          sim={sim}
          designs={designs}
          colors={colors}
          cam={cam}
          focus={focus}
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
            <p className="show-sub">Ride down, smash the pins — most knocked over wins! 🎳</p>
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

      {beat === 'ready' && count === -1 && (
        <div className="bowl-count next" key="next">
          <small>Next up</small>
          {cfg.picks[turn]?.name ?? ''} 🛹
        </div>
      )}
      {beat === 'ready' && count >= 0 && (
        <div className="bowl-count" key={count}>
          {count === 0 ? 'GO!' : count}
        </div>
      )}

      {/* The ride and the smash share the board — only the last column changes,
          from how far down the mountain to how many pins are over. */}
      {(beat === 'ride' || beat === 'smash') && (
        <>
          <div className="bowl-kicker">
            <span className="bowl-goal">
              {beat === 'smash'
                ? '🎳 Pins down!'
                : focus !== null
                  ? `⛰ ${cfg.picks[focus].name}: ${active?.pct ?? 0}% down`
                  : `⛰ ${active?.pct ?? 0}% down the mountain`}
            </span>
          </div>
          <div className="bowl-board">
            {standings.map((s, place) => (
              <div
                className={`bowl-row-item ${s.rolled ? 'done' : ''}`}
                key={s.lane}
                style={{ ['--c' as string]: colors[s.lane] }}
              >
                <span className="bowl-place">{place + 1}</span>
                <AnimalAvatar
                  design={designs[s.lane]}
                  colors={avatarColors(designs[s.lane])}
                  size={30}
                />
                <span className="bowl-name">{cfg.picks[s.lane].name}</span>
                {s.rolled ? (
                  <span className="bowl-pins">🎳 {s.pins}</span>
                ) : s.started ? (
                  <span className="bowl-speed">⚡{Math.round(s.speed)}</span>
                ) : (
                  <span className="bowl-speed">…</span>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Whoever just reached the deck, or whoever just cleaned up. */}
      {flash && (beat === 'ride' || beat === 'smash') && (
        <div className={`bowl-flash ${flash.kind}`} key={flash.at}>
          {flash.text}
        </div>
      )}

      {/* The champion, once every pin has stopped moving. */}
      {winner >= 0 && beat === 'winner' && designs[winner] && (
        <div className="bowl-winner" style={{ ['--c' as string]: colors[winner] }}>
          <AnimalAvatar design={designs[winner]} colors={avatarColors(designs[winner])} size={92} />
          <div className="bowl-winner-text">
            <span className="bowl-winner-kicker">
              {callIt(sim.decks[winner]?.score ?? 0)}
            </span>
            <span className="bowl-winner-name">{cfg.picks[winner].name} wins! 🏆</span>
          </div>
        </div>
      )}

      {/* Placings. */}
      {beat === 'result' && (
        <div className="show-overlay">
          <div className="show-card title">
            <div className="show-kicker">Final standings</div>
            <h1 className="show-title">Pins down! 🎳</h1>
            <ol className="bowl-results">
              {standings.map((s, place) => (
                <li key={s.lane} style={{ ['--c' as string]: colors[s.lane] }}>
                  <span className="bowl-medal">
                    {place === 0 ? '🥇' : place === 1 ? '🥈' : place === 2 ? '🥉' : place + 1}
                  </span>
                  <AnimalAvatar
                    design={designs[s.lane]}
                    colors={avatarColors(designs[s.lane])}
                    size={44}
                  />
                  <span className="bowl-name">{cfg.picks[s.lane].name}</span>
                  <span className="bowl-score">
                    {s.pins === PIN_COUNT ? 'X' : s.pins}
                  </span>
                  <span className="bowl-extra">
                    {s.pins === PIN_COUNT ? '🎳 strike' : `🎳 ${s.pins}/10`} 🪨{s.bumps}
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
              {designs[champion]
                ? `${cfg.picks[champion].name} smashed it! 🎳`
                : 'What a ride!'}
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
            <p className="show-sub">Like &amp; subscribe for more cube bowling 🎳</p>
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
