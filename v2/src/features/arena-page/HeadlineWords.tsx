import { useEffect, useRef, type CSSProperties, type RefObject } from 'react';
import { useMotionPreference } from '@/shared/motion/useMotionPreference';
import { splitWords } from './editorialMotion';
import { createRevealLifecycle } from './editorialLifecycle';

interface HeadlineWordsProps {
  readonly text: string;
  readonly className?: string;
  readonly ready?: boolean;
  readonly chapter?: boolean;
}

function WordsMarkup({ text, className = '', chapter = false, nodeRef }: HeadlineWordsProps & {
  readonly nodeRef?: RefObject<HTMLSpanElement | null>;
}) {
  let word = 0;
  return <span ref={nodeRef} className={`editorial-words ${chapter ? 'editorial-words--chapter' : 'editorial-words--headline'} ${className}`}>
    {splitWords(text).map((token, index) => /^\s+$/u.test(token) ? token :
      <span className="editorial-word-clip" key={index}><span className="editorial-word" style={{
        '--word-delay': `${Math.min(word++ * (chapter ? 45 : 10), chapter ? 180 : 30)}ms`,
      } as CSSProperties}>{token}</span></span>)}
  </span>;
}

function WordsRuntime({ text, className, ready = true, chapter = false }: HeadlineWordsProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const reducedMotion = useMotionPreference();
  useEffect(() => {
    if (!ready || chapter) return;
    const node = ref.current;
    if (!node) return;
    const root = node.closest<HTMLElement>('.partner__scroll');
    const lifecycle = createRevealLifecycle({ reducedMotion,
      onState: state => { node.dataset.editorialState = state; },
      observe: typeof IntersectionObserver === 'undefined' ? undefined : onVisible => {
        const observer = new IntersectionObserver(entries => {
          if (entries.some(entry => entry.isIntersecting)) onVisible();
        }, { root, threshold: 0.01 });
        observer.observe(node);
        return () => observer.disconnect();
      },
    });
    lifecycle.mount();
    return () => { lifecycle.dispose(); delete node.dataset.editorialState; };
  }, [ready, chapter, reducedMotion, text]);
  return <WordsMarkup text={text} className={className} chapter={chapter} nodeRef={ref} />;
}

/** Kept separate from the lazy body; server/no-JS markup never opts into a hidden state. */
export function HeadlineWords(props: HeadlineWordsProps) {
  return typeof window === 'undefined' || typeof document === 'undefined' ? <WordsMarkup {...props} /> : <WordsRuntime {...props} />;
}
