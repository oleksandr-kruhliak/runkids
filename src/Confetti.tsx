import { useMemo } from 'react'

const COLORS = ['#ff7a1a', '#ffd54a', '#2e9e5b', '#42a5f5', '#e5477a', '#7c4dff', '#ff5252']

/** A burst of falling confetti for the winners screen. Pure CSS, no deps. */
export default function Confetti({ count = 90 }: { count?: number }) {
  const bits = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 1.2,
        dur: 2.4 + Math.random() * 1.8,
        color: COLORS[i % COLORS.length],
        size: 6 + Math.random() * 8,
        rot: Math.random() * 360,
        drift: (Math.random() - 0.5) * 120,
        round: Math.random() < 0.35,
      })),
    [count],
  )
  return (
    <div className="confetti" aria-hidden>
      {bits.map((b, i) => (
        <span
          key={i}
          style={{
            left: `${b.left}%`,
            width: `${b.size}px`,
            height: `${b.size * (b.round ? 1 : 1.6)}px`,
            background: b.color,
            borderRadius: b.round ? '50%' : '2px',
            animationDelay: `${b.delay}s`,
            animationDuration: `${b.dur}s`,
            ['--drift' as string]: `${b.drift}px`,
            ['--rot' as string]: `${b.rot}deg`,
          }}
        />
      ))}
    </div>
  )
}
