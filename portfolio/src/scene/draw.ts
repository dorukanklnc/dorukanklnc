/** Small drawing helpers that give generated SVG paths a hand-drawn feel. */

export type Pt = [number, number]

/** Deterministic PRNG (mulberry32) so the artwork is identical on every load. */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const f = (n: number) => Math.round(n * 10) / 10

/** A line that wanders slightly, like an ink stroke. */
export function wobbleLine(x1: number, y1: number, x2: number, y2: number, amp: number, seed: number, segs = 3) {
  const r = rng(seed)
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  let d = `M${f(x1)} ${f(y1)}`
  for (let i = 1; i <= segs; i++) {
    const t0 = (i - 0.5) / segs
    const t1 = i / segs
    const o = (r() - 0.5) * 2 * amp
    const cx = x1 + dx * t0 + nx * o
    const cy = y1 + dy * t0 + ny * o
    const ex = x1 + dx * t1 + (i === segs ? 0 : nx * (r() - 0.5) * amp)
    const ey = y1 + dy * t1 + (i === segs ? 0 : ny * (r() - 0.5) * amp)
    d += ` Q${f(cx)} ${f(cy)} ${f(ex)} ${f(ey)}`
  }
  return d
}

/** Closed polygon with rounded corners and optional jitter on every vertex. */
export function roundPoly(points: Pt[], radius: number | number[], jitter = 0, seed = 1) {
  const r = rng(seed)
  const pts = points.map(([x, y]) => [x + (r() - 0.5) * 2 * jitter, y + (r() - 0.5) * 2 * jitter] as Pt)
  const n = pts.length
  let d = ''
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]
    const p1 = pts[i]
    const p2 = pts[(i + 1) % n]
    const rad = Array.isArray(radius) ? radius[i] : radius
    const l1 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1
    const l2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) || 1
    const r1 = Math.min(rad, l1 / 2)
    const r2 = Math.min(rad, l2 / 2)
    const a: Pt = [p1[0] + ((p0[0] - p1[0]) / l1) * r1, p1[1] + ((p0[1] - p1[1]) / l1) * r1]
    const b: Pt = [p1[0] + ((p2[0] - p1[0]) / l2) * r2, p1[1] + ((p2[1] - p1[1]) / l2) * r2]
    d += `${i === 0 ? 'M' : 'L'}${f(a[0])} ${f(a[1])} Q${f(p1[0])} ${f(p1[1])} ${f(b[0])} ${f(b[1])} `
  }
  return d + 'Z'
}

/** Wobbly closed blob through points using smooth quadratic midpoints. */
export function blob(points: Pt[], jitter = 0, seed = 1) {
  const r = rng(seed)
  const pts = points.map(([x, y]) => [x + (r() - 0.5) * 2 * jitter, y + (r() - 0.5) * 2 * jitter] as Pt)
  const n = pts.length
  const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  let d = ''
  for (let i = 0; i < n; i++) {
    const p1 = pts[i]
    const p2 = pts[(i + 1) % n]
    const m0 = mid(pts[(i - 1 + n) % n], p1)
    const m1 = mid(p1, p2)
    if (i === 0) d += `M${f(m0[0])} ${f(m0[1])} `
    d += `Q${f(p1[0])} ${f(p1[1])} ${f(m1[0])} ${f(m1[1])} `
  }
  return d + 'Z'
}

/** Wood-grain: a few long wavy lines across a vertical plank. */
export function grainLines(x: number, y: number, w: number, h: number, seed: number, count = 2) {
  const r = rng(seed)
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    const gx = x + w * (0.2 + r() * 0.6)
    const y0 = y + h * r() * 0.3
    const y1 = y0 + h * (0.35 + r() * 0.5)
    const sway = (r() - 0.5) * w * 0.3
    out.push(
      `M${f(gx)} ${f(y0)} C${f(gx + sway)} ${f(y0 + (y1 - y0) * 0.33)} ${f(gx - sway)} ${f(y0 + (y1 - y0) * 0.66)} ${f(gx + sway * 0.4)} ${f(y1)}`,
    )
  }
  return out.join(' ')
}

/** Short parallel hatch marks inside a box (for hand-drawn shading). */
export function hatch(x: number, y: number, w: number, h: number, seed: number, count = 6, slope = 0.6) {
  const r = rng(seed)
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    const hx = x + r() * w
    const hy = y + r() * h
    const len = 10 + r() * 14
    out.push(`M${f(hx)} ${f(hy)} l${f(len)} ${f(-len * slope)}`)
  }
  return out.join(' ')
}

/** Relative luminance helper to pick readable text on coloured labels. */
export function isLight(hex: string) {
  const m = hex.replace('#', '')
  if (m.length !== 6) return true
  const n = parseInt(m, 16)
  const rr = (n >> 16) & 255
  const gg = (n >> 8) & 255
  const bb = n & 255
  return 0.299 * rr + 0.587 * gg + 0.114 * bb > 150
}

export function shade(hex: string, amount: number) {
  const m = hex.replace('#', '')
  if (m.length !== 6) return hex
  const n = parseInt(m, 16)
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(amount < 0 ? v * (1 + amount) : v + (255 - v) * amount)))
  const rr = ch((n >> 16) & 255)
  const gg = ch((n >> 8) & 255)
  const bb = ch(n & 255)
  return `#${((1 << 24) | (rr << 16) | (gg << 8) | bb).toString(16).slice(1)}`
}
