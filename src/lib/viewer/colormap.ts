/** Continuous colormap (viridis, 9 stops) and helpers for coloring by a scalar. */
const STOPS: [number, number, number][] = [
  [68, 1, 84], [72, 40, 120], [62, 74, 137], [49, 104, 142], [38, 130, 142],
  [31, 158, 137], [53, 183, 121], [109, 205, 89], [180, 222, 44],
].map(([r, g, b]) => [r / 255, g / 255, b / 255]);

export function viridis(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t)) * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(x));
  const f = x - i;
  const a = STOPS[i], b = STOPS[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

export function viridisCss(t: number): string {
  const [r, g, b] = viridis(t);
  return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
}

export interface ScalarScale {
  /** display range after transform */
  lo: number;
  hi: number;
  /** true when log1p was applied (all values non-negative) */
  log: boolean;
}

/** Robust range: log1p when non-negative, clip at the 99th percentile so a few outliers do not wash out the map. */
export function scalarScale(values: Float32Array): ScalarScale {
  let min = Infinity;
  for (let i = 0; i < values.length; i++) if (values[i] < min) min = values[i];
  const log = Number.isFinite(min) && min >= 0;
  const t = new Float32Array(values.length);
  for (let i = 0; i < values.length; i++) t[i] = log ? Math.log1p(values[i]) : values[i];
  const sorted = Float32Array.from(t).sort();
  const lo = sorted.length ? sorted[0] : 0;
  const hi = sorted.length ? sorted[Math.floor((sorted.length - 1) * 0.99)] : 1;
  return { lo, hi: hi > lo ? hi : lo + 1e-6, log };
}

/** Per-point RGB buffer from a scalar. */
export function colorsFromScalar(values: Float32Array, s: ScalarScale): Float32Array {
  const out = new Float32Array(values.length * 3);
  const span = s.hi - s.lo;
  for (let i = 0; i < values.length; i++) {
    const v = s.log ? Math.log1p(values[i]) : values[i];
    const [r, g, b] = viridis((v - s.lo) / span);
    out[3 * i] = r; out[3 * i + 1] = g; out[3 * i + 2] = b;
  }
  return out;
}
