import { readdirSync, readFileSync } from 'node:fs';

/** Include the lazy editorial stylesheet as well as the eagerly loaded page shell. */
export const editorialCss = () => readdirSync(new URL('../../features/arena-page/', import.meta.url))
  .filter(file => file.endsWith('.css')).sort()
  .map(file => readFileSync(new URL(`../../features/arena-page/${file}`, import.meta.url), 'utf8')).join('\n');

/** Bleed can be reintroduced by any imported feature stylesheet, not only the shared page styles. */
export function sourceStyleSheets(directory = new URL('../../', import.meta.url), prefix = '') {
  return readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const file = `${prefix}${entry.name}`;
    if (entry.isDirectory()) return sourceStyleSheets(new URL(`${entry.name}/`, directory), `${file}/`);
    return entry.name.endsWith('.css') ? [{ file, css: readFileSync(new URL(entry.name, directory), 'utf8') }] : [];
  });
}

export function cssRules(css) {
  return [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map(([, selectors, declarations]) => ({ selectors: selectors.trim(), declarations }));
}

/** Commas inside :is(), :not(), etc. belong to one selector, not the next rule. */
export function selectorList(selectors) {
  let depth = 0, start = 0;
  const result = [];
  for (let i = 0; i < selectors.length; i++) {
    if ('(['.includes(selectors[i])) depth++;
    if (')]'.includes(selectors[i])) depth--;
    if (selectors[i] === ',' && depth === 0) {
      result.push(selectors.slice(start, i).trim());
      start = i + 1;
    }
  }
  result.push(selectors.slice(start).trim());
  return result;
}

/** Hero and chapters now share one backdrop, so no copy element needs its own bleed shade. */
export function bodyBleedShadeSelectors(css) {
  return cssRules(css).flatMap(({ selectors, declarations }) => {
    if (!/var\(\s*--page-copy-bleed\s*\)/.test(declarations)) return [];
    return selectorList(selectors);
  });
}

export const colourChannels = hex => hex.match(/[\da-f]{2}/gi).map(value => parseInt(value, 16));
export const luminance = channels => channels.map(value => {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
export const contrastRatio = (foreground, background) => {
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};
export const compositeShade = (pixel, alpha) => [5, 6, 9].map((channel, index) => channel * alpha + pixel[index] * (1 - alpha));

export const shadeAlpha = (css, name = 'body') => Number(css.match(new RegExp(`--page-${name}-shade\\s*:\\s*rgba\\(5,\\s*6,\\s*9,\\s*([\\d.]+)\\)`))?.[1]);

/** Model the mask's linear ramps from the source's explicit dimensions, not a magic coverage value. */
export function bodyBackdropCoverage(css, viewportWidth, x, y) {
  const horizontal = Number(css.match(/--page-body-feather-x\s*:\s*([\d.]+)%/)?.[1]) / 100;
  const vertical = Number(css.match(/--page-body-feather-top\s*:\s*([\d.]+)px/)?.[1]);
  const plane = cssRules(css).find(({ selectors, declarations }) => /\.partner__body::before\b/.test(selectors) && /\bbackground\s*:/.test(declarations))?.declarations ?? '';
  const outset = css.match(/--page-body-outset\s*:\s*max\(([\d.]+)vw,\s*calc\(([\d.]+)vw\s*-\s*var\(--partner-pad\)\)\)/);
  const padding = css.match(/--partner-pad\s*:\s*clamp\(([\d.]+)px,\s*([\d.]+)vw,\s*([\d.]+)px\)/);
  const insetMatches = /inset-inline\s*:\s*calc\(-1\s*\*\s*\(var\(--partner-pad\)\s*\+\s*var\(--page-body-outset\)\)\)/.test(plane);
  if (![horizontal, vertical].every(Number.isFinite) || !outset || !padding || !insetMatches) return NaN;
  const pad = Math.max(Number(padding[1]), Math.min(Number(padding[3]), viewportWidth * Number(padding[2]) / 100));
  const inlineBleed = Math.max(viewportWidth * Number(outset[1]) / 100, viewportWidth * Number(outset[2]) / 100 - pad);
  const width = viewportWidth + inlineBleed * 2;
  const left = -inlineBleed;
  const horizontalCoverage = Math.max(0, Math.min(1, (x - left) / (width * horizontal), (left + width - x) / (width * horizontal)));
  // inset-block-start is minus the vertical feather, so its plateau starts at body y=0.
  const verticalCoverage = Math.max(0, Math.min(1, (y + vertical) / vertical));
  return horizontalCoverage * verticalCoverage;
}
