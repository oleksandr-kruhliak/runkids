// Persistence for Animal Studio: a small library of designs kept in
// localStorage, plus JSON export/import so creations survive and can be shared.

import { AnimalDesign, coerceDesign, structuredCloneSafe } from './model'

const KEY = 'runkids.animals.v1'

export function loadLibrary(): AnimalDesign[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map(coerceDesign).filter(Boolean) as AnimalDesign[]
  } catch {
    return []
  }
}

export function saveLibrary(list: AnimalDesign[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // Storage may be unavailable (private mode / quota) — fail quietly.
  }
}

/** Insert or update a design by id, returning the new library list. */
export function upsertDesign(list: AnimalDesign[], design: AnimalDesign): AnimalDesign[] {
  const stamped = { ...structuredCloneSafe(design), updated: Date.now() }
  const idx = list.findIndex((d) => d.id === stamped.id)
  const next = idx >= 0 ? list.map((d, i) => (i === idx ? stamped : d)) : [stamped, ...list]
  saveLibrary(next)
  return next
}

export function deleteDesign(list: AnimalDesign[], id: string): AnimalDesign[] {
  const next = list.filter((d) => d.id !== id)
  saveLibrary(next)
  return next
}

export function exportDesign(design: AnimalDesign): void {
  const data = JSON.stringify(design, null, 2)
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${slug(design.name) || 'animal'}.animal.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function importDesignFile(file: File): Promise<AnimalDesign> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result))
        const design = coerceDesign(parsed)
        if (!design) return reject(new Error('Not a valid animal file'))
        resolve(design)
      } catch {
        reject(new Error('Could not read that file'))
      }
    }
    reader.onerror = () => reject(new Error('Could not read that file'))
    reader.readAsText(file)
  })
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}
