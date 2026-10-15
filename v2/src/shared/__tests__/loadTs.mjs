// Loads a TypeScript module from src/ together with the src/ modules it imports (relative paths and the
// '@/' alias), without a bundler: each file is transpiled with the repo's own TypeScript and imported as
// a data: URL whose specifiers point at the dependencies' data: URLs. Bare packages (react, babylon) are
// left to Node (react and its jsx runtime, babylon: resolved to file URLs here), or replaced through `stubs`
// ({ 'package-name': 'file:///...' }; a stub also stands in for a relative file such as a stylesheet).
// No import cycles.
// sourceModule.mjs does the same for one file at a time; this one follows the graph.
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(new URL('../../../package.json', import.meta.url));
const ts = require('typescript');
const SRC = fileURLToPath(new URL('../../', import.meta.url));
const CANDIDATES = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'];

function resolveSource(specifier, fromFile) {
  const base = specifier.startsWith('@/') ? resolve(SRC, specifier.slice(2)) : resolve(dirname(fromFile), specifier);
  for (const suffix of CANDIDATES) {
    const file = base + suffix;
    if (/\.(?:ts|tsx|json)$/.test(file) && existsSync(file)) return file;
  }
  throw new Error(`loadTs: cannot resolve ${specifier} from ${fromFile}`);
}

export function createLoader(stubs = {}) {
  const cache = new Map();
  const urlOf = (file) => {
    if (cache.has(file)) return cache.get(file);
    const input = readFileSync(file, 'utf8');
    const js = file.endsWith('.json') ? `export default ${JSON.stringify(JSON.parse(input))};` : ts.transpileModule(input, { compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX,
    } }).outputText;
    const linked = js.replace(/(from\s+|import\s*\(\s*|import\s+)(['"])([^'"]+)\2/g, (match, lead, quote, specifier) => {
      if (stubs[specifier]) return `${lead}${quote}${stubs[specifier]}${quote}`;
      if (!specifier.startsWith('.') && !specifier.startsWith('@/')) {
        if (specifier.startsWith('@babylonjs/') || /^react(?:\/jsx-runtime)?$/.test(specifier)) {
          return `${lead}${quote}${pathToFileURL(require.resolve(specifier)).href}${quote}`;
        }
        return match;
      }
      return `${lead}${quote}${urlOf(resolveSource(specifier, file))}${quote}`;
    });
    const url = `data:text/javascript;base64,${Buffer.from(linked).toString('base64')}`;
    cache.set(file, url);
    return url;
  }
  return {
    /** path: relative to src/, e.g. 'features/arena/framing.ts'. */
    load: (path) => import(urlOf(resolve(SRC, path))),
    urlOf: (path) => urlOf(resolve(SRC, path)),
  };
}
