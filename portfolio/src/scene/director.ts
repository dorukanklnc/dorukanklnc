/**
 * SceneDirector — owns every animation in the room.
 *
 * State machine:  idle → selecting → inserting → zooming → project → ejecting → idle
 *
 * All motion is expressed as plain numeric parameters (camera zoom `cam.z`, the
 * active cartridge's flight `fl`, and a few looks such as `dim`) that GSAP tweens.
 * `render()` turns those numbers into transforms using the shared stage geometry,
 * so an interrupted sequence can always continue from wherever it currently is.
 *
 * Wrappers per cartridge (outer → inner):
 *   .cart (anchor: base position + insertion clip) → .cart-flight (flight transform)
 *   → .cart-idle (floating) → button → .cart-art (hover lift, CSS)
 */
import gsap from 'gsap'
import type { ScenePoint } from '../content/types'
import { CART, IDLE, INSERT_POSE, TIMING, type CartSlot } from './config'
import type { ConsoleRefs } from './Console'
import {
  BODY_ORIGIN,
  LIMB_ORIGINS,
  SCREEN,
  SLOT,
  cameraAt,
  cameraFrame,
  cartPivot,
  computeFit,
  overlayAt,
  type CameraFrame,
  type Fit,
} from './geometry'
import type { FaceState } from './ScreenFace'

export type Phase = 'idle' | 'selecting' | 'inserting' | 'zooming' | 'project' | 'ejecting'

export interface CartEls {
  anchor: HTMLDivElement
  flight: HTMLDivElement
  idle: HTMLDivElement
  shadow: HTMLDivElement
  button: HTMLButtonElement
}

export interface Placement extends CartSlot {
  slug: string
}

export interface ProjectInfo {
  slug: string
  title: string
  emblem: string
  color: string
}

interface Flight {
  t: number
  tilt: number
  rz: number
  s: number
  depth: number
}

export interface DirectorEvents {
  phase: (phase: Phase, active: string | null) => void
  face: (face: FaceState) => void
  /** Which project the overlay shows (null = none). */
  overlay: (slug: string | null) => void
  fit: (fit: Fit) => void
}

type ElKey = 'scene' | 'camera' | 'stage' | 'dim' | 'overlay' | 'hud' | 'lip' | 'back' | 'front'

const REST: Flight = { t: 0, tilt: 0, rz: 0, s: 1, depth: 0 }
const INSERT_SCALE = (SLOT.width - 16) / CART.w
const INSERTED: Flight = { t: 1, tilt: INSERT_POSE.tilt, rz: SLOT.angle, s: INSERT_SCALE, depth: CART.h + 12 }
const DIM_SELECT = 0.38
const DIM_ZOOM = 0.86

export class SceneDirector {
  private els: Partial<Record<ElKey, HTMLElement | SVGElement>> = {}
  private carts = new Map<string, CartEls>()
  private placements = new Map<string, Placement>()
  private projects = new Map<string, ProjectInfo>()
  private consoleRefs: ConsoleRefs | null = null

  fit: Fit = computeFit(1280, 800)
  private frame: CameraFrame = cameraFrame(this.fit)

  phase: Phase = 'idle'
  /** Cartridge that is currently away from its home spot (flying, inserted, ejecting). */
  active: string | null = null
  private overlaySlug: string | null = null
  private overlayDetached = false

  private cam = { z: 0 }
  private fl: Flight = { ...REST }
  private look = { dim: 0, others: 0, overlay: 0, hud: 1 }

  private tl: gsap.core.Timeline | null = null
  private floats = new Map<string, gsap.core.Tween[]>()
  private loops: (gsap.core.Tween | gsap.core.Timeline)[] = []
  private blinkCall: gsap.core.Tween | null = null
  private limbCall: gsap.core.Tween | null = null
  private hovered: string | null = null
  private faceState: FaceState = { expression: 'neutral' }
  private parallax: { bx: gsap.QuickToFunc; by: gsap.QuickToFunc; fx: gsap.QuickToFunc; fy: gsap.QuickToFunc } | null = null

  reducedMotion = false
  private running = false
  private idleActive = false

  private on: DirectorEvents

  constructor(events: DirectorEvents) {
    this.on = events
  }

  /* ── registration ───────────────────────────────────────────────────────── */

  private binders = new Map<ElKey, (el: HTMLElement | SVGElement | null) => void>()

  /** Stable ref callback for a named scene element. */
  bind(key: ElKey) {
    let fn = this.binders.get(key)
    if (!fn) {
      fn = (el) => {
        if (el) this.els[key] = el
        else delete this.els[key]
        if (key === 'back' || key === 'front') this.parallax = null
        if (el && (key === 'camera' || key === 'overlay' || key === 'stage')) {
          if (key === 'stage') this.applyFit()
          this.render()
        }
      }
      this.binders.set(key, fn)
    }
    return fn
  }

  registerCart(slug: string, els: CartEls | null) {
    if (!els) {
      this.stopFloat(slug)
      this.carts.delete(slug)
      return
    }
    const prev = this.carts.get(slug)
    this.carts.set(slug, els)
    if (prev?.idle !== els.idle) {
      this.stopFloat(slug)
      if (slug === this.active) {
        gsap.set(els.idle, { y: 0, rotation: 0 })
        els.anchor.classList.add('is-active')
        this.render()
      } else if (this.idleActive) this.startFloat(slug, true)
    }
  }

  registerConsole = (refs: ConsoleRefs | null) => {
    const changed = refs?.body !== this.consoleRefs?.body
    this.consoleRefs = refs
    if (refs && changed && this.idleActive) {
      this.stopLoops()
      this.startLoops()
    }
  }

  setProjects(list: ProjectInfo[]) {
    this.projects = new Map(list.map((p) => [p.slug, p]))
  }

  setPlacements(list: Placement[]) {
    const next = new Map(list.map((p) => [p.slug, p]))
    const changed = list.some((p) => {
      const old = this.placements.get(p.slug)
      return !old || old.x !== p.x || old.y !== p.y
    })
    this.placements = next
    if (changed && this.tl && this.phase !== 'project') this.tl.progress(1)
    this.render()
  }

  /* ── lifecycle ──────────────────────────────────────────────────────────── */

  start() {
    if (this.running) return
    this.running = true
    document.addEventListener('visibilitychange', this.onVisibility)
    if (this.phase === 'idle') this.setIdleActive(true)
    this.render()
  }

  dispose() {
    this.running = false
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.tl?.kill()
    this.tl = null
    this.setIdleActive(false)
    // Settle any in-flight sequence into a consistent end state.
    if (this.phase === 'ejecting' || this.phase === 'selecting') this.resetToRoom()
  }

  setReducedMotion(reduced: boolean) {
    if (this.reducedMotion === reduced) return
    this.reducedMotion = reduced
    if (this.idleActive) {
      this.setIdleActive(false)
      this.setIdleActive(true)
    }
    if (reduced) {
      // Settle everything that was mid-float or shifted by parallax.
      this.resetParallax(0)
      for (const [slug, els] of this.carts) {
        if (slug === this.active) continue
        gsap.set(els.idle, { y: 0, rotation: 0 })
        gsap.set(els.shadow, { scale: 1, opacity: 1 })
      }
    }
  }

  private onVisibility = () => {
    if (this.phase !== 'idle') return
    this.setIdleActive(!document.hidden)
  }

  private pager = false

  /** Whether the shelf pager is shown (it needs a little room under the cartridges). */
  setPager(visible: boolean) {
    if (this.pager === visible) return
    this.pager = visible
    this.setViewport(this.fit.vw, this.fit.vh)
  }

  setViewport(vw: number, vh: number) {
    const prevLayout = this.fit.layout
    this.fit = computeFit(vw, vh, this.pager)
    this.frame = cameraFrame(this.fit)
    this.applyFit()
    if (prevLayout !== this.fit.layout && this.tl && this.phase !== 'project') this.tl.progress(1)
    this.on.fit(this.fit)
    this.render()
  }

  private applyFit() {
    const stage = this.els.stage as HTMLElement | undefined
    if (!stage) return
    const { x, y, scale } = this.fit
    stage.style.transform = `translate(${x}px, ${y}px) scale(${scale})`
    stage.style.setProperty('--inv', String(1 / scale))
  }

  /* ── public intents ─────────────────────────────────────────────────────── */

  /**
   * Bring the scene to "project `slug` is open" (or back to the room for null).
   * `animate` = play the physical insertion; otherwise cross-fade / show instantly.
   */
  goTo(slug: string | null, mode: 'animate' | 'fade' | 'instant') {
    if (slug) {
      const showing = this.overlaySlug === slug && this.phase !== 'ejecting' && this.phase !== 'idle'
      if (showing) return
      const canAnimate = mode === 'animate' && !this.reducedMotion && this.carts.has(slug) && this.placements.has(slug)
      if (canAnimate && (this.phase === 'idle' || (this.phase === 'ejecting' && this.active === slug))) {
        this.enter(slug)
      } else {
        this.jump(slug, mode === 'instant' ? 'instant' : 'fade')
      }
      return
    }
    if (this.phase === 'idle' || this.phase === 'ejecting') return
    if (this.reducedMotion || mode === 'instant') this.ejectFade(mode === 'instant')
    else this.eject()
  }

  hover(slug: string | null) {
    if (this.hovered === slug) return
    this.hovered = slug
    if (this.phase !== 'idle') return
    const eyes = this.consoleRefs?.eyes
    if (slug) {
      const p = this.placements.get(slug)
      this.setFace({ expression: 'curious' })
      if (p && eyes && !this.reducedMotion) {
        const dx = p.x + CART.w / 2 - SCREEN.center.x
        const dy = p.y + CART.h / 2 - SCREEN.center.y
        const n = Math.max(1, Math.hypot(dx, dy))
        gsap.to(eyes, { x: (dx / n) * 8, y: (dy / n) * 4.5, duration: 0.32, ease: 'power2.out', overwrite: 'auto' })
      }
    } else {
      this.setFace({ expression: 'neutral' })
      if (eyes) gsap.to(eyes, { x: 0, y: 0, duration: 0.4, ease: 'power2.out', overwrite: 'auto' })
    }
  }

  pointer(nx: number, ny: number) {
    if (this.phase !== 'idle' || this.reducedMotion) return
    const back = this.els.back
    const front = this.els.front
    if (!back || !front) return
    if (!this.parallax) {
      const o = { duration: 0.9, ease: 'power3.out' }
      this.parallax = {
        bx: gsap.quickTo(back, 'x', o),
        by: gsap.quickTo(back, 'y', o),
        fx: gsap.quickTo(front, 'x', o),
        fy: gsap.quickTo(front, 'y', o),
      }
    }
    // Only the far wall and the foreground move; the console, slot and cartridges never do.
    this.parallax.bx(nx * -12)
    this.parallax.by(ny * -6)
    this.parallax.fx(nx * 16)
    this.parallax.fy(ny * 8)
  }

  private resetParallax(duration = 0.3) {
    const targets = [this.els.back, this.els.front].filter(Boolean) as Element[]
    if (targets.length) gsap.to(targets, { x: 0, y: 0, duration, ease: 'power2.out', overwrite: true })
    this.parallax = null
  }

  /* ── sequences ──────────────────────────────────────────────────────────── */

  private enter(slug: string) {
    const els = this.carts.get(slug)!
    const info = this.projects.get(slug)
    const resuming = this.phase === 'ejecting' && this.active === slug
    this.killTimeline()
    this.active = slug
    this.overlayDetached = false
    this.setOverlay(slug)
    this.setPhase('selecting')
    this.setIdleActive(false)
    this.resetParallax(TIMING.select)
    if (!resuming) {
      this.stopFloat(slug) // freeze where it is — no snap
      this.fl = { ...REST }
    }
    els.anchor.classList.add('is-active')
    this.markCamera(true)
    this.setSceneVisible(true)

    const T = TIMING
    const c = this.consoleRefs
    const p = this.placements.get(slug)!
    const ex = SLOT.center.x - cartPivot(p).x
    const bank = Math.sign(ex || 1) * 7

    const tl = gsap.timeline({ onUpdate: this.render, onComplete: this.finishEnter })
    this.tl = tl

    // A — selection
    tl.call(() => this.setFace({ expression: 'happy' }), [], 0)
    tl.to(this.look, { others: 1, dim: DIM_SELECT, hud: 0, duration: 0.42, ease: 'power1.out' }, 0)
    if (c) {
      tl.to(c.body, { scaleY: 1, scaleX: 1, y: 0, duration: T.select, ease: 'power1.out', svgOrigin: BODY_ORIGIN, overwrite: 'auto' }, 0)
      tl.to(c.armR, { rotation: -26, duration: 0.2, ease: 'power2.out', svgOrigin: LIMB_ORIGINS.armR }, 0)
      tl.to(c.armR, { rotation: 0, duration: 0.35, ease: 'power2.inOut', svgOrigin: LIMB_ORIGINS.armR }, 0.32)
      tl.to(c.eyes, { x: 0, y: 0, duration: 0.25 }, 0)
    }

    // B — approach: lift, arc toward the slot, tilt back to lie flat
    const a = resuming ? 0 : T.select
    tl.call(() => this.setPhase('inserting'), [], a)
    tl.to(els.idle, { y: 0, rotation: 0, duration: T.approach, ease: 'power2.inOut' }, a)
    tl.to(this.fl, { t: 1, duration: T.approach, ease: 'power2.inOut' }, a)
    tl.to(this.fl, { tilt: INSERT_POSE.tilt, duration: T.approach * 0.72, ease: 'power2.in' }, a + T.approach * 0.28)
    tl.to(this.fl, { depth: -INSERT_POSE.standoff, duration: T.approach * 0.6, ease: 'power1.inOut' }, a + T.approach * 0.4)
    tl.to(this.fl, {
      keyframes: [
        { s: INSERT_POSE.liftScale, rz: bank, duration: T.approach * 0.45, ease: 'power1.out' },
        { s: INSERT_SCALE, rz: SLOT.angle, duration: T.approach * 0.55, ease: 'power1.inOut' },
      ],
    }, a)

    // C — insertion: push through the slot; the clip + lip hide what's inside
    const b = a + T.approach
    tl.to(this.fl, { depth: INSERTED.depth, duration: T.insert, ease: 'power2.in' }, b)
    tl.call(() => {
      if (info) this.setFace({ expression: 'boot', emblem: info.emblem, title: info.title, color: info.color })
    }, [], b + T.insert * 0.72)
    if (c) {
      tl.call(() => c.slotFill.setAttribute('fill', info?.color ?? '#E26D7A'), [], b)
      tl.to(c.slotFill, { opacity: 1, duration: 0.08 }, b + T.insert * 0.85)
      tl.fromTo(c.indicator, { attr: { r: 6 } }, { attr: { r: 8 }, duration: 0.09, yoyo: true, repeat: 1 }, b + T.insert * 0.9)
      tl.to(c.body, { scaleY: 0.984, scaleX: 1.008, duration: 0.07, yoyo: true, repeat: 1, ease: 'power1.out', svgOrigin: BODY_ORIGIN }, b + T.insert)
    }

    // D — camera: dolly into the screen; the project interface rides on it
    const z = b + T.insert - T.zoomOverlap
    tl.call(() => this.setPhase('zooming'), [], z)
    tl.to(this.cam, { z: 1, duration: T.zoom, ease: 'power2.inOut' }, z)
    tl.to(this.look, { dim: DIM_ZOOM, duration: T.zoom * 0.7, ease: 'power1.in' }, z)
    tl.to(this.look, { overlay: 1, duration: T.zoom * (T.revealEnd - T.revealStart), ease: 'power1.inOut' }, z + T.zoom * T.revealStart)
  }

  private finishEnter = () => {
    this.tl = null
    this.cam.z = 1
    this.look.overlay = 1
    this.overlayDetached = false
    this.markCamera(false)
    this.render()
    this.setSceneVisible(false)
    this.setPhase('project')
  }

  private eject() {
    const slug = this.active
    this.killTimeline()
    this.setPhase('ejecting')
    this.setSceneVisible(true)
    this.markCamera(true)
    this.setIdleActive(false)

    const els = slug ? this.carts.get(slug) : undefined
    const T = TIMING
    const E = T.ejectSpeed
    const c = this.consoleRefs
    const tl = gsap.timeline({ onUpdate: this.render, onComplete: this.finishEject })
    this.tl = tl

    // If the overlay was shown without the camera (fade/direct link), attach it now.
    this.overlayDetached = false
    const zoomT = T.zoom * E * Math.max(0.35, this.cam.z)
    tl.to(this.look, { overlay: 0, duration: zoomT * 0.45, ease: 'power1.in' }, 0)
    tl.to(this.cam, { z: 0, duration: zoomT, ease: 'power2.inOut' }, 0)
    tl.to(this.look, { dim: DIM_SELECT, duration: zoomT, ease: 'power1.out' }, 0)
    tl.call(() => this.setFace({ expression: 'happy' }), [], zoomT * 0.5)

    if (!els || !slug || !this.placements.has(slug)) {
      tl.to(this.look, { dim: 0, others: 0, hud: 1, duration: 0.3 }, zoomT)
      return
    }
    // Eject the cartridge out of the slot, then fly it home.
    const b = zoomT * 0.62
    if (c) tl.to(c.slotFill, { opacity: 0, duration: 0.06 }, b + 0.02)
    if (c) tl.fromTo(c.indicator, { attr: { r: 6 } }, { attr: { r: 8 }, duration: 0.08, yoyo: true, repeat: 1 }, b)
    if (this.fl.depth > -INSERT_POSE.standoff) {
      tl.to(this.fl, { depth: -INSERT_POSE.standoff, duration: T.insert * E, ease: 'power3.out' }, b)
    }
    const h = b + (this.fl.depth > -INSERT_POSE.standoff ? T.insert * E : 0)
    tl.to(this.fl, { t: 0, duration: T.approach * E, ease: 'power2.inOut' }, h)
    tl.to(this.fl, { tilt: 0, duration: T.approach * E * 0.7, ease: 'power2.out' }, h)
    tl.to(this.fl, { depth: 0, s: 1, rz: 0, duration: T.approach * E, ease: 'power1.inOut' }, h)
    tl.to(this.look, { others: 0, dim: 0, hud: 1, duration: 0.36, ease: 'power1.inOut' }, h + T.approach * E * 0.45)
    tl.call(() => this.setFace({ expression: 'neutral' }), [], h + T.approach * E)
  }

  private finishEject = () => {
    const slug = this.active
    this.tl = null
    this.resetToRoom()
    this.setPhase('idle', slug)
  }

  /** Reduced motion / instant: put the room back behind the overlay, then fade the overlay out. */
  private ejectFade(instant: boolean) {
    this.killTimeline()
    this.setPhase('ejecting')
    const slug = this.active
    this.overlayDetached = true
    this.cam.z = 0
    this.fl = { ...REST }
    if (slug) this.homeCart(slug, false)
    this.active = null
    Object.assign(this.look, { dim: 0, others: 0, hud: 1 })
    this.consoleRefs?.slotFill.setAttribute('opacity', '0')
    this.setFace({ expression: 'neutral' })
    this.setSceneVisible(true)
    this.render()
    if (instant) {
      this.look.overlay = 0
      this.finishEjectFade(slug)
      return
    }
    this.tl = gsap.timeline({ onUpdate: this.render, onComplete: () => this.finishEjectFade(slug) })
    this.tl.to(this.look, { overlay: 0, duration: TIMING.fade, ease: 'power1.out' })
  }

  private finishEjectFade(slug: string | null) {
    this.tl = null
    this.overlayDetached = false
    this.setOverlay(null)
    this.render()
    this.setIdleActive(true)
    this.setPhase('idle', slug)
  }

  /** Show a project without the insertion sequence (direct link, list, reduced motion, project→project). */
  private jump(slug: string, mode: 'fade' | 'instant') {
    this.killTimeline()
    const fromRoom = this.cam.z < 0.5 || this.phase === 'idle'
    const prev = this.active
    const apply = () => {
      if (prev && prev !== slug) this.homeCart(prev, true)
      const els = this.carts.get(slug)
      if (els && this.placements.has(slug)) {
        this.active = slug
        this.stopFloat(slug)
        gsap.set(els.idle, { y: 0, rotation: 0 })
        els.anchor.classList.add('is-active')
        this.fl = { ...INSERTED }
        const info = this.projects.get(slug)
        this.consoleRefs?.slotFill.setAttribute('fill', info?.color ?? '#E26D7A')
        this.consoleRefs?.slotFill.setAttribute('opacity', '1')
        if (info) this.setFace({ expression: 'boot', emblem: info.emblem, title: info.title, color: info.color })
      } else {
        this.active = null
      }
      this.cam.z = 1
      Object.assign(this.look, { dim: DIM_ZOOM, others: 1, hud: 0 })
      this.resetParallax(0)
    }
    this.setIdleActive(false)

    if (mode === 'instant') {
      apply()
      this.setOverlay(slug)
      this.look.overlay = 1
      this.finishEnter()
      return
    }

    this.setPhase('zooming')
    this.setSceneVisible(true)
    const tl = gsap.timeline({ onUpdate: this.render, onComplete: this.finishEnter })
    this.tl = tl
    if (fromRoom) {
      // Cross-fade the interface over the room, then settle the room behind it.
      this.overlayDetached = true
      this.setOverlay(slug)
      tl.fromTo(this.look, { overlay: 0 }, { overlay: 1, duration: TIMING.fade, ease: 'power1.out' })
      tl.call(apply)
    } else {
      // Already inside a screen: blink the screen between projects.
      tl.to(this.look, { overlay: 0, duration: 0.14, ease: 'power1.in' })
      tl.call(() => {
        apply()
        this.setOverlay(slug)
      })
      tl.to(this.look, { overlay: 1, duration: 0.2, ease: 'power1.out' })
    }
  }

  /* ── helpers ────────────────────────────────────────────────────────────── */

  private killTimeline() {
    if (this.tl) {
      this.tl.kill()
      this.tl = null
    }
  }

  private resetToRoom() {
    const slug = this.active
    this.cam.z = 0
    this.fl = { ...REST }
    Object.assign(this.look, { dim: 0, others: 0, overlay: 0, hud: 1 })
    if (slug) this.homeCart(slug, false)
    this.active = null
    this.overlayDetached = false
    this.markCamera(false)
    this.consoleRefs?.slotFill.setAttribute('opacity', '0')
    this.setFace({ expression: this.hovered ? 'curious' : 'neutral' })
    this.setOverlay(null)
    this.render()
    this.setSceneVisible(true)
    if (this.running) this.setIdleActive(true)
  }

  /** Put a cartridge back at its home spot (no animation). */
  private homeCart(slug: string, resumeFloat: boolean) {
    const els = this.carts.get(slug)
    if (!els) return
    els.anchor.classList.remove('is-active')
    els.anchor.style.clipPath = ''
    els.flight.style.transform = ''
    els.shadow.style.opacity = ''
    gsap.set(els.idle, { y: 0, rotation: 0 })
    if (resumeFloat && this.idleActive) this.startFloat(slug, true)
  }

  private setPhase(phase: Phase, focusSlug: string | null = this.active) {
    this.phase = phase
    this.on.phase(phase, focusSlug)
  }

  private setOverlay(slug: string | null) {
    if (this.overlaySlug === slug) return
    this.overlaySlug = slug
    this.on.overlay(slug)
  }

  private setFace(face: FaceState) {
    const f = this.faceState
    if (f.expression === face.expression && f.emblem === face.emblem && f.title === face.title) return
    this.faceState = face
    this.on.face(face)
  }

  private setSceneVisible(v: boolean) {
    const scene = this.els.scene as HTMLElement | undefined
    if (scene) scene.style.visibility = v ? '' : 'hidden'
  }

  private markCamera(moving: boolean) {
    const cam = this.els.camera as HTMLElement | undefined
    cam?.classList.toggle('is-moving', moving)
  }

  /* ── idle life ──────────────────────────────────────────────────────────── */

  private setIdleActive(on: boolean) {
    if (on === this.idleActive) return
    this.idleActive = on
    if (on) {
      for (const slug of this.carts.keys()) if (slug !== this.active) this.startFloat(slug, false)
      this.startLoops()
    } else {
      for (const slug of [...this.floats.keys()]) this.stopFloat(slug)
      this.stopLoops()
    }
  }

  private startFloat(slug: string, fromRest: boolean) {
    this.stopFloat(slug)
    const els = this.carts.get(slug)
    const p = this.placements.get(slug)
    if (!els || !p || this.reducedMotion) return
    const dur = gsap.utils.random(IDLE.floatDuration[0], IDLE.floatDuration[1])
    const phase = fromRest ? 0 : Math.random()
    const sway = IDLE.swayDegrees * (0.6 + Math.random() * 0.4)
    const y = gsap.fromTo(els.idle, { y: 0 }, { y: -p.amp, duration: dur / 2, repeat: -1, yoyo: true, ease: 'sine.inOut' })
    const r = gsap.fromTo(
      els.idle,
      { rotation: -sway },
      { rotation: sway, duration: dur * 0.83, repeat: -1, yoyo: true, ease: 'sine.inOut' },
    )
    const s = gsap.fromTo(
      els.shadow,
      { scale: 1, opacity: 1 },
      { scale: 0.82, opacity: 0.6, duration: dur / 2, repeat: -1, yoyo: true, ease: 'sine.inOut' },
    )
    y.progress(phase)
    s.progress(phase)
    r.progress(fromRest ? 0.5 : Math.random())
    this.floats.set(slug, [y, r, s])
  }

  private stopFloat(slug: string) {
    const tweens = this.floats.get(slug)
    if (!tweens) return
    tweens.forEach((t) => t.kill())
    this.floats.delete(slug)
  }

  private startLoops() {
    const c = this.consoleRefs
    if (!c || this.reducedMotion) return
    this.loops.push(
      gsap.to(c.body, {
        scaleY: 1.012,
        y: -1.4,
        duration: IDLE.breathe / 2,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
        svgOrigin: BODY_ORIGIN,
      }),
    )
    this.scheduleBlink()
    this.scheduleLimb()
  }

  private stopLoops() {
    this.loops.forEach((t) => t.kill())
    this.loops = []
    this.blinkCall?.kill()
    this.limbCall?.kill()
    this.blinkCall = null
    this.limbCall = null
    const c = this.consoleRefs
    if (c) {
      gsap.killTweensOf([c.armL, c.armR, c.legL, c.legR])
      gsap.to(c.body, { scaleY: 1, scaleX: 1, y: 0, duration: 0.2, svgOrigin: BODY_ORIGIN, overwrite: 'auto' })
      gsap.to(c.armL, { rotation: 0, duration: 0.2, svgOrigin: LIMB_ORIGINS.armL })
      gsap.to(c.armR, { rotation: 0, duration: 0.2, svgOrigin: LIMB_ORIGINS.armR })
      gsap.to(c.legL, { rotation: 0, duration: 0.2, svgOrigin: LIMB_ORIGINS.legL })
      gsap.to(c.legR, { rotation: 0, duration: 0.2, svgOrigin: LIMB_ORIGINS.legR })
    }
  }

  private scheduleBlink() {
    this.blinkCall = gsap.delayedCall(gsap.utils.random(IDLE.blinkEvery[0], IDLE.blinkEvery[1]), () => {
      this.blink()
      if (Math.random() < 0.25) gsap.delayedCall(0.24, () => this.blink())
      this.scheduleBlink()
    })
  }

  private blink() {
    const eyes = this.consoleRefs?.eyes
    const e = this.faceState.expression
    if (!eyes || (e !== 'neutral' && e !== 'curious')) return
    gsap.fromTo(eyes, { scaleY: 1 }, { scaleY: 0.08, duration: 0.07, yoyo: true, repeat: 1, ease: 'power1.in', transformOrigin: '50% 50%' })
  }

  private scheduleLimb() {
    this.limbCall = gsap.delayedCall(gsap.utils.random(IDLE.limbEvery[0], IDLE.limbEvery[1]), () => {
      const c = this.consoleRefs
      if (c) {
        const pick = Math.floor(Math.random() * 3)
        if (pick === 0) {
          gsap.to(c.armR, { rotation: -12, duration: 0.45, yoyo: true, repeat: 1, ease: 'sine.inOut', svgOrigin: LIMB_ORIGINS.armR })
        } else if (pick === 1) {
          gsap.to(c.legR, { rotation: 6, duration: 0.16, yoyo: true, repeat: 3, ease: 'sine.inOut', svgOrigin: LIMB_ORIGINS.legR })
        } else {
          gsap.to(c.armL, { rotation: 7, duration: 0.6, yoyo: true, repeat: 1, ease: 'sine.inOut', svgOrigin: LIMB_ORIGINS.armL })
        }
      }
      this.scheduleLimb()
    })
  }

  /* ── render ─────────────────────────────────────────────────────────────── */

  render = () => {
    const camera = this.els.camera as HTMLElement | undefined
    const overlay = this.els.overlay as HTMLElement | undefined
    const dim = this.els.dim as HTMLElement | undefined
    const hud = this.els.hud as HTMLElement | undefined
    const z = this.cam.z

    if (camera) {
      if (z <= 0) camera.style.transform = ''
      else {
        const c = cameraAt(this.frame, z)
        camera.style.transform = `translate(${c.tx}px, ${c.ty}px) scale(${c.k})`
      }
    }
    if (overlay) {
      if (this.overlayDetached || z >= 1) overlay.style.transform = ''
      else {
        const o = overlayAt(this.frame, z)
        overlay.style.transform = `translate(${o.tx}px, ${o.ty}px) scale(${o.k})`
      }
      overlay.style.opacity = String(this.look.overlay)
      overlay.style.visibility = this.look.overlay > 0.001 ? 'visible' : 'hidden'
    }
    if (dim) dim.style.opacity = String(this.look.dim)
    // The boot screen gives way to the project interface as it fades in.
    this.consoleRefs?.screen.setAttribute('opacity', String(Math.max(0, 1 - this.look.overlay * 2.2)))
    if (hud) hud.style.opacity = String(this.look.hud)

    for (const [slug, els] of this.carts) {
      if (slug === this.active) continue
      els.anchor.style.opacity = this.look.others > 0 ? String(1 - 0.6 * this.look.others) : ''
    }
    this.renderFlight()
  }

  private renderFlight() {
    const lip = this.els.lip as SVGGElement | undefined
    const slug = this.active
    const els = slug ? this.carts.get(slug) : undefined
    const p = slug ? this.placements.get(slug) : undefined
    if (!els || !p) {
      lip?.setAttribute('opacity', '0')
      return
    }
    els.anchor.style.opacity = ''
    const { t, tilt, rz, s, depth } = this.fl
    const pivot = cartPivot(p)
    const ex = SLOT.center.x - pivot.x
    const ey = SLOT.center.y - pivot.y
    // Cubic path: lift a little, swing across, arrive from just below/in front of the slot.
    const x = bezier(0, ex * 0.22, ex, ex, t)
    const y = bezier(0, -INSERT_POSE.lift, ey + INSERT_POSE.under, ey, t)
    els.flight.style.transform =
      `translate(${x}px, ${y}px) rotate(${rz}deg) scale(${s}) ` +
      `perspective(${INSERT_POSE.perspective}px) rotateX(${tilt}deg) translateY(${-depth}px)`
    els.shadow.style.opacity = String(Math.max(0, 1 - t * 3))

    const aligned = t >= 0.999
    els.anchor.style.clipPath = aligned ? slotClip(p) : ''
    const lipOn = aligned && depth > -INSERT_POSE.standoff + 0.5 && depth < CART.h + 4
    lip?.setAttribute('opacity', lipOn ? '1' : '0')
  }
}

function bezier(a: number, b: number, c: number, d: number, t: number) {
  const u = 1 - t
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d
}

/** Half-plane below the slot's upper lip, in the cartridge anchor's local coordinates. */
function slotClip(base: ScenePoint) {
  const L = SLOT.lipLeft
  const R = SLOT.lipRight
  const len = Math.hypot(R.x - L.x, R.y - L.y)
  const ux = (R.x - L.x) / len
  const uy = (R.y - L.y) / len
  const E = 4000
  const pts = [
    { x: L.x - ux * E, y: L.y - uy * E },
    { x: R.x + ux * E, y: R.y + uy * E },
    { x: R.x + ux * E, y: R.y + uy * E + E },
    { x: L.x - ux * E, y: L.y - uy * E + E },
  ]
  return `polygon(${pts.map((q) => `${(q.x - base.x).toFixed(2)}px ${(q.y - base.y).toFixed(2)}px`).join(', ')})`
}
