import { useSyncExternalStore } from 'react';
import { Volume2, VolumeOff } from 'lucide-react';
import { soundEngine } from '@/shared/utils/soundEngine';

/** Hub and Client Area read the same persisted preference. */
export function SoundToggle() {
  const muted = useSyncExternalStore(soundEngine.subscribeMute, soundEngine.isMuted, soundEngine.isMuted);
  return (
    <button type="button" onClick={() => soundEngine.toggleMute()} onMouseEnter={() => soundEngine.hover()}
      className="icon-btn" aria-label={muted ? 'Unmute ambient sound' : 'Mute ambient sound'}
      aria-pressed={muted} title={muted ? 'Sound off' : 'Sound on'}
      style={{ color: muted ? 'var(--color-text-mute)' : 'var(--color-holo-500)' }}>
      {muted ? <VolumeOff size={15} aria-hidden="true" /> : <Volume2 size={15} aria-hidden="true" />}
    </button>
  );
}
