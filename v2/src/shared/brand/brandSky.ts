import type { CSSProperties } from 'react';

/**
 * Deep space behind the age gate and the warp intro: the site's nebula turned steel blue (a
 * colour blend keeps its light and takes the hue of #1C2C43) and pressed into the void, with a
 * vignette. Both screens share it, so the gate dissolves into the warp without a black frame.
 * nebula.webp is the image preloadScene already warms on the gate. Static: painted once.
 */
export const BRAND_SKY: CSSProperties = {
  backgroundColor: '#050609',
  backgroundImage: [
    'radial-gradient(ellipse 72% 64% at 50% 36%, rgba(5, 6, 9, 0) 0%, rgba(5, 6, 9, 0.5) 58%, rgba(5, 6, 9, 0.94) 100%)',
    'linear-gradient(rgba(5, 6, 9, 0.38), rgba(5, 6, 9, 0.38))',
    'linear-gradient(#1c2c43, #1c2c43)',
    'url(/nebula.webp)',
  ].join(', '),
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  backgroundBlendMode: 'normal, normal, color, normal',
};
