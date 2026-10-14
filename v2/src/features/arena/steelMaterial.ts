import type { ArenaModule, BabylonModule, PBRMaterial, Scene } from './arenaTypes';

// The emblem's brushed, chiselled steel: PBR metal, lit by the baked studio environment, the baked
// normal map for the chisel, and the baked "ORM-style" map for brushed roughness streaks.
//
// Pitfalls from the prototype, now rules:
//  - Babylon's PBR reads roughness from the metallicTexture's ALPHA channel by default
//    (useRoughnessFromMetallicTextureAlpha = true). Our map keeps roughness in G and metallic in B, so
//    the alpha flag must be switched off and the green/blue flags on, or the metal is flat matte.
//  - metallic and roughness are factors on those channels, so both are 1 when a map is present.
//  - The materials are always in alpha-blend mode (alpha 1 at rest) with depth writes forced on: that way
//    fading the emblem (a panel opens) only changes a uniform. Switching between opaque and blended
//    would recompile the PBR shader in the middle of the fade.

export interface SteelTextures {
  readonly normal: InstanceType<BabylonModule['Texture']>;
  readonly rough: InstanceType<BabylonModule['Texture']>;
}

const STEEL_ALBEDO: readonly [number, number, number] = [0.62, 0.66, 0.72];

function base(A: ArenaModule, B: BabylonModule, scene: Scene, name: string): PBRMaterial {
  const material = new A.PBRMaterial(name, scene);
  material.metallic = 1;
  material.albedoColor = new B.Color3(...STEEL_ALBEDO);
  material.transparencyMode = A.PBRMaterial.PBRMATERIAL_ALPHABLEND;
  material.forceDepthWrite = true;
  material.alpha = 1;
  return material;
}

export function createSteelMaterials(A: ArenaModule, B: BabylonModule, scene: Scene, textures: SteelTextures) {
  const cap = base(A, B, scene, 'steelCap');
  cap.roughness = 1;
  cap.bumpTexture = textures.normal;
  cap.metallicTexture = textures.rough;
  cap.useRoughnessFromMetallicTextureAlpha = false;
  cap.useRoughnessFromMetallicTextureGreen = true;
  cap.useMetallnessFromMetallicTextureBlue = true;
  cap.useAmbientOcclusionFromMetallicTextureRed = false;
  const side = base(A, B, scene, 'steelSide');
  side.roughness = 0.22;
  return { cap, side, all: [cap, side] as const };
}
