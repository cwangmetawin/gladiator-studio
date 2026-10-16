import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useMotionPreference } from '@/shared/motion/useMotionPreference';
import { createRevealLifecycle } from './editorialLifecycle';
import { decodeFrame, formatCount, valueAtProgress } from './editorialMotion';
import { HeadlineWords } from './HeadlineWords';
import './editorialBody.css';

interface ChapterProps {
  readonly id: string;
  readonly number: string;
  readonly kicker: string;
  readonly title: string;
  readonly deck?: string;
  readonly titleCompanion?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}

/** One observer per chapter; body children stagger in CSS rather than subscribing individually. */
function ChapterRuntime(props: ChapterProps) {
  const { id, number, kicker } = props;
  const ref = useRef<HTMLElement>(null), kickerRef = useRef<HTMLSpanElement>(null);
  const reducedMotion = useMotionPreference();
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const root = node.closest<HTMLElement>('.partner__scroll');
    const kickerNode = kickerRef.current;
    let frame = 0, entered = false, disposed = false;
    let entryObserver: IntersectionObserver | undefined;
    const canObserve = typeof IntersectionObserver !== 'undefined';
    const lifecycle = createRevealLifecycle({ reducedMotion,
      onState: state => {
        node.dataset.editorialState = state;
        const visual = kickerNode;
        if (state !== 'visible' || reducedMotion || !canObserve || !visual) return;
        const text = `${number} · ${kicker}`, start = performance.now();
        const tick = (now: number) => {
          const progress = Math.min(1, (now - start) / 340);
          visual.textContent = decodeFrame(text, progress);
          if (progress < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
      observe: !canObserve ? undefined : onVisible => {
        const revealFrame = requestAnimationFrame(onVisible);
        return () => cancelAnimationFrame(revealFrame);
      },
    });
    if (reducedMotion || !canObserve) lifecycle.mount();
    else {
      // Leave offscreen chapters visible until their first view: the safety budget starts here.
      entryObserver = new IntersectionObserver(entries => {
        if (disposed || entered || !entries.some(entry => entry.isIntersecting)) return;
        entered = true;
        entryObserver?.disconnect(); entryObserver = undefined;
        lifecycle.mount();
      }, { root, rootMargin: '0px 0px 12% 0px', threshold: 0.01 });
      entryObserver.observe(node);
    }
    return () => {
      disposed = true; entryObserver?.disconnect();
      lifecycle.dispose(); cancelAnimationFrame(frame); delete node.dataset.editorialState;
      if (kickerNode) kickerNode.textContent = `${number} · ${kicker}`;
    };
  }, [reducedMotion, id, number, kicker]);
  return <ChapterMarkup {...props} nodeRef={ref} kickerRef={kickerRef} />;
}

function ChapterMarkup({ id, number, kicker, title, deck, titleCompanion, children, className = '', nodeRef, kickerRef }: ChapterProps & { readonly nodeRef?: RefObject<HTMLElement | null>; readonly kickerRef?: RefObject<HTMLSpanElement | null> }) {
  const identity = <>
    <h2 id={`${id}-title`} className="editorial-chapter__title" aria-label={title}><EditorialWords text={title} /></h2>
    {deck && <p className="editorial-chapter__deck">{deck}</p>}
  </>;
  return <section id={id} ref={nodeRef} className={`editorial-chapter ${className}`} aria-labelledby={`${id}-title`}>
    <div className="editorial-chapter__rail">
      <span className="editorial-chapter__number" aria-hidden="true">{number}</span>
      <p className="editorial-chapter__kicker" aria-label={`${number} · ${kicker}`}><span ref={kickerRef} aria-hidden="true">{number} · {kicker}</span></p>
    </div>
    <div className="editorial-chapter__content">
      <div className="editorial-chapter__hairline" aria-hidden="true" />
      {titleCompanion ? <div className="editorial-chapter__heading">{titleCompanion}<div className="editorial-chapter__identity">{identity}</div></div> : identity}
      <div className="editorial-chapter__body">{children}</div>
    </div>
  </section>;
}

export function EditorialChapter(props: ChapterProps) {
  return typeof window === 'undefined' || typeof document === 'undefined' ? <ChapterMarkup {...props} /> : <ChapterRuntime {...props} />;
}

export function EditorialWords({ text, className }: { readonly text: string; readonly className?: string }) {
  return <HeadlineWords text={text} className={className} chapter />;
}

interface IndexProps { readonly chapters: readonly { readonly id: string; readonly label: string }[]; readonly label?: string }

function IndexRuntime({ chapters, label }: IndexProps) {
  const ref = useRef<HTMLElement>(null);
  const [current, setCurrent] = useState(chapters[0]?.id ?? '');
  const reducedMotion = useMotionPreference();
  useEffect(() => {
    const root = ref.current?.closest<HTMLElement>('.partner__scroll');
    if (!root || typeof IntersectionObserver === 'undefined') return;
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.set(entry.target.id, entry.intersectionRatio);
        else visible.delete(entry.target.id);
      }
      const next = [...visible].sort((a, b) => b[1] - a[1])[0]?.[0];
      if (next) setCurrent(next);
    }, { root, rootMargin: '-12% 0px -35% 0px', threshold: [0, 0.1, 0.3, 0.6, 1] });
    for (const { id } of chapters) {
      const chapter = root.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
      if (chapter) observer.observe(chapter);
    }
    return () => observer.disconnect();
  }, [chapters]);
  return <IndexMarkup chapters={chapters} label={label} current={current} nodeRef={ref} reducedMotion={reducedMotion} onCurrent={setCurrent} />;
}

function IndexMarkup({ chapters, label = 'Page chapters', current, nodeRef, reducedMotion = true, onCurrent }: IndexProps & {
  readonly current: string; readonly nodeRef?: RefObject<HTMLElement | null>; readonly reducedMotion?: boolean; readonly onCurrent?: (id: string) => void;
}) {
  return <nav ref={nodeRef} className="editorial-index" aria-label={label}>
    <ol className="editorial-index__list">{chapters.map(({ id, label }, index) => <li className="editorial-index__item" key={id}>
      <a href={`#${id}`} aria-current={current === id ? 'true' : undefined} onClick={event => {
        const root = nodeRef?.current?.closest<HTMLElement>('.partner__scroll');
        const chapter = root?.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
        if (!root || !chapter) return;
        event.preventDefault();
        let top = 0;
        for (let node: HTMLElement | null = chapter; node && node !== root; node = node.offsetParent as HTMLElement | null) top += node.offsetTop;
        root.scrollTo({ top: Math.max(0, top - 32), behavior: reducedMotion ? 'instant' : 'smooth' });
        onCurrent?.(id);
        chapter.querySelector<HTMLElement>('h2')?.setAttribute('tabindex', '-1');
        chapter.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
      }}><span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>{label}</a>
    </li>)}</ol>
  </nav>;
}

export function EditorialIndex(props: IndexProps) {
  return typeof window === 'undefined' || typeof document === 'undefined' ? <IndexMarkup {...props} current={props.chapters[0]?.id ?? ''} /> : <IndexRuntime {...props} />;
}

interface CounterProps { readonly value: number; readonly decimals?: number; readonly suffix?: string; readonly label?: string }

function CounterRuntime({ value, decimals = 0, suffix = '', label }: CounterProps) {
  const ref = useRef<HTMLSpanElement>(null), animated = useRef<HTMLSpanElement>(null), hasAnimated = useRef(false);
  const reducedMotion = useMotionPreference();
  const final = formatCount(value, decimals, suffix);
  useEffect(() => {
    const node = ref.current, display = animated.current;
    if (!node || !display) return;
    display.textContent = final;
    if (reducedMotion || hasAnimated.current || typeof IntersectionObserver === 'undefined') {
      hasAnimated.current = true; return;
    }
    let frame = 0;
    const root = node.closest<HTMLElement>('.partner__scroll');
    const observer = new IntersectionObserver(entries => {
      if (hasAnimated.current || !entries.some(entry => entry.isIntersecting)) return;
      hasAnimated.current = true;
      observer.disconnect();
      const start = performance.now();
      const tick = (now: number) => {
        const progress = Math.min(1, (now - start) / 900);
        display.textContent = formatCount(valueAtProgress(value, progress), decimals, suffix);
        if (progress < 1) frame = requestAnimationFrame(tick);
      };
      display.textContent = formatCount(0, decimals, suffix);
      frame = requestAnimationFrame(tick);
    }, { root, threshold: 0.1 });
    observer.observe(node);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); display.textContent = final; };
  }, [value, decimals, suffix, final, reducedMotion]);
  return <CounterMarkup value={value} decimals={decimals} suffix={suffix} label={label} nodeRef={ref} valueRef={animated} />;
}

function CounterMarkup({ value, decimals = 0, suffix = '', label, nodeRef, valueRef }: CounterProps & {
  readonly nodeRef?: RefObject<HTMLSpanElement | null>; readonly valueRef?: RefObject<HTMLSpanElement | null>;
}) {
  const final = formatCount(value, decimals, suffix);
  return <span ref={nodeRef} className="editorial-counter" aria-label={label ? `${final} ${label}` : final}>
    <span ref={valueRef} className="editorial-counter__value" style={{ minWidth: `min(${final.length}ch, 100%)` }} aria-hidden="true">{final}</span>
    {label && <span className="editorial-counter__label" aria-hidden="true">{label}</span>}
  </span>;
}

export function EditorialCounter(props: CounterProps) {
  return typeof window === 'undefined' || typeof document === 'undefined' ? <CounterMarkup {...props} /> : <CounterRuntime {...props} />;
}

/** Thresholds update a transform variable; no scroll listener or layout read runs per frame. */
function TimelineRuntime({ children }: { readonly children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null), endRef = useRef<HTMLSpanElement>(null);
  const reducedMotion = useMotionPreference();
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (reducedMotion || typeof IntersectionObserver === 'undefined') {
      node.style.setProperty('--timeline-progress', '1'); return;
    }
    const root = node.closest<HTMLElement>('.partner__scroll');
    const end = endRef.current;
    const chapters = [...node.querySelectorAll<HTMLElement>('.editorial-chapter')];
    const thresholds = Array.from({ length: 21 }, (_, index) => index / 20);
    let highest = 0;
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.target === end && entry.isIntersecting) highest = 1;
        const index = chapters.indexOf(entry.target as HTMLElement);
        if (entry.isIntersecting && index >= 0) highest = Math.max(highest, (index + entry.intersectionRatio) / Math.max(1, chapters.length));
      }
      node.style.setProperty('--timeline-progress', String(highest));
    }, { root, threshold: thresholds });
    chapters.forEach(chapter => observer.observe(chapter));
    if (end) observer.observe(end);
    return () => observer.disconnect();
  }, [reducedMotion, children]);
  return <TimelineMarkup nodeRef={ref} endRef={endRef}>{children}</TimelineMarkup>;
}

function TimelineMarkup({ children, nodeRef, endRef }: { readonly children: ReactNode; readonly nodeRef?: RefObject<HTMLDivElement | null>; readonly endRef?: RefObject<HTMLSpanElement | null> }) {
  return <div ref={nodeRef} className="editorial-timeline"><span className="editorial-timeline__track" aria-hidden="true"><span className="editorial-timeline__progress" /></span>{children}<span ref={endRef} className="editorial-timeline__end" aria-hidden="true" /></div>;
}

export function EditorialTimeline(props: { readonly children: ReactNode }) {
  return typeof window === 'undefined' || typeof document === 'undefined' ? <TimelineMarkup {...props} /> : <TimelineRuntime {...props} />;
}
