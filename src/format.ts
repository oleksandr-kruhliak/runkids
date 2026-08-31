// Race clock formatting. Laps can run to five minutes, and "312.4s" reads as
// a number rather than a duration, so anything past a minute switches to
// m:ss.t. Tenths are kept throughout — they are how close finishes are read.

/** Bare clock: "12.4" under a minute, "5:12.4" beyond it. */
export function clock(secs: number): string {
  if (secs < 60) return secs.toFixed(1)
  const m = Math.floor(secs / 60)
  return `${m}:${(secs - m * 60).toFixed(1).padStart(4, '0')}`
}

/** Inline clock with its unit: "12.4s" / "5:12.4". */
export function clockUnit(secs: number): string {
  return secs < 60 ? `${secs.toFixed(1)}s` : clock(secs)
}

/** True when `clock` has switched to m:ss.t and no "s" suffix belongs. */
export function isLong(secs: number): boolean {
  return secs >= 60
}
