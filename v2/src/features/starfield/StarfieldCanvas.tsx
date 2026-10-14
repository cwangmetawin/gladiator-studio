import { Suspense, lazy, Component, type ReactNode, type ErrorInfo } from 'react';
import { BRAND_SKY } from '@/shared/brand/brandSky';
import { sceneReadiness } from './sceneReadiness';

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
    // No 3D scene is coming: the age gate need not wait for one, and the first screen shows its flat emblem.
    sceneReadiness.mark('home');
  }

  render(): ReactNode {
    // On failure the static nebula (rendered by StarfieldCanvas) stays as the backdrop.
    if (this.state.failed) return null;
    return this.props.children;
  }
}

// ─── Static stand-in while the Babylon.js bundle loads ───────────────────────
// The Babylon bundle is several MB, so on a real network the 3D scene starts seconds
// after the HUD appears. This is the steel-blue sky the age gate paints (BRAND_SKY: the same
// nebula image, already preloaded during the gate, turned steel blue and vignetted), which is also
// the sky the 3D scene paints at home, so nothing changes colour when the canvas fades in on top.
// Where there is no WebGL at all, it is the sky.

function NebulaBackdrop() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        ...BRAND_SKY,
      }}
      aria-hidden="true"
    />
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

interface StarfieldCanvasProps {
  readonly suspended: boolean;
}

export function StarfieldCanvas({ suspended }: StarfieldCanvasProps) {
  return (
    <>
      <NebulaBackdrop />
      <WebGLErrorBoundary>
        <Suspense fallback={null}>
          <StarfieldBackground suspended={suspended} />
        </Suspense>
      </WebGLErrorBoundary>
    </>
  );
}
