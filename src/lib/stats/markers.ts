import { geneColumn } from "../h5ad/matrix.ts";
import type { Dataset } from "../h5ad/types";
import { benjaminiHochberg, rankSum } from "./wilcoxon.ts";

export interface MarkerRow {
  gene: string;
  index: number;
  /** mean(selected) - mean(rest) */
  logFC: number;
  /** fraction of selected / rest cells with value > 0 */
  pctIn: number;
  pctOut: number;
  z: number;
  p: number;
  q: number;
}

export interface MarkerResult {
  nSelected: number;
  nTested: number;
  /** top genes higher in the selection, sorted by z descending */
  up: MarkerRow[];
}

/** Selected cells vs all others, one Wilcoxon test per gene, BH across all genes. */
export function computeMarkers(d: Dataset, selected: Uint32Array, top = 50): MarkerResult {
  const n = d.nCells;
  const inGroup = new Uint8Array(n);
  let nIn = 0;
  for (const i of selected) {
    if (i < n && !inGroup[i]) {
      inGroup[i] = 1;
      nIn++;
    }
  }
  if (!d.X || nIn === 0 || nIn === n) return { nSelected: nIn, nTested: 0, up: [] };

  const order = new Uint32Array(n);
  const nGenes = d.X.nCols;
  const p = new Float64Array(nGenes);
  const rows: MarkerRow[] = new Array(nGenes);
  for (let g = 0; g < nGenes; g++) {
    const v = geneColumn(d.X, g);
    let sumIn = 0, sumOut = 0, posIn = 0, posOut = 0;
    for (let i = 0; i < n; i++) {
      const x = v[i];
      if (inGroup[i]) { sumIn += x; if (x > 0) posIn++; }
      else { sumOut += x; if (x > 0) posOut++; }
    }
    const r = rankSum(v, inGroup, nIn, order);
    p[g] = r.p;
    rows[g] = {
      gene: d.geneNames[g] ?? `gene_${g}`,
      index: g,
      logFC: sumIn / nIn - sumOut / (n - nIn),
      pctIn: posIn / nIn,
      pctOut: posOut / (n - nIn),
      z: r.z,
      p: r.p,
      q: 1,
    };
  }
  const q = benjaminiHochberg(p);
  for (let g = 0; g < nGenes; g++) rows[g].q = q[g];
  const up = rows.filter((r) => r.z > 0).sort((a, b) => b.z - a.z).slice(0, top);
  return { nSelected: nIn, nTested: nGenes, up };
}
