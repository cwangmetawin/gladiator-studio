import { SCENE_ENERGY_CALM } from './sceneEnergy';

type BabylonModule = typeof import('@/shared/babylon/babylonCore');
type NavMaterial = InstanceType<BabylonModule['StandardMaterial']>;
type Nebula = InstanceType<BabylonModule['Layer']>;
interface Tint { readonly r: number; readonly g: number; readonly b: number }

const EMISSIVE_LIFT = { r: 0.025, g: 0.08, b: 0.12 };

/** StandardMaterial's existing Fresnel shader adds no textures or draw calls. */
export function createBrandMaterialResponse(B: BabylonModule, materials: readonly NavMaterial[], nebula: Nebula, enabled: boolean) {
  const entries = materials.map(material => {
    const rest = material.emissiveColor.clone();
    const rim = enabled ? new B.FresnelParameters() : null;
    if (rim) {
      rim.bias = 0;
      rim.power = 3;
      // Babylon mixes left at the grazing rim and right at the facing centre.
      rim.leftColor.copyFromFloats(1, 1, 1);
      rim.rightColor.copyFromFloats(1, 1, 1);
      material.emissiveFresnelParameters = rim;
    }
    return { material, rest, rim };
  });
  const probe = entries[0];

  function write(energy: number, tint: Tint): void {
    const lift = enabled ? Math.max(0, Math.min(1, (energy - SCENE_ENERGY_CALM) / (1 - SCENE_ENERGY_CALM))) : 0;
    for (const { material, rest, rim } of entries) {
      material.emissiveColor.copyFromFloats(rest.r + EMISSIVE_LIFT.r * lift, rest.g + EMISSIVE_LIFT.g * lift, rest.b + EMISSIVE_LIFT.b * lift);
      rim?.leftColor.copyFromFloats(1 + 0.6 * lift, 1 + 1.9 * lift, 1 + 2.7 * lift);
    }
    // M3 owns the base tint; an exact identity at rest preserves its game palette.
    nebula.color.r = tint.r * (1 + 0.02 * lift);
    // The catalogue hides nav planets, so its drag response must read through its scrim.
    nebula.color.g = tint.g * (1 + 0.07 * lift);
    nebula.color.b = tint.b * (1 + 0.18 * lift);
  }

  function readEnergy(): number {
    if (!probe) return SCENE_ENERGY_CALM;
    // Decode the emissive parameter that StandardMaterial uploads to its shader.
    return SCENE_ENERGY_CALM + (probe.material.emissiveColor.g - probe.rest.g) / EMISSIVE_LIFT.g * (1 - SCENE_ENERGY_CALM);
  }

  return { write, readEnergy };
}
