// The extra Babylon classes only the 3D emblem needs: PBR steel, the cube texture the .env loads into, a
// camera and the image-processing (tone mapping) settings. Kept out of shared/babylon/babylonCore.ts so
// the Client Area, which shares that entry, does not pay for them; the arena imports this lazily.
// The .env texture loader itself is registered by Babylon on demand and arrives as its own small chunk
// (warmed by preloadArena).
export { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
export { CubeTexture } from '@babylonjs/core/Materials/Textures/cubeTexture.js';
export { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
export { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration.js';
