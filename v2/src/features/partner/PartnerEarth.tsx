import { useEffect, useRef } from 'react';
import type { Engine } from '@babylonjs/core'; // type-only — erased at build

// Live low-orbit Earth backdrop for the Client Area: a large, slowly-rotating
// textured Earth whose lit horizon curves across the lower frame, an atmosphere
// band, and a star field above — the "command console in orbit" stage that the
// HUD content floats over. Persistent while the panel is open; one engine,
// created once, disposed on unmount.

export function PartnerEarth() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let disposed = false;
    let engine: Engine | null = null;
    const onResize = () => engine?.resize();

    (async () => {
      const B = await import('@babylonjs/core');
      const canvas = canvasRef.current;
      if (disposed || !canvas) return;

      engine = new B.Engine(canvas, true, { adaptToDeviceRatio: true });
      if (disposed) { engine.dispose(); engine = null; return; }
      const scene = new B.Scene(engine);
      scene.clearColor = new B.Color4(0, 0, 0, 0); // transparent → CSS starfield shows behind the Earth

      const baseAlpha = -Math.PI / 2;
      const camera = new B.ArcRotateCamera('c', baseAlpha, Math.PI / 2.18, 9, B.Vector3.Zero(), scene);
      camera.fov = 0.85;
      camera.minZ = 0.01;
      camera.maxZ = 400;

      // Sun grazes the limb → a real terminator along the horizon band.
      const amb = new B.HemisphericLight('a', new B.Vector3(-0.3, 0.4, -0.85), scene);
      amb.intensity = 0.2;
      amb.groundColor = new B.Color3(0.02, 0.03, 0.07);
      const sun = new B.DirectionalLight('s', new B.Vector3(0.6, -0.12, 0.4), scene);
      sun.intensity = 1.2;

      const R = 4.7;
      const yOff = -R - 1.4; // push the globe down to a true bottom horizon — content sits over dark sky above it

      // Earth material — replicated from the homepage's buildEarth: day diffuse +
      // SUBTLE night-lights emissive + topology BUMP map (the surface detail/relief)
      // + specular. Same textures the homepage ships.
      const earth = B.MeshBuilder.CreateSphere('e', { diameter: R * 2, segments: 96 }, scene);
      earth.position.y = yOff;
      earth.rotation.x = Math.PI;
      const em = new B.StandardMaterial('em', scene);
      const dayTex = new B.Texture('/textures/earth_day.jpg', scene);
      dayTex.anisotropicFilteringLevel = 8;
      em.diffuseTexture = dayTex;
      const nightTex = new B.Texture('/textures/earth_night_2k.jpg', scene);
      em.emissiveTexture = nightTex;
      em.emissiveColor = new B.Color3(0.08, 0.06, 0.03);
      const bumpTex = new B.Texture('/textures/earth_topology.png', scene);
      bumpTex.anisotropicFilteringLevel = 8;
      em.bumpTexture = bumpTex;
      em.bumpTexture.level = 0.5;
      em.specularColor = new B.Color3(0.3, 0.3, 0.35);
      em.specularPower = 24;
      earth.material = em;

      const clouds = B.MeshBuilder.CreateSphere('cl', { diameter: R * 2 * 1.012, segments: 64 }, scene);
      clouds.position.y = yOff;
      clouds.rotation.x = Math.PI;
      const cm = new B.StandardMaterial('cm', scene);
      const cloudTex = new B.Texture('/textures/earth_clouds.png', scene);
      cloudTex.hasAlpha = true;
      cm.diffuseTexture = cloudTex;
      cm.opacityTexture = cloudTex;
      cm.specularColor = new B.Color3(0, 0, 0);
      cm.backFaceCulling = true;
      cm.alpha = 0.5;
      clouds.material = cm;

      const atmo = B.MeshBuilder.CreateSphere('at', { diameter: R * 2 * 1.05, segments: 64 }, scene);
      atmo.position.y = yOff;
      const am = new B.StandardMaterial('am', scene);
      am.diffuseColor = new B.Color3(0, 0, 0);
      am.specularColor = new B.Color3(0, 0, 0);
      am.emissiveColor = new B.Color3(0.14, 0.32, 0.7);
      am.emissiveFresnelParameters = new B.FresnelParameters();
      am.emissiveFresnelParameters.bias = 0.05;
      am.emissiveFresnelParameters.power = 3.4;
      am.emissiveFresnelParameters.leftColor = B.Color3.White();
      am.emissiveFresnelParameters.rightColor = B.Color3.Black();
      am.opacityFresnelParameters = new B.FresnelParameters();
      am.opacityFresnelParameters.bias = 0.02;
      am.opacityFresnelParameters.power = 3.2;
      am.opacityFresnelParameters.leftColor = B.Color3.White();
      am.opacityFresnelParameters.rightColor = B.Color3.Black();
      am.alpha = 0.3;
      am.alphaMode = B.Constants.ALPHA_ADD;
      am.backFaceCulling = false;
      atmo.material = am;

      // NOTE: deliberately NO PointsCloudSystem starfield and NO GlowLayer here —
      // both are GPU-driver-fragile (point sprites + post-process bloom render as
      // corrupted blocks / grey wash on some hardware). Stars + atmosphere glow are
      // done robustly in CSS instead (.partner__stars / .partner__atmo).
      window.addEventListener('resize', onResize);
      const spin = reduced ? 0 : 0.00018;
      engine.runRenderLoop(() => {
        if (disposed) return;
        earth.rotation.y += spin;
        clouds.rotation.y += spin * 1.25;
        if (!reduced) camera.alpha = baseAlpha + Math.sin(performance.now() * 0.00003) * 0.16; // gentle orbit drift
        scene.render();
      });
    })().catch(() => { /* backdrop is decorative — never block the page */ });

    return () => {
      disposed = true;
      window.removeEventListener('resize', onResize);
      if (engine) { engine.dispose(); engine = null; }
    };
  }, []);

  return <canvas ref={canvasRef} className="partner__earth-canvas" aria-hidden="true" />;
}
