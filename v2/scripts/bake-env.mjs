// Bakes the studio environment: public/arena/studio.env, the prefiltered cube Babylon's PBR steel reflects.
//   node scripts/bake-env.mjs          writes public/arena/studio.env and public/arena/studio.env.json
//   node scripts/bake-env.mjs --check  exits 1 when the recipe or the baked file no longer match
// Babylon's .env encoder needs a GPU, so this step runs in a real Chromium through Playwright (not a
// dependency of the app: give it with NODE_PATH, e.g. a global install, or PLAYWRIGHT_DIR). The recipe is
// scripts/arena/env.mjs; studio.env.json records its hash and the cube size, which the unit tests check.
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { studioHdr } from './arena/env.mjs';

export const ENV_CUBE_SIZE = 128;
export const ENV_FILE = 'public/arena/studio.env';
export const ENV_RECORD = 'public/arena/studio.env.json';

const sha256 = (data) => createHash('sha256').update(data).digest('hex');

/** What the recipe is: the hash of its source and of the .hdr it makes. Test-stable, unlike zlib bytes. */
export function envRecipe(root = new URL('../', import.meta.url)) {
  const sources = ['scripts/arena/env.mjs', 'scripts/arena/env-page.mjs'].map((file) => readFileSync(new URL(file, root), 'utf8'));
  return { recipe: sha256(sources.join('\n---\n')), cube: ENV_CUBE_SIZE, hdr: sha256(studioHdr()) };
}

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  const dirs = [process.env.PLAYWRIGHT_DIR, ...(process.env.NODE_PATH ?? '').split(':')].filter(Boolean);
  for (const dir of [undefined, ...dirs]) {
    try { return require(dir ? require.resolve('playwright', { paths: [dir] }) : 'playwright'); } catch { /* try the next place */ }
  }
  throw new Error('Playwright not found: set NODE_PATH or PLAYWRIGHT_DIR to a node_modules that has it');
}

async function bakeInBrowser(root) {
  const page = await build({
    entryPoints: [fileURLToPath(new URL('scripts/arena/env-page.mjs', root))], bundle: true, write: false, format: 'iife',
    platform: 'browser', absWorkingDir: fileURLToPath(root), logLevel: 'error',
  });
  const hdr = studioHdr();
  const html = '<!doctype html><meta charset="utf-8"><body><script src="/page.js"></script>';
  const server = createServer((request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    const files = { '/': ['text/html', html], '/page.js': ['text/javascript', page.outputFiles[0].text], '/studio.hdr': ['application/octet-stream', hdr] };
    const entry = files[path];
    if (!entry) { response.writeHead(404).end(); return; }
    response.writeHead(200, { 'Content-Type': entry[0] }).end(entry[1]);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu'] });
  try {
    const tab = await browser.newPage();
    await tab.goto(`http://127.0.0.1:${server.address().port}/?size=${ENV_CUBE_SIZE}`);
    await tab.waitForFunction(() => window.__env || window.__envError, null, { timeout: 90000 });
    const error = await tab.evaluate(() => window.__envError);
    if (error) throw new Error(error);
    return await tab.evaluate(() => window.__env);
  } finally {
    await browser.close();
    server.close();
  }
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) {
  const root = new URL('../', import.meta.url);
  const recipe = envRecipe(root);
  if (process.argv.includes('--check')) {
    let record = null;
    try { record = JSON.parse(readFileSync(new URL(ENV_RECORD, root), 'utf8')); readFileSync(new URL(ENV_FILE, root)); } catch { /* missing */ }
    const stale = !record || record.recipe !== recipe.recipe || record.cube !== recipe.cube || record.hdr !== recipe.hdr;
    if (stale) console.error(`stale: ${ENV_FILE} (run: node scripts/bake-env.mjs)`);
    process.exit(stale ? 1 : 0);
  }
  const result = await bakeInBrowser(root);
  mkdirSync(new URL('public/arena/', root), { recursive: true });
  const bytes = Buffer.from(result.base64, 'base64');
  writeFileSync(new URL(ENV_FILE, root), bytes);
  writeFileSync(new URL(ENV_RECORD, root), `${JSON.stringify({ ...recipe, babylon: result.babylon, bytes: bytes.length }, null, 2)}\n`);
  console.log(`studio.env ${bytes.length} bytes, cube ${ENV_CUBE_SIZE}, Babylon ${result.babylon}`);
}
