// Run with npm run test:unit. The top bar (Phase 4 M1) replaced the seven orbiting dots: each section button asks
// App for its panel exactly once and makes no sound of its own (the transition's arrival cue is the single sound
// for a navigation); Client Area and the phone's menu call App's handlers; a covered bar is hidden and inert.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader } from '../../../shared/__tests__/loadTs.mjs';

const icon = 'export const ExternalLink = () => null, Menu = ExternalLink, Gamepad2 = ExternalLink, Info = ExternalLink, Users = ExternalLink, Map = ExternalLink, Radio = ExternalLink, Briefcase = ExternalLink, Mail = ExternalLink;';
const data = text => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
const { load } = createLoader({
  'lucide-react': data(icon),
  '@/shared/ui/SoundToggle': data('export const SoundToggle = () => null;'),
  '@/shared/utils/soundEngine': data("export const soundEngine = { hover: () => globalThis.__sounds.push('hover'), click: () => globalThis.__sounds.push('click') };"),
  './topBar.css': data(''),
});
const { TopBar } = await load('features/arena/TopBar.tsx');
const { NAV_ITEMS } = await load('features/arena/navItems.ts');

const walk = (node, predicate, found = []) => {
  if (!node || typeof node !== 'object') return found;
  if (Array.isArray(node)) { node.forEach(child => walk(child, predicate, found)); return found; }
  if (predicate(node)) found.push(node);
  walk(node.props?.children, predicate, found);
  return found;
};
const textOf = node => (node === null || node === undefined || typeof node === 'boolean' ? ''
  : typeof node === 'string' || typeof node === 'number' ? String(node)
    : Array.isArray(node) ? node.map(textOf).join('') : textOf(node.props?.children));

function render(patch = {}) {
  globalThis.__sounds = [];
  const calls = { activate: [], client: 0, menu: 0 };
  const props = {
    isConnected: true, isMobile: false, target: 'none', covered: false, menuVisible: true,
    onActivate: id => calls.activate.push(id), onClientArea: () => { calls.client += 1; }, onMenu: () => { calls.menu += 1; },
    ...patch,
  };
  return { tree: TopBar(props), calls };
}
const buttons = tree => walk(tree, node => node.type === 'button');

test('the seven section buttons are the seven sections, in order, each asking for its own panel once and making no click sound', () => {
  const { tree, calls } = render();
  const items = buttons(tree).filter(button => String(button.props.className).includes('topbar__item'));
  assert.deepEqual(items.map(textOf), NAV_ITEMS.map(item => item.short));
  assert.deepEqual(NAV_ITEMS.map(item => item.panelId), ['games', 'about', 'team', 'journey', 'live', 'careers', 'contact']);
  items.forEach(button => button.props.onClick({}));
  assert.deepEqual(calls.activate, NAV_ITEMS.map(item => item.panelId), 'one request per press, in order');
  assert.deepEqual(globalThis.__sounds, [], 'the arrival cue is the single sound for this navigation');
});

test('a hover plays the soft tick and nothing else', () => {
  const { tree, calls } = render();
  const items = buttons(tree).filter(button => String(button.props.className).includes('topbar__item'));
  items[0].props.onMouseEnter();
  assert.deepEqual(globalThis.__sounds, ['hover']);
  assert.deepEqual(calls.activate, []);
});

test('the open section is pressed; the live item carries the connection as a dot and in its name', () => {
  const open = render({ target: 'team' }).tree;
  const pressed = buttons(open).filter(button => button.props['aria-pressed'] === true).map(textOf);
  assert.deepEqual(pressed, ['Team']);
  for (const [isConnected, word] of [[true, 'connected'], [false, 'offline']]) {
    const live = buttons(render({ isConnected }).tree).find(button => textOf(button).includes('Live'));
    assert.equal(live.props['aria-label'], `Live feed, ${word}`);
    const dot = walk(live, node => node.type === 'i')[0];
    assert.equal(dot.props['data-live'], isConnected);
  }
});

test('desktop has Client Area and no menu; a phone has the menu and no section row or Client Area', () => {
  const desktop = render();
  assert.equal(walk(desktop.tree, node => node.type === 'nav').length, 1);
  const client = buttons(desktop.tree).find(button => String(button.props.className).includes('topbar__client'));
  client.props.onClick(); client.props.onMouseEnter();
  assert.equal(desktop.calls.client, 1);
  assert.deepEqual(globalThis.__sounds, ['hover']);
  assert.equal(buttons(desktop.tree).some(button => button.props['aria-label'] === 'Open menu'), false);

  const phone = render({ isMobile: true });
  assert.equal(walk(phone.tree, node => node.type === 'nav').length, 0, 'the phone row is the drawer');
  assert.equal(buttons(phone.tree).some(button => String(button.props.className).includes('topbar__client')), false);
  const menu = buttons(phone.tree).find(button => button.props['aria-label'] === 'Open menu');
  menu.props.onClick({});
  assert.equal(phone.calls.menu, 1);
  assert.equal(menu.props.style.visibility, 'visible');
  assert.equal(menu.props.tabIndex, 0);
});

test('while a panel flies in or out the phone menu is hidden and out of the tab order, so focus can return to it', () => {
  const menu = buttons(render({ isMobile: true, menuVisible: false }).tree).find(button => button.props['aria-label'] === 'Open menu');
  assert.equal(menu.props.style.visibility, 'hidden');
  assert.equal(menu.props.tabIndex, -1);
  assert.equal(menu.props['aria-hidden'], true);
});

test('covered: hidden and inert, but still mounted (so its arrival never replays)', () => {
  const shown = render().tree, hidden = render({ covered: true }).tree;
  assert.equal(shown.type, 'header');
  assert.equal(shown.props.inert, false);
  assert.equal(shown.props['data-covered'], undefined);
  assert.equal(hidden.props.inert, true);
  assert.equal(hidden.props['data-covered'], '');
});
