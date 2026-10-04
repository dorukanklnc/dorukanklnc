import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { profile, projects } from '../content/portfolio'
import { assetUrl } from '../lib/assets'
import { linkHandler, pathFor } from '../lib/router'

interface PanelProps {
  title: string
  eyebrow: string
  onClose: () => void
  children: ReactNode
}

function Panel({ title, eyebrow, onClose, children }: PanelProps) {
  const heading = useRef<HTMLHeadingElement>(null)
  const dialog = useRef<HTMLElement>(null)
  const id = useId()

  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
  }, [title])

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Keep Tab inside the dialog.
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Tab' || !dialog.current) return
    const items = dialog.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex="0"]')
    if (!items.length) return
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && (document.activeElement === first || document.activeElement === heading.current)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="panel-layer">
      <div className="panel-backdrop" onClick={onClose} aria-hidden="true" />
      <section ref={dialog} className="panel" role="dialog" aria-modal="true" aria-labelledby={id} onKeyDown={onKeyDown}>
        <header className="panel-head">
          <div>
            <p className="panel-eyebrow">{eyebrow}</p>
            <h2 id={id} ref={heading} tabIndex={-1}>
              {title}
            </h2>
          </div>
          <button type="button" className="panel-close" onClick={onClose} aria-label="Close and return to the room">
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className="panel-body">{children}</div>
      </section>
    </div>
  )
}

export function AboutPanel({ onClose }: { onClose: () => void }) {
  return (
    <Panel title="About me" eyebrow={profile.name} onClose={onClose}>
      {profile.about.map((p, i) => (
        <p key={i} className={i === 0 ? 'lead' : undefined}>
          {p}
        </p>
      ))}
      {profile.notes && profile.notes.length > 0 && (
        <dl className="notes">
          {profile.notes.map((n) => (
            <div key={n.label}>
              <dt>{n.label}</dt>
              <dd>{n.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <h3>Tools I use</h3>
      <ul className="chips">
        {profile.skills.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
      <p className="panel-foot">
        <a href={pathFor({ name: 'contact' })} onClick={linkHandler({ name: 'contact' }, 'link', true)}>
          Get in touch →
        </a>
      </p>
    </Panel>
  )
}

export function ContactPanel({ onClose }: { onClose: () => void }) {
  return (
    <Panel title="Contact" eyebrow="Say hello" onClose={onClose}>
      <p className="lead">{profile.contactIntro}</p>
      <ul className="contact-list">
        {profile.contact.map((c) => {
          const external = /^https?:/.test(c.href)
          return (
            <li key={c.label}>
              <span className="contact-label">{c.label}</span>
              <a href={c.href} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>
                {c.text}
                {external && <span className="visually-hidden"> (opens in a new tab)</span>}
              </a>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}

export function ProjectListPanel({ onClose }: { onClose: () => void }) {
  return (
    <Panel title="All projects" eyebrow="Cartridge shelf" onClose={onClose}>
      <ul className="project-list">
        {projects.map((p) => {
          const thumb = p.thumbnail ?? p.screenshots[0]
          return (
            <li key={p.slug}>
              <a href={pathFor({ name: 'project', slug: p.slug })} onClick={linkHandler({ name: 'project', slug: p.slug }, 'list')}>
                <span className="pl-thumb" style={{ background: p.labelColor }} aria-hidden="true">
                  {thumb && <img src={assetUrl(thumb.src)} alt="" loading="lazy" />}
                </span>
                <span className="pl-text">
                  <span className="pl-title">{p.title}</span>
                  <span className="pl-type">{p.type}</span>
                  <span className="pl-summary">{p.summary}</span>
                </span>
              </a>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}
