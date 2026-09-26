export function polylineLength(points: readonly (readonly [number, number])[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i - 1]!;
    const [x2, y2] = points[i]!;
    total += Math.hypot(x2 - x1, y2 - y1);
  }
  return total;
}
