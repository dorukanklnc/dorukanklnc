import type { Ref } from 'react'
import { FACE } from './geometry'
import { isLight } from './draw'

const INK = '#1C2828'

export type Expression = 'neutral' | 'curious' | 'happy' | 'boot' | 'off'

export interface FaceState {
  expression: Expression
  /** Shown on the boot screen. */
  emblem?: string
  title?: string
  color?: string
}

const W = FACE.screen.w
const H = FACE.screen.h
const EYE_Y = 62
const EYE_L = W / 2 - 27
const EYE_R = W / 2 + 27
const MOUTH_Y = 94

interface Props {
  state: FaceState
  eyesRef: Ref<SVGGElement>
  bootBarRef: Ref<SVGRectElement>
}

export function ScreenFace({ state, eyesRef, bootBarRef }: Props) {
  const { expression } = state

  if (expression === 'boot') {
    const color = state.color ?? '#E26D7A'
    const fg = isLight(color) ? INK : '#FFF8EC'
    return (
      <g className="screen-boot">
        {/* keep an (empty) eyes group so blink/glance tweens always have a target */}
        <g ref={eyesRef} />
        <circle cx={W / 2} cy={56} r={27} fill={color} stroke={INK} strokeWidth="3.4" />
        <circle cx={W / 2} cy={56} r={20} fill="none" stroke={fg} strokeWidth="1.6" strokeDasharray="3 4" opacity="0.6" />
        <text
          x={W / 2}
          y={57}
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily="'Pixelify Sans', monospace"
          fontWeight="700"
          fontSize={state.emblem && state.emblem.length > 2 ? 15 : 19}
          fill={fg}
        >
          {state.emblem}
        </text>
        <text
          x={W / 2}
          y={104}
          textAnchor="middle"
          fontFamily="'Pixelify Sans', monospace"
          fontWeight="600"
          fontSize={Math.min(13, 168 / ((state.title?.length ?? 1) * 0.62))}
          fill={INK}
        >
          {state.title}
        </text>
        <rect x={W / 2 - 40} y={116} width="80" height="8" rx="4" fill="none" stroke={INK} strokeWidth="2" />
        <rect ref={bootBarRef} x={W / 2 - 38} y={118} width="76" height="4" rx="2" fill={INK} style={{ transformBox: 'fill-box', transformOrigin: 'left center' }} />
      </g>
    )
  }

  if (expression === 'off') return <g ref={eyesRef} />

  return (
    <g className="screen-face">
      {expression === 'happy' && (
        <g opacity="0.55">
          <ellipse cx={EYE_L - 14} cy={EYE_Y + 22} rx="10" ry="5.5" fill="#F29BA6" />
          <ellipse cx={EYE_R + 14} cy={EYE_Y + 22} rx="10" ry="5.5" fill="#F29BA6" />
        </g>
      )}
      <g ref={eyesRef}>
        {expression === 'happy' ? (
          <>
            <path d={`M${EYE_L - 9} ${EYE_Y + 4} Q ${EYE_L} ${EYE_Y - 9} ${EYE_L + 9} ${EYE_Y + 4}`} stroke={INK} strokeWidth="3.6" fill="none" strokeLinecap="round" />
            <path d={`M${EYE_R - 9} ${EYE_Y + 4} Q ${EYE_R} ${EYE_Y - 9} ${EYE_R + 9} ${EYE_Y + 4}`} stroke={INK} strokeWidth="3.6" fill="none" strokeLinecap="round" />
          </>
        ) : expression === 'curious' ? (
          <>
            <ellipse cx={EYE_L} cy={EYE_Y} rx="6.6" ry="8.4" fill={INK} />
            <ellipse cx={EYE_R} cy={EYE_Y} rx="6.6" ry="8.4" fill={INK} />
            <circle cx={EYE_L + 2.2} cy={EYE_Y - 3} r="2.1" fill="#E3F4E5" />
            <circle cx={EYE_R + 2.2} cy={EYE_Y - 3} r="2.1" fill="#E3F4E5" />
            <path d={`M${EYE_R - 9} ${EYE_Y - 16} Q ${EYE_R} ${EYE_Y - 21} ${EYE_R + 8} ${EYE_Y - 15}`} stroke={INK} strokeWidth="2.6" fill="none" strokeLinecap="round" />
          </>
        ) : (
          <>
            <ellipse cx={EYE_L} cy={EYE_Y} rx="5.4" ry="6.6" fill={INK} />
            <ellipse cx={EYE_R} cy={EYE_Y} rx="5.4" ry="6.6" fill={INK} />
            <circle cx={EYE_L + 1.8} cy={EYE_Y - 2.4} r="1.6" fill="#E3F4E5" />
            <circle cx={EYE_R + 1.8} cy={EYE_Y - 2.4} r="1.6" fill="#E3F4E5" />
          </>
        )}
      </g>
      {expression === 'happy' ? (
        <g>
          <path d={`M${W / 2 - 16} ${MOUTH_Y - 4} Q ${W / 2} ${MOUTH_Y - 1} ${W / 2 + 16} ${MOUTH_Y - 4} Q ${W / 2 + 13} ${MOUTH_Y + 16} ${W / 2} ${MOUTH_Y + 16} Q ${W / 2 - 13} ${MOUTH_Y + 16} ${W / 2 - 16} ${MOUTH_Y - 4} Z`} fill={INK} />
          <path d={`M${W / 2 - 8} ${MOUTH_Y + 12} Q ${W / 2} ${MOUTH_Y + 5} ${W / 2 + 8} ${MOUTH_Y + 12} Q ${W / 2} ${MOUTH_Y + 16} ${W / 2 - 8} ${MOUTH_Y + 12} Z`} fill="#F2788C" />
        </g>
      ) : expression === 'curious' ? (
        <ellipse cx={W / 2 + 2} cy={MOUTH_Y + 4} rx="5" ry="6" fill="none" stroke={INK} strokeWidth="3.2" />
      ) : (
        <path d={`M${W / 2 - 14} ${MOUTH_Y} Q ${W / 2} ${MOUTH_Y + 14} ${W / 2 + 14} ${MOUTH_Y}`} stroke={INK} strokeWidth="3.6" fill="none" strokeLinecap="round" />
      )}
      {/* faint pixel grid line, like an old LCD */}
      <path d={`M0 ${H - 18} H ${W}`} stroke="#C7E2CF" strokeWidth="1" opacity="0.6" />
    </g>
  )
}
