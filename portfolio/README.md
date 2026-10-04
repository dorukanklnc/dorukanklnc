# Dorukan Kılınç — interactive portfolio

A cozy illustrated tree-house room with a living turquoise game console. Each project is a
floating cartridge: pick one and it flies over, slides into the console's slot, and the camera
dives into the screen, which becomes the project page. **Eject** reverses the whole thing.

Built with React 19, TypeScript, Vite and GSAP. All artwork is local, layered SVG — no
backend, no external requests at runtime.

## Run it

```bash
cd portfolio
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
npm run lint
```

`npm run build` also writes `dist/404.html` (a copy of `index.html`) so static hosts such as
GitHub Pages serve deep links like `/projects/rolebluff`. On other hosts, add a rewrite of all
paths to `/index.html`. To deploy under a sub-path, build with
`BASE_PATH=/your-path/ npm run build`.

## Edit your content — `src/content/portfolio.ts`

Everything a visitor reads lives in this one typed file (types are in `src/content/types.ts`).

- **`profile`** — name, tagline, About paragraphs and notes, skills, and contact links (Contact
  only lists what you add here).
- **`projects`** — one entry per cartridge, in shelf order:

| field | purpose |
| --- | --- |
| `slug` | URL: `/projects/<slug>` (lowercase, hyphens, unique) |
| `title`, `type`, `summary` | label, small type tag, one or two sentences |
| `role`, `technologies`, `features` | shown on the project page; empty ones are hidden |
| `description` | optional longer case-study paragraphs |
| `thumbnail` | image on the cartridge label |
| `screenshots` | first one is the large preview; the rest form a gallery |
| `liveUrl`, `sourceUrl` | buttons appear **only** when a real URL is set |
| `labelColor`, `emblem` | cartridge label colour and 1–3 character emblem (also on the boot screen) |
| `room` | optional per-layout position override, e.g. `{ wide: { x: 700, y: 760 } }` |
| `placeholder` | marks starter content; shows an edit hint on the project page in dev mode only |

### Add a project

1. Put its images in `public/projects/<slug>/` (PNG, JPG, WebP or SVG; 16:10 works best for
   the preview, and the label crops the centre to about 3:2).
2. Add an entry to `projects` in `src/content/portfolio.ts`.

That's all. The animation is data-driven: the new cartridge takes the next free slot. Each
layout has six slots; with more projects, a shelf pager appears under the room.

### Replace the demo previews

The five `public/projects/*/preview.svg` files are clearly-labelled **demo illustrations**, not
real screenshots. Drop in real images, point `thumbnail` / `screenshots[].src` at them, and set
`demo: false` (or remove it) so the "Demo preview" caption disappears.

## Where things are controlled

| what | where |
| --- | --- |
| Animation timings (select, approach, insert, zoom, eject speed, fade) | `TIMING` in `src/scene/config.ts` |
| Insertion pose (tilt, perspective, stand-off, arc) | `INSERT_POSE` in `src/scene/config.ts` |
| Idle floating, blinking, limb motion, breathing | `IDLE` in `src/scene/config.ts` |
| Cartridge positions per layout (wide / medium / tall) and the safe area that must stay visible | `LAYOUTS` in `src/scene/config.ts` |
| Layout breakpoints and HUD insets | `LAYOUT_BREAKPOINTS`, `hudInsets` in `src/scene/config.ts` |
| Console placement | `CONSOLE_POS` in `src/scene/config.ts` |
| Slot, screen and camera maths (shared coordinate system) | `src/scene/geometry.ts` |
| The animation state machine (idle → selecting → inserting → zooming → project → ejecting) | `src/scene/director.ts` |
| Room, console and cartridge artwork | `src/scene/Room.tsx`, `Console.tsx`, `ScreenFace.tsx`, `Cartridge.tsx` |

Every position is in **stage units**. The room is a 2400 × 1600 drawing, and the whole stage is
scaled to fit the screen, so the slot and screen targets stay exact at any size.

## Accessibility and motion

- Cartridges are real buttons (Tab, then Enter or Space). Focus or hover shows the project's
  summary, and Escape ejects.
- Focus moves to the project heading when a project opens, and back to its cartridge after
  ejecting. The room is `inert` while a project or panel is open.
- With `prefers-reduced-motion`, floating, parallax and blinking stop, and opening or closing a
  project becomes a short cross-fade.
- "View projects as a list" (`/projects`) offers direct navigation using the same URLs.
- Background motion pauses while the tab is hidden or a project is open.
