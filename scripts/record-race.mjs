#!/usr/bin/env node
// Generate a race video without touching the app: drives Runkids in headless
// Chrome and records the run to a .webm file (YouTube-ready).
//
// Usage (dev server must be running — `npm run dev`):
//   npm run record -- [options]
//   node scripts/record-race.mjs --env Winter --lap 15 --racers 5 --out winter.webm
//
// Options:
//   --env <name>       Environment chip to pick: Summer | Winter | Autumn |
//                      Spring | any saved custom name        (default Summer)
//   --mode <gp|trial>  Grand Prix (all at once) or Time Trial (default gp)
//   --racers <n>       How many racers (2–8)                 (default 4)
//   --lap <seconds>    Average lap length slider             (default 8)
//   --obstacles <pct>  Obstacle density slider 0–100         (default 40)
//   --out <file>       Output video path                     (default race-<time>.webm)
//   --size <WxH>       Video size                            (default 1280x720)
//   --hold <seconds>   How long to linger on the podium      (default 5)
//   --url <url>        App URL                               (default http://localhost:5173)
//   --keep-ui          Don't hide the corner controls (skips the H key)

import { chromium } from 'playwright-core'
import { mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const args = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback
}
const flag = (name) => args.includes(`--${name}`)

const env = opt('env', 'Summer')
const mode = opt('mode', 'gp')
const racers = Math.max(2, Math.min(8, parseInt(opt('racers', '4'), 10)))
const lap = parseInt(opt('lap', '8'), 10)
const obstacles = parseInt(opt('obstacles', '40'), 10)
const out = opt('out', `race-${Date.now()}.webm`)
const [w, h] = opt('size', '1280x720').split('x').map((n) => parseInt(n, 10))
const hold = parseFloat(opt('hold', '5'))
const url = opt('url', 'http://localhost:5173')

const videoDir = join(tmpdir(), `runkids-rec-${Date.now()}`)
mkdirSync(videoDir, { recursive: true })

console.log(`Recording: env=${env} mode=${mode} racers=${racers} lap=${lap}s obstacles=${obstacles}% → ${out}`)

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
    console.error(e.message.includes('ffmpeg') ? 'Missing ffmpeg — run: npx playwright install ffmpeg' : e.message)
    process.exit(1)
  })

const page = await context.newPage()
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message))

try {
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForSelector('.racer-card', { timeout: 15000 })
  await page.waitForTimeout(600)

  // Racers: clear the default selection, then pick the first N cards.
  while ((await page.locator('.racer-card.on').count()) > 0) {
    await page.locator('.racer-card.on').first().click()
  }
  const cardCount = await page.locator('.racer-card').count()
  for (let i = 0; i < Math.min(racers, cardCount); i++) {
    await page.locator('.racer-card').nth(i).click()
  }

  // Race style + environment + sliders.
  await page.click(`.mode-card:has-text("${mode === 'trial' ? 'Time Trial' : 'Grand Prix'}")`)
  await page.click(`.env-chip:has-text("${env}")`)
  const sliders = page.locator('.slider-line input')
  await sliders.nth(0).fill(String(lap))
  await sliders.nth(1).fill(String(obstacles))

  await page.click('text=Generate & Play')
  await page.waitForSelector('text=Start the race!', { timeout: 15000 })
  await page.waitForTimeout(2500) // linger on the lineup card
  await page.click('text=Start the race!')
  if (!flag('keep-ui')) await page.keyboard.press('h')

  // Wait for the podium; budget scales with race length.
  const budget = (lap * (mode === 'trial' ? racers : 1) * 4 + 60) * 1000
  await page.waitForSelector('.results-card', { timeout: budget })
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
