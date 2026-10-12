import { Suspense, lazy, Component, type ReactNode, type ErrorInfo } from 'react';

// Lazy-load the heavy Babylon.js canvas so it never blocks the initial paint
const StarfieldBackground = lazy(() => import('./StarfieldBackground'));

// ─── WebGL error boundary ─────────────────────────────────────────────────────

interface WebGLErrorState {
  readonly failed: boolean;
}

/**
 * Catches WebGL context-loss and Babylon.js initialisation errors.
 * On failure we render a plain dark background — no broken canvas.
 */
class WebGLErrorBoundary extends Component<
  { readonly children: ReactNode },
  WebGLErrorState
> {
  constructor(props: { readonly children: ReactNode }) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError(): WebGLErrorState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.warn('[StarfieldCanvas] WebGL error — degrading gracefully:', error, info);
  }

  render(): ReactNode {
    // On failure the static nebula (rendered by StarfieldCanvas) stays as the backdrop.
    if (this.state.failed) return null;
    return this.props.children;
  }
}

// ─── Static stand-in while the Babylon.js bundle loads ───────────────────────
// The Babylon bundle is several MB, so on a real network the 3D scene starts seconds
// after the HUD appears. This is the same nebula image Babylon draws as its backdrop
// (already preloaded during the age gate — see preloadScene.ts), dimmed and cropped
// to match its Layer (color ≈ 0.6, 0.92 inset ⇒ ~1.09× zoom). The canvas fades in on
// top of it once the scene is ready, so the cosmos is there from the first frame.

function NebulaBackdrop() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        backgroundColor: '#050508',
        backgroundImage: 'url(/nebula.webp)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        transform: 'scale(1.09)',
        filter: 'brightness(0.6)',
      }}
      aria-hidden="true"
    />
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

export function StarfieldCanvas() {
  return (
    <>
      <NebulaBackdrop />
      <WebGLErrorBoundary>
        <Suspense fallback={null}>
          <StarfieldBackground />
        </Suspense>
      </WebGLErrorBoundary>
    </>
  );
}
