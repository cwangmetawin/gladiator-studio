import test from 'node:test';
import assert from 'node:assert/strict';
import { moduleUrl, source } from './sourceModule.mjs';

test('a real mobile Hero CTA requests its panel once without the Button / Hero double click', async () => {
  const hooks = moduleUrl(`
    export const useEffect = () => {}, useRef = current => ({ current }), useState = value => [value, () => {}];
  `);
  const sound = moduleUrl(`export const clicks = []; export const soundEngine = { click: () => clicks.push('click'), hover() {} };`);
  const button = moduleUrl(source('../ui/Button.tsx').replace("from '@/shared/utils/soundEngine'", `from '${sound}'`));
  const stubs = moduleUrl(`
    export { Button } from '${button}';
    export const motion = { section: 'section', div: 'div', span: 'span' };
    export const Eyebrow = () => null, Divider = Eyebrow, BigWinFlash = Eyebrow;
    export const Gamepad2 = Eyebrow, Info = Eyebrow, Users = Eyebrow, Map = Eyebrow, Radio = Eyebrow, Briefcase = Eyebrow, Mail = Eyebrow;
    export const useIsMobile = () => true, useSection = () => ({}), useStudioStats = () => ({ games: 1 });
    export const withCatalogueCounts = text => text, motionTokens = { feedbackMs: 80 };
  `);
  let src = source('../../features/hero/Hero.tsx').replace("import './hero.css';", '')
    .replaceAll("from 'react'", `from '${hooks}'`).replace("from '@/shared/utils/soundEngine'", `from '${sound}'`);
  for (const name of ['framer-motion', 'lucide-react', '@/shared/ui', '@/shared/hooks/useIsMobile',
    '@/shared/content/SiteContentContext', '@/shared/content/StudioStats', '@/shared/utils/catalogueText',
    './BigWinFlash', '@/shared/motion/tokens']) src = src.replace(`from '${name}'`, `from '${stubs}'`);
  const { Hero } = await import(moduleUrl(src));
  const { Button } = await import(button);
  const { clicks } = await import(sound);
  const previousWindow = globalThis.window, previousEvent = globalThis.CustomEvent;
  const requests = [];
  globalThis.window = { dispatchEvent: event => requests.push(event), matchMedia: () => ({ matches: false }) };
  globalThis.CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options.detail; } };
  const walk = (element, predicate) => {
    if (!element || typeof element !== 'object') return null;
    if (predicate(element)) return element;
    for (const child of [element.props?.children].flat(Infinity)) {
      const found = walk(child, predicate); if (found) return found;
    }
    return null;
  };
  try {
    const tree = Hero({ panelSide: 'left', active: true, target: 'none' });
    const cta = walk(tree, element => element.type === Button && element.props.children === 'Explore Games');
    assert.ok(cta);
    const nativeButton = Button(cta.props);
    nativeButton.props.onClick({});
    assert.equal(requests.length, 1);
    assert.equal(requests[0].type, 'open-panel'); assert.equal(requests[0].detail, 'games');
    assert.deepEqual(clicks, [], 'the arrival cue is the single sound for this navigation');
    const regularButton = Button({ children: 'Ordinary action' });
    regularButton.props.onClick({}); assert.equal(clicks.length, 1, 'ordinary buttons still keep their one generic cue');
  } finally {
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
    if (previousEvent === undefined) delete globalThis.CustomEvent; else globalThis.CustomEvent = previousEvent;
  }
});
