export function polylineLength(points: readonly (readonly [number, number])[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i - 1]!;
    const [x2, y2] = points[i]!;
    total += Math.hypot(x2 - x1, y2 - y1);
  }
  return total;
}

type Point = readonly [number, number];

/** A rectangle in metres, origin top-left, y down: what an SVG `viewBox` shows. */
export type ViewBox = { x: number; y: number; width: number; height: number };

/** The smallest box holding every point; a single point gives a box of size 0. */
export function boundsOf(points: readonly Point[]): ViewBox {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * The view that shows `target` with `padding` round it, widened to the screen's `aspect`
 * (width ÷ height) so nothing is stretched, centred on the target. Never smaller than
 * `minSize` across, so a short leg does not fill the screen.
 */
export function fitView(target: ViewBox, aspect: number, padding: number, minSize = 20): ViewBox {
  let width = Math.max(target.width + 2 * padding, minSize);
  let height = Math.max(target.height + 2 * padding, minSize);
  if (width / height < aspect) width = height * aspect;
  else height = width / aspect;
  return {
    x: target.x + target.width / 2 - width / 2,
    y: target.y + target.height / 2 - height / 2,
    width,
    height,
  };
}

/** An SVG path through the points: "M x y L x y …". */
export function pathData(points: readonly Point[]): string {
  return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ');
}
