// Run with npm run test:unit. Phase 4 M0/M1: the age gate is the site's first frame, a brand opening, and it
// hands over to the 3D emblem's first screen only once that has drawn.
// No browser: the shipped TSX is server-rendered for its markup and run on a tiny hook harness
// (hookHarness.mjs) with a fake clock for its exit.
// MUTATE_GATE_GAME_NAME=1 puts a catalogue title into the gate's copy (red).
// MUTATE_GATE_REDUCED_EXIT=1 makes reduced motion run the exit animation too (red).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { source } from './sourceModule.mjs';
import { loadAgeGate, loadCuratedCatalogue } from './ageGateModules.mjs';
import { createClock, createHarness, findAll, textOf } from './hookHarness.mjs';

const require = createRequire(new URL('../../../package.json', import.meta.url));
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const curated = await loadCuratedCatalogue();
const titles = curated.map(game => game.title);

const mutate = (path, text) => {
  if (process.env.MUTATE_GATE_GAME_NAME === '1' && path.endsWith('AgeGate.tsx')) {
    const target = 'meet the minimum age in your jurisdiction.';
    assert.ok(text.includes(target), 'game-name mutation target not found');
    return text.replace(target, `${target} Now playing: ${titles[0]}.`);
  }
  if (process.env.MUTATE_GATE_REDUCED_EXIT === '1' && path.endsWith('AgeGate.tsx')) {
    const target = 'if (!reducedMotion) setEntering(true);';
    assert.ok(text.includes(target), 'reduced-exit mutation target not found');
    return text.replace(target, 'setEntering(true);');
  }
  return text;
};
const server = await loadAgeGate({ transform: mutate });
const gate = await loadAgeGate({ harness: true, transform: mutate });
const { GATE_IGNITE_MS, GATE_FADE_MS, HOME_SAFETY_MS, gatePhase, gateIsDialog, gateIsExiting, gateStepDelay } = gate.state;

const noop = () => {};
const baseProps = { verified: false, rejected: false, onVerify: noop, onReject: noop, onExited: noop };
const markupOf = (props = {}) => {
  globalThis.__reducedMotion = false;
  return renderToStaticMarkup(React.createElement(server.AgeGate, { ...baseProps, ...props }));
};
const textOfMarkup = markup => markup.replace(/<[^>]*>/g, ' ').replace(/&#x27;|&quot;|&amp;/g, ' ').replace(/\s+/g, ' ').trim();
const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const textById = (markup, id) => {
  const match = new RegExp(`id="${escapeRegExp(id)}"[^>]*>([\\s\\S]*?)</(?:h1|h2|p)>`).exec(markup);
  assert.ok(match, `no element with id ${id}`);
  return textOfMarkup(match[1]);
};
const attribute = (markup, name) => new RegExp(`${name}="([^"]+)"`).exec(markup)?.[1];

// ── What the gate shows ────────────────────────────────────────────────────────

test('before the gate answers there is only the brand: no game, game image, amount or win', () => {
  assert.ok(titles.length >= 10, 'the curated catalogue is loaded');
  for (const props of [{}, { rejected: true }]) {
    const markup = markupOf(props);
    const text = textOfMarkup(markup).toLowerCase();
    for (const title of titles) assert.ok(!text.includes(title.toLowerCase()), `the gate names the game "${title}"`);
    assert.doesNotMatch(markup, /<img\b/i, 'no image element');
    assert.doesNotMatch(markup, /cdn|\.jpe?g|\.png|\.gif/i, 'no game image URL');
    assert.doesNotMatch(text, /[$€£]\s?\d|\b(rtp|jackpot|wins?|winners?|wagered|payouts?)\b/i, 'no amount or win');
  }
});

test('the question keeps its meaning: 18+ notice, two answers, the responsible-gambling line and link', () => {
  const markup = markupOf();
  const text = textOfMarkup(markup);
  assert.match(text, /This site features gambling-related content for users aged 18 and over\. By entering, you confirm you meet the minimum age in your jurisdiction\./);
  assert.deepEqual([...markup.matchAll(/<button\b[^>]*>([^<]*)<\/button>/g)].map(match => match[1]), ['I am 18 or older', 'Under 18']);
  assert.match(text, /Gambling can be addictive\. Play responsibly\./);
  assert.match(markup, /<a href="https:\/\/www\.begambleaware\.org" target="_blank" rel="noopener noreferrer">BeGambleAware\.org<\/a>/);
  assert.match(textById(markup, attribute(markup, 'aria-labelledby')), /^Age verification/);
});

test('the gate is a labelled, described modal dialog whose decoration is hidden from assistive tech', () => {
  const markup = markupOf();
  assert.match(markup, /role="dialog"/);
  assert.match(markup, /aria-modal="true"/);
  assert.match(markup, /tabindex="-1"/);
  assert.equal(textById(markup, attribute(markup, 'aria-labelledby')), 'Age verification · 18+');
  assert.match(textById(markup, attribute(markup, 'aria-describedby')), /^This site features gambling-related content/);
  assert.equal(markup.match(/<h1\b/g)?.length, 1, 'one h1');
  assert.match(markup, /<h1[^>]*>.*Built for.*the arena.*<\/h1>/);
  for (const marker of ['gate__sky', 'gate__flash', 'data-emblem-anchor']) {
    const element = new RegExp(`<div[^>]*${marker}[^>]*>`).exec(markup)?.[0];
    assert.ok(element, `${marker} is rendered`);
    assert.match(element, /aria-hidden="true"/, `${marker} is hidden from assistive tech`);
  }
});

test('Under 18 leads to the refusal page: its own heading, no buttons, the help link kept', () => {
  const markup = markupOf({ rejected: true });
  const text = textOfMarkup(markup);
  assert.doesNotMatch(markup, /<button\b/);
  assert.match(markup, /<h1[^>]*>.*Access.*denied.*<\/h1>/);
  assert.match(text, /You must be 18 or older to access this website\. Please close this tab\./);
  assert.match(markup, /href="https:\/\/www\.begambleaware\.org"/);
  assert.match(textById(markup, attribute(markup, 'aria-labelledby')), /^Access denied$/);
  assert.match(markup, /data-gate-phase="denied"/);
});

// ── The phases ─────────────────────────────────────────────────────────────────

test('phases: ask / denied until the answer, then igniting → lit → fading, or gone without motion', () => {
  const state = (patch = {}) => ({ verified: false, rejected: false, entering: false, ignited: false, ready: false, ...patch });
  assert.equal(gatePhase(state()), 'ask');
  assert.equal(gatePhase(state({ rejected: true })), 'denied');
  assert.equal(gatePhase(state({ entering: true })), 'igniting');
  assert.equal(gatePhase(state({ entering: true, verified: true, ready: true })), 'igniting', 'the ignition always runs its course');
  assert.equal(gatePhase(state({ entering: true, ignited: true })), 'lit', 'lit frame held until the site is there');
  assert.equal(gatePhase(state({ entering: true, ignited: true, verified: true })), 'lit', 'the site is mounted but the first screen has not drawn: still held');
  assert.equal(gatePhase(state({ entering: true, ignited: true, ready: true })), 'lit', 'the first screen is ready but the site has not committed: still held');
  assert.equal(gatePhase(state({ entering: true, ignited: true, verified: true, ready: true })), 'fading');
  assert.equal(gatePhase(state({ verified: true })), 'gone', 'no ignition (reduced motion): the gate goes at once');
  assert.deepEqual(['ask', 'denied', 'igniting', 'lit', 'fading', 'gone'].map(gateIsDialog), [true, true, false, false, false, false]);
  assert.deepEqual(['ask', 'denied', 'igniting', 'lit', 'fading', 'gone'].map(gateIsExiting), [false, false, true, true, true, false]);
  assert.deepEqual(['ask', 'denied', 'igniting', 'lit', 'fading', 'gone'].map(gateStepDelay), [null, null, GATE_IGNITE_MS, null, GATE_FADE_MS, 0]);
});

test('the ignition takes 0.6-0.9 s and the fade into the first screen under 0.6 s', () => {
  assert.ok(GATE_IGNITE_MS >= 600 && GATE_IGNITE_MS <= 900, `ignition ${GATE_IGNITE_MS} ms`);
  assert.ok(GATE_FADE_MS >= 250 && GATE_FADE_MS <= 600, `fade ${GATE_FADE_MS} ms`);
  const css = source('../components/ageGate.css');
  assert.ok(css.includes('var(--gate-ignite)') && css.includes('var(--gate-fade)'), 'the CSS runs on the same two durations');
  assert.match(source('../components/AgeGate.tsx'), /'--gate-ignite': `\$\{GATE_IGNITE_MS\}ms`, '--gate-fade': `\$\{GATE_FADE_MS\}ms`/);
});

// ── What the buttons do ────────────────────────────────────────────────────────

let clock = createClock();

function mountGate({ reduced = false, ...patch } = {}) {
  clock = createClock(); // every test starts with no timers
  gate.readiness.sceneReadiness.resetScene(); // ... no 3D scene ready, and no release
  gate.reveal.homeReveal.reset();
  globalThis.window = { setTimeout: (...args) => clock.setTimeout(...args), clearTimeout: (...args) => clock.clearTimeout(...args) };
  globalThis.__reducedMotion = reduced;
  globalThis.__dialogFocusCalls = [];
  const calls = { verify: 0, reject: 0, exited: 0 };
  let props = { ...baseProps, ...patch, onVerify: () => { calls.verify += 1; }, onReject: () => { calls.reject += 1; }, onExited: () => { calls.exited += 1; } };
  const harness = createHarness(gate.AgeGate);
  harness.mount(props);
  const press = text => harness.act(() => findAll(harness.output, el => el.type === 'button' && textOf(el) === text)[0].props.onClick());
  const update = next => { props = { ...props, ...next }; harness.update(props); };
  const advance = ms => harness.act(() => clock.advance(ms));
  const sceneDraws = () => harness.act(() => gate.readiness.sceneReadiness.mark('home'));
  const phase = () => harness.output?.props['data-gate-phase'] ?? null;
  const emblemMode = () => findAll(harness.output, el => el.type?.name === 'GateEmblem')[0]?.props.mode;
  const dialogActive = () => globalThis.__dialogFocusCalls.at(-1)?.active;
  return { harness, calls, press, update, advance, sceneDraws, phase, emblemMode, dialogActive };
}

test('"I am 18 or older" verifies, ignites at once, holds the lit frame until the 3D emblem has drawn, releases the home as it fades, then unmounts', () => {
  const view = mountGate();
  assert.deepEqual([view.phase(), view.emblemMode(), view.dialogActive()], ['ask', 'idle', true]);
  view.press('I am 18 or older');
  assert.equal(view.calls.verify, 1, 'the verify path runs on the click');
  assert.deepEqual([view.phase(), view.emblemMode(), view.dialogActive()], ['igniting', 'ignite', false]);
  assert.equal(view.harness.output.props.inert, true, 'an inert overlay while it leaves');
  assert.equal(view.harness.output.props['aria-hidden'], true);
  assert.deepEqual(clock.pending.sort((a, b) => a - b), [GATE_IGNITE_MS, HOME_SAFETY_MS], 'the ignition step and the safety hold');
  view.advance(GATE_IGNITE_MS - 1);
  assert.equal(view.phase(), 'igniting');
  view.advance(1);
  assert.equal(view.phase(), 'lit', 'the site has not committed yet: the lit frame holds');
  view.update({ verified: true });
  assert.equal(view.phase(), 'lit', 'the site is mounted, but the 3D emblem has not drawn: the lit frame still holds');
  assert.equal(gate.reveal.homeReveal.getSnapshot(), null, 'the home is not released while the gate holds');
  view.advance(1500);
  assert.deepEqual([view.phase(), view.calls.exited], ['lit', 0], 'the gate stays mounted for as long as the 3D emblem is missing');
  view.sceneDraws();
  assert.equal(view.phase(), 'fading');
  assert.notEqual(gate.reveal.homeReveal.getSnapshot(), null, 'the home is released in the commit that starts the fade');
  assert.deepEqual(clock.pending.filter(delay => delay === GATE_FADE_MS), [GATE_FADE_MS]);
  view.advance(GATE_FADE_MS - 1);
  assert.deepEqual([view.phase(), view.calls.exited], ['fading', 0], 'still mounted, above the first screen, until the fade ends');
  view.advance(1);
  assert.equal(view.calls.exited, 1, 'unmounted when the fade ends');
  assert.equal(view.calls.verify, 1);
  view.harness.unmount();
});

test('a site that is mounted but whose 3D emblem never draws is shown after the safety hold, counted from the click', () => {
  const view = mountGate();
  view.press('I am 18 or older');
  view.update({ verified: true });
  view.advance(HOME_SAFETY_MS - 1);
  assert.equal(view.phase(), 'lit');
  assert.equal(gate.reveal.homeReveal.getSnapshot(), null);
  view.advance(1);
  assert.equal(view.phase(), 'fading', 'no WebGL or a stalled download never traps the visitor on the gate');
  assert.notEqual(gate.reveal.homeReveal.getSnapshot(), null);
  assert.ok(HOME_SAFETY_MS <= 5000, 'a slow network must not hold the gate far beyond a few seconds');
  view.harness.unmount();
});

test('when the 3D emblem has already drawn the ignition goes straight into the fade, without a hold', () => {
  const view = mountGate();
  view.press('I am 18 or older');
  view.advance(300);
  view.update({ verified: true });
  view.sceneDraws();
  assert.equal(view.phase(), 'igniting', 'readiness never cuts the ignition short');
  assert.equal(gate.reveal.homeReveal.getSnapshot(), null, 'and the home is not released during the ignition');
  view.advance(GATE_IGNITE_MS - 300);
  assert.equal(view.phase(), 'fading');
  assert.notEqual(gate.reveal.homeReveal.getSnapshot(), null);
  view.advance(GATE_FADE_MS);
  assert.equal(view.calls.exited, 1);
  view.harness.unmount();
});

test('reduced motion has no exit animation: verify runs and the gate is gone in the commit that verifies', () => {
  const view = mountGate({ reduced: true });
  view.press('I am 18 or older');
  assert.equal(view.calls.verify, 1);
  assert.equal(view.phase(), 'ask', 'no ignition');
  assert.deepEqual(clock.pending, [], 'no timer, no animation');
  view.update({ verified: true });
  assert.equal(view.harness.output, null, 'nothing is rendered for the browser to paint');
  assert.equal(view.calls.exited, 1, 'closed at once');
  assert.deepEqual(clock.pending, []);
  view.harness.unmount();
});

test('"Under 18" asks for the refusal page and never verifies', () => {
  const view = mountGate();
  view.press('Under 18');
  assert.deepEqual([view.calls.reject, view.calls.verify], [1, 0]);
  view.update({ rejected: true });
  assert.deepEqual([view.phase(), view.emblemMode(), view.dialogActive()], ['denied', 'off', true]);
  assert.match(textOf(findAll(view.harness.output, el => el.type === 'h1')[0]), /Access\s+denied/);
  assert.deepEqual(findAll(view.harness.output, el => el.type === 'button'), []);
  view.harness.unmount();
});

test('leaving the page mid-exit leaves no timer behind', () => {
  const view = mountGate();
  view.press('I am 18 or older');
  assert.equal(clock.pending.length, 2, 'the ignition step and the safety hold');
  view.harness.unmount();
  assert.deepEqual(clock.pending, []);
});

test('the gate keeps its place above the site until its exit ends; a visitor verified earlier never sees it', () => {
  globalThis.__reducedMotion = false;
  const layer = createHarness(gate.AgeGateLayer);
  const layerProps = { verified: false, rejected: false, onVerify: noop, onReject: noop };
  layer.mount(layerProps);
  assert.equal(layer.output.type, gate.AgeGate);
  layer.update({ ...layerProps, verified: true });
  assert.equal(layer.output.type, gate.AgeGate, 'still mounted while the site mounts beneath it');
  layer.act(() => layer.output.props.onExited());
  assert.equal(layer.output, null, 'unmounted once its exit ends');
  const returning = createHarness(gate.AgeGateLayer);
  gate.reveal.homeReveal.reset();
  returning.mount({ ...layerProps, verified: true });
  assert.equal(returning.output, null);
  assert.notEqual(gate.reveal.homeReveal.getSnapshot(), null, 'with no gate to wait for, the first screen is released at once');
});

test('a gate that closes without having faded (reduced motion) still releases the home, as it closes; never while it is asking', () => {
  globalThis.__reducedMotion = true;
  gate.reveal.homeReveal.reset();
  const layer = createHarness(gate.AgeGateLayer);
  const layerProps = { verified: false, rejected: false, onVerify: noop, onReject: noop };
  layer.mount(layerProps);
  assert.equal(gate.reveal.homeReveal.getSnapshot(), null, 'the gate is asking');
  layer.update({ ...layerProps, verified: true });
  assert.equal(gate.reveal.homeReveal.getSnapshot(), null, 'verified, but the gate has not closed yet');
  layer.act(() => layer.output.props.onExited());
  assert.notEqual(gate.reveal.homeReveal.getSnapshot(), null, 'the gate is gone, so the first screen starts its arrival');
  gate.reveal.homeReveal.reset();
  globalThis.__reducedMotion = false;
});

test('useAgeGate: starts verified from the session, verify stores the answer as a transition, reject shows the refusal', () => {
  const stored = new Map();
  globalThis.sessionStorage = { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) };
  globalThis.__transitions = [];
  const hook = createHarness(() => gate.state.useAgeGate());
  hook.mount({});
  assert.deepEqual([hook.output.verified, hook.output.showGate], [false, true]);
  hook.act(() => hook.output.reject());
  assert.deepEqual([hook.output.verified, hook.output.showGate], [false, false]);
  hook.act(() => hook.output.verify());
  assert.equal(stored.get('gladiator_age_verified'), '1');
  assert.equal(globalThis.__transitions.length, 1, 'the site mounts as a non-urgent update');
  assert.equal(hook.output.verified, true);
  const again = createHarness(() => gate.state.useAgeGate());
  again.mount({});
  assert.equal(again.output.verified, true, 'a verified session skips the gate');
  delete globalThis.sessionStorage;
});

test('App still unlocks sound and warms the scene on the click, then verifies', () => {
  const app = source('../../app/App.tsx');
  assert.match(app, /const handleVerify = useCallback\(\(\) => \{\s*preloadScene\(\);\s*soundEngine\.unlock\(\);\s*verify\(\);\s*\}, \[verify\]\);/);
  assert.match(app, /<AgeGateLayer verified=\{verified\} rejected=\{!verified && !showGate\} onVerify=\{handleVerify\} onReject=\{reject\} \/>/);
});

// ── The stylesheet's promises ──────────────────────────────────────────────────

function keyframeBlocks(css) {
  const blocks = [];
  for (const match of css.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)) {
    let depth = 1, index = match.index + match[0].length;
    const start = index;
    while (depth > 0 && index < css.length) { depth += css[index] === '{' ? 1 : css[index] === '}' ? -1 : 0; index += 1; }
    blocks.push({ name: match[1], body: css.slice(start, index - 1) });
  }
  return blocks;
}

test('every gate animation moves only transform or opacity (the compositor does the work, no filter re-runs)', () => {
  const css = source('../components/ageGate.css');
  const blocks = keyframeBlocks(css);
  assert.ok(blocks.length >= 15, `found ${blocks.length} keyframes`);
  for (const { name, body } of blocks) {
    const properties = new Set([...body.matchAll(/([a-z-]+)\s*:/g)].map(match => match[1]));
    for (const property of properties) assert.ok(['opacity', 'transform'].includes(property), `@keyframes ${name} animates ${property}`);
  }
  assert.doesNotMatch(css, /backdrop-filter/);
  assert.ok(!/@keyframes[^{]*\{[^@]*filter\s*:/.test(css), 'no animated filter');
});

test('reduced motion gets one complete still: lit emblem, no spark, arcs, current or flash, no animation at all', () => {
  const css = source('../components/ageGate.css');
  const block = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*)\n\}\s*$/.exec(css)?.[1];
  assert.ok(block, 'a reduced-motion block closes the stylesheet');
  for (const selector of ['.gate__spark', '.gate__arc', '.gate__current', '.gate__flash']) assert.ok(block.includes(selector), selector);
  assert.match(block, /display: none/);
  assert.match(block, /\.gate__lit \{ opacity: 1; \}/);
  assert.match(block, /\.gate \*\s*\{ animation: none !important; \}/);
});

test('both answers are tap targets of at least 44 px', () => {
  const css = source('../components/ageGate.css');
  const minHeight = /\.gate__btn \{[^}]*min-height: (\d+)px/.exec(css)?.[1];
  assert.ok(Number(minHeight) >= 44, `min-height ${minHeight}px`);
});
