/**
 * Tiny History-API router. Routes:
 *   /                  room
 *   /projects          project list
 *   /projects/:slug    project detail
 *   /about, /contact   info panels over the room
 */
import { useSyncExternalStore, type MouseEvent } from 'react'

export type Route =
  | { name: 'home' }
  | { name: 'list' }
  | { name: 'about' }
  | { name: 'contact' }
  | { name: 'project'; slug: string }
  | { name: 'notFound'; path: string }

/** How the current history entry was reached. */
export type Via = 'initial' | 'cartridge' | 'list' | 'link' | 'pop' | 'eject'

export interface NavState {
  idx: number
  via: Via
  /** The entry directly before this one is the room (so "back" returns to it). */
  fromHome?: boolean
  /** One-off message to show after a redirect. */
  notice?: 'notFound'
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')

export function parsePath(pathname: string): Route {
  let p = pathname
  if (BASE && p.startsWith(BASE)) p = p.slice(BASE.length)
  p = '/' + p.replace(/^\/+|\/+$/g, '')
  if (p === '/' || p === '/index.html') return { name: 'home' }
  if (p === '/projects') return { name: 'list' }
  if (p === '/about') return { name: 'about' }
  if (p === '/contact') return { name: 'contact' }
  const m = p.match(/^\/projects\/([a-z0-9-]+)$/i)
  if (m) return { name: 'project', slug: m[1].toLowerCase() }
  return { name: 'notFound', path: p }
}

export function pathFor(route: Route): string {
  switch (route.name) {
    case 'home':
      return `${BASE}/`
    case 'list':
      return `${BASE}/projects`
    case 'about':
      return `${BASE}/about`
    case 'contact':
      return `${BASE}/contact`
    case 'project':
      return `${BASE}/projects/${route.slug}`
    default:
      return `${BASE}/`
  }
}

interface Snapshot {
  route: Route
  state: NavState
  key: number
}

let key = 0
function read(via?: Via): Snapshot {
  const raw = (window.history.state ?? null) as NavState | null
  const state: NavState = raw && typeof raw.idx === 'number' ? { ...raw, via: via ?? raw.via } : { idx: 0, via: 'initial' }
  return { route: parsePath(window.location.pathname), state, key: ++key }
}

if (!window.history.state || typeof window.history.state.idx !== 'number') {
  window.history.replaceState({ idx: 0, via: 'initial' } satisfies NavState, '')
} else {
  // A refresh keeps history.state; treat it as a fresh load.
  window.history.replaceState({ ...window.history.state, via: 'initial', notice: undefined }, '')
}

let snapshot = read()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

window.addEventListener('popstate', () => {
  snapshot = read('pop')
  emit()
})

export function navigate(route: Route, opts: { via?: Via; replace?: boolean; notice?: NavState['notice'] } = {}) {
  const current = snapshot
  const via = opts.via ?? 'link'
  const next: NavState = {
    idx: opts.replace ? current.state.idx : current.state.idx + 1,
    via,
    fromHome: opts.replace ? current.state.fromHome : current.route.name === 'home',
    notice: opts.notice,
  }
  const url = pathFor(route)
  if (opts.replace) window.history.replaceState(next, '', url)
  else window.history.pushState(next, '', url)
  snapshot = { route: parsePath(window.location.pathname), state: next, key: ++key }
  emit()
}

/** Return to the room: step back when the previous entry is the room, otherwise push it. */
export function goHome(via: Via = 'eject') {
  if (snapshot.state.fromHome && snapshot.state.idx > 0) window.history.back()
  else navigate({ name: 'home' }, { via })
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function useRoute(): Snapshot {
  return useSyncExternalStore(subscribe, () => snapshot)
}

/** Click handler for internal <a> links: keeps real hrefs (open in new tab still works). */
export function linkHandler(route: Route, via: Via = 'link', replace = false) {
  return (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    navigate(route, { via, replace })
  }
}
