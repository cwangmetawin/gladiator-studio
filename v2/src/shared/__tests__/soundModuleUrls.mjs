import assert from 'node:assert/strict';

/** MUTATE_SOUND_KEY=1 restores the old off-key transmission oscillator (red). */
export function soundModuleUrls(moduleUrl, source, { mutateKey = false, tokens, suffix = '' } = {}) {
  const urls = {};
  const compile = (path, names, mutate) => {
    let src = source(path);
    if (mutate) src = mutate(src);
    for (const [name, url] of Object.entries(urls)) src = src.replaceAll(`from '${name}'`, `from '${url}'`);
    const url = moduleUrl(src + `\n// ${suffix}\n`);
    for (const name of names) urls[name] = url;
    return url;
  };
  const key = compile('../audio/key.ts', ['./key', '@/shared/audio/key'], mutateKey ? src => {
    const target = 'transmission: cue([NOTES.D6, NOTES.F6, NOTES.G6])';
    assert.ok(src.includes(target), 'sound-key mutation target not found');
    return src.replace(target, 'transmission: cue([{ ...NOTES.D6, hz: 1200 }, NOTES.F6, NOTES.G6])');
  } : undefined);
  const player = compile('../audio/cuePlayer.ts', ['@/shared/audio/cuePlayer']);
  const ambient = compile('../audio/ambientBuffer.ts', ['@/shared/audio/ambientBuffer']);
  const throttle = compile('../audio/cueThrottle.ts', ['@/shared/audio/cueThrottle']);
  const mute = compile('../audio/muteStore.ts', ['@/shared/audio/muteStore']);
  const engine = compile('../utils/soundEngine.ts', ['@/shared/utils/soundEngine']);
  if (tokens) urls['@/shared/motion/tokens'] = tokens;
  const transition = tokens ? compile('../audio/transitionSound.ts', ['@/shared/audio/transitionSound']) : null;
  return { key, player, ambient, throttle, mute, engine, transition };
}
