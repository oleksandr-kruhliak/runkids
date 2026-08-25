// The bundled animal pack (public/animal-pack) served as a built-in library.
// Designs load from the app's own files — they never touch localStorage (the
// 21 x ~2000-block pack is bigger than the storage quota), so they are always
// available and can't be lost. User-saved designs with the same id shadow the
// built-in version.

import { AnimalDesign, coerceDesign } from './model'

let cache: AnimalDesign[] | null = null
let pending: Promise<AnimalDesign[]> | null = null

export function loadBuiltins(): Promise<AnimalDesign[]> {
  if (cache) return Promise.resolve(cache)
  if (pending) return pending
  const base = import.meta.env.BASE_URL
  pending = fetch(`${base}animal-pack/manifest.json`)
    .then((r) => (r.ok ? r.json() : []))
    .then((manifest: { name: string; file: string }[]) =>
      Promise.all(
        (Array.isArray(manifest) ? manifest : []).map((m) =>
          fetch(`${base}animal-pack/${m.file}`)
            .then((r) => r.json())
            .then((j) => coerceDesign(j))
            .catch(() => null),
        ),
      ),
    )
    .then((list) => {
      cache = list.filter(Boolean) as AnimalDesign[]
      return cache
    })
    .catch(() => {
      pending = null
      return []
    })
  return pending
}

/** User designs first; built-ins fill in unless shadowed by the same id. */
export function mergeLibraries(custom: AnimalDesign[], builtins: AnimalDesign[]): AnimalDesign[] {
  const ids = new Set(custom.map((d) => d.id))
  return [...custom, ...builtins.filter((b) => !ids.has(b.id))]
}

/** Ids of built-in designs (for UI affordances like hiding delete). */
export function isBuiltinId(builtins: AnimalDesign[], id: string): boolean {
  return builtins.some((b) => b.id === id)
}
