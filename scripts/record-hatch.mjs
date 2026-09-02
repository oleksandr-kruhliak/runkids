#!/usr/bin/env node
// Generate a Surprise Eggs video without touching the app: drives the Egg
// Hatch page in headless Chrome and records the episode to a .webm file
// (YouTube-ready). The sibling of scripts/record-race.mjs.
//
// Usage (dev server must be running — `npm run dev`):
//   npm run record:hatch -- [options]
//   node scripts/record-hatch.mjs --eggs 5 --hits 3 --env Winter --out eggs.webm
//
// Options:
//   --eggs <n>         How many eggs to smash (1–8)          (default 4)
//   --pick <a,b,c>     Specific animals by name, in order; overrides --eggs
//   --hits <n>         Toughest egg: each one rolls 3..n blows  (default 6)
//   --tool <name>      Pin one tool ("Toy mallet", "Pickaxe", "Baseball
//                      bat", …) instead of a surprise one per egg
//   --env <name>       Environment chip: Summer | Winter | … (default Summer)
//   --weather <name>   Weather chip: Auto | None | Snow | …  (default Auto)
//   --out <file>       Output video path             (default eggs-<time>.webm)
//   --size <WxH>       Video size                            (default 1280x720)
//   --hold <seconds>   How long to linger on the outro card  (default 8)
//   --url <url>        App URL                (default http://localhost:5173)
//   --mp4              Also convert to .mp4 with ffmpeg

import { chromium } from 'playwright-core'
import { spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const args = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback
}
const flag = (name) => args.includes(`--${name}`)

const pick = opt('pick', '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const eggs = Math.max(1, Math.min(8, parseInt(opt('eggs', '4'), 10)))
const hits = Math.max(3, Math.min(9, parseInt(opt('hits', '6'), 10)))
const tool = opt('tool', '')
const env = opt('env', 'Summer')
const weather = opt('weather', 'Auto')
const out = opt('out', `eggs-${Date.now()}.webm`)
const [w, h] = opt('size', '1280x720').split('x').map((n) => parseInt(n, 10))
const hold = parseFloat(opt('hold', '8'))
const url = opt('url', 'http://localhost:5173')

const count = pick.length || eggs
// Matches the beat timings in src/hatch/model.ts, plus room to breathe: title
// card, the eggs dropping in, the painter colouring them, then the smashing.
// Hit counts are rolled per egg, so budget for every one of them being the
// worst case and for the slowest tool in the box.
const dropMs = Math.max(0, count - 1) * 520 + 1400 + 900
// Two passes of the painter: the base coat, then the patterns.
const paintMs = (2200 + Math.max(0, count - 1) * 1700 + 1600) * 2 + 3500
const finaleMs = 11000 + count * 3000 + 1200
const episodeMs =
  4200 + dropMs + paintMs + count * (1100 + hits * 1200 + 700 + 3400) + finaleMs + 20000

const videoDir = join(tmpdir(), `runkids-hatch-${Date.now()}`)
mkdirSync(videoDir, { recursive: true })

console.log(
  `Recording: ${pick.length ? `animals=${pick.join('+')}` : `eggs=${eggs}`}` +
    ` hits=3-${hits} tool=${tool || 'surprise'} env=${env} weather=${weather} → ${out}`,
)

const browser = await chromium.launch({ channel: 'chrome', headless: true }).catch((e) => {
  console.error('Could not launch Chrome:', e.message)
  process.exit(1)
})
const context = await browser
  .newContext({
    viewport: { width: w, height: h },
    recordVideo: { dir: videoDir, size: { width: w, height: h } },
  })
  .catch((e) => {
    console.error(
      e.message.includes('ffmpeg')
        ? 'Missing ffmpeg — run: npx playwright install ffmpeg'
        : e.message,
    )
    process.exit(1)
  })

const page = await context.newPage()
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message))

try {
  await page.goto(`${url.replace(/#.*$/, '')}#/hatch`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.racer-card', { timeout: 20000 })
  await page.waitForTimeout(600) // let the bundled animal pack finish loading

  // Animals: clear the default selection, then choose by name or by position.
  while ((await page.locator('.racer-card.on').count()) > 0) {
    await page.locator('.racer-card.on').first().click()
  }
  if (pick.length) {
    for (const name of pick) {
      const card = page.locator('.racer-card', { hasText: name }).first()
      if ((await card.count()) === 0) {
        console.error(`No animal called "${name}" — skipping it.`)
        continue
      }
      await card.click()
    }
  } else {
    const cards = await page.locator('.racer-card').count()
    for (let i = 0; i < Math.min(eggs, cards); i++) {
      await page.locator('.racer-card').nth(i).click()
    }
  }

  await page.locator('.slider-line', { hasText: 'Toughest egg' }).locator('input').fill(String(hits))
  if (tool) {
    const chip = page.locator('.env-chip', { hasText: tool }).first()
    if (await chip.count()) await chip.click()
    else console.error(`No tool called "${tool}" — leaving it on surprise.`)
  }
  await page.click(`.env-chip:has-text("${env}")`)
  if (weather.toLowerCase() !== 'auto') {
    const chip = page.locator('.env-chip', { hasText: weather }).first()
    if (await chip.count()) await chip.click()
  }

  // The show carries no app chrome of its own — the controls only appear if
  // someone presses Esc — so there's nothing to hide before filming.
  await page.click('text=Start smashing')

  // The outro card is the end of the episode.
  await page.waitForSelector('text=All hatched!', { timeout: episodeMs })
  await page.waitForTimeout(hold * 1000)
} catch (e) {
  console.error('Recording run failed:', e.message)
} finally {
  await context.close() // flushes the video file
  await browser.close()
}

const files = readdirSync(videoDir).filter((f) => f.endsWith('.webm'))
if (files.length === 0) {
  console.error('No video was produced.')
  process.exit(1)
}
renameSync(join(videoDir, files[0]), out)
rmSync(videoDir, { recursive: true, force: true })
console.log(`✔ Saved ${out}`)

if (flag('mp4')) {
  const mp4 = out.replace(/\.webm$/i, '') + '.mp4'
  const res = spawnSync(
    'ffmpeg',
    ['-y', '-i', out, '-c:v', 'libx264', '-crf', '18', '-preset', 'fast', '-pix_fmt', 'yuv420p', mp4],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  )
  if (res.error?.code === 'ENOENT') {
    console.error('ffmpeg not found — install it with: brew install ffmpeg')
  } else if (res.status !== 0) {
    console.error(`ffmpeg failed:\n${res.stderr?.toString().split('\n').slice(-4).join('\n')}`)
  } else {
    console.log(`✔ Converted ${mp4}`)
  }
}
