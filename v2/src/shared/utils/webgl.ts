// Is there a WebGL context to be had at all? Asked once, with a throwaway canvas that is released at once. The
// age gate asks it so that a visitor without WebGL is not held on the lit frame while the 3D scene's code
// downloads only to fail: the first screen shows its flat emblem straight away.

let known: boolean | null = null;

export function webglAvailable(): boolean {
  if (typeof document === 'undefined') return true; // no DOM to ask (a server render, a unit test): assume yes
  if (known !== null) return known;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    known = gl !== null;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    known = false;
  }
  return known;
}
