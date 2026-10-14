// Runs inside Chromium (scripts/bake-env.mjs bundles and serves it): turns the studio .hdr into Babylon's
// prefiltered .env with Babylon's own encoder, so the file's format and mip layout are correct by
// construction. Hands the bytes back as base64 on window.__env.
import { Engine } from '@babylonjs/core/Engines/engine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { HDRCubeTexture } from '@babylonjs/core/Materials/Textures/hdrCubeTexture.js';
import { CreateEnvTextureAsync } from '@babylonjs/core/Misc/environmentTextureTools.js';
import '@babylonjs/core/Engines/Extensions/engine.renderTargetCube.js';

const SIZE = Number(new URLSearchParams(location.search).get('size') || 128);

async function main() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 16;
  document.body.append(canvas);
  // Env textures can only be made by an engine without premultiplied alpha.
  const engine = new Engine(canvas, false, { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false });
  const scene = new Scene(engine);
  const texture = await new Promise((resolve, reject) => {
    const hdr = new HDRCubeTexture('/studio.hdr', scene, SIZE, false, true, false, true, () => resolve(hdr), (message) => reject(new Error(String(message))));
  });
  const buffer = await CreateEnvTextureAsync(texture, { imageType: 'image/png', disableIrradianceTexture: true });
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  window.__env = { base64: btoa(binary), size: SIZE, babylon: Engine.Version };
}

main().catch((error) => { window.__envError = String(error && error.stack || error); });
