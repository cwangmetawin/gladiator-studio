import type { CSSProperties } from 'react';

// Deep space behind the age gate and the first screen: the site's nebula turned steel blue (a colour blend
// keeps its light and takes the hue of SKY_TINT) and pressed into the void, with a vignette. The gate paints
// it in CSS (BRAND_SKY); the 3D scene paints the same recipe from these constants (features/arena/steelSky),
// so the gate dissolves into the first screen without the sky changing colour. nebula.webp is the image
// preloadScene already warms on the gate. Static: painted once.

export const SKY_VOID = '#050609';
/** The colour blend: the nebula keeps its lightness and takes this hue and saturation. */
export const SKY_TINT = '#1c2c43';
/** How much of the void colour is pressed over the whole sky (the 3D scene's nebula layer is multiplied by about 1 - this). */
export const SKY_DARKEN = 0.38;
/** An elliptical vignette: radii and centre as fractions of the viewport, and the void's opacity at each stop. */
export const SKY_VIGNETTE = {
  cx: 0.5, cy: 0.36, rx: 0.72, ry: 0.64,
  stops: [[0, 0], [0.58, 0.5], [1, 0.94]],
} as const;

const VOID_RGB = '5, 6, 9';

const pct = (fraction: number): string => `${Math.round(fraction * 1000) / 10}%`;

const vignetteGradient = (): string => {
  const { cx, cy, rx, ry, stops } = SKY_VIGNETTE;
  const colours = stops.map(([at, alpha]) => `rgba(${VOID_RGB}, ${alpha}) ${pct(at)}`).join(', ');
  return `radial-gradient(ellipse ${pct(rx)} ${pct(ry)} at ${pct(cx)} ${pct(cy)}, ${colours})`;
};

export const BRAND_SKY: CSSProperties = {
  backgroundColor: SKY_VOID,
  backgroundImage: [
    vignetteGradient(),
    `linear-gradient(rgba(${VOID_RGB}, ${SKY_DARKEN}), rgba(${VOID_RGB}, ${SKY_DARKEN}))`,
    `linear-gradient(${SKY_TINT}, ${SKY_TINT})`,
    'url(/nebula.webp)',
  ].join(', '),
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  backgroundBlendMode: 'normal, normal, color, normal',
};

/** The void colour as an rgba() string, for the 3D scene's 2D-canvas vignette. */
export const skyVoid = (alpha: number): string => `rgba(${VOID_RGB}, ${alpha})`;
