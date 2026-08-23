import { useCallback, useReducer, useRef } from 'react'

interface Snap<T> {
  past: T[]
  present: T
  future: T[]
}

const LIMIT = 80 // cap on undo depth
const COALESCE_MS = 600 // merge same-tag edits within this window into one step

/**
 * Undo/redo history for a single value. `commit` replaces the present and
 * pushes the old value onto the undo stack; passing the same `tag` again within
 * a short window coalesces the edits into one step (so dragging a slider or
 * typing in a field is a single undo, not one per tick). `undo`/`redo` walk the
 * stacks. `reset`/`load` are provided for wholesale swaps.
 */
export function useHistory<T>(initial: T | (() => T)) {
  const ref = useRef<Snap<T>>({
    past: [],
    present: typeof initial === 'function' ? (initial as () => T)() : initial,
    future: [],
  })
  const lastTag = useRef<string | null>(null)
  const lastTime = useRef(0)
  const [, bump] = useReducer((n: number) => n + 1, 0)

  const commit = useCallback((next: T, tag?: string) => {
    const h = ref.current
    if (Object.is(next, h.present)) return
    const now = Date.now()
    const coalesce = !!tag && lastTag.current === tag && now - lastTime.current < COALESCE_MS
    lastTag.current = tag ?? null
    lastTime.current = now
    ref.current = coalesce
      ? { past: h.past, present: next, future: [] }
      : { past: [...h.past, h.present].slice(-LIMIT), present: next, future: [] }
    bump()
  }, [])

  const undo = useCallback(() => {
    const h = ref.current
    if (!h.past.length) return
    lastTag.current = null
    ref.current = {
      past: h.past.slice(0, -1),
      present: h.past[h.past.length - 1],
      future: [h.present, ...h.future],
    }
    bump()
  }, [])

  const redo = useCallback(() => {
    const h = ref.current
    if (!h.future.length) return
    lastTag.current = null
    ref.current = {
      past: [...h.past, h.present],
      present: h.future[0],
      future: h.future.slice(1),
    }
    bump()
  }, [])

  /** Swap in a whole new value as one undoable step (load / new / import). */
  const load = useCallback((next: T) => {
    const h = ref.current
    lastTag.current = null
    ref.current = { past: [...h.past, h.present].slice(-LIMIT), present: next, future: [] }
    bump()
  }, [])

  return {
    state: ref.current.present,
    commit,
    undo,
    redo,
    load,
    canUndo: ref.current.past.length > 0,
    canRedo: ref.current.future.length > 0,
  }
}
