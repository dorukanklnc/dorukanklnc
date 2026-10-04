import { useEffect, useRef, type Ref } from 'react'
import { profile, projects } from '../content/portfolio'
import type { Project } from '../content/types'
import { assetUrl } from '../lib/assets'
import { goHome, linkHandler, pathFor } from '../lib/router'

interface Props {
  project: Project
  /** True once the interface fully covers the screen and should take focus. */
  settled: boolean
  shellRef: Ref<HTMLDivElement>
}

export function ProjectView({ project, settled, shellRef }: Props) {
  const heading = useRef<HTMLHeadingElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const [hero, ...gallery] = project.screenshots
  const index = projects.findIndex((p) => p.slug === project.slug)
  const next = projects[(index + 1) % projects.length]
  const prev = projects[(index - 1 + projects.length) % projects.length]

  useEffect(() => {
    if (settled) heading.current?.focus({ preventScroll: true })
  }, [settled, project.slug])

  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 })
  }, [project.slug])

  useEffect(() => {
    if (!settled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) goHome()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [settled])

  return (
    <div ref={shellRef} className="project-shell" data-settled={settled || undefined}>
      <div ref={scroller} className="project-scroll">
        <header className="pv-bar">
          <a className="pv-brand" href={pathFor({ name: 'home' })} onClick={(e) => { e.preventDefault(); goHome() }}>
            <span className="pv-brand-dot" aria-hidden="true" />
            {profile.name}
          </a>
          <nav className="pv-nav" aria-label="Project navigation">
            <a href={pathFor({ name: 'list' })} onClick={linkHandler({ name: 'list' })}>
              All projects
            </a>
            <button type="button" className="btn btn-eject" onClick={() => goHome()}>
              <span className="btn-dot btn-dot-green" aria-hidden="true" />
              Eject
            </button>
          </nav>
        </header>

        <main className="pv-main" id="main">
          <figure className="pv-preview">
            <div className="pv-frame">
              {hero ? (
                <img src={assetUrl(hero.src)} alt={hero.alt} width={1600} height={1000} decoding="async" />
              ) : (
                <div className="pv-noimg">No preview yet</div>
              )}
            </div>
            {hero?.demo && <figcaption>Demo preview — real screenshots coming soon.</figcaption>}
          </figure>

          <div className="pv-info">
            <p className="pv-type">{project.type}</p>
            <h1 ref={heading} tabIndex={-1}>
              {project.title}
            </h1>
            <p className="pv-summary">{project.summary}</p>

            <dl className="pv-meta">
              {project.role && (
                <div>
                  <dt>Role</dt>
                  <dd>{project.role}</dd>
                </div>
              )}
              {project.technologies.length > 0 && (
                <div>
                  <dt>Stack</dt>
                  <dd>
                    <ul className="chips" aria-label="Technologies">
                      {project.technologies.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                  </dd>
                </div>
              )}
            </dl>

            {project.features && project.features.length > 0 && (
              <section className="pv-features" aria-labelledby="pv-features-h">
                <h2 id="pv-features-h">Highlights</h2>
                <ul>
                  {project.features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </section>
            )}

            <div className="pv-actions">
              {project.liveUrl && (
                <a className="btn btn-dark" href={project.liveUrl} target="_blank" rel="noreferrer">
                  <span className="btn-dot btn-dot-red" aria-hidden="true" />
                  View live project
                  <span className="visually-hidden"> (opens in a new tab)</span>
                </a>
              )}
              {project.sourceUrl && (
                <a className="btn" href={project.sourceUrl} target="_blank" rel="noreferrer">
                  <span className="btn-dot btn-dot-blue" aria-hidden="true" />
                  Source code
                  <span className="visually-hidden"> (opens in a new tab)</span>
                </a>
              )}
              <button type="button" className="btn btn-eject" onClick={() => goHome()}>
                <span className="btn-dot btn-dot-green" aria-hidden="true" />
                Eject
              </button>
            </div>

            {import.meta.env.DEV && project.placeholder && (
              <p className="pv-devnote">
                Starter content — replace the text and media for “{project.slug}” in src/content/portfolio.ts. (This note only shows in development.)
              </p>
            )}
          </div>
        </main>

        {(project.description?.length || gallery.length > 0) && (
          <section className="pv-case" aria-label="Case study">
            {project.description?.map((para, i) => (
              <p key={i}>{para}</p>
            ))}
            {gallery.length > 0 && (
              <div className="pv-gallery">
                {gallery.map((m) => (
                  <figure key={m.src}>
                    <img src={assetUrl(m.src)} alt={m.alt} loading="lazy" decoding="async" />
                    {m.demo && <figcaption>Demo preview</figcaption>}
                  </figure>
                ))}
              </div>
            )}
          </section>
        )}

        {projects.length > 1 && (
          <nav className="pv-more" aria-label="Other projects">
            <a href={pathFor({ name: 'project', slug: prev.slug })} onClick={linkHandler({ name: 'project', slug: prev.slug }, 'link', true)}>
              <span aria-hidden="true">←</span> {prev.title}
            </a>
            <a href={pathFor({ name: 'project', slug: next.slug })} onClick={linkHandler({ name: 'project', slug: next.slug }, 'link', true)}>
              {next.title} <span aria-hidden="true">→</span>
            </a>
          </nav>
        )}
      </div>
    </div>
  )
}
