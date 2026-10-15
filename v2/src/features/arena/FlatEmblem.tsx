import { EMBLEM_HEIGHT, EMBLEM_HELMET, EMBLEM_WIDTH, EMBLEM_WINGS } from '@/shared/brand/emblemPaths';

const PIECES = [...EMBLEM_WINGS, ...EMBLEM_HELMET];

/**
 * The flat emblem: lit steel in an SVG. It is the first screen's emblem where there is no WebGL (and
 * until the 3D one has drawn its first frame), the same silhouette and the same lit gradient as the gate's.
 * Static: nothing here moves.
 */
export function FlatEmblem({ className, fillId = 'flat-emblem-fill' }: { readonly className?: string; readonly fillId?: string }) {
  return (
    <svg className={className} viewBox={`0 0 ${EMBLEM_WIDTH} ${EMBLEM_HEIGHT}`} focusable="false" aria-hidden="true">
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".34" stopColor="#e3ecf5" />
          <stop offset=".64" stopColor="#9fb3c9" />
          <stop offset="1" stopColor="#5c7591" />
        </linearGradient>
      </defs>
      <g fill={`url(#${fillId})`} stroke="#b6e8ff" strokeWidth={1}>
        {PIECES.map((d, index) => <path key={index} d={d} vectorEffect="non-scaling-stroke" />)}
      </g>
    </svg>
  );
}

/** A small emblem for the top bar's brand: the silhouette in the surrounding text colour. */
export function MiniEmblem({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox={`0 0 ${EMBLEM_WIDTH} ${EMBLEM_HEIGHT}`} focusable="false" aria-hidden="true">
      <g fill="currentColor">{PIECES.map((d, index) => <path key={index} d={d} />)}</g>
    </svg>
  );
}
