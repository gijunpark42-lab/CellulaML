/** Wilcoxon rank-sum (Mann-Whitney U) test of one group vs the rest, with tie correction
 *  and normal approximation. Same test scanpy uses in rank_genes_groups(method="wilcoxon"). */

export interface RankSumResult {
  /** standardized statistic; > 0 means higher in the selected group */
  z: number;
  /** two-sided p-value (normal approximation) */
  p: number;
}

/** Standard normal survival function via erfc (Abramowitz-Stegun 7.1.26, |err| < 1.5e-7). */
function normalSf(x: number): number {
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const poly =
    t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erfc = poly * Math.exp(-z * z);
  return erfc / 2;
}

/**
 * @param values one gene across all cells
 * @param inGroup 1 for selected cells, 0 otherwise
 * @param order   scratch index array of length n (reused across genes to avoid allocation)
 */
export function rankSum(values: Float32Array, inGroup: Uint8Array, nIn: number, order: Uint32Array): RankSumResult {
  const n = values.length;
  const nOut = n - nIn;
  if (nIn === 0 || nOut === 0) return { z: 0, p: 1 };

  for (let i = 0; i < n; i++) order[i] = i;
  order.sort((a, b) => values[a] - values[b]);

  // average ranks for ties, rank sum of the in-group, tie correction sum(t^3 - t)
  let rankSumIn = 0;
  let tieTerm = 0;
  let i = 0;
  while (i < n) {
    let j = i;
    const v = values[order[i]];
    while (j + 1 < n && values[order[j + 1]] === v) j++;
    const t = j - i + 1;
    const avgRank = (i + j) / 2 + 1; // ranks are 1-based
    for (let k = i; k <= j; k++) if (inGroup[order[k]]) rankSumIn += avgRank;
    if (t > 1) tieTerm += t * t * t - t;
    i = j + 1;
  }

  const mean = (nIn * (n + 1)) / 2;
  const variance = ((nIn * nOut) / 12) * (n + 1 - tieTerm / (n * (n - 1)));
  if (variance <= 0) return { z: 0, p: 1 };
  const z = (rankSumIn - mean) / Math.sqrt(variance);
  return { z, p: Math.min(1, 2 * normalSf(z)) };
}

/** Benjamini-Hochberg adjusted p-values (q-values), same order as input. */
export function benjaminiHochberg(p: Float64Array): Float64Array {
  const m = p.length;
  const idx = Array.from({ length: m }, (_, i) => i).sort((a, b) => p[a] - p[b]);
  const q = new Float64Array(m);
  let running = 1;
  for (let r = m - 1; r >= 0; r--) {
    const i = idx[r];
    running = Math.min(running, (p[i] * m) / (r + 1));
    q[i] = running;
  }
  return q;
}
