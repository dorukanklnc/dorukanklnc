import { memo, useLayoutEffect, useRef } from 'react'
import { CONSOLE_BOX } from './config'
import { roundPoly, type Pt } from './draw'
import { DEPTH, FACE, FRONT, FRONT_MATRIX, HIP_L as hipL, HIP_R as hipR, SHOULDER_L as shoulderL, SHOULDER_R as shoulderR, SIDE_MATRIX } from './geometry'
import { ScreenFace, type FaceState } from './ScreenFace'

const INK = '#1C2828'
const LIMB = '#A9DCE5'
const LIMB_SHADE = '#86C3CF'

export interface ConsoleRefs {
  root: SVGSVGElement
  body: SVGGElement
  eyes: SVGGElement
  armL: SVGGElement
  armR: SVGGElement
  legL: SVGGElement
  legR: SVGGElement
  slotFill: SVGRectElement
  indicator: SVGCircleElement
  screen: SVGGElement
  bootBar: SVGRectElement | null
}

const FTL = FRONT.o
const FTR = { x: FRONT.o.x + FRONT.u.x, y: FRONT.o.y + FRONT.u.y }
const FBR = { x: FTR.x + FRONT.v.x, y: FTR.y + FRONT.v.y }
const FBL = { x: FRONT.o.x + FRONT.v.x, y: FRONT.o.y + FRONT.v.y }
const BTL = { x: FTL.x + DEPTH.x, y: FTL.y + DEPTH.y }
const BTR = { x: FTR.x + DEPTH.x, y: FTR.y + DEPTH.y }
const BBL = { x: FBL.x + DEPTH.x, y: FBL.y + DEPTH.y }

const P = (p: { x: number; y: number }): Pt => [p.x, p.y]

const SILHOUETTE = roundPoly([P(BTL), P(BTR), P(FTR), P(FBR), P(FBL), P(BBL)], [16, 14, 16, 18, 18, 16])
const TOP_FACE = roundPoly([P(FTL), P(FTR), P(BTR), P(BTL)], [6, 12, 12, 14])
const SIDE_FACE = roundPoly([P(BTL), P(FTL), P(FBL), P(BBL)], [14, 4, 16, 16])

function Tube({ d, w = 9 }: { d: string; w?: number }) {
  return (
    <>
      <path d={d} fill="none" stroke={INK} strokeWidth={w + 6} strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke={LIMB} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke={LIMB_SHADE} strokeWidth={w * 0.32} strokeLinecap="round" transform="translate(1.6 1.8)" opacity="0.8" />
    </>
  )
}

function Nub({ cx, cy, rx, ry, rot = 0 }: { cx: number; cy: number; rx: number; ry: number; rot?: number }) {
  return (
    <g transform={`rotate(${rot} ${cx} ${cy})`}>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={LIMB} stroke={INK} strokeWidth="3.4" />
      <ellipse cx={cx + rx * 0.25} cy={cy + ry * 0.3} rx={rx * 0.55} ry={ry * 0.4} fill={LIMB_SHADE} opacity="0.7" />
      <ellipse cx={cx - rx * 0.35} cy={cy - ry * 0.35} rx={rx * 0.25} ry={ry * 0.2} fill="#fff" opacity="0.7" />
    </g>
  )
}

interface ConsoleProps {
  face: FaceState
  onRefs: (refs: ConsoleRefs | null) => void
}

function ConsoleArt({ face, onRefs }: ConsoleProps) {
  const root = useRef<SVGSVGElement>(null)
  const body = useRef<SVGGElement>(null)
  const eyes = useRef<SVGGElement>(null)
  const armL = useRef<SVGGElement>(null)
  const armR = useRef<SVGGElement>(null)
  const legL = useRef<SVGGElement>(null)
  const legR = useRef<SVGGElement>(null)
  const slotFill = useRef<SVGRectElement>(null)
  const indicator = useRef<SVGCircleElement>(null)
  const bootBar = useRef<SVGRectElement>(null)
  const screen = useRef<SVGGElement>(null)

  useLayoutEffect(() => {
    if (!root.current || !body.current || !eyes.current) return
    onRefs({
      root: root.current,
      body: body.current,
      eyes: eyes.current,
      armL: armL.current!,
      armR: armR.current!,
      legL: legL.current!,
      legR: legR.current!,
      slotFill: slotFill.current!,
      indicator: indicator.current!,
      screen: screen.current!,
      bootBar: bootBar.current,
    })
  })
  useLayoutEffect(() => () => onRefs(null), [onRefs])

  const sc = FACE.screen
  const sl = FACE.slot

  return (
    <svg
      ref={root}
      className="console-svg"
      viewBox={`0 0 ${CONSOLE_BOX.w} ${CONSOLE_BOX.h}`}
      width={CONSOLE_BOX.w}
      height={CONSOLE_BOX.h}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="c-front" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9CE2D3" />
          <stop offset="0.55" stopColor="#86D4C4" />
          <stop offset="1" stopColor="#71C2B2" />
        </linearGradient>
        <linearGradient id="c-side" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#4E9C90" />
          <stop offset="1" stopColor="#68B6A8" />
        </linearGradient>
        <linearGradient id="c-top" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#B9EEE2" />
          <stop offset="1" stopColor="#A2E2D5" />
        </linearGradient>
        <linearGradient id="c-screen" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#D2EBD8" />
          <stop offset="0.25" stopColor="#DCF1E0" />
          <stop offset="1" stopColor="#E3F4E5" />
        </linearGradient>
        <clipPath id="c-screen-clip">
          <rect x={sc.x} y={sc.y} width={sc.w} height={sc.h} rx={sc.r} />
        </clipPath>
        <clipPath id="c-front-clip">
          <rect x="0" y="0" width={FRONT.w} height={FRONT.h} rx="18" />
        </clipPath>
      </defs>

      {/* Right arm and legs sit behind the body so their roots tuck under it. */}
      <g ref={armR}>
        <Tube d={`M${shoulderR.x - 8} ${shoulderR.y} C ${shoulderR.x + 34} ${shoulderR.y + 4}, ${shoulderR.x + 52} ${shoulderR.y + 40}, ${shoulderR.x + 46} ${shoulderR.y + 86}`} />
        <Nub cx={shoulderR.x + 46} cy={shoulderR.y + 94} rx={11} ry={9.5} rot={-10} />
      </g>
      <g ref={legL}>
        <Tube d={`M${hipL.x} ${hipL.y - 10} C ${hipL.x - 2} ${hipL.y + 28}, ${hipL.x - 22} ${hipL.y + 52}, ${hipL.x - 34} ${hipL.y + 78}`} w={10} />
        <Nub cx={hipL.x - 40} cy={hipL.y + 86} rx={15} ry={10} rot={-28} />
      </g>
      <g ref={legR}>
        <Tube d={`M${hipR.x} ${hipR.y - 10} C ${hipR.x + 4} ${hipR.y + 30}, ${hipR.x + 22} ${hipR.y + 58}, ${hipR.x + 30} ${hipR.y + 84}`} w={10} />
        <Nub cx={hipR.x + 34} cy={hipR.y + 92} rx={15} ry={10} rot={22} />
      </g>

      <g ref={body}>
        {/* Body silhouette, top and side planes */}
        <path d={SILHOUETTE} fill="url(#c-side)" />
        <path d={TOP_FACE} fill="url(#c-top)" />
        <path d={SIDE_FACE} fill="url(#c-side)" />

        {/* Side plane details: speaker holes, DK marking, arm port */}
        <g transform={SIDE_MATRIX}>
          <path d="M6 14 Q 4 150 8 286" stroke="#3E8A7E" strokeWidth="5" fill="none" opacity="0.55" strokeLinecap="round" />
          {[
            [26, 34], [42, 31], [18, 49], [34, 47], [50, 45], [26, 62], [42, 60],
          ].map(([x, y]) => (
            <g key={`${x}-${y}`}>
              <ellipse cx={x} cy={y} rx="3.6" ry="3.9" fill={INK} />
              <ellipse cx={x + 0.9} cy={y + 1.2} rx="1.6" ry="1.5" fill="#86D4C4" opacity="0.5" />
            </g>
          ))}
          <text
            x="0"
            y="0"
            transform="translate(23 96) rotate(90)"
            fontFamily="'Nunito Variable', 'Nunito', system-ui, sans-serif"
            fontWeight="900"
            fontSize="52"
            letterSpacing="2"
            fill={INK}
          >
            DK
          </text>
          <ellipse cx="36" cy="246" rx="11" ry="12" fill="#4E9C90" stroke={INK} strokeWidth="3.6" />
          <ellipse cx="37" cy="247" rx="5.5" ry="6" fill={INK} opacity="0.85" />
        </g>

        {/* Front plane: everything inside is drawn in flat face space */}
        <g transform={FRONT_MATRIX}>
          <rect x="0" y="0" width={FRONT.w} height={FRONT.h} rx="18" fill="url(#c-front)" />
          <g clipPath="url(#c-front-clip)">
            <path d={`M0 ${FRONT.h - 34} Q ${FRONT.w * 0.5} ${FRONT.h - 22} ${FRONT.w} ${FRONT.h - 40} L ${FRONT.w} ${FRONT.h} L 0 ${FRONT.h} Z`} fill="#5FB3A3" opacity="0.38" />
            <path d={`M${FRONT.w - 14} 0 Q ${FRONT.w - 8} ${FRONT.h * 0.5} ${FRONT.w - 16} ${FRONT.h} L ${FRONT.w} ${FRONT.h} L ${FRONT.w} 0 Z`} fill="#5FB3A3" opacity="0.35" />
            <path d="M14 7 Q 120 3 222 7" stroke="#E9FFF8" strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.65" />
            <path d="M6 22 Q 3 120 7 220" stroke="#E9FFF8" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.45" />
          </g>
          <rect x="0" y="0" width={FRONT.w} height={FRONT.h} rx="18" fill="none" stroke={INK} strokeWidth="3.4" opacity="0.9" />

          {/* Screen bezel + glass */}
          <rect x={sc.x + 3} y={sc.y + 4} width={sc.w} height={sc.h} rx={sc.r} fill="#4F9F92" opacity="0.55" />
          <rect x={sc.x} y={sc.y} width={sc.w} height={sc.h} rx={sc.r} fill="url(#c-screen)" />
          <g clipPath="url(#c-screen-clip)">
            <path
              d={`M${sc.x} ${sc.y} H ${sc.x + sc.w} V ${sc.y + 9} Q ${sc.x + 20} ${sc.y + 8} ${sc.x + 10} ${sc.y + 22} Q ${sc.x + 8} ${sc.y + 80} ${sc.x + 10} ${sc.y + sc.h} H ${sc.x} Z`}
              fill="#B9D9C3"
              opacity="0.75"
            />
            <path d={`M${sc.x + 120} ${sc.y} L ${sc.x + 150} ${sc.y} L ${sc.x + 70} ${sc.y + sc.h} L ${sc.x + 40} ${sc.y + sc.h} Z`} fill="#fff" opacity="0.16" />
            <path d={`M${sc.x + 158} ${sc.y} L ${sc.x + 168} ${sc.y} L ${sc.x + 88} ${sc.y + sc.h} L ${sc.x + 78} ${sc.y + sc.h} Z`} fill="#fff" opacity="0.14" />
            <g ref={screen} transform={`translate(${sc.x} ${sc.y})`}>
              <ScreenFace state={face} eyesRef={eyes} bootBarRef={bootBar} />
            </g>
          </g>
          <rect x={sc.x} y={sc.y} width={sc.w} height={sc.h} rx={sc.r} fill="none" stroke={INK} strokeWidth="4.6" />

          {/* Cartridge slot */}
          <rect x={sl.x - 2} y={sl.y - 2} width={sl.w + 4} height={sl.h + 5} rx="4" fill="#5FB3A3" opacity="0.6" />
          <rect x={sl.x} y={sl.y} width={sl.w} height={sl.h} rx="3.5" fill="#142020" />
          <rect ref={slotFill} x={sl.x + 8} y={sl.y + 3} width={sl.w - 16} height={sl.h - 5} rx="1.5" fill="#E26D7A" opacity="0" />
          <path d={`M${sl.x + 3} ${sl.y + sl.h + 2.2} H ${sl.x + sl.w - 3}`} stroke="#C8F3EA" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
          <circle ref={indicator} cx={FACE.indicator.x} cy={FACE.indicator.y} r={FACE.indicator.r} fill="#2B56D6" stroke={INK} strokeWidth="2" />

          {/* D-pad */}
          <g transform="translate(60 240)">
            <path d="M-8 -24 h16 v16 h16 v16 h-16 v16 h-16 v-16 h-16 v-16 h16 Z" fill="#C9A62C" transform="translate(2 3)" />
            <path d="M-8 -24 h16 v16 h16 v16 h-16 v16 h-16 v-16 h-16 v-16 h16 Z" fill="#F5D24A" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
            <path d="M-5 -20 v12 M-20 -5 h10" stroke="#FFF3B5" strokeWidth="2.4" strokeLinecap="round" />
          </g>
          {/* Triangle, circles */}
          <path d="M141 209 L155 232 L127 232 Z" fill="#2E9FB8" transform="translate(1.5 2.5)" />
          <path d="M141 209 L155 232 L127 232 Z" fill="#4CC6E2" stroke={INK} strokeWidth="2.8" strokeLinejoin="round" />
          <circle cx="192" cy="223" r="11" fill="#4FA53A" transform="translate(1.5 2)" />
          <circle cx="192" cy="223" r="11" fill="#78D35C" stroke={INK} strokeWidth="2.8" />
          <circle cx="188.5" cy="219" r="3" fill="#D5FFC7" opacity="0.85" />
          <circle cx="160" cy="258" r="18" fill="#C23450" transform="translate(2 2.5)" />
          <circle cx="160" cy="258" r="18" fill="#F2566F" stroke={INK} strokeWidth="3" />
          <ellipse cx="154" cy="251" rx="6" ry="4" fill="#FFC3CD" opacity="0.8" transform="rotate(-30 154 251)" />
          {/* Start / select */}
          <rect x="34" y="279" width="26" height="8" rx="4" fill="#2C55D8" stroke={INK} strokeWidth="2.2" />
          <rect x="68" y="279" width="26" height="8" rx="4" fill="#2C55D8" stroke={INK} strokeWidth="2.2" />
        </g>

        {/* Edges and outline */}
        <path d={`M${FTL.x} ${FTL.y + 10} L ${FBL.x} ${FBL.y - 12}`} stroke={INK} strokeWidth="2.6" opacity="0.55" />
        <path d={SILHOUETTE} fill="none" stroke={INK} strokeWidth="5.5" strokeLinejoin="round" />

        {/* Left arm loops out of the side port and rests on the floor */}
        <g ref={armL}>
          <Tube
            d={`M${shoulderL.x - 2} ${shoulderL.y + 1} C ${shoulderL.x - 30} ${shoulderL.y + 6}, ${shoulderL.x - 44} ${shoulderL.y + 34}, ${shoulderL.x - 40} ${shoulderL.y + 62} S ${shoulderL.x - 30} ${shoulderL.y + 96}, ${shoulderL.x - 46} ${shoulderL.y + 112}`}
          />
          <Nub cx={shoulderL.x - 50} cy={shoulderL.y + 118} rx={11} ry={9.5} rot={18} />
        </g>
      </g>
    </svg>
  )
}

export const Console = memo(ConsoleArt)

/** Separate thin layer above the cartridges: the slot's upper lip that the cartridge slides under. */
export function SlotLip({ lipRef }: { lipRef: (el: SVGGElement | null) => void }) {
  const sl = FACE.slot
  return (
    <svg className="slot-lip" viewBox={`0 0 ${CONSOLE_BOX.w} ${CONSOLE_BOX.h}`} width={CONSOLE_BOX.w} height={CONSOLE_BOX.h} aria-hidden="true">
      <defs>
        <linearGradient id="lip-shadow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0B1414" stopOpacity="0.55" />
          <stop offset="1" stopColor="#0B1414" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g ref={lipRef} transform={FRONT_MATRIX} opacity="0">
        <rect x={sl.x + 1} y={sl.y} width={sl.w - 2} height="9" fill="url(#lip-shadow)" />
        <path d={`M${sl.x + 1} ${sl.y} H ${sl.x + sl.w - 1}`} stroke="#142020" strokeWidth="3.2" strokeLinecap="round" />
        <path d={`M${sl.x + 2} ${sl.y - 2.6} H ${sl.x + sl.w - 2}`} stroke="#5FB3A3" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
      </g>
    </svg>
  )
}

