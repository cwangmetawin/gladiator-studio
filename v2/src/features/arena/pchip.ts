/** A shape-preserving cubic track. Zero end tangents give a quiet arrival and departure. */
export type Knot = readonly [position: number, value: number];

export function createPchip(input: readonly Knot[]): (position: number) => number {
  if (input.length < 2 || input.some(([x, y], i) => !Number.isFinite(x) || !Number.isFinite(y)
    || (i > 0 && x <= input[i - 1]![0]))) throw new Error('Invalid camera track: finite, increasing knots required');
  // Own the data: a caller changing its keyframe array must never change a prepared track.
  const keys = input.map(([x, y]) => [x, y] as const);
  const spans = keys.slice(1).map(([x], i) => x - keys[i]![0]);
  const slopes = keys.slice(1).map(([, y], i) => (y - keys[i]![1]) / spans[i]!);
  const tangents = keys.map((_, i) => {
    if (i === 0 || i === keys.length - 1) return 0;
    const before = slopes[i - 1]!, after = slopes[i]!;
    if (before * after <= 0) return 0;
    const left = spans[i - 1]!, right = spans[i]!;
    const w1 = 2 * right + left, w2 = right + 2 * left;
    return (w1 + w2) / (w1 / before + w2 / after);
  });
  return (position: number): number => {
    if (Number.isNaN(position) || position <= keys[0]![0]) return keys[0]![1];
    if (position >= keys.at(-1)![0]) return keys.at(-1)![1];
    let i = 0;
    while (position > keys[i + 1]![0]) i++;
    const [x, a] = keys[i]!, b = keys[i + 1]![1], h = spans[i]!;
    const t = (position - x) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * a + (t3 - 2 * t2 + t) * h * tangents[i]!
      + (-2 * t3 + 3 * t2) * b + (t3 - t2) * h * tangents[i + 1]!;
  };
}
