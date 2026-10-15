import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { encodeWav } from './wav.mjs';
import { LIMITS } from './analysis.mjs';
import { V2_ROOT } from './synth.mjs';

export function optionsFromArgs(args, defaultFolder) {
  let out = resolve(V2_ROOT, '../m4-notes', defaultFolder), sampleRate = 48000;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out' && args[i + 1]) out = resolve(args[++i]);
    else if (args[i] === '--sample-rate' && args[i + 1]) sampleRate = Number(args[++i]);
    else throw new Error(`Unknown or incomplete option: ${args[i]}`);
  }
  if (![44100, 48000].includes(sampleRate)) throw new Error('Sample rate must be 44100 or 48000');
  return { out, sampleRate, mutateKey: process.env.MUTATE_SOUND_KEY === '1', mutateSquare: process.env.MUTATE_SOUND_SQUARE === '1' };
}

export async function writeCueWav(out, name, channels, sampleRate, duration) {
  await mkdir(out, { recursive: true });
  const frames = Math.min(channels[0].length, Math.ceil((duration + 0.03) * sampleRate));
  await writeFile(resolve(out, `${name}.wav`), encodeWav(channels.map(channel => channel.slice(0, frames)), sampleRate));
}

const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');

export async function writeReport(out, engine, results, notes, options) {
  await mkdir(out, { recursive: true });
  const pass = results.every(result => result.pass), generatedAt = new Date().toISOString();
  const report = { engine, generatedAt, sampleRate: options.sampleRate, masterGain: 0.35, limits: LIMITS,
    mutations: { key: options.mutateKey, square: options.mutateSquare }, pass, results };
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  const rows = results.map(result => {
    const pitch = notes[result.name].tones.map(p => p.name).join(' · ') || '无音高';
    const cents = result.kind === 'tonal' ? result.worstCents.toFixed(3) : '—';
    return `<tr><th scope="row">${escape(result.name)}<small>${escape(pitch)}</small></th><td>${result.pass ? '通过' : '失败'}</td>
      <td>${cents}</td><td>${(result.outOfKeyEnergy * 100).toFixed(5)}%</td><td>${result.flatness.toPrecision(4)}</td>
      <td><audio controls preload="none" src="${encodeURIComponent(result.name)}.wav"></audio></td></tr>`;
  }).join('\n');
  await writeFile(resolve(out, 'index.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>M4 音频测量与试听</title><style>body{background:#101315;color:#edf2f4;font:16px/1.6 system-ui;margin:32px}main{max-width:1200px;margin:auto}
    a{color:#b9dfed}table{border-collapse:collapse;width:100%}th,td{padding:12px;border-bottom:1px solid #3c444a;text-align:left}small{display:block;font-weight:400}audio{max-width:280px} .scroll{overflow-x:auto}</style>
    <main><h1>M4 音频测量与试听：${pass ? '通过' : '失败'}</h1><p>${escape(engine)} · ${options.sampleRate} Hz · ${escape(generatedAt)}</p>
    <p>D 自然小调，A440，强分音阈值 −40 dB，允许 ±10 音分。主音量 0.35；WAV 保留实际相对音量，没有逐条归一化。</p>
    <p>无音高提示音按平坦度 ≥ 0.06 或调性相干度 &lt; 0.3 验收；表内调外能量对此类信号仅供参考。<a href="report.json">完整 JSON</a></p>
    <div class="scroll"><table><thead><tr><th>提示音／音符</th><th>结果</th><th>最大音分偏差</th><th>调外分音能量</th><th>平坦度</th><th>试听</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p>请另行检查网页内首次点击、静音、遮挡与音画同步；离线测量和试听不代表这些行为已通过浏览器验收。</p></main></html>`);
  return report;
}
