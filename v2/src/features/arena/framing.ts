// Where the camera must stand so the 3D emblem lands on a rectangle of the page, and how much of the
// first screen the emblem then covers. Pure maths: the scene feeds it the DOM slot, the gate's anchor
// rectangle (so the 3D emblem lights up exactly where the gate's 2D emblem was) and the viewport.

export interface Rect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export interface Viewport { readonly width: number; readonly height: number }

export interface Framing {
  /** Camera distance from the emblem plane, in world units. */
  readonly distance: number;
  /** The emblem's offset in the plane, so that it lands on the rectangle's centre. */
  readonly offsetX: number;
  readonly offsetY: number;
}

/** Vertical field of view in radians: a phone sees more of the world around a wide emblem. */
export const FOV_DESKTOP = 0.62;
export const FOV_PHONE = 0.9;

export function tanHalfFov(fov: number): number { return Math.tan(fov / 2); }

/**
 * Camera distance and emblem offset for an emblem `emblemWidth` world units wide to span `rect` horizontally
 * and be centred on it. The camera looks along +z from the origin; the emblem moves instead of the camera
 * (the picture is a flat plate: the skew of an off-axis plate is far below a pixel of its thickness).
 */
export function framingFor(rect: Rect, viewport: Viewport, emblemWidth: number, fov: number): Framing {
  const tanV = tanHalfFov(fov), tanH = tanV * (viewport.width / viewport.height);
  const distance = emblemWidth / (2 * tanH * (rect.width / viewport.width));
  const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
  return {
    distance,
    offsetX: ((cx - viewport.width / 2) / (viewport.width / 2)) * distance * tanH,
    offsetY: ((viewport.height / 2 - cy) / (viewport.height / 2)) * distance * tanV,
  };
}

export function blendFraming(a: Framing, b: Framing, t: number): Framing {
  const k = Math.min(1, Math.max(0, t));
  return {
    distance: a.distance + (b.distance - a.distance) * k,
    offsetX: a.offsetX + (b.offsetX - a.offsetX) * k,
    offsetY: a.offsetY + (b.offsetY - a.offsetY) * k,
  };
}

/** The emblem never stands taller than this share of its slot: a short window or a landscape phone must not push it under the bar or the headline. */
export const SLOT_HEIGHT_FILL = 0.94;

/** The rectangle a wide emblem is placed in: `fraction` of the slot's width (or less, if that would be taller than the slot), centred in the slot. */
export function emblemRect(slot: Rect, emblem: { readonly width: number; readonly height: number }, fraction: number): Rect {
  const aspect = emblem.height / emblem.width;
  const width = Math.min(slot.width * fraction, (slot.height * SLOT_HEIGHT_FILL) / aspect), height = width * aspect;
  return { x: slot.x + (slot.width - width) / 2, y: slot.y + (slot.height - height) / 2, width, height };
}

/** The emblem's on-screen box (viewport pixels, clipped to the viewport) from its world positions (x, y, z triples). */
export function projectedBox(positions: Float32Array, framing: Framing, viewport: Viewport, fov: number): Rect {
  const tanV = tanHalfFov(fov), tanH = tanV * (viewport.width / viewport.height);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const depth = positions[i + 2]! + framing.distance;
    if (depth <= 0) continue;
    const sx = viewport.width / 2 + ((positions[i]! + framing.offsetX) / (depth * tanH)) * (viewport.width / 2);
    const sy = viewport.height / 2 - ((positions[i + 1]! + framing.offsetY) / (depth * tanV)) * (viewport.height / 2);
    x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
  }
  if (x0 === Infinity) return { x: 0, y: 0, width: 0, height: 0 };
  const cx0 = Math.max(0, x0), cy0 = Math.max(0, y0), cx1 = Math.min(viewport.width, x1), cy1 = Math.min(viewport.height, y1);
  return { x: cx0, y: cy0, width: Math.max(0, cx1 - cx0), height: Math.max(0, cy1 - cy0) };
}

export interface BoxShares {
  /** The box's width over the viewport's width. */
  readonly width: number;
  /** The box's area over the viewport's area. */
  readonly viewportArea: number;
  /** The box's area over the area of the first screen's stage: what is left once the bar, headline and details have their rows. */
  readonly stageArea: number;
}

export function boxShares(box: Rect, viewport: Viewport, stage: Rect): BoxShares {
  const area = (rect: Rect): number => rect.width * rect.height;
  return {
    width: viewport.width > 0 ? box.width / viewport.width : 0,
    viewportArea: area(viewport as Rect) > 0 ? area(box) / (viewport.width * viewport.height) : 0,
    stageArea: area(stage) > 0 ? area(box) / area(stage) : 0,
  };
}
