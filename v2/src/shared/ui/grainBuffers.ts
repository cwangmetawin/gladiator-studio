const TILE_SIZE = 256;
const FRAME_COUNT = 10;

// Viewport dimensions deliberately do not control the noise allocation. Only
// the display canvas resizes; these tiles remain at one grain pixel per CSS pixel.
export function grainBufferLayout(_viewportWidth: number, _viewportHeight: number) {
  const width = TILE_SIZE;
  const height = TILE_SIZE;
  return { width, height, frameCount: FRAME_COUNT, bytes: width * height * FRAME_COUNT * 4 };
}
