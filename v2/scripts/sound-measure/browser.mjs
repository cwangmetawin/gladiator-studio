import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { bundleSynth, loadNodeSynth } from './synth.mjs';
import { measureCue } from './measure.mjs';
import { optionsFromArgs, writeCueWav, writeReport } from './report.mjs';

const require = createRequire(import.meta.url);

/** The controller supplies playwright through NODE_PATH; the website adds no dependency. */
async function main() {
  const options = optionsFromArgs(process.argv.slice(2), 'browser-audio');
  const { chromium } = require('playwright');
  const bundle = await bundleSynth({ ...options, format: 'iife' });
  const synth = await loadNodeSynth(options), results = [];
  const browser = await chromium.launch({ channel: 'chromium', headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><meta charset="utf-8"><title>M4 音频离线渲染</title>');
    await page.addScriptTag({ content: bundle });
    for (const name of synth.cueNames) {
      const pcm = await page.evaluate(async ({ name, sampleRate }) => {
        const synth = globalThis.SoundHarness;
        const context = new OfflineAudioContext(2, Math.ceil(synth.renderSeconds(name) * sampleRate), sampleRate);
        await synth.prepareRender(context, name);
        const rendered = await context.startRendering();
        return Array.from({ length: rendered.numberOfChannels }, (_, ch) => Array.from(rendered.getChannelData(ch)));
      }, { name, sampleRate: options.sampleRate });
      const channels = pcm.map(channel => Float32Array.from(channel));
      const result = measureCue(name, channels, options.sampleRate, synth.notes[name].tones.length > 0);
      results.push(result);
      await writeCueWav(options.out, name, channels, options.sampleRate, result.duration);
      console.log(`${name}: ${result.pass ? '通过' : '失败'}，最大偏差 ${result.worstCents.toFixed(3)} 音分，平坦度 ${result.flatness.toPrecision(4)}`);
    }
    const report = await writeReport(options.out, `Chromium ${browser.version()} OfflineAudioContext`, results, synth.notes, options);
    if (!report.pass) process.exitCode = 1;
  } finally { await browser.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
