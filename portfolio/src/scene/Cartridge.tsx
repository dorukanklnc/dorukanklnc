import { memo, useId } from 'react'
import type { Project } from '../content/types'
import { assetUrl } from '../lib/assets'
import { CART } from './config'
import { isLight, shade } from './draw'

const INK = '#191414'

/** Splits a title into at most two short lines for the label. */
function labelLines(title: string): string[] {
  if (title.length <= 11) return [title]
  const words = title.split(/\s+/)
  let best: string[] = [title]
  let bestScore = Infinity
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ')
    const b = words.slice(i).join(' ')
    const score = Math.max(a.length, b.length)
    if (score < bestScore) {
      bestScore = score
      best = [a, b]
    }
  }
  return best
}

/** The cartridge artwork (dark retro plastic shell + coloured label). Purely visual. */
export const CartridgeArt = memo(function CartridgeArt({ project }: { project: Project }) {
  const uid = useId().replace(/:/g, '')
  const color = project.labelColor
  const fg = isLight(color) ? '#1E1A17' : '#FFF8EC'
  const lines = labelLines(project.title)
  const longest = Math.max(...lines.map((l) => l.length))
  const fontSize = Math.min(lines.length === 1 ? 9.5 : 8.6, 51 / (longest * 0.6))
  const thumb = project.thumbnail ?? project.screenshots[0]

  return (
    <svg className="cart-svg" viewBox={`0 0 ${CART.w} ${CART.h}`} width={CART.w} height={CART.h} aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={`thumb-${uid}`}>
          <rect x="17" y="17" width="66" height="42" rx="3" />
        </clipPath>
        <linearGradient id={`shell-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4A4246" />
          <stop offset="1" stopColor="#2E282B" />
        </linearGradient>
      </defs>

      {/* shell thickness (right + bottom) */}
      <path d="M8 6 H86 L96 16 V122 Q96 127 91 127 H9 Q4 127 4 122 V10 Q4 6 8 6 Z" fill="#161213" transform="translate(3 2)" />
      {/* shell face with the notched top-right corner */}
      <path d="M8 3 H84 L96 15 V119 Q96 125 90 125 H8 Q3 125 3 119 V8 Q3 3 8 3 Z" fill={`url(#shell-${uid})`} stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M8 6.5 H82" stroke="#6E6468" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M6.5 10 V116" stroke="#5E5559" strokeWidth="1.4" strokeLinecap="round" />

      {/* label */}
      <rect x="11" y="11" width="78" height="76" rx="5" fill={shade(color, -0.35)} transform="translate(1.2 1.6)" />
      <rect x="11" y="11" width="78" height="76" rx="5" fill={color} stroke={INK} strokeWidth="1.8" />
      <path d="M14 14 H86" stroke={shade(color, 0.45)} strokeWidth="1.4" strokeLinecap="round" opacity="0.8" />
      <rect x="17" y="17" width="66" height="42" rx="3" fill="#2A2427" />
      {thumb && (
        <image
          href={assetUrl(thumb.src)}
          x="17"
          y="17"
          width="66"
          height="42"
          preserveAspectRatio="xMidYMid slice"
          clipPath={`url(#thumb-${uid})`}
        />
      )}
      <rect x="17" y="17" width="66" height="42" rx="3" fill="none" stroke={INK} strokeWidth="1.6" />
      <path d="M20 21 L30 21" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" opacity="0.5" />

      {/* emblem + title band */}
      <circle cx="23" cy="73" r="7.5" fill={fg} stroke={INK} strokeWidth="1.3" />
      <text
        x="23"
        y="73.6"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="'Pixelify Sans', monospace"
        fontWeight="700"
        fontSize={project.emblem.length > 2 ? 5.6 : 7}
        fill={color}
      >
        {project.emblem}
      </text>
      {lines.map((line, i) => (
        <text
          key={line}
          x="34"
          y={lines.length === 1 ? 76.5 : 70 + i * 9.4}
          fontFamily="'Pixelify Sans', monospace"
          fontWeight="700"
          fontSize={fontSize}
          fill={fg}
        >
          {line}
        </text>
      ))}

      {/* grip ridges near the base */}
      {[96, 103, 110, 117].map((y) => (
        <g key={y}>
          <path d={`M18 ${y} H82`} stroke="#151112" strokeWidth="2.6" strokeLinecap="round" />
          <path d={`M18 ${y + 2} H82`} stroke="#5A5155" strokeWidth="1" strokeLinecap="round" opacity="0.8" />
        </g>
      ))}
      <path d="M88 96 L88 116" stroke="#151112" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
    </svg>
  )
})
