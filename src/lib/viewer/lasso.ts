/** Point-in-polygon (even-odd rule) selection over interleaved xy coordinates. */
export function selectInPolygon(xy: Float32Array, poly: number[][]): Uint32Array {
  const n = xy.length / 2;
  const m = poly.length;
  if (m < 3) return new Uint32Array(0);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of poly) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = xy[2 * i], y = xy[2 * i + 1];
    if (x < minX || x > maxX || y < minY || y > maxY) continue;
    let inside = false;
    for (let a = 0, b = m - 1; a < m; b = a++) {
      const [xa, ya] = poly[a], [xb, yb] = poly[b];
      if (ya > y !== yb > y && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) inside = !inside;
    }
    if (inside) out.push(i);
  }
  return Uint32Array.from(out);
}
