// Shared lazy entry for the homepage and Client Area. Importing the core barrel
// registers every Babylon feature, so keep the two scenes' API explicit here.
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder.js';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder.js';

// Preserve registrations supplied by the barrel. Glow/Layer/DynamicTexture also
// import their components/extensions themselves; keeping them explicit documents
// the render path and protects it when Babylon changes its internal imports.
import '@babylonjs/core/Layers/effectLayerSceneComponent.js';
import '@babylonjs/core/Layers/layerSceneComponent.js';
import '@babylonjs/core/Particles/particleSystemComponent.js';
import '@babylonjs/core/Engines/Extensions/engine.dynamicTexture.js';
// Scene attaches pointer handlers even though the decorative camera is detached.
import '@babylonjs/core/Culling/ray.js';
// Registers the rescale pass used for NPOT textures on WebGL 1.
import '@babylonjs/core/PostProcesses/passPostProcess.js';

export { Engine } from '@babylonjs/core/Engines/engine.js';
export { Scene } from '@babylonjs/core/scene.js';
export { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
export { Vector3, Matrix } from '@babylonjs/core/Maths/math.vector.js';
export { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
export { Constants } from '@babylonjs/core/Engines/constants.js';
export { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
export { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
export { PointLight } from '@babylonjs/core/Lights/pointLight.js';
export { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
export { Mesh } from '@babylonjs/core/Meshes/mesh.js';
export { SubMesh } from '@babylonjs/core/Meshes/subMesh.js';
export { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
export { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
export { Material } from '@babylonjs/core/Materials/material.js';
export { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
export { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
export { Effect } from '@babylonjs/core/Materials/effect.js';
export { PostProcess } from '@babylonjs/core/PostProcesses/postProcess.js';
export { FresnelParameters } from '@babylonjs/core/Materials/fresnelParameters.js';
export { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
export { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
export { GlowLayer } from '@babylonjs/core/Layers/glowLayer.js';
export { Layer } from '@babylonjs/core/Layers/layer.js';
export { ParticleSystem } from '@babylonjs/core/Particles/particleSystem.js';

// These builders also register Mesh/VertexData's legacy factory methods. Avoid
// meshBuilder.js, which would import every other procedural mesh builder too.
export const MeshBuilder = { CreateSphere, CreateTorus, CreatePlane };

// Keep optional GPU measurement behind the same entry and out of normal requests.
export async function loadGpuInstrumentation() {
  await import('@babylonjs/core/Engines/Extensions/engine.query.js');
  return import('@babylonjs/core/Instrumentation/engineInstrumentation.js');
}
