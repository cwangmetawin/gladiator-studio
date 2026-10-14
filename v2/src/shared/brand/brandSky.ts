import type { CSSProperties } from 'react';

/**
 * Deep space behind the age gate and the warp intro: the site's nebula turned steel blue (a
 * colour blend keeps its light and takes the hue of #1C2C43) and pressed into the void, with a
 * vignette. Both screens share it, so the gate dissolves into the warp without a black frame.
 * nebula.webp is the image preloadScene already warms on the gate. Static: painted once.
 */
export const BRAND_SKY: CSSProperties = {
  backgroundColor: '#050609',
  // nebula-steel.webp is nebula.webp with the colour blend (#1C2C43) and the 38 % void overlay
  // baked in, so the first frame paints one image and a gradient instead of a full-screen blend.
  backgroundImage: [
    'radial-gradient(ellipse 72% 64% at 50% 36%, rgba(5, 6, 9, 0) 0%, rgba(5, 6, 9, 0.5) 58%, rgba(5, 6, 9, 0.94) 100%)',
    'url(/nebula-steel.webp)',
  ].join(', '),
  backgroundSize: 'cover',
  backgroundPosition: 'center',
};
