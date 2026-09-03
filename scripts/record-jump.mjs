#!/usr/bin/env node
// Generate a Cloud Climb video without touching the app: drives the doodle-jump
// page in headless Chrome and records the episode to a .webm file
// (YouTube-ready). The sibling of scripts/record-race.mjs and record-hatch.mjs.
//
// Usage (dev server must be running — `npm run dev`):
//   npm run record:jump -- [options]
//   node scripts/record-jump.mjs --climbers 4 --climb 60 --out climb.webm
//
// Options:
//   --climbers <n>     How many animals climb (2–4)           (default 3)
//   --pick <a,b,c>     Specific animals by name, in order; overrides --climbers
//   --climb <secs>     How long the winner's climb lasts, 15–150  (default 40)
//   --obstacles <pct>  Share of trick platforms, 0–100            (default 65)
//   --difficulty <n>   Easy | Classic | Wild                  (default Classic)
//   --loose            Turn "keep it close" off: no catch-up bounce
//   --env <name>       Environment chip: Summer | Winter | …  (default Summer)
//   --weather <name>   Weather chip: Auto | None | Snow | …   (default Auto)
//   --out <file>       Output video path            (default climb-<time>.webm)
//   --size <WxH>       Video size                            (default 1280x720)
//   --hold <seconds>   How long to linger on the outro card   (default 8)
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
const climbers = Math.max(2, Math.min(4, parseInt(opt('climbers', '3'), 10)))
const climb = Math.max(15, Math.min(150, parseInt(opt('climb', '40'), 10)))
const obstacles = Math.max(0, Math.min(100, parseInt(opt('obstacles', '65'), 10)))
const difficulty = opt('difficulty', 'Classic')
const env = opt('env', 'Summer')
const weather = opt('weather', 'Auto')
const out = opt('out', `climb-${Date.now()}.webm`)
const [w, h] = opt('size', '1280x720').split('x').map((n) => parseInt(n, 10))
const hold = parseFloat(opt('hold', '8'))
const url = opt('url', 'http://localhost:5173')

// Matches the beat timings in src/jump/model.ts, plus room to breathe. The
// climb is the open-ended beat and the tower is only built to hit the asked-for
// time on average, so budget for it running well over, plus the whole
// straggler window on top.
const climbMs = climb * 1000 * 2 + 12000
const episodeMs = 4200 + 3200 + climbMs + 6000 + 7000 + 20000

const videoDir = join(tmpdir(), `runkids-climb-${Date.now()}`)
mkdirSync(videoDir, { recursive: true })

console.log(
  `Recording: ${pick.length ? `animals=${pick.join('+')}` : `climbers=${climbers}`}` +
    ` climb=${climb}s obstacles=${obstacles}% difficulty=${difficulty}` +
    ` env=${env} weather=${weather} → ${out}`,
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
  await page.goto(`${url.replace(/#.*$/, '')}#/jump`, { waitUntil: 'networkidle' })
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
    for (let i = 0; i < Math.min(climbers, cards); i++) {
      await page.locator('.racer-card').nth(i).click()
    }
  }

  await page.locator('.mode-card', { hasText: difficulty }).first().click()
  await page
    .locator('.slider-line', { hasText: 'Average climb' })
    .locator('input')
    .fill(String(climb))
  await page
    .locator('.slider-line', { hasText: 'Obstacles' })
    .locator('input')
    .fill(String(obstacles))
  if (flag('loose')) await page.locator('.env-chip', { hasText: 'Keep it close' }).first().click()
  await page.click(`.env-chip:has-text("${env}")`)
  if (weather.toLowerCase() !== 'auto') {
    const chip = page.locator('.env-chip', { hasText: weather }).first()
    if (await chip.count()) await chip.click()
  }

  // The show carries no app chrome of its own — the controls only appear if
  // someone presses Esc — so there's nothing to hide before filming.
  await page.click('text=Start climbing')

  // The sign-off card is the end of the episode.
  await page.waitForSelector("text=That's a wrap!", { timeout: episodeMs })
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
