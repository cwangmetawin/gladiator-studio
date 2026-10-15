import { createAmbientBufferCache } from '@/shared/audio/ambientBuffer';
import { playCue } from '@/shared/audio/cuePlayer';
import { createCueBufferCache } from '@/shared/audio/cueBuffer';
import { createCueThrottle, createWinThrottle, GAME_SWITCH_INTERVAL_MS } from '@/shared/audio/cueThrottle';
import { muteStore } from '@/shared/audio/muteStore';
import type { EffectCue } from '@/shared/audio/key';

// AudioContext creation and playback are both gated by a real user interaction.
let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let unlocked = false;
let volume = 0.35;
let ambientSource: AudioBufferSourceNode | null = null;
let ambientGain: GainNode | null = null;
let ambientRequested = false;
let ambientPending = false;
let cancelArc: (() => void) | null = null;
const ambientCache = createAmbientBufferCache();
const cueCache = createCueBufferCache();
const allowWin = createWinThrottle();
const allowGameSwitch = createCueThrottle(GAME_SWITCH_INTERVAL_MS);

function unlock(): void {
  if (unlocked) return;
  try {
    const ac = new AudioContext();
    const gain = ac.createGain();
    gain.gain.value = muteStore.getSnapshot() ? 0 : volume;
    gain.connect(ac.destination);
    ctx = ac;
    masterGain = gain;
    unlocked = true;
    if (ac.state === 'suspended') void ac.resume().catch(() => {});
    // Queue bounded background work now, while the intro is still on screen.
    void ambientCache.prepare(ac).catch(() => {});
    void cueCache.prepare(ac).catch(() => {});
    if (ambientRequested) startAmbient();
  } catch { /* Audio unavailable: the visual site remains fully usable. */ }
}

function initGestureUnlock(): () => void {
  const visibilityTarget = typeof document === 'undefined' ? null : document;
  const visibility = (): void => { if (visibilityTarget?.hidden) stopArc(); };
  const gesture = (): void => {
    unlock();
    if (ctx?.state === 'suspended') void ctx.resume().catch(() => {});
  };
  for (const event of ['pointerdown', 'keydown', 'click']) window.addEventListener(event, gesture, true);
  visibilityTarget?.addEventListener('visibilitychange', visibility);
  return () => {
    for (const event of ['pointerdown', 'keydown', 'click']) window.removeEventListener(event, gesture, true);
    visibilityTarget?.removeEventListener('visibilitychange', visibility);
    stopArc();
  };
}

function stopArc(): void { cancelArc?.(); cancelArc = null; }

function play(cue: EffectCue, level = 1): void {
  if (!unlocked || muteStore.getSnapshot() || !ctx || !masterGain) return;
  if ((cue === 'alert' || cue === 'bigWin') && !allowWin(cue, performance.now())) return;
  if (cue === 'gameSwitch' && !allowGameSwitch(performance.now())) return;
  if (cue === 'arc') stopArc();
  const cancel = playCue(ctx, masterGain, cue, cueCache.get(), level);
  if (cue === 'arc') cancelArc = cancel;
}

function startAmbient(): void {
  ambientRequested = true;
  if (!unlocked || muteStore.getSnapshot() || !ctx || ambientSource || ambientPending) return;
  const ac = ctx;
  ambientPending = true;
  void ambientCache.prepare(ac).then(buffer => {
    ambientPending = false;
    if (!ambientRequested || muteStore.getSnapshot() || ambientSource || !masterGain) return;
    // Hand-off only creates/connects nodes. Buffer synthesis has already yielded.
    const source = ac.createBufferSource();
    const gain = ac.createGain();
    source.buffer = buffer;
    source.loop = true;
    gain.gain.setValueAtTime(0, ac.currentTime);
    gain.gain.linearRampToValueAtTime(1, ac.currentTime + 3);
    source.connect(gain);
    gain.connect(masterGain);
    source.start();
    ambientSource = source;
    ambientGain = gain;
  }).catch(() => { ambientPending = false; });
}

function stopAmbient(): void {
  ambientRequested = false;
  if (ambientSource) {
    try { ambientSource.stop(); } catch { /* already stopped */ }
    ambientSource.disconnect();
    ambientSource = null;
  }
  ambientGain?.disconnect();
  ambientGain = null;
}

function setVolume(value: number): void {
  volume = Math.max(0, Math.min(1, value));
  if (masterGain) masterGain.gain.value = muteStore.getSnapshot() ? 0 : volume;
}

function toggleMute(): boolean {
  const muted = muteStore.toggle();
  if (masterGain) masterGain.gain.value = muted ? 0 : volume;
  if (muted) { stopAmbient(); stopArc(); }
  else startAmbient();
  return muted;
}

export const soundEngine = Object.freeze({
  hover: () => play('hover'),
  click: () => play('click'),
  panelOpen: () => play('panelOpen'),
  panelClose: () => play('panelClose'),
  transmission: () => play('transmission'),
  alert: () => play('alert'),
  bigWin: () => play('bigWin'),
  sectionSwitch: () => play('sectionSwitch'),
  warpStart: () => play('warpStart'),
  warpArrival: () => play('warpArrival'),
  catalogueFocus: () => play('catalogueFocus'),
  ignite: () => play('ignite'),
  arc: () => play('arc'),
  crossing: (soft = false) => play('crossing', soft ? 0.5 : 1),
  gameSwitch: () => play('gameSwitch'),
  unlock, initGestureUnlock, startAmbient, stopAmbient, stopArc, setVolume, toggleMute,
  isMuted: muteStore.getSnapshot,
  subscribeMute: muteStore.subscribe,
});
