import type { ExpressionMatrix } from "./types";

/** Extract one gene (column) as a dense Float32Array of length nRows. Never throws on bad input. */
export function geneColumn(X: ExpressionMatrix, col: number): Float32Array {
  const out = new Float32Array(X.nRows);
  if (col < 0 || col >= X.nCols) return out;

  if (X.format === "dense") {
    const { data, nCols } = X;
    for (let r = 0; r < X.nRows; r++) out[r] = data[r * nCols + col];
    return out;
  }

  const { data, indices, indptr } = X;
  if (X.format === "csc") {
    const start = indptr[col], end = indptr[col + 1];
    for (let k = start; k < end; k++) {
      const r = indices[k];
      if (r >= 0 && r < X.nRows) out[r] = data[k];
    }
    return out;
  }

  // csr: scan every row for this column (O(nnz), fine for a single lookup)
  for (let r = 0; r < X.nRows; r++) {
    const start = indptr[r], end = indptr[r + 1];
    for (let k = start; k < end; k++) {
      if (indices[k] === col) {
        out[r] = data[k];
        break;
      }
    }
  }
  return out;
}
