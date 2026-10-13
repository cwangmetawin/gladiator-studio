import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(new URL('../../../package.json', import.meta.url));
const ts = require('typescript');
export const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
export const moduleUrl = src => {
  const js = ts.transpileModule(src, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText.replace(/from ['"](react(?:\/jsx-runtime)?|framer-motion|lucide-react|@babylonjs\/core\/[^'"]+)['"]/g,
    (_match, name) => `from '${pathToFileURL(require.resolve(name)).href}'`)
    .replace(/import ['"](@babylonjs\/core\/[^'"]+)['"]/g,
      (_match, name) => `import '${pathToFileURL(require.resolve(name)).href}'`)
    .replace(/import\(['"](@babylonjs\/core\/[^'"]+)['"]\)/g,
      (_match, name) => `import('${pathToFileURL(require.resolve(name)).href}')`);
  return `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
};
