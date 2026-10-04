import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Hud } from './components/Hud'
import { findProject, profile, projects } from './content/portfolio'
import type { Project } from './content/types'
import { goHome, navigate, parsePath, useRoute, type Via } from './lib/router'
import { SceneDirector, type Phase } from './scene/director'
import type { Fit } from './scene/geometry'
import { computePlacements, pageCount, pageOf } from './scene/placement'
import { Scene } from './scene/Scene'
import type { FaceState } from './scene/ScreenFace'
import { AboutPanel, ContactPanel, ProjectListPanel } from './views/Panels'
import { ProjectView } from './views/ProjectView'

const projectMap = new Map(projects.map((p) => [p.slug, p]))

function useMedia(query: string) {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setMatch(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return match
}

function modeFor(via: Via): 'animate' | 'fade' | 'instant' {
  if (via === 'initial') return 'instant'
  if (via === 'cartridge' || via === 'pop' || via === 'eject') return 'animate'
  return 'fade'
}

export default function App() {
  const { route, state, key } = useRoute()
  const [phase, setPhase] = useState<Phase>('idle')
  const [face, setFace] = useState<FaceState>({ expression: 'neutral' })
  const [overlaySlug, setOverlaySlug] = useState<string | null>(null)
  const [fit, setFit] = useState<Fit | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [focusRequest, setFocusRequest] = useState<{ slug: string; n: number } | null>(null)
  const reduced = useMedia('(prefers-reduced-motion: reduce)')
  const touch = useMedia('(hover: none)')

  const director = useMemo(
    () =>
      new SceneDirector({
        phase: (p, slug) => {
          setPhase(p)
          if (p === 'idle' && slug) setFocusRequest((r) => ({ slug, n: (r?.n ?? 0) + 1 }))
        },
        face: setFace,
        overlay: setOverlaySlug,
        fit: setFit,
      }),
    [],
  )

  useEffect(() => director.setReducedMotion(reduced), [director, reduced])
  useEffect(() => {
    // Handy for debugging the timeline from the console during development.
    if (import.meta.env.DEV) (window as unknown as { __director: SceneDirector }).__director = director
  }, [director])

  useLayoutEffect(() => {
    director.setProjects(projects.map((p) => ({ slug: p.slug, title: p.title, emblem: p.emblem, color: p.labelColor })))
    const onResize = () => director.setViewport(window.innerWidth, window.innerHeight)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [director])

  useEffect(() => {
    director.start()
    return () => director.dispose()
  }, [director])

  const layout = fit?.layout ?? 'wide'
  const routeSlug = route.name === 'project' && projectMap.has(route.slug) ? route.slug : null
  const pages = pageCount(projects.length, layout)
  // Keep the shelf page that holds the open (or ejecting) cartridge on screen.
  const pinned = routeSlug ?? overlaySlug
  const shownPage = pinned ? pageOf(projects, pinned, layout) : Math.min(page, pages - 1)
  const [lastPinned, setLastPinned] = useState(pinned)
  if (pinned !== lastPinned) {
    // Stay on that shelf page after the cartridge returns.
    setLastPinned(pinned)
    if (pinned) setPage(pageOf(projects, pinned, layout))
  }
  const placements = useMemo(() => computePlacements(projects, layout, shownPage), [layout, shownPage])

  useLayoutEffect(() => {
    director.setPlacements(placements)
  }, [director, placements])

  useLayoutEffect(() => {
    director.setPager(pages > 1)
  }, [director, pages])

  // Route → scene. Runs after the cartridges have registered, so direct links can
  // start in the "inserted" state.
  const lastKey = useRef(-1)
  useEffect(() => {
    if (lastKey.current === key) return
    lastKey.current = key
    if (route.name === 'notFound' || (route.name === 'project' && !routeSlug)) {
      navigate({ name: 'home' }, { replace: true, via: 'initial', notice: 'notFound' })
      return
    }
    director.goTo(routeSlug, modeFor(state.via))
  }, [director, key, route, routeSlug, state.via])

  const onSelect = useCallback(
    (slug: string) => {
      // Lock further selections: the URL changes synchronously, the scene a moment later.
      if (director.phase !== 'idle' || parsePath(window.location.pathname).name !== 'home') return
      navigate({ name: 'project', slug }, { via: 'cartridge' })
    },
    [director],
  )

  const onHover = useCallback(
    (slug: string | null) => {
      setHovered(slug)
      director.hover(slug)
    },
    [director],
  )

  const closePanel = useCallback(() => goHome('link'), [])

  const panel = route.name === 'about' || route.name === 'contact' || route.name === 'list' ? route.name : null
  const overlayProject: Project | undefined = overlaySlug ? findProject(overlaySlug) : undefined
  const sceneInteractive = phase === 'idle' && !panel
  const hoveredProject = hovered && phase === 'idle' ? (projectMap.get(hovered) ?? null) : null

  useEffect(() => {
    const p = overlayProject && phase !== 'ejecting' ? overlayProject : null
    document.title = p ? `${p.title} — ${profile.name}` : panel === 'about' ? `About — ${profile.name}` : panel === 'contact' ? `Contact — ${profile.name}` : `${profile.name} — Portfolio`
  }, [overlayProject, phase, panel])

  return (
    <>
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); navigate({ name: 'list' }) }}>
        Skip to the project list
      </a>
      <Scene
        director={director}
        layout={layout}
        placements={placements}
        projects={projectMap}
        face={face}
        interactive={sceneInteractive}
        focusRequest={focusRequest}
        onSelect={onSelect}
        onHover={onHover}
      />
      <Hud
        hudRef={director.bind('hud') as (el: HTMLDivElement | null) => void}
        hovered={hoveredProject}
        interactive={sceneInteractive || (phase === 'idle' && !!panel)}
        touch={touch}
        page={shownPage}
        pages={pages}
        onPage={(p) => setPage(Math.max(0, Math.min(pages - 1, p)))}
        current={route.name}
      />
      {overlayProject && (
        <ProjectView
          project={overlayProject}
          settled={phase === 'project'}
          shellRef={director.bind('overlay') as (el: HTMLDivElement | null) => void}
        />
      )}
      {phase === 'idle' && panel === 'about' && <AboutPanel onClose={closePanel} />}
      {phase === 'idle' && panel === 'contact' && <ContactPanel onClose={closePanel} />}
      {phase === 'idle' && panel === 'list' && <ProjectListPanel onClose={closePanel} />}
      <div className="sr-status" role="status" aria-live="polite">
        {phase === 'project' && overlayProject ? `Opened ${overlayProject.title}.` : ''}
      </div>
      {state.notice === 'notFound' && (
        <div key={key} className="toast" role="status">
          That page isn’t on the shelf, so here’s the room instead.
        </div>
      )}
    </>
  )
}
