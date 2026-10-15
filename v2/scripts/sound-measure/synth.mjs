import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../../package.json', import.meta.url));
const { build } = require('esbuild');
export const V2_ROOT = fileURLToPath(new URL('../../', import.meta.url));

// This entry imports the production synth. There is no second implementation of a cue.
const ENTRY = `
import { CUE_NOTES } from './src/shared/audio/key.ts';
import { playCue } from './src/shared/audio/cuePlayer.ts';
import { createAmbientBufferCache } from './src/shared/audio/ambientBuffer.ts';
import { createCueBufferCache } from './src/shared/audio/cueBuffer.ts';
export const notes = CUE_NOTES;
export const cueNames = Object.keys(CUE_NOTES);
export const renderSeconds = name => name === 'ambient' ? 8 : 1.2;
export async function prepareRender(ac, name) {
  if (!Object.hasOwn(CUE_NOTES, name)) throw new Error('Unknown cue: ' + name);
  const master = ac.createGain(); master.gain.value = 0.35; master.connect(ac.destination);
  const originalRandom = Math.random;
  let seed = 0x4d34;
  Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  try {
    if (name === 'ambient') {
      const source = ac.createBufferSource();
      source.buffer = await createAmbientBufferCache(callback => callback()).prepare(ac);
      source.loop = true; source.connect(master); source.start();
    } else {
      const buffer = await createCueBufferCache(callback => callback()).prepare(ac);
      playCue(ac, master, name, buffer);
    }
  } finally { Math.random = originalRandom; }
}
`;

/** Mutations modify the bundled real source in memory; working-tree files are never rewritten. */
export async function bundleSynth({ format = 'esm', mutateKey = false, mutateSquare = false } = {}) {
  const plugins = [{ name: 'sound-mutations', setup(builder) {
    builder.onLoad({ filter: /\/(?:key|cuePlayer)\.ts$/ }, async ({ path }) => {
      if (!(mutateKey && path.endsWith('/key.ts')) && !(mutateSquare && path.endsWith('/cuePlayer.ts'))) return;
      const { readFile } = await import('node:fs/promises');
      let contents = await readFile(path, 'utf8');
      const target = mutateKey && path.endsWith('/key.ts')
        ? 'transmission: cue([NOTES.D6, NOTES.F6, NOTES.G6])' : "osc.type = 'sine';";
      if (!contents.includes(target)) throw new Error('Sound mutation target not found');
      contents = contents.replace(target, path.endsWith('/key.ts')
        ? 'transmission: cue([{ ...NOTES.D6, hz: 1200 }, NOTES.F6, NOTES.G6])'
        : "osc.type = cue === 'click' ? 'square' : 'sine';");
      return { contents, loader: 'ts' };
    });
  } }];
  const result = await build({
    stdin: { contents: ENTRY, resolveDir: V2_ROOT, sourcefile: 'sound-measure-entry.ts', loader: 'ts' },
    bundle: true, format, ...(format === 'iife' ? { globalName: 'SoundHarness' } : {}),
    platform: 'browser', target: 'es2022', write: false, logLevel: 'silent', plugins,
  });
  return result.outputFiles[0].text;
}

export async function loadNodeSynth(options = {}) {
  const bundle = await bundleSynth(options);
  return import(`data:text/javascript;base64,${Buffer.from(bundle).toString('base64')}`);
}
