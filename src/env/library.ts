// Persistence for the Environment Studio (mirrors studio/library.ts).

import { EnvDesign, coerceEnv } from './model'

const KEY = 'runkids.envs.v1'

export function loadEnvLibrary(): EnvDesign[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map(coerceEnv).filter(Boolean) as EnvDesign[]
  } catch {
    return []
  }
}

export function saveEnvLibrary(list: EnvDesign[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // Storage may be unavailable — fail quietly.
  }
}

export function upsertEnv(list: EnvDesign[], design: EnvDesign): EnvDesign[] {
  const stamped = { ...design, params: { ...design.params, sky: { ...design.params.sky } }, updated: Date.now() }
  const idx = list.findIndex((d) => d.id === stamped.id)
  const next = idx >= 0 ? list.map((d, i) => (i === idx ? stamped : d)) : [stamped, ...list]
  saveEnvLibrary(next)
  return next
}

export function deleteEnv(list: EnvDesign[], id: string): EnvDesign[] {
  const next = list.filter((d) => d.id !== id)
  saveEnvLibrary(next)
  return next
}
