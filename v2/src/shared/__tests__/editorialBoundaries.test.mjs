import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../../', import.meta.url));
const read = file => readFileSync(join(SRC, file), 'utf8');
let app = read('app/App.tsx');
const loaders = read('features/arena-page/pageBodyLoaders.ts');
if (process.env.MUTATE_EDITORIAL_EAGER === '1') app += "\nimport { AboutSection } from '@/features/about/AboutSection';";

test('all eight page bodies stay behind their existing dynamic import boundaries', () => {
  const bodies = ['games/GamesPage', 'about/AboutSection', 'team/TeamSection', 'journey/JourneySection',
    'live-feed/LiveActivityFeed', 'careers/CareersSection', 'contact/ContactSection', 'partner/PartnerArea'];
  for (const body of bodies) {
    assert.equal(app.includes(`from '@/features/${body}'`), false, `${body} cannot become an eager App import`);
    assert.equal(loaders.includes(`import('@/features/${body}')`), true, `${body} retains its lazy loader`);
  }
});

const editorialFiles = readdirSync(join(SRC, 'features/arena-page')).filter(name => /editorial/i.test(name) && /\.(?:ts|tsx)$/.test(name))
  .map(name => ({ name, text: read(`features/arena-page/${name}`) }));
if (process.env.MUTATE_EDITORIAL_SCROLL === '1') editorialFiles.push({ name: 'mutation.ts', text: "scrollRoot.addEventListener('scroll', onScroll);" });
if (process.env.MUTATE_EDITORIAL_WEBGL === '1') editorialFiles.push({ name: 'mutation.ts', text: "import { Engine } from '@babylonjs/core/Engines/engine';" });

test('editorial motion adds no scroll-event work and no new rendering context', () => {
  assert.ok(editorialFiles.length > 0, 'shared editorial implementation exists');
  for (const { name, text } of editorialFiles) {
    assert.equal(/addEventListener\s*\(\s*['"]scroll['"]|onScroll\s*[=:]/.test(text), false, `no scroll listener in ${name}`);
    assert.equal(/@babylonjs|new\s+(?:Engine|WebGLRenderingContext)|getContext\s*\(/.test(text), false, `no extra WebGL in ${name}`);
  }
});

test('every page adopts the shared editorial chapter primitives', () => {
  const pages = ['about/AboutSection.tsx', 'team/TeamSection.tsx', 'journey/JourneySection.tsx',
    'careers/CareersSection.tsx', 'contact/ContactSection.tsx', 'games/GamesPage.tsx', 'live-feed/LiveActivityFeed.tsx',
    'partner/PortalSections.tsx'];
  for (const page of pages) {
    let text = read(`features/${page}`);
    if (process.env.MUTATE_EDITORIAL_CHAPTER === '1' && page.startsWith('about/')) text = text.replace(/^import[^\n]*editorial[^\n]*\n/gim, '');
    assert.equal(/from\s+['"][^'"]*editorial[^'"]*['"]/i.test(text), true, `${page} uses the shared editorial module`);
  }
});
