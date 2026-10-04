/** A point in scene (stage) units. The stage is 2400 × 1600 units; see src/scene/config.ts. */
export interface ScenePoint {
  x: number
  y: number
}

export type LayoutName = 'wide' | 'medium' | 'tall'

/**
 * Optional per-project room placement. Each value is the cartridge's top-left corner
 * in stage units for that layout. When omitted, the cartridge takes the next free
 * default slot from src/scene/config.ts.
 */
export type RoomPlacement = Partial<Record<LayoutName, ScenePoint>>

export interface ProjectMedia {
  /** Path relative to /public (e.g. "projects/rolebluff/preview.svg") or an absolute URL. */
  src: string
  alt: string
  /** Shows a "Demo preview" caption. Set to false once you use a real screenshot. */
  demo?: boolean
}

export interface Project {
  /** URL slug: /projects/<slug>. Lowercase, hyphenated, unique. */
  slug: string
  title: string
  /** Small label above the title, e.g. "Android app". */
  type: string
  /** One or two sentences. Shown on hover/focus in the room and at the top of the project page. */
  summary: string
  /** Optional longer case-study paragraphs shown below the main section. */
  description?: string[]
  /** Your role on the project. Omit to hide the row. */
  role?: string
  technologies: string[]
  /** Short feature bullet points. Omit or leave empty to hide the list. */
  features?: string[]
  /** Image on the cartridge label. Falls back to the first screenshot. */
  thumbnail: ProjectMedia
  /** First screenshot is the large preview; the rest form a small gallery. */
  screenshots: ProjectMedia[]
  /** Only rendered when set. Never put placeholder URLs here. */
  liveUrl?: string
  sourceUrl?: string
  /** Cartridge label colour (any CSS colour). */
  labelColor: string
  /** One to three characters shown as the cartridge emblem and on the console's boot screen. */
  emblem: string
  /** Marks starter content that still needs your real information (shown as a hint in dev mode only). */
  placeholder?: boolean
  room?: RoomPlacement
}

export interface ContactLink {
  label: string
  href: string
  /** Visible text, e.g. the address or handle. */
  text: string
}

export interface Profile {
  name: string
  /** Short line under the name. */
  tagline: string
  /** About page paragraphs. */
  about: string[]
  /** Short "currently" style notes for the About page. */
  notes?: { label: string; value: string }[]
  skills: string[]
  contact: ContactLink[]
  /** Shown on the Contact page above the links. */
  contactIntro: string
}
