import { useEffect, useState } from 'react';
import { loadCoverManifest } from '@/features/arena/hallActions';
import type { CoverManifest } from '@/features/arena/hallManifest';

/** Wait for the small local manifest before asking for any original catalogue images. */
export function usePartnerCovers() {
  const [covers, setCovers] = useState<{ readonly manifest: CoverManifest | null; readonly ready: boolean }>({ manifest: null, ready: false });
  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;
    const timeout = window.setTimeout(() => controller.abort(), 4000);
    void loadCoverManifest(controller.signal).then(manifest => {
      window.clearTimeout(timeout);
      if (mounted) setCovers({ manifest, ready: true });
    });
    return () => { mounted = false; window.clearTimeout(timeout); controller.abort(); };
  }, []);
  return covers;
}
