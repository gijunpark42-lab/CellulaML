/** Fixed categorical palette (Tableau 20 order). Index i -> category i; wraps past 20. */
const HEX = [
  "#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f",
  "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#bab0ac",
  "#a0cbe8", "#ffbe7d", "#ff9d9a", "#8cd17d", "#b6992d",
  "#f1ce63", "#d4a6c8", "#d37295", "#fabfd2", "#79706e",
];

export const MISSING_COLOR = "#3f3f46"; // zinc-700, for code -1

export function categoryColor(i: number): string {
  return i < 0 ? MISSING_COLOR : HEX[i % HEX.length];
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Build a per-point RGB buffer (3 floats per point) from category codes. */
export function colorsFromCodes(codes: Int32Array, nCategories: number): Float32Array {
  const lut = new Float32Array((nCategories + 1) * 3);
  for (let c = -1; c < nCategories; c++) {
    const [r, g, b] = hexToRgb(categoryColor(c));
    const o = (c + 1) * 3;
    lut[o] = r; lut[o + 1] = g; lut[o + 2] = b;
  }
  const out = new Float32Array(codes.length * 3);
  for (let i = 0; i < codes.length; i++) {
    const c = codes[i];
    const o = (c < 0 || c >= nCategories ? 0 : c + 1) * 3;
    out[3 * i] = lut[o]; out[3 * i + 1] = lut[o + 1]; out[3 * i + 2] = lut[o + 2];
  }
  return out;
}
