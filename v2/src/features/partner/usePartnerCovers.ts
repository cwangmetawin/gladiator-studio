import { COVER_MANIFEST } from '@/features/arena/hallManifest';

const COVERS = { manifest: COVER_MANIFEST, ready: true } as const;

/** Baked covers are available with the lazy Client Area chunk, before its first render. */
export function usePartnerCovers() { return COVERS; }
