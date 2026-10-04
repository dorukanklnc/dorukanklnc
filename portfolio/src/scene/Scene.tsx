import { memo, useCallback, useEffect, useLayoutEffect, useRef, type PointerEvent } from 'react'
import type { LayoutName, Project } from '../content/types'
import { CartridgeArt } from './Cartridge'
import { CART, CONSOLE_POS, LAYOUTS, STAGE } from './config'
import { Console, SlotLip } from './Console'
import type { Placement, SceneDirector } from './director'
import { RoomBack, RoomFloor, RoomFront, RoomLight } from './Room'
import type { FaceState } from './ScreenFace'

interface CartridgeProps {
  project: Project
  placement: Placement
  director: SceneDirector
  onSelect: (slug: string) => void
  onHover: (slug: string | null) => void
}

const Cartridge = memo(function Cartridge({ project, placement, director, onSelect, onHover }: CartridgeProps) {
  const anchor = useRef<HTMLDivElement>(null)
  const flight = useRef<HTMLDivElement>(null)
  const idle = useRef<HTMLDivElement>(null)
  const shadow = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const { slug } = project

  useLayoutEffect(() => {
    director.registerCart(slug, {
      anchor: anchor.current!,
      flight: flight.current!,
      idle: idle.current!,
      shadow: shadow.current!,
      button: button.current!,
    })
    return () => director.registerCart(slug, null)
  }, [director, slug])

  const descId = `cart-desc-${slug}`
  return (
    <div ref={anchor} className="cart" data-slug={slug} style={{ left: placement.x, top: placement.y }}>
      <div ref={shadow} className="cart-shadow" style={{ top: CART.h + placement.shadow }} aria-hidden="true" />
      <div ref={flight} className="cart-flight">
        <div ref={idle} className="cart-idle">
          <button
            ref={button}
            type="button"
            className="cart-hit"
            aria-label={`${project.title} — ${project.type}. Insert cartridge to open the project.`}
            aria-describedby={descId}
            onClick={() => onSelect(slug)}
            onPointerEnter={(e) => e.pointerType === 'mouse' && onHover(slug)}
            onPointerLeave={(e) => e.pointerType === 'mouse' && onHover(null)}
            onFocus={() => onHover(slug)}
            onBlur={() => onHover(null)}
          >
            <span className="cart-art">
              <CartridgeArt project={project} />
            </span>
          </button>
          <span className="cart-edge" aria-hidden="true" />
          <span className="cart-tag" aria-hidden="true">
            {project.title}
          </span>
          <span id={descId} className="visually-hidden">
            {project.summary}
          </span>
        </div>
      </div>
    </div>
  )
})

interface SceneProps {
  director: SceneDirector
  layout: LayoutName
  placements: Placement[]
  projects: Map<string, Project>
  face: FaceState
  interactive: boolean
  focusRequest: { slug: string; n: number } | null
  onSelect: (slug: string) => void
  onHover: (slug: string | null) => void
}

export function Scene({ director, layout, placements, projects, face, interactive, focusRequest, onSelect, onHover }: SceneProps) {
  const shelf = LAYOUTS[layout].shelf

  useEffect(() => {
    if (!focusRequest || !interactive) return
    const btn = document.querySelector<HTMLButtonElement>(`.cart[data-slug="${focusRequest.slug}"] .cart-hit`)
    btn?.focus({ preventScroll: true })
  }, [focusRequest, interactive])

  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (e.pointerType !== 'mouse') return
      director.pointer((e.clientX / window.innerWidth - 0.5) * 2, (e.clientY / window.innerHeight - 0.5) * 2)
    },
    [director],
  )

  return (
    <div
      ref={director.bind('scene')}
      className="scene"
      inert={!interactive}
      onPointerMove={onPointerMove}
      role="region"
      aria-label="The room. Each floating cartridge is a project."
    >
      <div ref={director.bind('camera')} className="camera">
        <div ref={director.bind('stage')} className="stage" style={{ width: STAGE.w, height: STAGE.h }}>
          <div ref={director.bind('back')} className="layer layer-back">
            <RoomBack />
          </div>
          <div className="layer">
            <RoomFloor />
          </div>
          {shelf && (
            <div className="wall-shelf" style={{ left: shelf.x, top: shelf.y, width: shelf.w, height: shelf.h }} aria-hidden="true">
              <span />
              <span />
            </div>
          )}
          <div className="layer">
            <RoomLight />
          </div>
          <div ref={director.bind('dim')} className="room-dim" />
          <div className="console-wrap" style={{ left: CONSOLE_POS.x, top: CONSOLE_POS.y }}>
            <Console face={face} onRefs={director.registerConsole} />
          </div>
          <div ref={director.bind('front')} className="layer layer-front">
            <RoomFront />
          </div>
          <div className="carts">
            {placements.map((pl) => {
              const project = projects.get(pl.slug)
              return project ? (
                <Cartridge key={pl.slug} project={project} placement={pl} director={director} onSelect={onSelect} onHover={onHover} />
              ) : null
            })}
          </div>
          <div className="slot-lip-wrap" style={{ left: CONSOLE_POS.x, top: CONSOLE_POS.y }}>
            <SlotLip lipRef={director.bind('lip')} />
          </div>
        </div>
      </div>
    </div>
  )
}
