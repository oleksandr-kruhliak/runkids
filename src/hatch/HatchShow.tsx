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
import HatchSetup from './HatchSetup'
import HatchStage, { CamMode, StageEgg } from './HatchStage'
import { rng, styleFor } from './eggGeo'
import { pickTools } from './tools'
import { PAINTERS, PainterDef, pickPainter, pickPatternPainter } from './painters'
import {
  ADMIRE_MS,
  BURST_MS,
  DROP_SETTLE_MS,
  EggRuntime,
  HatchBeat,
  HatchConfig,
  HIT_GAP_MS,
  OUTRO_MS,
  PAINT_EACH_MS,
  PARADE_MS,
  RECAP_EACH_MS,
  SETTLE_MS,
  TITLE_MS,
  designFor,
  dropBeatMs,
  dropStartMs,
  episodeTitle,
  freshEggs,
  meetMsFor,
  paintBeatMs,
  paintStartMs,
  recapMs,
  rollHits,
} from './model'
import '../styles.css'
import './hatch.css'

// The Egg Hatch page. It runs the same way the race auto-show does: a chain of
// timed beats the app walks through by itself, so an episode films itself
// without anyone touching the keyboard. In "tap to smash" mode the only thing
// the viewer controls is when the tool falls.
//
// Each egg rolls its own tool and its own number of blows when the episode
// starts, so the swing timings come from whichever tool is currently up rather
// than from one fixed pair of constants.

/** How long the finished row holds before the sign-off card slides in. */
const CARD_MS = 2600

/** Portrait tint for a design — its body block's colour. */
function avatarColors(design: AnimalDesign): AnimalColors {
  const body = design.blocks.find((b) => b.role === 'body') ?? design.blocks[0]
  const c = body?.color ?? '#e8734a'
  return { body: c, belly: c, ear: c }
}

export default function HatchShow({ onExit }: { onExit: () => void }) {
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
  const [cfg, setCfg] = useState<HatchConfig | null>(null)
  const [eggs, setEggs] = useState<StageEgg[]>([])
  const [state, setState] = useState<EggRuntime[]>([])
  const [beat, setBeat] = useState<HatchBeat>('title')
  const [idx, setIdx] = useState(0)
  const [swingAt, setSwingAt] = useState(0)
  const [shakeAt, setShakeAt] = useState(0)
  const [partyAt, setPartyAt] = useState(0)
  /** performance.now() the painter set off; 0 once the painting beat is over. */
  const [paintSince, setPaintSince] = useState(0)
  /** The rig currently on stage — the base coat's, then the pattern pass's. */
  const [painter, setPainter] = useState<PainterDef>(PAINTERS[0])
  /** The two rigs this episode drew: one per pass. */
  const painterRef = useRef<PainterDef>(PAINTERS[0])
  const patternRef = useRef<PainterDef>(PAINTERS[0])
  /** performance.now() the animals set off for the curtain call. */
  const [paradeAt, setParadeAt] = useState(0)
  const [cheering, setCheering] = useState(false)
  /** Which animal the recap is naming right now. */
  const [recapIdx, setRecapIdx] = useState(0)
  const [cardUp, setCardUp] = useState(false)
  /**
   * The show runs with no app chrome on screen at all — it's meant to be
   * filmed, and anything that isn't the show would end up in the video. Esc
   * brings the controls up when someone actually wants them.
   */
  const [chromeOpen, setChromeOpen] = useState(false)
  const [soundOn, setSoundOn] = useState(true)
  const [toast, setToast] = useState<string | null>(null)

  // Mirrors for the timer chain, which outlives any single render.
  const cfgRef = useRef<HatchConfig | null>(null)
  /** The built stage — each egg's rolled tool and hit count live here. */
  const eggsRef = useRef<StageEgg[]>([])
  const idxRef = useRef(0)
  const hitsRef = useRef(0)
  const beatRef = useRef<HatchBeat>('title')
  const busyUntil = useRef(0)
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
  // The beats call each other in a ring (a blow leads to the next egg, which
  // leads to more blows), so the two that close the loop are reached through
  // refs that are filled in once every callback below exists.
  const goEggRef = useRef<(i: number) => void>(() => {})
  const finishRef = useRef<() => void>(() => {})
  const paradeRef = useRef<() => void>(() => {})
  const recapRef = useRef<(count: number) => void>(() => {})
  const admireRef = useRef<() => void>(() => {})
  const paintPassRef = useRef<(pass: 'paint' | 'pattern') => void>(() => {})

  /** One blow lands: either another crack, or the shell gives way. */
  const land = useCallback(() => {
    const config = cfgRef.current
    const egg = eggsRef.current[idxRef.current]
    if (!config || !egg) return
    const i = idxRef.current
    const now = performance.now()
    const hits = hitsRef.current + 1
    hitsRef.current = hits
    setShakeAt(now)

    if (hits < egg.hits) {
      // Each tool has its own voice for the blow.
      sfx(egg.tool.hit, 0.9)
      sfx('thud', 0.5)
      setState((s) => s.map((e, n) => (n === i ? { ...e, hits, hitAt: now } : e)))
      return
    }

    // The shell breaks. The animal is already climbing out by the time the
    // shards land, so the reveal never feels like it waits for the debris.
    sfx('smash', 1)
    sfx('pop', 0.8)
    setState((s) => s.map((e, n) => (n === i ? { ...e, hits, hitAt: now, breakAt: now } : e)))
    setPartyAt(now)
    after(180, () => sfx('boing', 0.7))
    after(BURST_MS, () => {
      beatRef.current = 'meet'
      setBeat('meet')
      sfx('chime', 0.8)
    })
    after(3400, () => setPartyAt(0))
    // The showcase takes up whatever's left of this egg's time budget, so a
    // tough egg (more blows) lingers less on the animal than an easy one.
    const meet = meetMsFor(config.avgEgg, egg.hits)
    after(BURST_MS + meet, () => {
      const next = i + 1
      if (next < config.picks.length) goEggRef.current(next)
      else paradeRef.current()
    })
  }, [after])

  /** Start a swing; the blow lands part-way through it. */
  const swing = useCallback(() => {
    const config = cfgRef.current
    const egg = eggsRef.current[idxRef.current]
    if (!config || !egg) return
    const now = performance.now()
    if (now < busyUntil.current) return
    const { swingMs, impactMs } = egg.tool
    busyUntil.current = now + swingMs
    setSwingAt(now)
    sfx('wind', 0.35)
    after(impactMs, land)
    if (config.auto && hitsRef.current + 1 < egg.hits) {
      after(swingMs + HIT_GAP_MS, () => swingRef.current())
    }
  }, [after, land])
  const swingRef = useRef(swing)
  swingRef.current = swing

  /** Move the camera to egg `i` and (in auto mode) start swinging. */
  const goEgg = useCallback(
    (i: number) => {
      const config = cfgRef.current
      if (!config) return
      idxRef.current = i
      hitsRef.current = 0
      busyUntil.current = 0
      setIdx(i)
      beatRef.current = 'smash'
      setBeat('smash')
      setSwingAt(0)
      setPaintSince(0) // the cloud has done its job and drifted off
      if (config.auto) after(SETTLE_MS, swing)
    },
    [after, swing],
  )

  /**
   * The cold open: the nests are empty and the eggs come down out of the sky,
   * one after another, bouncing into place. Like the painting beat, every
   * egg's start time is stamped in up front so each one falls on its own clock.
   */
  const dropEggs = useCallback(() => {
    const config = cfgRef.current
    if (!config) return
    const count = config.picks.length
    const now = performance.now()
    beatRef.current = 'drop'
    setBeat('drop')
    setState((s) => s.map((e, i) => ({ ...e, dropAt: now + dropStartMs(i) })))
    for (let i = 0; i < count; i++) {
      // The thud lands with the egg, not when it was let go.
      after(dropStartMs(i) + DROP_SETTLE_MS * 0.55, () => {
        sfx('thud', 0.75)
        sfx('pop', 0.4)
      })
    }
    after(dropBeatMs(count), () => paintPassRef.current('paint'))
  }, [after])

  /**
   * A painter works down the row. Run twice: once for the base coat, then
   * again — with a different rig — to stamp the patterns on. Every egg's start
   * time is stamped in up front, so the shells take their colour on their own
   * clock and the beat needs no ticking.
   */
  const paintPass = useCallback(
    (pass: 'paint' | 'pattern') => {
      const config = cfgRef.current
      if (!config) return
      const count = config.picks.length
      const now = performance.now()
      const rig = pass === 'paint' ? painterRef.current : patternRef.current
      beatRef.current = pass
      setBeat(pass)
      setPainter(rig)
      setPaintSince(now)
      setState((s) =>
        s.map((e, i) =>
          pass === 'paint'
            ? { ...e, paintAt: now + paintStartMs(i) }
            : { ...e, patternAt: now + paintStartMs(i) },
        ),
      )
      // Whatever this painter sounds like, once per egg, and a chime as the
      // colour finishes taking.
      for (let i = 0; i < count; i++) {
        after(paintStartMs(i), () => sfx(rig.sfx, 0.5))
        after(paintStartMs(i) + PAINT_EACH_MS * 0.55, () => sfx('chime', 0.35))
      }
      after(paintBeatMs(count), () =>
        pass === 'paint' ? paintPassRef.current('pattern') : admireRef.current(),
      )
    },
    [after],
  )

  /** A moment on the finished row before anything gets broken. */
  const admire = useCallback(() => {
    beatRef.current = 'admire'
    setBeat('admire')
    setPaintSince(0) // the painter's work is done; it drifts off
    sfx('fanfare', 0.5)
    after(ADMIRE_MS, () => goEggRef.current(0))
  }, [after])

  /**
   * The curtain call: every animal steps down off its nest, walks forward and
   * celebrates together. It's the shot the whole episode has been building to.
   */
  const parade = useCallback(() => {
    const count = cfgRef.current?.picks.length ?? 0
    beatRef.current = 'parade'
    setBeat('parade')
    setParadeAt(performance.now())
    setPartyAt(performance.now())
    sfx('fanfare', 1)
    // They cheer once the whole line has arrived, not one at a time.
    after(3000, () => {
      setCheering(true)
      sfx('chime', 0.6)
    })
    after(PARADE_MS, () => recapRef.current(count))
  }, [after])

  /** One at a time down the line, with their names. */
  const recap = useCallback(
    (count: number) => {
      beatRef.current = 'recap'
      setBeat('recap')
      setCheering(false)
      setRecapIdx(0)
      for (let i = 1; i < count; i++) {
        after(i * RECAP_EACH_MS, () => {
          setRecapIdx(i)
          sfx('pop', 0.5)
        })
      }
      after(recapMs(count), () => finishRef.current())
    },
    [after],
  )

  /** Credits. */
  const finish = useCallback(() => {
    beatRef.current = 'outro'
    setBeat('outro')
    setPartyAt(performance.now())
    sfx('fanfare', 1)
    // A beat on the whole line first — the card waits its turn.
    after(CARD_MS, () => setCardUp(true))
    after(OUTRO_MS, () => {
      if (stopRec.current) {
        stopRec.current()
        say('🎬 Video saved to your downloads')
      }
    })
  }, [after, say])

  // Close the ring now that every end of it exists.
  goEggRef.current = goEgg
  finishRef.current = finish
  paradeRef.current = parade
  recapRef.current = recap
  admireRef.current = admire
  paintPassRef.current = paintPass
  const dropRef = useRef(dropEggs)
  dropRef.current = dropEggs

  const start = useCallback(
    async (config: HatchConfig, record: boolean) => {
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
      // Roll the episode: two painters — one for the base coat, a different
      // one for the pattern pass — then a tool and a toughness for every egg.
      // Separate streams, so how many draws one takes can't shift the others.
      const rig = pickPainter(rng(config.seed + 7), config.painter)
      const patternRig = pickPatternPainter(rng(config.seed + 13), rig, config.painter)
      const tools = pickTools(config.picks.length, rng(config.seed + 31), config.tool)
      const hitCounts = rollHits(config.picks.length, config.maxHits, rng(config.seed + 977))
      const built: StageEgg[] = config.picks.map((p, i) => ({
        style: styleFor(i, config.seed),
        seed: config.seed + i * 977,
        design: designFor(p, library),
        name: p.name,
        tool: tools[i],
        hits: hitCounts[i],
      }))
      cfgRef.current = config
      eggsRef.current = built
      idxRef.current = 0
      hitsRef.current = 0
      busyUntil.current = 0
      painterRef.current = rig
      patternRef.current = patternRig
      setPainter(rig)
      setCfg(config)
      setEggs(built)
      setState(freshEggs(built.length))
      setIdx(0)
      setSwingAt(0)
      setPartyAt(0)
      setPaintSince(0)
      setParadeAt(0)
      setCheering(false)
      setRecapIdx(0)
      setCardUp(false)
      beatRef.current = 'title'
      setBeat('title')
      setChromeOpen(false)
      // Esc is the only way back once the show starts, so say so once — but
      // never while filming, where the hint would land in the video.
      if (!record) after(900, () => say('Press Esc for controls'))
      // Title card, the eggs drop in, they get their colours, then the smashing.
      after(TITLE_MS, () => dropRef.current())
    },
    [after, clearTimers, library, say, startRecording],
  )

  const backToSetup = useCallback(() => {
    clearTimers()
    if (stopRec.current) stopRec.current()
    exitFullscreen()
    cfgRef.current = null
    eggsRef.current = []
    setCfg(null)
    setChromeOpen(false)
  }, [clearTimers])

  // --- Input --------------------------------------------------------------
  const soundRef = useRef(soundOn)
  soundRef.current = soundOn
  const toggleSound = useCallback(() => {
    const next = !soundRef.current
    setSoundOn(next)
    setAudioEnabled(next)
  }, [])

  const tap = useCallback(() => {
    const config = cfgRef.current
    if (!config || config.auto) return
    if (beatRef.current !== 'smash') return
    initAudio()
    swing()
  }, [swing])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        tap()
      } else if (e.key === 'r' || e.key === 'R') {
        if (recSupported) toggleRecording()
      } else if (e.key === 'm' || e.key === 'M') {
        toggleSound()
      } else if (e.key === 'Escape') {
        // In the show, Esc is the way to the controls rather than the way out —
        // leaving is the Settings chip, which they get to from here.
        if (cfgRef.current) setChromeOpen((open) => !open)
        else onExit()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onExit, recSupported, tap, toggleRecording, toggleSound])

  // --- Render -------------------------------------------------------------
  if (!cfg) {
    return <HatchSetup saved={library} onStart={start} onExit={onExit} />
  }

  const painting = beat === 'paint' || beat === 'pattern'
  const cam: CamMode =
    beat === 'title' || beat === 'outro' || beat === 'admire' || beat === 'parade'
      ? beat === 'parade'
        ? 'parade'
        : 'wide'
      : beat === 'drop'
        ? 'drop'
        : painting
          ? 'paint'
          : beat === 'recap'
            ? 'recap'
            : 'focus'
  // Every beat but the smashing plays across the whole row, so there's no
  // single egg for the stage to centre on — except the recap, which walks the
  // line naming one animal at a time.
  const active = cam === 'focus' ? idx : cam === 'recap' ? recapIdx : -1
  const current = eggs[idx]
  const hatched = (state[idx]?.breakAt ?? 0) > 0
  const partyOn = partyAt > 0

  return (
    <div className="hatch" onPointerDown={tap}>
      <Canvas shadows camera={{ position: [0, 3.4, 12], fov: 45 }} dpr={[1, 2]}>
        <HatchStage
          eggs={eggs}
          state={state}
          active={active}
          swingAt={swingAt}
          toolOn={beat === 'smash' && !hatched}
          cam={cam}
          painter={painter}
          patternFill={patternRef.current.fill}
          paintSince={paintSince}
          paradeAt={paradeAt}
          cheering={cheering}
          shakeAt={shakeAt}
          env={cfg.env}
        />
      </Canvas>

      {partyOn && <Confetti key={partyAt} count={beat === 'outro' ? 120 : 70} />}

      {/* Opening card: the animals stay a secret, so the eggs do the talking. */}
      {beat === 'title' && (
        <div className="show-overlay">
          <div className="show-card title">
            <div className="show-kicker">Cube Kids</div>
            <h1 className="show-title">{episodeTitle(eggs.length)}</h1>
            <p className="show-sub">Who is hiding inside? 🤔</p>
            {/* Neutral tiles: the eggs are still blank at this point, and the
                cloud hasn't given their colours away yet either. */}
            <div className="show-strip">
              {eggs.map((_, i) => (
                <div className="show-face" key={i} style={{ ['--lane-color' as string]: '#cbd5e1' }}>
                  <span className="hatch-eggface">🥚</span>
                  <span className="show-facename">Egg {i + 1}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* The painting beat gets its own caption — there's no egg number yet
          because the cloud is working down the whole row. */}
      {beat === 'drop' && (
        <div className="hatch-kicker">
          <span className="hatch-count">Here they come! 🥚</span>
        </div>
      )}

      {painting && (
        <div className="hatch-kicker">
          <span className="hatch-count">
            {painter.icon} {beat === 'pattern' ? 'Now the patterns!' : `${painter.label}!`}
          </span>
        </div>
      )}

      {beat === 'admire' && (
        <div className="hatch-kicker">
          <span className="hatch-count">All painted! ✨</span>
        </div>
      )}

      {beat === 'parade' && (
        <div className="hatch-kicker">
          <span className="hatch-count">Take a bow! 🎉</span>
        </div>
      )}

      {/* Recap: the camera walks the line and names them one at a time. */}
      {beat === 'recap' && eggs[recapIdx] && (
        <div
          className="hatch-reveal"
          key={recapIdx}
          style={{ ['--c' as string]: avatarColors(eggs[recapIdx].design).body }}
        >
          <AnimalAvatar
            design={eggs[recapIdx].design}
            colors={avatarColors(eggs[recapIdx].design)}
            size={92}
          />
          <div className="hatch-reveal-text">
            <span className="hatch-reveal-kicker">Egg {recapIdx + 1} was…</span>
            <span className="hatch-reveal-name">{eggs[recapIdx].name}!</span>
          </div>
        </div>
      )}

      {/* Which egg we're on and what's hitting it. How many blows it still has
          left is deliberately not shown — not knowing when the shell is about
          to go is the whole tension of the beat. It stays up through the
          reveal so it never blinks out. */}
      {(beat === 'smash' || beat === 'meet') && current && (
        <div className="hatch-kicker">
          <span className="hatch-count">
            Egg {idx + 1} of {eggs.length}
          </span>
          <span className="hatch-tool">
            {current.tool.icon} {current.tool.label}
          </span>
        </div>
      )}

      {beat === 'smash' && !cfg.auto && (
        <div className="hatch-tap">{current?.tool.icon ?? '🔨'} Tap to smash!</div>
      )}

      {/* The reveal: a lower third with the animal's portrait and name. */}
      {beat === 'meet' && current && (
        <div
          className="hatch-reveal"
          style={{ ['--c' as string]: avatarColors(current.design).body }}
        >
          <AnimalAvatar design={current.design} colors={avatarColors(current.design)} size={92} />
          <div className="hatch-reveal-text">
            <span className="hatch-reveal-kicker">It's a…</span>
            <span className="hatch-reveal-name">{current.name}!</span>
          </div>
        </div>
      )}

      {beat === 'outro' && cardUp && (
        <div className="show-overlay">
          <div className="show-card title">
            <div className="show-kicker">That's a wrap!</div>
            <h1 className="show-title">All hatched! 🐣</h1>
            <div className="show-strip">
              {eggs.map((e, i) => (
                <div
                  className="show-face"
                  key={i}
                  style={{ ['--lane-color' as string]: avatarColors(e.design).body }}
                >
                  <AnimalAvatar design={e.design} colors={avatarColors(e.design)} size={64} />
                  <span className="show-facename">{e.name}</span>
                </div>
              ))}
            </div>
            <p className="show-ask">Which egg was your favourite? Shout it out! 🗣️</p>
            <p className="show-sub">Like &amp; subscribe for more cube surprises 🥚</p>
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
            onClick={(e) => {
              e.stopPropagation()
              toggleRecording()
            }}
            title="Record this episode to a video file"
          >
            {recording ? '■ Stop rec' : '⏺ Record'}
          </button>
        )}
        <button
          className={`corner-chip ${soundOn ? 'on' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            toggleSound()
          }}
          title="Sound effects (M)"
        >
          {soundOn ? '🔊 Sound' : '🔇 Muted'}
        </button>
        <button
          className="corner-chip"
          onClick={(e) => {
            e.stopPropagation()
            backToSetup()
          }}
          title="Back to the setup screen"
        >
          ⚙ Settings
        </button>
        <button
          className="corner-chip"
          onClick={(e) => {
            e.stopPropagation()
            setChromeOpen(false)
          }}
          title="Hide these again (Esc)"
        >
          ✕ Hide
        </button>
      </div>
      )}
    </div>
  )
}
