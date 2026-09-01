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
//   --mode <gp|trial|cup>  Grand Prix (all at once), Time Trial, or a
//                      Tournament cup: heats then a final   (default gp)
//   --heat <n>         Tournament: racers per heat (2-4)     (default 3)
//   --advance <n>      Tournament: how many advance per heat (default 1)
//   --racers <n>       How many racers (2–8)                 (default 4)
//   --lap <seconds>    Average lap length slider             (default 8)
//   --obstacles <pct>  Obstacle density slider 0–100         (default 40)
//   --out <file>       Output video path                     (default race-<time>.webm)
//   --size <WxH>       Layout size in CSS pixels             (default 1280x720)
//   --scale <n>        Device pixel ratio; the video comes out at size x scale.
//                      Use --size 1920x1080 --scale 2 for 4K with the HUD
//                      still proportioned for 1080p          (default 1)
//   --hold <seconds>   How long to linger on the podium      (default 5)
//   --url <url>        App URL                               (default http://localhost:5173)
//   --keep-ui          Don't hide the corner controls (skips the H key)

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

const env = opt('env', 'Summer')
const mode = opt('mode', 'gp')
const isCup = mode === 'cup' || mode === 'tournament'
const racers = Math.max(2, Math.min(isCup ? 16 : 8, parseInt(opt('racers', isCup ? '9' : '4'), 10)))
const heat = Math.max(2, Math.min(4, parseInt(opt('heat', '3'), 10)))
const advance = Math.max(1, Math.min(heat - 1, parseInt(opt('advance', '1'), 10)))
const lap = parseInt(opt('lap', '8'), 10)
const obstacles = parseInt(opt('obstacles', '40'), 10)
const out = opt('out', `race-${Date.now()}.webm`)
const [w, h] = opt('size', '1280x720').split('x').map((n) => parseInt(n, 10))
// Rendering at a bigger viewport would shrink the HUD against the frame, since
// its type is sized in CSS pixels. Scaling the device pixel ratio instead keeps
// the layout identical and just renders it with more pixels.
const scale = Math.max(1, Math.min(4, parseFloat(opt('scale', '1'))))
const hold = parseFloat(opt('hold', '5'))
const url = opt('url', 'http://localhost:5173')

const videoDir = join(tmpdir(), `runkids-rec-${Date.now()}`)
mkdirSync(videoDir, { recursive: true })

console.log(
  `Recording: env=${env} mode=${mode} racers=${racers}` +
    (isCup ? ` heat=${heat} advance=${advance}` : '') +
    ` lap=${lap}s obstacles=${obstacles}%` +
    ` video=${w * scale}x${h * scale}${scale !== 1 ? ` (${w}x${h} @${scale}x)` : ''} → ${out}`,
)

const browser = await chromium.launch({ channel: 'chrome', headless: true }).catch((e) => {
  console.error('Could not launch Chrome:', e.message)
  process.exit(1)
})
const context = await browser
  .newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: scale,
    recordVideo: { dir: videoDir, size: { width: w * scale, height: h * scale } },
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

  // A cup raises the entrant cap, so choose the style before picking racers.
  await page.click(
    `.mode-card:has-text("${isCup ? 'Tournament' : mode === 'trial' ? 'Time Trial' : 'Grand Prix'}")`,
  )

  // Racers: clear the default selection, then pick the first N cards.
  while ((await page.locator('.racer-card.on').count()) > 0) {
    await page.locator('.racer-card.on').first().click()
  }
  const cardCount = await page.locator('.racer-card').count()
  for (let i = 0; i < Math.min(racers, cardCount); i++) {
    await page.locator('.racer-card').nth(i).click()
  }

  // Environment + sliders (target by label: a cup adds sliders of its own).
  await page.click(`.env-chip:has-text("${env}")`)
  const slider = (label) => page.locator('.slider-line', { hasText: label }).locator('input')
  if (isCup) {
    await slider('Racers per heat').fill(String(heat))
    await slider('Advance per heat').fill(String(advance))
  }
  await slider('Average lap').fill(String(lap))
  await slider('Obstacles').fill(String(obstacles))

  if (isCup) {
    await page.click('text=Start the Cup')
    await page.waitForSelector('.bracket-card', { timeout: 15000 })
    await page.waitForTimeout(3000) // hold on the draw
    if (!flag('keep-ui')) await page.keyboard.press('h')
    const budget = (lap * 4 + 60) * 1000
    for (let round = 0; round < 40; round++) {
      if (await page.locator('.bk-champion').count()) break
      await page.keyboard.press('Enter') // start the next heat / final
      await page.waitForSelector('.results-card', { timeout: budget })
      await page.waitForTimeout(2600) // celebrate on the podium
      await page.keyboard.press('Enter') // back to the bracket
      await page.waitForSelector('.bracket-card', { timeout: 15000 })
      await page.waitForTimeout(2600) // read the standings
    }
    await page.waitForTimeout(hold * 1000)
  } else {
    await page.click('text=Generate & Play')
    await page.waitForSelector('text=Start the race!', { timeout: 15000 })
    await page.waitForTimeout(2500) // linger on the lineup card
    await page.click('text=Start the race!')
    if (!flag('keep-ui')) await page.keyboard.press('h')

    // Wait for the podium; budget scales with race length.
    const budget = (lap * (mode === 'trial' ? racers : 1) * 4 + 60) * 1000
    await page.waitForSelector('.results-card', { timeout: budget })
    await page.waitForTimeout(hold * 1000)
  }
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
