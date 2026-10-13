import { DOOR_WIDTH, PHONE_DOOR_WIDTH, DOOR_HEIGHT, DOOR_CLEARANCE, DOOR_TOP,
  DOOR_BOTTOM, PHONE_DOOR_BOTTOM, overlaps, type ScreenRect } from './doorSelection';

/** Label-sized patches of sky, measured only when the DOM layout changes. */
export function createConstellationLayout() {
  const slots: ScreenRect[] = [];
  const previousObstacles: ScreenRect[] = [];
  const probe: ScreenRect = { left: 0, top: 0, right: 0, bottom: 0 };
  let width = 0;
  let height = 0;
  let phone = false;
  let revision = 0;

  function measure(nextWidth: number, nextHeight: number, nextPhone: boolean, obstacles: readonly ScreenRect[]): boolean {
    let changed = width !== nextWidth || height !== nextHeight || phone !== nextPhone
      || previousObstacles.length !== obstacles.length;
    for (let i = 0; !changed && i < obstacles.length; i++) {
      const a = previousObstacles[i]!;
      const b = obstacles[i]!;
      changed = a.left !== b.left || a.top !== b.top || a.right !== b.right || a.bottom !== b.bottom;
    }
    if (!changed) return false;
    width = nextWidth; height = nextHeight; phone = nextPhone;
    previousObstacles.length = obstacles.length;
    for (let i = 0; i < obstacles.length; i++) previousObstacles[i] = { ...obstacles[i]! };
    slots.length = 0;
    const doorWidth = phone ? PHONE_DOOR_WIDTH : DOOR_WIDTH;
    const bottom = height - (phone ? PHONE_DOOR_BOTTOM : DOOR_BOTTOM);
    // Non-overlapping patches make the hash stable regardless of win arrival order.
    // Scan vertically at the clearance interval so narrow gaps below the phone hub aren't lost.
    for (let top = DOOR_TOP; top + DOOR_HEIGHT <= bottom; top += DOOR_CLEARANCE) {
      for (let left = DOOR_CLEARANCE; left + doorWidth <= width - DOOR_CLEARANCE; left += doorWidth + DOOR_CLEARANCE) {
        probe.left = left; probe.top = top; probe.right = left + doorWidth; probe.bottom = top + DOOR_HEIGHT;
        let blocked = false;
        for (let i = 0; i < obstacles.length; i++) {
          if (overlaps(probe, obstacles[i]!)) { blocked = true; break; }
        }
        for (let i = 0; !blocked && i < slots.length; i++) {
          if (overlaps(probe, slots[i]!)) blocked = true;
        }
        if (!blocked) slots.push({ ...probe });
      }
    }
    revision++;
    return true;
  }

  return { slots, measure, get width() { return width; }, get height() { return height; },
    get obstacles(): readonly ScreenRect[] { return previousObstacles; },
    get phone() { return phone; }, get revision() { return revision; } };
}
