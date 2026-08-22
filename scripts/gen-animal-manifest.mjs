// Scans public/models/animals for .glb files and writes a manifest.json.
import { readdirSync, writeFileSync } from 'node:fs'

const dir = 'public/models/animals'
let files = []
try {
  files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.glb'))
} catch {
  // directory missing — leave files empty
}

const pretty = (f) =>
  f
    .replace(/\.glb$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const manifest = files.sort().map((f) => ({ name: pretty(f), file: f }))
writeFileSync(`${dir}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n')

console.log(`Animal manifest: ${manifest.length} model(s)`)
for (const m of manifest) console.log(` - ${m.name}  =>  ${m.file}`)
