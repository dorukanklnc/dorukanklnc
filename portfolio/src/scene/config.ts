/**
 * Scene configuration: stage size, console placement, cartridge slots per layout,
 * and animation timings. Everything here is in STAGE UNITS — the room artwork is a
 * 2400 × 1600 drawing and every object (console, cartridges, slot, screen) is
 * positioned in that same coordinate system. The whole stage is then scaled to fit
 * the viewport (see computeFit in geometry.ts), so nothing depends on pixel sizes.
 */
import type { LayoutName, ScenePoint } from '../content/types'

export const STAGE = { w: 2400, h: 1600 } as const

/** The console SVG is a 520 × 520 box whose top-left corner sits here (stage units). */
export const CONSOLE_POS: ScenePoint = { x: 930, y: 700 }
export const CONSOLE_BOX = { w: 520, h: 520 } as const

/** Cartridge artwork size in stage units (the SVG viewBox is 0 0 100 128). */
export const CART = { w: 100, h: 128 } as const

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface CartSlot extends ScenePoint {
  /** Distance from the cartridge's bottom edge to its floor shadow. */
  shadow: number
  /** Float amplitude in stage units (6–12 px on desktop after scaling). */
  amp: number
}

export interface LayoutConfig {
  /** Region that must stay fully visible (console + all cartridges). */
  safe: Rect
  slots: CartSlot[]
  /** Draw a small wall shelf behind the top row (compact portrait layout). */
  shelf?: Rect
}

/**
 * Cartridge slots per layout (top-left corner of each cartridge, stage units).
 * Projects fill slots in order; with more projects than slots a shelf pager appears.
 * A project can override its own position with `room` in src/content/portfolio.ts.
 */
export const LAYOUTS: Record<LayoutName, LayoutConfig> = {
  wide: {
    safe: { x: 600, y: 700, w: 1190, h: 600 },
    slots: [
      { x: 772, y: 752, shadow: 150, amp: 9 },
      { x: 640, y: 952, shadow: 92, amp: 7 },
      { x: 806, y: 1128, shadow: 46, amp: 8 },
      { x: 1500, y: 742, shadow: 150, amp: 10 },
      { x: 1622, y: 950, shadow: 96, amp: 7 },
      { x: 1460, y: 1134, shadow: 44, amp: 8 },
    ],
  },
  medium: {
    safe: { x: 720, y: 560, w: 920, h: 740 },
    slots: [
      { x: 778, y: 600, shadow: 120, amp: 8 },
      { x: 1500, y: 590, shadow: 120, amp: 9 },
      { x: 752, y: 862, shadow: 90, amp: 7 },
      { x: 1516, y: 856, shadow: 90, amp: 8 },
      { x: 800, y: 1120, shadow: 46, amp: 7 },
      { x: 1460, y: 1126, shadow: 44, amp: 8 },
    ],
  },
  tall: {
    safe: { x: 960, y: 440, w: 470, h: 965 },
    shelf: { x: 972, y: 612, w: 446, h: 30 },
    slots: [
      { x: 990, y: 466, shadow: 20, amp: 6 },
      { x: 1145, y: 466, shadow: 20, amp: 6 },
      { x: 1300, y: 466, shadow: 20, amp: 6 },
      { x: 1040, y: 1196, shadow: 34, amp: 6 },
      { x: 1250, y: 1196, shadow: 34, amp: 6 },
      { x: 1145, y: 1236, shadow: 30, amp: 6 },
    ],
  },
}

/** Aspect ratio (available width / height) thresholds for picking a layout. */
export const LAYOUT_BREAKPOINTS = { wide: 1.22, medium: 0.8 } as const

/** Screen space reserved for the top navigation and bottom info bar (CSS px). */
export function hudInsets(vw: number, pager = false) {
  const extra = pager ? 56 : 0
  if (vw < 640) return { top: 64, bottom: 116 + extra, left: 8, right: 8 }
  return { top: 76, bottom: 104 + extra, left: 24, right: 24 }
}

/** Largest stage scale; keeps some room visible on very large monitors. */
export const MAX_FIT_SCALE = 1.7

/** Minimum stage height (units) visible on screen, so the room never feels cramped. */
export const MIN_VIEW_H = 1000

/**
 * Animation timings in seconds. The enter sequence is
 *   select → approach → insert → (overlapping) camera zoom → project.
 * Total click-to-content time ≈ select + approach + insert − zoomOverlap + zoom.
 */
export const TIMING = {
  select: 0.15,
  approach: 0.5,
  insert: 0.32,
  /** Camera starts this long before the insertion finishes. */
  zoomOverlap: 0.12,
  zoom: 0.74,
  /** Project interface fades in during this part of the zoom (0–1 of zoom). */
  revealStart: 0.3,
  revealEnd: 0.82,
  /** Eject durations are the enter durations multiplied by this. */
  ejectSpeed: 0.78,
  /** Reduced-motion cross-fade. */
  fade: 0.22,
} as const

/** Pose of the cartridge while it lines up with and slides into the slot. */
export const INSERT_POSE = {
  /** Backwards tilt (rotateX, degrees) so the cartridge lies almost flat into the slot. */
  tilt: 72,
  /** CSS perspective distance in stage units used for the tilt. */
  perspective: 700,
  /** How far in front of the slot (stage units along the cartridge) it pauses before pushing in. */
  standoff: 32,
  /** How far the cartridge lifts as it leaves its spot (path control point, stage units). */
  lift: 90,
  /** The path arrives from this far below the slot, so the final motion is a push upward/inward. */
  under: 70,
  /** Mid-flight scale bump (cartridge lifted toward the viewer). */
  liftScale: 1.16,
} as const

/** Idle behaviour ranges (seconds). */
export const IDLE = {
  floatDuration: [3.2, 4.8] as [number, number],
  swayDegrees: 0.9,
  blinkEvery: [4, 8] as [number, number],
  limbEvery: [7, 13] as [number, number],
  breathe: 2.8,
}
