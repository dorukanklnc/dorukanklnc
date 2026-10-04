import type { Ref } from 'react'
import { profile } from '../content/portfolio'
import type { Project } from '../content/types'
import { linkHandler, pathFor, type Route } from '../lib/router'

interface HudProps {
  hudRef: Ref<HTMLDivElement>
  hovered: Project | null
  interactive: boolean
  touch: boolean
  page: number
  pages: number
  onPage: (page: number) => void
  current: Route['name']
}

const NAV: { route: Route; label: string; name: Route['name'] }[] = [
  { route: { name: 'list' }, label: 'Project list', name: 'list' },
  { route: { name: 'about' }, label: 'About', name: 'about' },
  { route: { name: 'contact' }, label: 'Contact', name: 'contact' },
]

export function Hud({ hudRef, hovered, interactive, touch, page, pages, onPage, current }: HudProps) {
  return (
    <div ref={hudRef} className="hud" inert={!interactive}>
      <header className="hud-top">
        <a
          className="brand"
          href={pathFor({ name: 'home' })}
          onClick={current === 'home' ? (e) => e.preventDefault() : linkHandler({ name: 'home' })}
        >
          <span className="brand-name">{profile.name}</span>
          <span className="brand-tag">{profile.tagline}</span>
        </a>
        <nav className="hud-nav" aria-label="Main">
          {NAV.map((n) => (
            <a
              key={n.name}
              href={pathFor(n.route)}
              onClick={linkHandler(n.route)}
              aria-current={current === n.name ? 'page' : undefined}
            >
              {n.label}
            </a>
          ))}
        </nav>
      </header>

      <div className="hud-bottom">
        {pages > 1 && (
          <div className="pager" role="group" aria-label="Cartridge shelf">
            <button type="button" onClick={() => onPage(page - 1)} disabled={page === 0} aria-label="Previous shelf">
              ◀
            </button>
            <span aria-live="polite">
              Shelf {page + 1} / {pages}
            </span>
            <button type="button" onClick={() => onPage(page + 1)} disabled={page >= pages - 1} aria-label="Next shelf">
              ▶
            </button>
          </div>
        )}
        <div className="hud-info" aria-hidden={hovered ? 'true' : undefined}>
          {hovered ? (
            <>
              <p className="hud-info-title">
                <span className="hud-swatch" style={{ background: hovered.labelColor }} />
                {hovered.title}
                <span className="hud-info-type">{hovered.type}</span>
              </p>
              <p className="hud-info-summary">{hovered.summary}</p>
            </>
          ) : (
            <p className="hud-hint">
              {touch ? 'Tap a cartridge to explore my work.' : 'Choose a cartridge to explore my work.'}
              <a href={pathFor({ name: 'list' })} onClick={linkHandler({ name: 'list' })}>
                View projects as a list
              </a>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
