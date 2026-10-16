import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../../../package.json', import.meta.url));
const ts = require('typescript');
const source = readFileSync(new URL('../editorialMotion.ts', import.meta.url), 'utf8');
const load = async text => import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(text, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText).toString('base64')}`);
const motion = await load(source);
const wordContract = split => {
  for (const text of ['Small team. Senior hands.', '  Built\tto be\nplayed hard  ', 'London-born.\u00a0MetaWin-built.', 'One—two, three!', '']) {
    assert.equal(split(text).join(''), text);
  }
  assert.equal(split('One two').filter(token => !/^\s+$/u.test(token)).length, 2);
};

test('word tokens retain the complete original, punctuation, whitespace and non-breaking spaces', () => wordContract(motion.splitWords));
test('count formatting retains exact final values, existing one-decimal percentages and grouping', () => {
  assert.equal(motion.formatCount(97.1, 1, '%'), '97.1%');
  assert.equal(motion.formatCount(12000, 0, '+'), '12,000+');
  assert.equal(motion.formatCount(motion.valueAtProgress(97.1, 1), 1, '%'), '97.1%');
  assert.equal(motion.valueAtProgress(42, 0), 0);
  assert.equal(motion.valueAtProgress(42, 0.5) > 21, true);
});
test('reduced-motion counting returns its exact final value immediately', () => {
  assert.equal(motion.valueAtProgress(97.1, 0, true), 97.1);
});
test('decode preserves whitespace and ends at the exact credential', () => {
  const key = 'sb_live_AbC123xYz';
  assert.equal(motion.decodeFrame(key, 0.4).length, key.length);
  assert.equal(motion.decodeFrame('ab cd', 0)[2], ' ');
  assert.equal(motion.decodeFrame(key, 1), key);
  assert.equal(motion.decodeFrame(key, 0.99) === key, false);
});
test('reduced-motion decode returns the credential immediately', () => {
  assert.equal(motion.decodeFrame('sb_live_AbC123xYz', 0, true), 'sb_live_AbC123xYz');
});

test('mutation checks reject whitespace loss, missing final-value guards and reduced-motion guards', async () => {
  const whitespace = await load(source.replace('text.split(/(\\s+)/u)', 'text.split(/\\s+/u)'));
  assert.throws(() => wordContract(whitespace.splitWords), assert.AssertionError);
  const countReduced = await load(source.replace('reducedMotion || progress >= 1', 'progress >= 1'));
  assert.throws(() => assert.equal(countReduced.valueAtProgress(97.1, 0, true), 97.1), assert.AssertionError);
  const decodeReduced = await load(source.replaceAll('reducedMotion || progress >= 1) return value;', 'progress >= 1) return value;'));
  assert.throws(() => assert.equal(decodeReduced.decodeFrame('sb_live_AbC123xYz', 0, true), 'sb_live_AbC123xYz'), assert.AssertionError);
  const decodeFinal = await load(source.replaceAll('reducedMotion || progress >= 1) return value;', 'reducedMotion) return value;'));
  assert.throws(() => assert.equal(decodeFinal.decodeFrame('sb_live_AbC123xYz', 1), 'sb_live_AbC123xYz'), assert.AssertionError);
});
