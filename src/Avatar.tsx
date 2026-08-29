import { useMemo } from 'react'
import { AnimalDesign } from './studio/model'
import { AnimalColors } from './track/Animal'

// Little animal portraits for menus and the bracket. A design is already a
// list of coloured boxes, so a head-on view is just those boxes projected onto
// a canvas back-to-front — no WebGL, and it works for any custom animal.

const cache = new Map<string, string>()

function drawDesign(ctx: CanvasRenderingContext2D, design: AnimalDesign, size: number) {
  const blocks = design.blocks
  if (blocks.length === 0) return
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const b of blocks) {
    minX = Math.min(minX, b.pos[0] - b.size[0] / 2)
    maxX = Math.max(maxX, b.pos[0] + b.size[0] / 2)
    minY = Math.min(minY, b.pos[1] - b.size[1] / 2)
    maxY = Math.max(maxY, b.pos[1] + b.size[1] / 2)
  }
  const w = maxX - minX || 1
  const h = maxY - minY || 1
  const scale = (size * 0.94) / Math.max(w, h)
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2

  // Painter's algorithm along the facing axis (+Z is the animal's front).
  const sorted = [...blocks].sort((a, b) => a.pos[2] - b.pos[2])
  for (const b of sorted) {
    const bw = Math.max(1, Math.ceil(b.size[0] * scale))
    const bh = Math.max(1, Math.ceil(b.size[1] * scale))
    const px = Math.round(size / 2 + (b.pos[0] - cx) * scale - (b.size[0] * scale) / 2)
    const py = Math.round(size / 2 - (b.pos[1] - cy) * scale - (b.size[1] * scale) / 2)
    ctx.fillStyle = b.color
    ctx.fillRect(px, py, bw, bh)
  }
}

/** Fallback face for the built-in racers, which have colours but no design. */
function drawSimple(ctx: CanvasRenderingContext2D, colors: AnimalColors, size: number) {
  const u = size / 16
  const R = (x: number, y: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c
    ctx.fillRect(Math.round(x * u), Math.round(y * u), Math.ceil(w * u), Math.ceil(h * u))
  }
  R(3, 5, 10, 9, colors.body) // head
  R(2, 2, 3, 4, colors.ear) // ears
  R(11, 2, 3, 4, colors.ear)
  R(5, 10, 6, 4, colors.belly) // muzzle
  R(5, 8, 2, 2, '#1c1c1c') // eyes
  R(9, 8, 2, 2, '#1c1c1c')
  R(7, 11, 2, 2, '#2a1c14') // nose
}

/** A data URL for this animal's portrait (cached per design + colour). */
export function avatarUrl(
  design: AnimalDesign | null | undefined,
  colors: AnimalColors,
  size = 64,
): string {
  const key = `${design?.id ?? 'default'}|${design?.updated ?? 0}|${colors.body}|${size}`
  const hit = cache.get(key)
  if (hit) return hit
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.imageSmoothingEnabled = false
  if (design && design.blocks.length > 0) drawDesign(ctx, design, size)
  else drawSimple(ctx, colors, size)
  const url = canvas.toDataURL()
  cache.set(key, url)
  return url
}

export default function AnimalAvatar({
  design,
  colors,
  size = 28,
  className,
}: {
  design?: AnimalDesign | null
  colors: AnimalColors
  size?: number
  className?: string
}) {
  const url = useMemo(() => avatarUrl(design, colors, 64), [design, colors])
  return (
    <img
      className={`avatar ${className ?? ''}`}
      src={url}
      alt=""
      width={size}
      height={size}
      style={{ ['--avatar-ring' as string]: colors.body }}
    />
  )
}
