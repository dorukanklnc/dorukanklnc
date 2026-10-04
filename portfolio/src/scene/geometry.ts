/**
 * Shared geometry. The console is drawn as a rounded cuboid seen slightly from the
 * upper left. Its front face is an affine parallelogram, so the screen, slot and
 * buttons are drawn in a flat "face space" and mapped with one matrix. The same
 * mapping gives the exact slot and screen positions in stage units, which the
 * animation uses as its targets.
 */
import type { LayoutName, ScenePoint } from '../content/types'
import {
  CART,
  CONSOLE_POS,
  LAYOUT_BREAKPOINTS,
  LAYOUTS,
  MAX_FIT_SCALE,
  MIN_VIEW_H,
  STAGE,
  hudInsets,
  type Rect,
} from './config'

/* ── Console body (console-local units, 520 × 520 box) ─────────────────────── */

/** Front face: origin, width vector, height vector. */
export const FRONT = {
  o: { x: 175, y: 70 },
  u: { x: 235, y: -7 },
  v: { x: 0, y: 300 },
  /** Flat face-space size. */
  w: 235,
  h: 300,
} as const

/** Depth vector from the front face toward the back (visible left side + top). */
export const DEPTH = { x: -72, y: -20 } as const

/** Flat face-space rectangles (x, y, w, h). */
export const FACE = {
  screen: { x: 22, y: 22, w: 191, h: 148, r: 15 },
  slot: { x: 32, y: 184, w: 126, h: 10 },
  indicator: { x: 196, y: 186, r: 6 },
} as const

/** SVG matrix() for drawing in face space. */
export const FRONT_MATRIX = `matrix(${FRONT.u.x / FRONT.w} ${FRONT.u.y / FRONT.w} ${FRONT.v.x / FRONT.h} ${FRONT.v.y / FRONT.h} ${FRONT.o.x} ${FRONT.o.y})`

/** Side face drawn in a flat 75 × 300 space, origin at the back-top corner. */
export const SIDE = { w: 75, h: 300 } as const
export const SIDE_MATRIX = `matrix(${-DEPTH.x / SIDE.w} ${-DEPTH.y / SIDE.w} 0 1 ${FRONT.o.x + DEPTH.x} ${FRONT.o.y + DEPTH.y})`

export function faceToConsole(fx: number, fy: number): ScenePoint {
  return {
    x: FRONT.o.x + (fx / FRONT.w) * FRONT.u.x + (fy / FRONT.h) * FRONT.v.x,
    y: FRONT.o.y + (fx / FRONT.w) * FRONT.u.y + (fy / FRONT.h) * FRONT.v.y,
  }
}

export function sideToConsole(sx: number, sy: number): ScenePoint {
  return {
    x: FRONT.o.x + DEPTH.x + (sx / SIDE.w) * -DEPTH.x,
    y: FRONT.o.y + DEPTH.y + (sx / SIDE.w) * -DEPTH.y + sy,
  }
}

export function consoleToStage(p: ScenePoint): ScenePoint {
  return { x: CONSOLE_POS.x + p.x, y: CONSOLE_POS.y + p.y }
}

export const faceToStage = (fx: number, fy: number) => consoleToStage(faceToConsole(fx, fy))

/** Angle of the front face's horizontal edges (degrees, negative = rising to the right). */
export const FACE_ANGLE = (Math.atan2(FRONT.u.y, FRONT.u.x) * 180) / Math.PI

/* ── Console rig: pivots for breathing and limb motion (console-local units) ── */

export const SHOULDER_L = sideToConsole(36, 246)
export const SHOULDER_R = faceToConsole(FRONT.w - 4, 214)
export const HIP_L = faceToConsole(84, 292)
export const HIP_R = faceToConsole(152, 290)
const bottomCentre = faceToConsole(FRONT.w / 2, FRONT.h)
/** Breathing / squash pivot (bottom centre of the body), as a GSAP svgOrigin. */
export const BODY_ORIGIN = `${bottomCentre.x} ${bottomCentre.y}`
export const LIMB_ORIGINS = {
  armL: `${SHOULDER_L.x} ${SHOULDER_L.y}`,
  armR: `${SHOULDER_R.x} ${SHOULDER_R.y}`,
  legL: `${HIP_L.x} ${HIP_L.y}`,
  legR: `${HIP_R.x} ${HIP_R.y}`,
}

/* ── Derived targets in stage units ────────────────────────────────────────── */

const s = FACE.slot
export const SLOT = {
  /** Where the cartridge's leading edge pivots: centre of the slot opening. */
  center: faceToStage(s.x + s.w / 2, s.y + s.h / 2),
  /** Upper lip of the opening: everything beyond this line is inside the console. */
  lipLeft: faceToStage(s.x, s.y),
  lipRight: faceToStage(s.x + s.w, s.y),
  width: s.w,
  angle: FACE_ANGLE,
}

const sc = FACE.screen
export const SCREEN = {
  center: faceToStage(sc.x + sc.w / 2, sc.y + sc.h / 2),
  /** Axis-aligned rectangle fully inside the (slightly skewed) screen. */
  innerW: sc.w,
  innerH: sc.h - Math.abs((sc.w * FRONT.u.y) / FRONT.u.x),
}

/* ── Fit: stage → viewport ─────────────────────────────────────────────────── */

export interface Fit {
  scale: number
  x: number
  y: number
  vw: number
  vh: number
  layout: LayoutName
}

export function pickLayout(vw: number, vh: number, pager = false): LayoutName {
  const ins = hudInsets(vw, pager)
  const ratio = (vw - ins.left - ins.right) / Math.max(1, vh - ins.top - ins.bottom)
  if (ratio >= LAYOUT_BREAKPOINTS.wide) return 'wide'
  if (ratio >= LAYOUT_BREAKPOINTS.medium) return 'medium'
  return 'tall'
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** `pager`: reserve room for the shelf pager when there are more projects than slots. */
export function computeFit(vw: number, vh: number, pager = false): Fit {
  const layout = pickLayout(vw, vh, pager)
  const safe: Rect = LAYOUTS[layout].safe
  const ins = hudInsets(vw, pager)
  const availW = Math.max(1, vw - ins.left - ins.right)
  const availH = Math.max(1, vh - ins.top - ins.bottom)
  // Fit the interactive area, but always show enough of the room around it.
  let scale = Math.min(availW / safe.w, availH / safe.h, vh / MIN_VIEW_H, MAX_FIT_SCALE)
  // The room must always cover the whole viewport.
  scale = Math.max(scale, vw / STAGE.w, vh / STAGE.h)
  const cx = ins.left + availW / 2
  const centred = ins.top + availH / 2 - (safe.y + safe.h / 2) * scale
  const bottomAligned = ins.top + availH - (safe.y + safe.h) * scale
  // Spare height goes mostly above the console, where the wall and shelves are.
  const x = clamp(cx - (safe.x + safe.w / 2) * scale, vw - STAGE.w * scale, 0)
  const y = clamp(centred + (bottomAligned - centred) * 0.9, vh - STAGE.h * scale, 0)
  return { scale, x, y, vw, vh, layout }
}

export const stageToViewport = (fit: Fit, p: ScenePoint): ScenePoint => ({
  x: fit.x + p.x * fit.scale,
  y: fit.y + p.y * fit.scale,
})

/* ── Camera: zoom from the room into the console screen ─────────────────────── */

export interface CameraFrame {
  /** Scale at z = 1 (screen covers the viewport). */
  S: number
  /** Fixed point of the zoom in viewport px. */
  F: ScenePoint
}

/** Extra zoom so the rounded screen corners stay outside the viewport. */
const COVER = 1.1

export function cameraFrame(fit: Fit): CameraFrame {
  const p0 = stageToViewport(fit, SCREEN.center)
  const w = SCREEN.innerW * fit.scale
  const h = SCREEN.innerH * fit.scale
  const S = COVER * Math.max(fit.vw / w, fit.vh / h)
  const C = { x: fit.vw / 2, y: fit.vh / 2 }
  // Zooming by k about F moves p0 to F + k(p0 − F); we need p0 → C at k = S.
  const F = { x: (C.x - S * p0.x) / (1 - S), y: (C.y - S * p0.y) / (1 - S) }
  return { S, F }
}

/** Camera transform for zoom progress z ∈ [0, 1] (exponential, so the zoom feels even). */
export function cameraAt(frame: CameraFrame, z: number) {
  const k = Math.pow(frame.S, z)
  return { k, tx: frame.F.x * (1 - k), ty: frame.F.y * (1 - k) }
}

/**
 * Transform for the project interface so it rides on the console screen: identity at
 * z = 1, and at smaller z the same zoom about F scaled down by k / S.
 */
export function overlayAt(frame: CameraFrame, z: number) {
  const k = Math.pow(frame.S, z) / frame.S
  return { k, tx: frame.F.x * (1 - k), ty: frame.F.y * (1 - k) }
}

/* ── Cartridge flight ──────────────────────────────────────────────────────── */

/** Pivot (leading-edge centre) of a cartridge at rest, stage units. */
export const cartPivot = (pos: ScenePoint): ScenePoint => ({ x: pos.x + CART.w / 2, y: pos.y })

export function quad(a: number, c: number, b: number, t: number) {
  const u = 1 - t
  return u * u * a + 2 * u * t * c + t * t * b
}
