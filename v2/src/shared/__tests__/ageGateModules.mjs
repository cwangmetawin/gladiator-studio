import { moduleUrl, source } from './sourceModule.mjs';
import { harnessHooksUrl } from './hookHarness.mjs';

/**
 * Compile the shipped age gate (AgeGate.tsx, ageGateState.ts, brandSky.ts) with its imports wired.
 *   harness: true  React's hooks go to hookHarness (no DOM), the emblem is a stub (its props are read from the element tree).
 *   harness: false real React for react-dom/server markup, with the real GateEmblem.
 * `transform(path, text)` lets a mutation test change a source before it is compiled.
 */
export async function loadAgeGate({ harness = false, transform = (_path, text) => text } = {}) {
  const read = path => transform(path, source(path));
  const hooks = harness ? harnessHooksUrl(moduleUrl) : null;
  const withHooks = text => (hooks ? text.replaceAll("from 'react'", `from '${hooks}'`) : text);

  const stateUrl = moduleUrl(withHooks(read('../components/ageGateState.ts')));
  const skyUrl = moduleUrl(read('../brand/brandSky.ts'));
  const dialogFocusUrl = moduleUrl(harness
    ? 'export const useDialogFocus = options => { (globalThis.__dialogFocusCalls ??= []).push(options); return { current: null }; };'
    : "import { useRef } from 'react'; export const useDialogFocus = () => useRef(null);");
  const motionUrl = moduleUrl('export const useMotionPreference = () => globalThis.__reducedMotion === true;');

  let emblemUrl;
  if (harness) {
    emblemUrl = moduleUrl('export function GateEmblem() { return null; }');
  } else {
    const pathsUrl = moduleUrl(read('../brand/emblemPaths.ts'));
    const arcsUrl = moduleUrl(read('../brand/emblemArcs.ts').replace("from './emblemPaths'", `from '${pathsUrl}'`));
    const anchorUrl = moduleUrl(read('../brand/emblemAnchor.ts').replace("from './emblemPaths'", `from '${pathsUrl}'`));
    emblemUrl = moduleUrl(read('../components/GateEmblem.tsx')
      .replace("from '@/shared/brand/emblemPaths'", `from '${pathsUrl}'`)
      .replace("from '@/shared/brand/emblemArcs'", `from '${arcsUrl}'`)
      .replace("from '@/shared/brand/emblemAnchor'", `from '${anchorUrl}'`));
  }

  const gateUrl = moduleUrl(withHooks(read('../components/AgeGate.tsx'))
    .replace("import './ageGate.css';\n", '')
    .replace("from '../hooks/useDialogFocus'", `from '${dialogFocusUrl}'`)
    .replace("from '../motion/useMotionPreference'", `from '${motionUrl}'`)
    .replace("from '../brand/brandSky'", `from '${skyUrl}'`)
    .replace("from './ageGateState'", `from '${stateUrl}'`)
    .replace("from './GateEmblem'", `from '${emblemUrl}'`));

  return { ...(await import(gateUrl)), state: await import(stateUrl) };
}

/** The curated catalogue the site ships (what a visitor must not see before the gate answers). */
export async function loadCuratedCatalogue() {
  const rtpUrl = moduleUrl(source('../utils/gameRtp.ts'));
  const catalogueSource = source('../../api/gameData.ts')
    .replace("from '@/shared/utils/gameRtp'", `from '${rtpUrl}'`)
    .replace("import { GameDataResponseSchema } from './schemas';", 'const GameDataResponseSchema = { parse: (value) => value };')
    .replace("import { fetchCatalogueFromDb } from './catalogueDb';", 'const fetchCatalogueFromDb = async () => null;');
  const { GLADIATOR_SLOTS, METAWIN_ORIGINALS } = await import(moduleUrl(catalogueSource));
  return [...GLADIATOR_SLOTS, ...METAWIN_ORIGINALS];
}
