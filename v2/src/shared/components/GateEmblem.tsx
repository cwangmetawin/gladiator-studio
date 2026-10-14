import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type SVGProps } from 'react';
import { EMBLEM_HEIGHT, EMBLEM_HELMET, EMBLEM_WIDTH, EMBLEM_WINGS } from '@/shared/brand/emblemPaths';
import { ARC_BOX_HEIGHT, ARC_EDGE_Y, ARC_FEATHERS, ARC_FIRST_MS, SPARK, arcGeometry, nextArc, type ArcGeometry } from '@/shared/brand/emblemArcs';
import { emblemAnchor } from '@/shared/brand/emblemAnchor';

// The gate's 2D emblem: stacked SVG layers (dark steel, lit steel, a pre-blurred glow, the
// ignition current) and small arc/spark layers. Only their opacity and transform animate, so
// the browser composites them and never re-runs the blur.

const PIECES = [...EMBLEM_WINGS, ...EMBLEM_HELMET];
const VIEW = `0 0 ${EMBLEM_WIDTH} ${EMBLEM_HEIGHT}`;
const ARCS: readonly ArcGeometry[] = ARC_FEATHERS.map(arcGeometry);
const pct = (value: number, of: number): string => `${((value / of) * 100).toFixed(3)}%`;

export type EmblemMode = 'idle' | 'ignite' | 'off';

interface GateEmblemProps {
  /** idle: the spark breathes and arcs fire; ignite: the exit ignition; off: the denied page. */
  readonly mode: EmblemMode;
  readonly reducedMotion: boolean;
}

function Pieces(props: SVGProps<SVGPathElement>) {
  return <>{PIECES.map((d, index) => <path key={index} d={d} {...props} />)}</>;
}

function SteelLayer() {
  return (
    <svg className="gate__layer gate__steel" viewBox={VIEW} focusable="false">
      <defs>
        <linearGradient id="gate-steel-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#465267" />
          <stop offset=".42" stopColor="#262e3c" />
          <stop offset="1" stopColor="#12161f" />
        </linearGradient>
        <linearGradient id="gate-steel-rim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c6d2e2" stopOpacity=".7" />
          <stop offset=".5" stopColor="#8294ac" stopOpacity=".25" />
          <stop offset="1" stopColor="#4b5874" stopOpacity=".1" />
        </linearGradient>
      </defs>
      <Pieces fill="url(#gate-steel-fill)" stroke="url(#gate-steel-rim)" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function LitLayer() {
  return (
    <svg className="gate__layer gate__lit" viewBox={VIEW} focusable="false">
      <defs>
        <linearGradient id="gate-lit-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".34" stopColor="#e3ecf5" />
          <stop offset=".64" stopColor="#9fb3c9" />
          <stop offset="1" stopColor="#5c7591" />
        </linearGradient>
      </defs>
      <Pieces fill="url(#gate-lit-fill)" stroke="#b6e8ff" strokeWidth={1} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/**
 * The glow mounts one frame after the emblem: a blur is the most expensive thing to rasterise on
 * the gate, and the first frame (the title, the page's LCP) should not wait for it.
 */
function useAfterFirstFrame(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => { setReady(true); });
    return () => { cancelAnimationFrame(frame); };
  }, []);
  return ready;
}

/** A static blur, rasterised once with its layer; animating the layer's opacity never re-runs it. */
function GlowLayer() {
  return (
    <svg className="gate__layer gate__glow" viewBox={VIEW} focusable="false">
      <defs>
        <filter id="gate-glow-blur" x="-8%" y="-40%" width="116%" height="180%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>
      <g filter="url(#gate-glow-blur)" fill="none" stroke="#4fc3f7" strokeWidth={6}>
        <Pieces />
      </g>
    </svg>
  );
}

/** The ignition current, one half per side, wiped outwards from the helmet. */
function CurrentHalf({ side }: { readonly side: 'left' | 'right' }) {
  const left = side === 'left';
  const view = left ? `0 0 ${SPARK.x} ${EMBLEM_HEIGHT}` : `${SPARK.x} 0 ${EMBLEM_WIDTH - SPARK.x} ${EMBLEM_HEIGHT}`;
  const box: CSSProperties = left ? { left: 0, width: pct(SPARK.x, EMBLEM_WIDTH) } : { left: pct(SPARK.x, EMBLEM_WIDTH), right: 0 };
  return (
    <div className={`gate__current gate__current--${side}`} style={box}>
      <div className="gate__current-reveal">
        <svg className="gate__layer" viewBox={view} focusable="false" fill="none">
          <g stroke="#4fc3f7" strokeOpacity=".4" strokeWidth={7}><Pieces vectorEffect="non-scaling-stroke" /></g>
          <g stroke="#80d8ff" strokeWidth={2.4}><Pieces vectorEffect="non-scaling-stroke" /></g>
          <g stroke="#ffffff" strokeWidth={1}><Pieces vectorEffect="non-scaling-stroke" /></g>
        </svg>
      </div>
    </div>
  );
}

function Arc({ arc, nodeRef }: { readonly arc: ArcGeometry; readonly nodeRef: (node: HTMLDivElement | null) => void }) {
  const style: CSSProperties = {
    left: pct(arc.x, EMBLEM_WIDTH), top: pct(arc.y, EMBLEM_HEIGHT),
    width: pct(arc.length, EMBLEM_WIDTH), height: pct(ARC_BOX_HEIGHT, EMBLEM_HEIGHT),
    transformOrigin: `50% ${pct(ARC_EDGE_Y, ARC_BOX_HEIGHT)}`,
    transform: `rotate(${arc.angleDeg.toFixed(3)}deg)${arc.mirrored ? ' scaleX(-1)' : ''}`,
  };
  const view = `0 0 ${arc.length.toFixed(1)} ${ARC_BOX_HEIGHT}`;
  return (
    <div ref={nodeRef} className="gate__arc" data-feather={arc.feather} style={style}>
      <div className="gate__arc-light" style={{ top: pct(ARC_EDGE_Y - 7, ARC_BOX_HEIGHT), height: pct(16, ARC_BOX_HEIGHT) }} />
      <div className="gate__arc-window">
        <div className="gate__arc-reveal">
          {arc.bolts.map((d, index) => (
            <svg key={index} className={`gate__layer gate__bolt gate__bolt--${index === 0 ? 'a' : 'b'}`} viewBox={view} focusable="false" fill="none">
              <path d={d} stroke="#4fc3f7" strokeOpacity=".45" strokeWidth={5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              <path d={d} stroke="#b6e8ff" strokeWidth={1.8} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              <path d={d} stroke="#ffffff" strokeWidth={0.8} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            </svg>
          ))}
        </div>
      </div>
    </div>
  );
}

export function GateEmblem({ mode, reducedMotion }: GateEmblemProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const arcNodes = useRef<(HTMLDivElement | null)[]>([]);
  const glowReady = useAfterFirstFrame();

  // M1 hand-off: where the 2D emblem is on screen, kept current through resizes, and null once
  // the gate has gone (the 3D emblem then owns the screen position).
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const publish = (): void => {
      const { x, y, width, height } = box.getBoundingClientRect();
      emblemAnchor.publish({ x, y, width, height });
    };
    publish();
    window.addEventListener('resize', publish);
    return () => {
      window.removeEventListener('resize', publish);
      emblemAnchor.publish(null);
    };
  }, []);

  // One arc at a time: toggling data-firing restarts that arc's 0.3 s CSS animation.
  useEffect(() => {
    if (mode !== 'idle' || reducedMotion) return;
    const nodes = arcNodes.current;
    let previous: number | null = null;
    let timer = 0;
    const fire = (): void => {
      const { feather, waitMs } = nextArc(Math.random, previous);
      if (previous !== null) nodes[previous]?.removeAttribute('data-firing');
      nodes[feather]?.setAttribute('data-firing', '');
      previous = feather;
      timer = window.setTimeout(fire, waitMs);
    };
    timer = window.setTimeout(fire, ARC_FIRST_MS);
    return () => {
      window.clearTimeout(timer);
      nodes.forEach(node => node?.removeAttribute('data-firing'));
    };
  }, [mode, reducedMotion]);

  return (
    <div ref={boxRef} className="gate__emblem" data-emblem-anchor="" data-mode={mode} aria-hidden="true">
      <div className="gate__halo" />
      <SteelLayer />
      {glowReady && <GlowLayer />}
      <LitLayer />
      <CurrentHalf side="left" />
      <CurrentHalf side="right" />
      {ARCS.map(arc => (
        <Arc key={arc.feather} arc={arc} nodeRef={node => { arcNodes.current[arc.feather] = node; }} />
      ))}
      <div className="gate__spark" style={{ left: pct(SPARK.x, EMBLEM_WIDTH), top: pct(SPARK.y, EMBLEM_HEIGHT) }}>
        <div className="gate__spark-halo" />
        <div className="gate__spark-core" />
      </div>
    </div>
  );
}
