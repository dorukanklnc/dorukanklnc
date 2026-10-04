/**
 * The cozy tree-house room, drawn as layered SVG in stage units (2400 × 1600).
 * Layers: RoomBack (wall, tree trunk, window, shelves) → RoomFloor (planks, rug,
 * sofa, plant, contact shadows) → [console + cartridges] → RoomFront (foreground).
 * All shapes are generated once with a seeded RNG, so the drawing is stable.
 */
import { memo, useMemo } from 'react'
import { STAGE } from './config'
import { blob, grainLines, hatch, rng, roundPoly, wobbleLine, type Pt } from './draw'

const INK = '#2A1A10'
const SEAM = 890 // wall / floor line

const WALL = ['#B27A47', '#BA8350', '#AA7240', '#BE8957', '#B07646']
const FLOOR = ['#A8724A', '#B07B50', '#9E6A42', '#B5825A', '#A47049']
const BOOKS = ['#4E8F8C', '#D9A93F', '#C9605E', '#7C68A8', '#EADFC4', '#7FA35B', '#3F6E8C', '#E08A4F', '#9D4F6A']

const f = (n: number) => Math.round(n * 10) / 10

/* ── Wall ─────────────────────────────────────────────────────────────────── */

function WallPlanks() {
  const { planks, seams, grain, knots } = useMemo(() => {
    const r = rng(11)
    const planks: { x: number; w: number; c: string }[] = []
    // Planks run past the stage edges so wall parallax never reveals a gap.
    let x = -70
    let i = 0
    while (x < STAGE.w + 70) {
      const w = 84 + Math.round(r() * 46)
      planks.push({ x, w, c: WALL[i % WALL.length] })
      x += w
      i++
    }
    const seams = planks.map((p, j) => wobbleLine(p.x, 40, p.x + (r() - 0.5) * 6, SEAM + 4, 2.2, 100 + j, 4)).join(' ')
    const grain = planks.map((p, j) => grainLines(p.x, 60, p.w, SEAM - 60, 300 + j, 3)).join(' ')
    const knots: { x: number; y: number; rx: number; ry: number }[] = []
    planks.forEach((p) => {
      if (r() < 0.45) knots.push({ x: p.x + p.w * (0.3 + r() * 0.4), y: 120 + r() * 680, rx: 7 + r() * 6, ry: 11 + r() * 8 })
    })
    return { planks, seams, grain, knots }
  }, [])

  return (
    <g>
      {planks.map((p) => (
        <rect key={p.x} x={p.x} y={30} width={p.w + 1} height={SEAM - 20} fill={p.c} />
      ))}
      <path d={grain} stroke="#8A5A31" strokeWidth="2.2" fill="none" opacity="0.38" strokeLinecap="round" />
      {knots.map((k, i) => (
        <g key={i} opacity="0.7">
          <ellipse cx={k.x} cy={k.y} rx={k.rx} ry={k.ry} fill="#94602F" stroke="#6E4322" strokeWidth="2" />
          <ellipse cx={k.x + 1} cy={k.y + 1} rx={k.rx * 0.4} ry={k.ry * 0.45} fill="#6E4322" />
        </g>
      ))}
      <path d={seams} stroke="#5A3820" strokeWidth="3.4" fill="none" strokeLinecap="round" />
      {/* plank highlights */}
      {planks.map((p, i) => (
        <path key={`h${i}`} d={`M${p.x + 6} 70 V${SEAM - 30}`} stroke="#D9A46A" strokeWidth="2" opacity="0.28" strokeLinecap="round" />
      ))}
    </g>
  )
}

function CeilingBeam() {
  return (
    <g>
      <rect x="-70" y="-40" width={STAGE.w + 140} height="104" fill="#7B4C29" />
      <path d={wobbleLine(-70, 64, STAGE.w + 70, 62, 2, 7, 10)} stroke={INK} strokeWidth="5" fill="none" />
      <path d={wobbleLine(-70, 54, STAGE.w + 70, 53, 1.5, 8, 10)} stroke="#A06A3C" strokeWidth="3" fill="none" opacity="0.7" />
      {[200, 760, 1340, 1960].map((x) => (
        <g key={x}>
          <path d={`M${x} 64 L${x + 120} 64 L${x + 60} 140 Z`} fill="#6F4325" stroke={INK} strokeWidth="4" strokeLinejoin="round" />
          <circle cx={x + 60} cy="88" r="5" fill="#3B2414" />
        </g>
      ))}
    </g>
  )
}

const TRUNK = `M332 936
  C 356 800, 330 660, 268 520
  C 214 400, 196 230, 212 40
  L 438 40
  C 428 170, 446 300, 496 400
  C 520 450, 532 470, 540 474
  C 572 380, 624 230, 668 40
  L 806 40
  C 784 200, 736 360, 664 520
  C 624 620, 626 780, 676 936
  C 640 952, 600 944, 572 958
  C 520 946, 470 960, 430 950
  C 394 956, 360 950, 332 936 Z`

function Trunk() {
  const bark = useMemo(() => {
    const lines: string[] = []
    const r = rng(42)
    for (let i = 0; i < 9; i++) {
      const x = 270 + i * 34 + r() * 10
      lines.push(`M${f(x + 40 - i * 4)} ${f(900 - r() * 40)} C ${f(x + 30)} ${f(700)}, ${f(x - 20)} ${f(520)}, ${f(x - 60 + i * 6)} ${f(260 - r() * 120)}`)
    }
    for (let i = 0; i < 4; i++) {
      const x = 600 + i * 30
      lines.push(`M${f(x - 10)} ${f(560 - i * 10)} C ${f(x + 20)} ${f(420)}, ${f(x + 40)} ${f(260)}, ${f(x + 70 + i * 6)} ${f(60)}`)
    }
    return lines.join(' ')
  }, [])
  return (
    <g>
      <path d={TRUNK} fill="#C27D40" />
      {/* shaded right flanks */}
      <path d="M438 40 C 428 170, 446 300, 496 400 C 470 300, 470 160, 476 40 Z" fill="#9E5F2C" opacity="0.8" />
      <path d="M806 40 C 784 200, 736 360, 664 520 C 624 620, 626 780, 676 936 C 650 944, 630 946, 612 950 C 588 800, 600 640, 640 520 C 700 360, 744 200, 762 40 Z" fill="#9E5F2C" opacity="0.85" />
      {/* lit left flanks */}
      <path d="M332 936 C 356 800, 330 660, 268 520 C 214 400, 196 230, 212 40 L 244 40 C 234 220, 252 390, 304 510 C 360 640, 384 800, 370 940 Z" fill="#DE9A58" opacity="0.75" />
      <path d={bark} stroke="#7E4A20" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.6" />
      {/* knot hole */}
      <ellipse cx="408" cy="560" rx="26" ry="34" fill="#7E4A20" stroke={INK} strokeWidth="4" />
      <ellipse cx="412" cy="566" rx="14" ry="20" fill="#3B2010" />
      <path d={TRUNK} fill="none" stroke={INK} strokeWidth="6" strokeLinejoin="round" />
      {/* roots on the floor */}
      <path d="M332 936 C 300 950, 270 962, 236 966 C 276 976, 330 972, 372 958" fill="#B06C33" stroke={INK} strokeWidth="5" strokeLinejoin="round" />
      <path d="M676 936 C 712 952, 744 962, 790 964 C 744 978, 690 976, 640 958" fill="#B06C33" stroke={INK} strokeWidth="5" strokeLinejoin="round" />
    </g>
  )
}

function RoundWindow() {
  const cx = 968
  const cy = 600
  const R = 108
  return (
    <g>
      <circle cx={cx + 6} cy={cy + 8} r={R + 22} fill="#5E3A1E" opacity="0.5" />
      <circle cx={cx} cy={cy} r={R + 22} fill="#8A5A30" stroke={INK} strokeWidth="5" />
      <circle cx={cx} cy={cy} r={R + 12} fill="none" stroke="#B07A45" strokeWidth="4" opacity="0.8" />
      <clipPath id="win-clip">
        <circle cx={cx} cy={cy} r={R} />
      </clipPath>
      <g clipPath="url(#win-clip)">
        <rect x={cx - R} y={cy - R} width={R * 2} height={R * 2} fill="#BFE4E4" />
        <ellipse cx={cx - 20} cy={cy - 40} rx="70" ry="22" fill="#E8F6F2" opacity="0.9" />
        <path d={blob([[cx - 140, cy + 20], [cx - 60, cy - 30], [cx + 10, cy + 10], [cx + 90, cy - 20], [cx + 150, cy + 30], [cx + 150, cy + 140], [cx - 140, cy + 140]], 6, 3)} fill="#86B865" />
        <path d={blob([[cx - 140, cy + 60], [cx - 40, cy + 30], [cx + 60, cy + 70], [cx + 150, cy + 50], [cx + 150, cy + 150], [cx - 140, cy + 150]], 5, 4)} fill="#5F9A4E" />
        <path d={`M${cx + 60} ${cy - R} C ${cx + 40} ${cy - 40}, ${cx + 80} ${cy}, ${cx + 130} ${cy + 10}`} stroke="#6D4A2A" strokeWidth="12" fill="none" strokeLinecap="round" />
        <path d={blob([[cx + 20, cy - 110], [cx + 70, cy - 70], [cx + 120, cy - 90], [cx + 140, cy - 30], [cx + 90, cy - 10], [cx + 30, cy - 40]], 6, 8)} fill="#7DB35C" stroke={INK} strokeWidth="3" />
        <path d={`M${cx - R} ${cy + 46} L${cx + R} ${cy - 20} L${cx + R} ${cy + 10} L${cx - R} ${cy + 76} Z`} fill="#fff" opacity="0.18" />
      </g>
      <path d={`M${cx - R} ${cy} H${cx + R} M${cx} ${cy - R} V${cy + R}`} stroke="#8A5A30" strokeWidth="12" />
      <path d={`M${cx - R} ${cy} H${cx + R} M${cx} ${cy - R} V${cy + R}`} stroke={INK} strokeWidth="2.5" opacity="0.6" />
      <circle cx={cx} cy={cy} r={R} fill="none" stroke={INK} strokeWidth="5" />
      {/* sill */}
      <path d={roundPoly([[cx - 92, cy + 116], [cx + 92, cy + 116], [cx + 104, cy + 140], [cx - 104, cy + 140]], 6)} fill="#9C6838" stroke={INK} strokeWidth="4.5" strokeLinejoin="round" />
      {/* tiny cactus on the sill */}
      <path d={roundPoly([[cx + 40, cy + 116], [cx + 74, cy + 116], [cx + 70, cy + 92], [cx + 44, cy + 92]], 4)} fill="#C9603F" stroke={INK} strokeWidth="3.5" />
      <path d={`M${cx + 57} ${cy + 92} V ${cy + 56} M${cx + 57} ${cy + 76} H ${cx + 46} V ${cy + 64} M${cx + 57} ${cy + 70} H ${cx + 68} V ${cy + 60}`} stroke={INK} strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d={`M${cx + 57} ${cy + 92} V ${cy + 56} M${cx + 57} ${cy + 76} H ${cx + 46} V ${cy + 64} M${cx + 57} ${cy + 70} H ${cx + 68} V ${cy + 60}`} stroke="#6FA455" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </g>
  )
}

function Picture() {
  // A small framed doodle above the console.
  const x = 1146
  const y = 498
  const w = 150
  const h = 112
  return (
    <g>
      <path d={`M${x + w / 2} ${y - 46} L${x + 18} ${y + 4} M${x + w / 2} ${y - 46} L${x + w - 18} ${y + 4}`} stroke="#4A2E1A" strokeWidth="3" />
      <circle cx={x + w / 2} cy={y - 48} r="6" fill="#3B2414" />
      <rect x={x + 5} y={y + 7} width={w} height={h} rx="6" fill="#5E3A1E" opacity="0.5" />
      <rect x={x} y={y} width={w} height={h} rx="6" fill="#E0A453" stroke={INK} strokeWidth="5" />
      <rect x={x + 14} y={y + 14} width={w - 28} height={h - 28} rx="3" fill="#F3E6C8" stroke={INK} strokeWidth="3" />
      <circle cx={x + 96} cy={y + 42} r="12" fill="#F2B84B" stroke={INK} strokeWidth="2.5" />
      <path d={`M${x + 16} ${y + h - 16} L${x + 52} ${y + 46} L${x + 76} ${y + 72} L${x + 96} ${y + 56} L${x + w - 16} ${y + h - 16} Z`} fill="#6CC3B5" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <path d={`M${x + 42} ${y + 62} L${x + 52} ${y + 46} L${x + 62} ${y + 58}`} fill="#fff" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
    </g>
  )
}

function Post() {
  return (
    <g>
      <rect x="1338" y="40" width="54" height={SEAM - 30} fill="#8A5630" />
      <rect x="1376" y="40" width="16" height={SEAM - 30} fill="#6E4223" />
      <path d={grainLines(1338, 80, 40, SEAM - 120, 77, 2)} stroke="#5E3A1E" strokeWidth="2" fill="none" opacity="0.6" />
      <path d={`${wobbleLine(1338, 40, 1338, SEAM + 6, 1.5, 31, 5)} ${wobbleLine(1392, 40, 1392, SEAM + 6, 1.5, 32, 5)}`} stroke={INK} strokeWidth="5" fill="none" />
    </g>
  )
}

interface Book {
  x: number
  w: number
  h: number
  c: string
  lean: number
  band: boolean
}

function shelfBooks(seed: number, x0: number, x1: number, minH: number, maxH: number, gaps: [number, number][]) {
  const r = rng(seed)
  const books: Book[] = []
  let x = x0
  while (x < x1) {
    const gap = gaps.find(([a, b]) => x >= a && x < b)
    if (gap) {
      x = gap[1]
      continue
    }
    const w = 18 + Math.round(r() * 18)
    if (x + w > x1) break
    const lean = r() < 0.12 ? (r() < 0.5 ? -1 : 1) * (6 + r() * 8) : 0
    books.push({ x, w, h: minH + r() * (maxH - minH), c: BOOKS[Math.floor(r() * BOOKS.length)], lean, band: r() < 0.6 })
    x += w + (lean ? 12 : 1)
  }
  return books
}

function BookRow({ books, y }: { books: Book[]; y: number }) {
  return (
    <g>
      {books.map((b, i) => (
        <g key={i} transform={b.lean ? `rotate(${b.lean} ${b.lean > 0 ? b.x : b.x + b.w} ${y})` : undefined}>
          <rect x={b.x} y={y - b.h} width={b.w} height={b.h} rx="3" fill={b.c} stroke={INK} strokeWidth="3.2" />
          <rect x={b.x + b.w - 6} y={y - b.h + 3} width="4" height={b.h - 6} fill="#000" opacity="0.14" />
          {b.band && (
            <>
              <path d={`M${b.x + 2} ${y - b.h + 14} H${b.x + b.w - 2} M${b.x + 2} ${y - 18} H${b.x + b.w - 2}`} stroke="#F6E7C4" strokeWidth="2.6" opacity="0.8" />
              <rect x={b.x + b.w / 2 - 4} y={y - b.h * 0.6} width="8" height={Math.min(30, b.h * 0.25)} rx="2" fill="#F6E7C4" opacity="0.75" />
            </>
          )}
        </g>
      ))}
    </g>
  )
}

function Shelves() {
  const upper = useMemo(() => shelfBooks(5, 1420, 2290, 80, 130, [[1640, 1720], [1980, 2080]]), [])
  const lower = useMemo(() => shelfBooks(9, 1440, 2290, 70, 116, [[1590, 1700], [1880, 1960], [2150, 2230]]), [])
  const board = (y: number, x0: number, x1: number) => (
    <g>
      <rect x={x0 + 4} y={y + 6} width={x1 - x0} height="20" fill="#5E3A1E" opacity="0.45" />
      <rect x={x0} y={y} width={x1 - x0} height="20" rx="3" fill="#A56C3B" stroke={INK} strokeWidth="4.5" />
      <path d={`M${x0 + 8} ${y + 5} H${x1 - 8}`} stroke="#D29A60" strokeWidth="2.5" opacity="0.7" />
      {[x0 + 60, x1 - 70].map((bx) => (
        <path key={bx} d={`M${bx} ${y + 20} L${bx} ${y + 56} L${bx + 34} ${y + 20}`} fill="#7E4B26" stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />
      ))}
    </g>
  )
  return (
    <g>
      <BookRow books={upper} y={372} />
      {/* globe on the upper shelf */}
      <g>
        <path d="M1664 372 L1700 372 L1690 356 L1674 356 Z" fill="#7E4B26" stroke={INK} strokeWidth="3" />
        <circle cx="1682" cy="318" r="36" fill="#6CB7C9" stroke={INK} strokeWidth="4" />
        <path d={blob([[1660, 300], [1676, 292], [1690, 306], [1682, 320], [1668, 322]], 2, 5)} fill="#8DBF5E" stroke={INK} strokeWidth="2" />
        <path d={blob([[1690, 330], [1704, 326], [1708, 340], [1694, 346]], 2, 6)} fill="#8DBF5E" stroke={INK} strokeWidth="2" />
        <path d="M1640 318 A 42 42 0 0 1 1724 318" stroke="#C99B45" strokeWidth="4" fill="none" />
      </g>
      {/* lying stack */}
      {[0, 1, 2].map((i) => (
        <rect key={i} x={1996 - i * 4} y={372 - 22 * (i + 1)} width={78 + i * 6} height="22" rx="3" fill={BOOKS[(i * 3 + 1) % BOOKS.length]} stroke={INK} strokeWidth="3" />
      ))}
      {board(372, 1392, 2320)}

      <BookRow books={lower} y={560} />
      {/* jar with pencils */}
      <g>
        <path d="M1606 470 L1606 456 M1620 470 L1626 448 M1634 470 L1644 452" stroke={INK} strokeWidth="7" strokeLinecap="round" />
        <path d="M1606 470 L1606 456 M1620 470 L1626 448 M1634 470 L1644 452" stroke="#E0B33F" strokeWidth="3.5" strokeLinecap="round" />
        <rect x="1596" y="468" width="50" height="92" rx="10" fill="#CDE7E0" stroke={INK} strokeWidth="4" opacity="0.95" />
        <path d="M1604 480 V548" stroke="#fff" strokeWidth="4" opacity="0.6" strokeLinecap="round" />
      </g>
      {/* little clock */}
      <g>
        <rect x="1892" y="490" width="58" height="70" rx="12" fill="#C9605E" stroke={INK} strokeWidth="4" />
        <circle cx="1921" cy="520" r="20" fill="#F6E7C4" stroke={INK} strokeWidth="3" />
        <path d="M1921 520 V508 M1921 520 L1931 526" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      </g>
      {/* plant in a mug */}
      <g>
        <path d={blob([[2166, 470], [2150, 430], [2172, 408], [2190, 440], [2212, 420], [2222, 452], [2204, 474]], 4, 12)} fill="#6FA455" stroke={INK} strokeWidth="3.5" />
        <rect x="2160" y="466" width="56" height="94" rx="8" fill="#E0B33F" stroke={INK} strokeWidth="4" />
        <path d="M2216 488 C 2238 488, 2238 528, 2216 528" stroke={INK} strokeWidth="5" fill="none" />
      </g>
      {board(560, 1392, 2320)}
      {/* string lights hanging from the lower shelf */}
      <path d="M1410 584 Q 1520 640 1640 590 Q 1760 646 1880 594 Q 2000 650 2120 596 Q 2220 640 2310 590" stroke="#3B2414" strokeWidth="2.5" fill="none" />
      {[
        [1460, 612], [1520, 622], [1584, 610], [1690, 616], [1760, 624], [1830, 612], [1930, 616], [2000, 626], [2070, 612], [2160, 614], [2240, 618],
      ].map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y + 8} r="22" fill="#FFD976" opacity="0.18" />
          <path d={`M${x} ${y - 6} V ${y}`} stroke="#3B2414" strokeWidth="3" />
          <ellipse cx={x} cy={y + 8} rx="7" ry="9" fill={i % 3 === 0 ? '#FFE08A' : i % 3 === 1 ? '#FFB7A8' : '#C6F0D8'} stroke={INK} strokeWidth="2.2" />
        </g>
      ))}
    </g>
  )
}

function WallShading() {
  return (
    <g pointerEvents="none">
      <defs>
        <linearGradient id="wall-top" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3A200D" stopOpacity="0.55" />
          <stop offset="0.45" stopColor="#3A200D" stopOpacity="0.05" />
          <stop offset="0.9" stopColor="#3A200D" stopOpacity="0" />
          <stop offset="1" stopColor="#3A200D" stopOpacity="0.3" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width={STAGE.w} height={SEAM} fill="url(#wall-top)" />
      <path d={hatch(60, 120, 120, 600, 17, 22, 1.2)} stroke="#6E4322" strokeWidth="2" opacity="0.35" strokeLinecap="round" />
      <path d={hatch(2200, 640, 180, 220, 18, 16, 1.2)} stroke="#6E4322" strokeWidth="2" opacity="0.35" strokeLinecap="round" />
    </g>
  )
}

export const RoomBack = memo(function RoomBack() {
  return (
    <svg className="room-layer" viewBox={`0 0 ${STAGE.w} ${STAGE.h}`} width={STAGE.w} height={STAGE.h} aria-hidden="true" focusable="false">
      <rect x="-70" y="-40" width={STAGE.w + 140} height={SEAM + 80} fill="#A9733F" />
      <WallPlanks />
      <WallShading />
      <CeilingBeam />
      <RoundWindow />
      <Picture />
      <Post />
      <Shelves />
      <Trunk />
    </svg>
  )
})

/* ── Floor ────────────────────────────────────────────────────────────────── */

const VP = { x: 1200, y: 120 }

function floorRows() {
  const rows: number[] = [SEAM]
  let h = 30
  while (rows[rows.length - 1] < STAGE.h + 20) {
    rows.push(rows[rows.length - 1] + h)
    h *= 1.13
  }
  return rows
}

function FloorPlanks() {
  const { boards, rowLines, joints, grain, nails } = useMemo(() => {
    const r = rng(23)
    const rows = floorRows()
    const boards: { d: string; c: string }[] = []
    const jointPaths: string[] = []
    const grainPaths: string[] = []
    const nails: Pt[] = []
    const toward = (x: number, yTop: number, yBot: number) => VP.x + (x - VP.x) * ((yBot - VP.y) / (yTop - VP.y))
    for (let i = 0; i < rows.length - 1; i++) {
      const y0 = rows[i]
      const y1 = rows[i + 1]
      let x = -200 - r() * 300
      let k = 0
      while (x < STAGE.w + 200) {
        const len = 300 + r() * 420
        const xa = x
        const xb = x + len
        const d = `M${f(xa)} ${f(y0)} L${f(xb)} ${f(y0)} L${f(toward(xb, y0, y1))} ${f(y1)} L${f(toward(xa, y0, y1))} ${f(y1)} Z`
        boards.push({ d, c: FLOOR[(i * 3 + k) % FLOOR.length] })
        jointPaths.push(wobbleLine(xb, y0, toward(xb, y0, y1), y1, 1, i * 50 + k, 2))
        if (y1 - y0 > 40) {
          nails.push([xb - 10, y0 + (y1 - y0) * 0.3], [xb - 10, y0 + (y1 - y0) * 0.72])
        }
        if (r() < 0.7) {
          const gy = y0 + (y1 - y0) * (0.3 + r() * 0.4)
          const gx = xa + len * r() * 0.3
          grainPaths.push(`M${f(gx)} ${f(gy)} q ${f(len * 0.2)} ${f((r() - 0.5) * 8)} ${f(len * 0.45)} ${f((r() - 0.5) * 6)} t ${f(len * 0.25)} ${f((r() - 0.5) * 6)}`)
        }
        x = xb
        k++
      }
    }
    const rowLines = rows.map((y, j) => wobbleLine(-20, y, STAGE.w + 20, y + (r() - 0.5) * 3, 1.6, 900 + j, 12)).join(' ')
    return { boards, rowLines, joints: jointPaths.join(' '), grain: grainPaths.join(' '), nails }
  }, [])

  return (
    <g>
      {boards.map((b, i) => (
        <path key={i} d={b.d} fill={b.c} />
      ))}
      <path d={grain} stroke="#7A4E2C" strokeWidth="2.4" fill="none" opacity="0.4" strokeLinecap="round" />
      <path d={joints} stroke="#5A3820" strokeWidth="2.6" fill="none" />
      <path d={rowLines} stroke="#4E301A" strokeWidth="3.4" fill="none" />
      {nails.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2.6" fill="#4E301A" opacity="0.7" />
      ))}
    </g>
  )
}

function Rug() {
  const cx = 1196
  const cy = 1112
  return (
    <g>
      <ellipse cx={cx + 6} cy={cy + 10} rx="392" ry="104" fill="#3A200D" opacity="0.22" />
      <ellipse cx={cx} cy={cy} rx="388" ry="100" fill="#9C5B52" stroke={INK} strokeWidth="5" />
      <ellipse cx={cx} cy={cy} rx="362" ry="88" fill="#B97A6C" />
      <ellipse cx={cx} cy={cy} rx="330" ry="76" fill="none" stroke="#EBD3B5" strokeWidth="6" strokeDasharray="20 14" opacity="0.85" />
      <ellipse cx={cx} cy={cy} rx="290" ry="64" fill="#A8685E" />
      <ellipse cx={cx} cy={cy} rx="258" ry="54" fill="none" stroke="#D9A882" strokeWidth="4" opacity="0.8" />
      {[-180, 180].map((dx) => (
        <path key={dx} d={`M${cx + dx} ${cy - 20} l 16 20 l -16 20 l -16 -20 Z`} fill="#EBD3B5" opacity="0.7" />
      ))}
      <path d={hatch(cx - 340, cy - 50, 680, 110, 61, 22, 0.15)} stroke="#7E4440" strokeWidth="2" opacity="0.3" />
    </g>
  )
}

function Sofa() {
  const cx = 1960
  const cy = 768
  return (
    <g transform={`translate(${cx} 916) scale(0.86) translate(${-cx} -916)`}>
      <ellipse cx={cx + 10} cy={cy + 150} rx="330" ry="34" fill="#3A200D" opacity="0.3" />
      {/* legs */}
      {[cx - 250, cx - 110, cx + 120, cx + 250].map((x, i) => (
        <path key={x} d={`M${x - 12} ${cy + 96} L${x + 12} ${cy + 96} L${x + 8} ${cy + 148 - (i % 3 === 0 ? 10 : 0)} L${x - 8} ${cy + 148 - (i % 3 === 0 ? 10 : 0)} Z`} fill="#6E4223" stroke={INK} strokeWidth="4" strokeLinejoin="round" />
      ))}
      {/* bolsters along the back */}
      {[
        [cx - 150, cy - 68, -3],
        [cx + 112, cy - 74, 4],
      ].map(([x, y, rot], i) => (
        <g key={i} transform={`rotate(${rot} ${x} ${y})`}>
          <rect x={x - 112} y={y - 38} width="224" height="76" rx="38" fill="#9CC29B" stroke={INK} strokeWidth="5" />
          <rect x={x - 100} y={y + 4} width="200" height="26" rx="13" fill="#7FA67F" opacity="0.7" />
          <path d={`M${x - 90} ${y - 22} H ${x + 70}`} stroke="#C8E4C4" strokeWidth="5" strokeLinecap="round" opacity="0.8" />
          <ellipse cx={x - 104} cy={y} rx="20" ry="36" fill="#B5D6B3" stroke={INK} strokeWidth="4.5" />
          <path d={`M${x - 110} ${y - 12} Q ${x - 96} ${y} ${x - 110} ${y + 12}`} stroke={INK} strokeWidth="2.5" fill="none" />
          <circle cx={x - 104} cy={y} r="5" fill="#7FA67F" stroke={INK} strokeWidth="2" />
        </g>
      ))}
      {/* seat side band */}
      <path d={`M${cx - 330} ${cy} L${cx - 330} ${cy + 70} C ${cx - 330} ${cy + 140}, ${cx + 330} ${cy + 140}, ${cx + 330} ${cy + 70} L ${cx + 330} ${cy} Z`} fill="#A3A12C" stroke={INK} strokeWidth="5" strokeLinejoin="round" />
      <path d={`M${cx - 300} ${cy + 74} C ${cx - 200} ${cy + 116}, ${cx + 200} ${cy + 116}, ${cx + 300} ${cy + 74}`} stroke="#C2C24A" strokeWidth="4" fill="none" opacity="0.7" />
      {/* seat top */}
      <ellipse cx={cx} cy={cy} rx="330" ry="76" fill="#C9C842" stroke={INK} strokeWidth="5" />
      <ellipse cx={cx - 20} cy={cy - 10} rx="290" ry="56" fill="#D6D55A" opacity="0.7" />
      <path d={`M${cx - 318} ${cy + 10} C ${cx - 200} ${cy + 74}, ${cx + 200} ${cy + 74}, ${cx + 318} ${cy + 10}`} stroke="#A3A12C" strokeWidth="5" fill="none" opacity="0.8" />
      {/* tufting */}
      {[
        [cx - 150, cy + 4], [cx + 30, cy + 18], [cx + 190, cy - 2], [cx - 30, cy - 34],
      ].map(([x, y], i) => (
        <path key={i} d={`M${x - 12} ${y - 6} L${x} ${y} L${x + 12} ${y - 6} M${x} ${y} V ${y + 9}`} stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.75" />
      ))}
      {/* book lying on the seat */}
      <g transform={`rotate(-8 ${cx - 230} ${cy + 6})`}>
        <rect x={cx - 280} y={cy - 6} width="98" height="26" rx="4" fill="#EADFC4" stroke={INK} strokeWidth="3.5" />
        <rect x={cx - 284} y={cy - 18} width="104" height="18" rx="4" fill="#8DCFB9" stroke={INK} strokeWidth="3.5" />
        <path d={`M${cx - 276} ${cy + 6} H ${cx - 190}`} stroke="#B9A98A" strokeWidth="2" />
      </g>
    </g>
  )
}

function Plant() {
  const x = 500
  const y = 968
  const leaves: { d: string; c: string }[] = [
    { d: `M${x} ${y - 90} C ${x - 120} ${y - 160}, ${x - 170} ${y - 260}, ${x - 120} ${y - 330} C ${x - 60} ${y - 260}, ${x - 30} ${y - 170}, ${x} ${y - 90} Z`, c: '#5E9A4C' },
    { d: `M${x} ${y - 90} C ${x + 120} ${y - 150}, ${x + 190} ${y - 230}, ${x + 160} ${y - 310} C ${x + 90} ${y - 250}, ${x + 30} ${y - 170}, ${x} ${y - 90} Z`, c: '#6FAE58' },
    { d: `M${x} ${y - 90} C ${x - 20} ${y - 200}, ${x + 10} ${y - 320}, ${x + 40} ${y - 380} C ${x + 70} ${y - 300}, ${x + 50} ${y - 190}, ${x} ${y - 90} Z`, c: '#7FBA62' },
    { d: `M${x} ${y - 90} C ${x - 150} ${y - 110}, ${x - 230} ${y - 160}, ${x - 250} ${y - 210} C ${x - 160} ${y - 200}, ${x - 70} ${y - 160}, ${x} ${y - 90} Z`, c: '#4F8A42' },
  ]
  return (
    <g transform={`translate(${x} ${y + 36}) scale(0.78) translate(${-x} ${-(y + 36)})`}>
      <ellipse cx={x + 8} cy={y + 34} rx="96" ry="18" fill="#3A200D" opacity="0.3" />
      {leaves.map((l, i) => (
        <g key={i}>
          <path d={l.d} fill={l.c} stroke={INK} strokeWidth="4.5" strokeLinejoin="round" />
        </g>
      ))}
      <path d={`M${x} ${y - 90} C ${x - 60} ${y - 180}, ${x - 110} ${y - 250}, ${x - 120} ${y - 320} M${x} ${y - 90} C ${x + 70} ${y - 160}, ${x + 130} ${y - 230}, ${x + 158} ${y - 300} M${x} ${y - 90} C ${x + 14} ${y - 200}, ${x + 30} ${y - 300}, ${x + 40} ${y - 370}`} stroke="#2F5E2A" strokeWidth="3" fill="none" opacity="0.7" />
      <path d={roundPoly([[x - 80, y - 96], [x + 80, y - 96], [x + 62, y + 36], [x - 62, y + 36]], 12)} fill="#C2643F" stroke={INK} strokeWidth="5" strokeLinejoin="round" />
      <path d={roundPoly([[x - 88, y - 108], [x + 88, y - 108], [x + 84, y - 80], [x - 84, y - 80]], 8)} fill="#D97A4F" stroke={INK} strokeWidth="5" strokeLinejoin="round" />
      <path d={`M${x + 40} ${y - 70} Q ${x + 46} ${y - 20} ${x + 34} ${y + 20}`} stroke="#9E4A2C" strokeWidth="6" fill="none" opacity="0.6" strokeLinecap="round" />
    </g>
  )
}

function FloorShading() {
  return (
    <g pointerEvents="none">
      <defs>
        <linearGradient id="floor-ao" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2A1408" stopOpacity="0.5" />
          <stop offset="1" stopColor="#2A1408" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="0" y={SEAM} width={STAGE.w} height="120" fill="url(#floor-ao)" />
      {/* sunlit patch from the window */}
      <path d="M700 1010 L 980 1000 L 1040 1060 L 720 1074 Z" fill="#FFE2A8" opacity="0.16" />
    </g>
  )
}

function Baseboard() {
  return (
    <g>
      <rect x="-10" y={SEAM - 26} width={STAGE.w + 20} height="34" fill="#6E4223" />
      <path d={wobbleLine(-10, SEAM - 26, STAGE.w + 10, SEAM - 25, 1.4, 55, 12)} stroke={INK} strokeWidth="4" fill="none" />
      <path d={wobbleLine(-10, SEAM - 20, STAGE.w + 10, SEAM - 19, 1, 56, 12)} stroke="#9C6436" strokeWidth="2.5" fill="none" opacity="0.8" />
      <path d={wobbleLine(-10, SEAM + 7, STAGE.w + 10, SEAM + 8, 1.4, 57, 12)} stroke={INK} strokeWidth="4" fill="none" />
    </g>
  )
}

export const RoomFloor = memo(function RoomFloor() {
  return (
    <svg className="room-layer" viewBox={`0 0 ${STAGE.w} ${STAGE.h}`} width={STAGE.w} height={STAGE.h} aria-hidden="true" focusable="false">
      <FloorPlanks />
      <FloorShading />
      <Baseboard />
      <Rug />
      <Sofa />
      <Plant />
      {/* console contact shadow */}
      <ellipse cx="1206" cy="1078" rx="196" ry="30" fill="#2A1408" opacity="0.32" />
      <ellipse cx="1150" cy="1074" rx="120" ry="16" fill="#2A1408" opacity="0.25" />
    </svg>
  )
})

/* ── Foreground ───────────────────────────────────────────────────────────── */

function Stump() {
  const cx = 1880
  const cy = 1360
  return (
    <g>
      <ellipse cx={cx + 12} cy={cy + 200} rx="170" ry="34" fill="#2A1408" opacity="0.35" />
      <path d={`M${cx - 150} ${cy} L ${cx - 158} ${cy + 180} C ${cx - 120} ${cy + 220}, ${cx + 120} ${cy + 220}, ${cx + 160} ${cy + 180} L ${cx + 150} ${cy} Z`} fill="#9A5F2E" stroke={INK} strokeWidth="6" strokeLinejoin="round" />
      <path d={`M${cx - 90} ${cy + 40} C ${cx - 96} ${cy + 100}, ${cx - 86} ${cy + 150}, ${cx - 96} ${cy + 196} M${cx + 10} ${cy + 50} C ${cx + 4} ${cy + 110}, ${cx + 16} ${cy + 160}, ${cx + 8} ${cy + 206} M${cx + 96} ${cy + 40} C ${cx + 104} ${cy + 100}, ${cx + 92} ${cy + 150}, ${cx + 106} ${cy + 194}`} stroke="#6E4223" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d={`M${cx + 110} ${cy + 20} C ${cx + 130} ${cy + 80}, ${cx + 120} ${cy + 140}, ${cx + 150} ${cy + 180} L ${cx + 150} ${cy} Z`} fill="#7A4622" opacity="0.6" />
      <ellipse cx={cx} cy={cy} rx="150" ry="42" fill="#E3B47A" stroke={INK} strokeWidth="6" />
      <ellipse cx={cx} cy={cy} rx="110" ry="30" fill="none" stroke="#C48E54" strokeWidth="3.5" />
      <ellipse cx={cx} cy={cy} rx="70" ry="19" fill="none" stroke="#C48E54" strokeWidth="3" />
      <ellipse cx={cx} cy={cy} rx="30" ry="8" fill="none" stroke="#C48E54" strokeWidth="3" />
      {/* mug */}
      <g>
        <path d={`M${cx + 60} ${cy - 10} C ${cx + 90} ${cy - 10}, ${cx + 90} ${cy - 50}, ${cx + 60} ${cy - 50}`} stroke={INK} strokeWidth="9" fill="none" />
        <path d={`M${cx + 60} ${cy - 10} C ${cx + 90} ${cy - 10}, ${cx + 90} ${cy - 50}, ${cx + 60} ${cy - 50}`} stroke="#6CC3B5" strokeWidth="4" fill="none" />
        <path d={`M${cx + 4} ${cy - 76} L${cx + 64} ${cy - 76} L${cx + 60} ${cy + 2} Q ${cx + 34} ${cy + 12} ${cx + 8} ${cy + 2} Z`} fill="#6CC3B5" stroke={INK} strokeWidth="5" strokeLinejoin="round" />
        <ellipse cx={cx + 34} cy={cy - 76} rx="30" ry="8" fill="#4A2A18" stroke={INK} strokeWidth="4" />
        <path d={`M${cx + 24} ${cy - 96} q 8 -12 0 -24 M${cx + 42} ${cy - 92} q 8 -12 0 -24`} stroke="#F6EED9" strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.7" />
      </g>
    </g>
  )
}

function Cushion() {
  const cx = 500
  const cy = 1430
  return (
    <g>
      <ellipse cx={cx + 10} cy={cy + 78} rx="190" ry="30" fill="#2A1408" opacity="0.3" />
      <path d={blob([[cx - 200, cy + 10], [cx - 120, cy - 50], [cx + 40, cy - 64], [cx + 190, cy - 30], [cx + 210, cy + 40], [cx + 100, cy + 84], [cx - 100, cy + 84], [cx - 210, cy + 50]], 4, 33)} fill="#8E6CCF" stroke={INK} strokeWidth="6" />
      <path d={blob([[cx - 150, cy - 4], [cx - 60, cy - 36], [cx + 80, cy - 40], [cx + 150, cy - 10], [cx + 90, cy + 20], [cx - 80, cy + 22]], 3, 34)} fill="#A68BDD" opacity="0.8" />
      <circle cx={cx} cy={cy - 6} r="9" fill="#6E50AE" stroke={INK} strokeWidth="3" />
      <path d={`M${cx - 120} ${cy + 54} C ${cx - 40} ${cy + 74}, ${cx + 60} ${cy + 74}, ${cx + 150} ${cy + 46}`} stroke="#6E50AE" strokeWidth="5" fill="none" opacity="0.8" />
    </g>
  )
}

export const RoomFront = memo(function RoomFront() {
  return (
    <svg className="room-layer" viewBox={`0 0 ${STAGE.w} ${STAGE.h}`} width={STAGE.w} height={STAGE.h} aria-hidden="true" focusable="false">
      <Stump />
      <Cushion />
    </svg>
  )
})

/** Lighting/vignette drawn above the room but below the console. */
export const RoomLight = memo(function RoomLight() {
  return (
    <svg className="room-layer" viewBox={`0 0 ${STAGE.w} ${STAGE.h}`} width={STAGE.w} height={STAGE.h} aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="room-vignette" cx="1200" cy="980" r="1250" gradientUnits="userSpaceOnUse">
          <stop offset="0.35" stopColor="#1E0E05" stopOpacity="0" />
          <stop offset="1" stopColor="#1E0E05" stopOpacity="0.55" />
        </radialGradient>
        <radialGradient id="room-warm" cx="1200" cy="900" r="700" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFD9A0" stopOpacity="0.16" />
          <stop offset="1" stopColor="#FFD9A0" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width={STAGE.w} height={STAGE.h} fill="url(#room-warm)" />
      <rect x="0" y="0" width={STAGE.w} height={STAGE.h} fill="url(#room-vignette)" />
    </svg>
  )
})
