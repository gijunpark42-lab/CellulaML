import { geneColumn } from "../h5ad/matrix.ts";
import type { Dataset, ExpressionMatrix } from "../h5ad/types.ts";

/** Weights exported by ml/train_reference.py. Inference = softmax((W z + b) / T), z = min(x / std, clip). */
export interface RefModel {
  name: string;
  source: string;
  classes: string[];
  genes: string[];
  std: number[];
  clip: number;
  normalize: "log1p_cp10k";
  W: number[][]; // K x G
  b: number[];
  temperature: number;
  abstain_below: number;
  abstain_table?: Record<string, number>;
  evidence: Record<string, string[]>;
  validation: Record<string, unknown>;
}

export type InputKind = "counts" | "lognorm" | "scaled";

export interface ClusterCall {
  /** category index in the label set */
  code: number;
  nCells: number;
  /** mean calibrated probability per class */
  probs: number[];
  best: number;
  confidence: number;
  abstain: boolean;
  /** genes contributing most to the winning class in this cluster (data-specific evidence) */
  evidence: string[];
}

export interface AnnotationResult {
  classes: string[];
  /** per-cell calibrated probs, row-major nCells x K */
  probs: Float32Array;
  pred: Int32Array;
  conf: Float32Array;
  source: "raw" | "X";
  inputKind: InputKind;
  genesMatched: number;
  clusters: ClusterCall[];
  warnings: string[];
}

/** Look at a sample of stored values to decide what the matrix contains. */
export function detectInputKind(X: ExpressionMatrix): InputKind {
  const data = X.data;
  const step = Math.max(1, Math.floor(data.length / 5000));
  let max = 0;
  let negative = false;
  let allInt = true;
  let seen = 0;
  for (let i = 0; i < data.length && seen < 5000; i += step) {
    const v = data[i];
    if (v === 0) continue;
    seen++;
    if (v < 0) negative = true;
    if (v > max) max = v;
    if (allInt && v !== Math.floor(v)) allInt = false;
  }
  if (negative) return "scaled";
  if (allInt && max >= 30) return "counts";
  return "lognorm";
}

function rowTotals(X: ExpressionMatrix): Float64Array {
  const t = new Float64Array(X.nRows);
  if (X.format === "dense") {
    for (let r = 0; r < X.nRows; r++) {
      let s = 0;
      const o = r * X.nCols;
      for (let c = 0; c < X.nCols; c++) s += X.data[o + c];
      t[r] = s;
    }
  } else if (X.format === "csr") {
    for (let r = 0; r < X.nRows; r++) {
      let s = 0;
      for (let k = X.indptr[r]; k < X.indptr[r + 1]; k++) s += X.data[k];
      t[r] = s;
    }
  } else {
    for (let c = 0; c < X.nCols; c++) {
      for (let k = X.indptr[c]; k < X.indptr[c + 1]; k++) t[X.indices[k]] += X.data[k];
    }
  }
  return t;
}

/**
 * Annotate every cell and summarize per cluster. Never throws on missing genes: unmatched model genes contribute 0.
 * @param codes  per-cell cluster code (e.g. a stored label set); -1 = unassigned
 */
export function annotate(d: Dataset, m: RefModel, codes: Int32Array, nCats: number): AnnotationResult {
  const warnings: string[] = [];
  const src = d.raw ?? (d.X ? { X: d.X, geneNames: d.geneNames } : null);
  if (!src) throw new Error("no expression matrix in this file");
  const source: "raw" | "X" = d.raw ? "raw" : "X";
  const X = src.X;
  const n = X.nRows;
  const K = m.classes.length;
  const G = m.genes.length;

  const kind = detectInputKind(X);
  if (kind === "scaled") {
    warnings.push(`${source} looks z-scored (negative values); the model expects log-normalized data, results may be unreliable`);
  }
  const totals = kind === "counts" ? rowTotals(X) : null;

  // gene name -> column, case-insensitive, first occurrence wins
  const colOf = new Map<string, number>();
  src.geneNames.forEach((g, i) => {
    const key = String(g).toUpperCase();
    if (!colOf.has(key)) colOf.set(key, i);
  });

  const logits = new Float64Array(n * K);
  for (let i = 0; i < n; i++) for (let k = 0; k < K; k++) logits[i * K + k] = m.b[k];
  const clusterZ = new Float64Array(nCats * G); // summed z per cluster per model gene (for evidence)
  const clusterN = new Int32Array(nCats);
  for (let i = 0; i < n; i++) if (codes[i] >= 0 && codes[i] < nCats) clusterN[codes[i]]++;

  let matched = 0;
  const z = new Float32Array(n);
  for (let j = 0; j < G; j++) {
    const col = colOf.get(m.genes[j].toUpperCase());
    if (col === undefined) continue;
    matched++;
    const raw = geneColumn(X, col);
    const inv = 1 / m.std[j];
    for (let i = 0; i < n; i++) {
      let v = raw[i];
      if (totals) v = totals[i] > 0 ? Math.log1p((v * 1e4) / totals[i]) : 0;
      v *= inv;
      z[i] = v > m.clip ? m.clip : v;
    }
    for (let k = 0; k < K; k++) {
      const w = m.W[k][j];
      if (w === 0) continue;
      for (let i = 0; i < n; i++) logits[i * K + k] += w * z[i];
    }
    for (let i = 0; i < n; i++) {
      const c = codes[i];
      if (c >= 0 && c < nCats) clusterZ[c * G + j] += z[i];
    }
  }
  if (matched < G * 0.5) {
    warnings.push(`only ${matched} of ${G} model genes found in this file (${source}); predictions may be unreliable`);
  }

  // calibrated softmax
  const probs = new Float32Array(n * K);
  const pred = new Int32Array(n);
  const conf = new Float32Array(n);
  const invT = 1 / m.temperature;
  for (let i = 0; i < n; i++) {
    let mx = -Infinity;
    for (let k = 0; k < K; k++) mx = Math.max(mx, logits[i * K + k] * invT);
    let s = 0;
    for (let k = 0; k < K; k++) {
      const e = Math.exp(logits[i * K + k] * invT - mx);
      probs[i * K + k] = e;
      s += e;
    }
    let best = 0;
    for (let k = 0; k < K; k++) {
      probs[i * K + k] /= s;
      if (probs[i * K + k] > probs[i * K + best]) best = k;
    }
    pred[i] = best;
    conf[i] = probs[i * K + best];
  }

  // per-cluster summary
  const clusters: ClusterCall[] = [];
  for (let c = 0; c < nCats; c++) {
    if (clusterN[c] === 0) continue;
    const mean = new Array<number>(K).fill(0);
    for (let i = 0; i < n; i++) {
      if (codes[i] !== c) continue;
      for (let k = 0; k < K; k++) mean[k] += probs[i * K + k];
    }
    for (let k = 0; k < K; k++) mean[k] /= clusterN[c];
    let best = 0;
    for (let k = 1; k < K; k++) if (mean[k] > mean[best]) best = k;
    const contrib: [number, number][] = [];
    for (let j = 0; j < G; j++) {
      const v = m.W[best][j] * (clusterZ[c * G + j] / clusterN[c]);
      if (v > 0) contrib.push([v, j]);
    }
    contrib.sort((a, b) => b[0] - a[0]);
    clusters.push({
      code: c,
      nCells: clusterN[c],
      probs: mean,
      best,
      confidence: mean[best],
      abstain: mean[best] < m.abstain_below,
      evidence: contrib.slice(0, 5).map(([, j]) => m.genes[j]),
    });
  }

  return { classes: m.classes, probs, pred, conf, source, inputKind: kind, genesMatched: matched, clusters, warnings };
}
