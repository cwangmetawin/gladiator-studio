import { pathToFileURL } from 'node:url';
import { audioRecorder } from './offline.mjs';
import { loadNodeSynth } from './synth.mjs';
import { measureCue } from './measure.mjs';
import { optionsFromArgs, writeCueWav, writeReport } from './report.mjs';

export async function renderNodeCue(synth, name, sampleRate = 48000) {
  const { AudioContext, record } = audioRecorder(sampleRate), ac = new AudioContext();
  await synth.prepareRender(ac, name);
  return { channels: ac.render(synth.renderSeconds(name)), record };
}

async function main() {
  const options = optionsFromArgs(process.argv.slice(2), 'node-audio');
  const synth = await loadNodeSynth(options), results = [];
  for (const name of synth.cueNames) {
    const { channels } = await renderNodeCue(synth, name, options.sampleRate);
    const result = measureCue(name, channels, options.sampleRate, synth.notes[name].tones.length > 0);
    results.push(result);
    await writeCueWav(options.out, name, channels, options.sampleRate, result.duration);
    console.log(`${name}: ${result.pass ? '通过' : '失败'}，最大偏差 ${result.worstCents.toFixed(3)} 音分，平坦度 ${result.flatness.toPrecision(4)}`);
  }
  const report = await writeReport(options.out, 'Node 合成波形（生产代码）', results, synth.notes, options);
  if (!report.pass) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
