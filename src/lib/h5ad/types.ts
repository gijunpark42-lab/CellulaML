/** Parsed contents of an .h5ad file. Everything is optional except cell/gene counts;
 *  missing or malformed sections are skipped, never fatal. */

export interface LabelSet {
  /** obs column name, e.g. "louvain" */
  name: string;
  /** category names as strings (always strings, even if stored as numbers) */
  categories: string[];
  /** per-cell index into categories; -1 = missing */
  codes: Int32Array;
}

export interface Embedding {
  /** obsm key, e.g. "X_umap" */
  name: string;
  /** interleaved [x0,y0,x1,y1,...] - first two dims only */
  xy: Float32Array;
}

export interface SparseMatrix {
  format: "csr" | "csc";
  nRows: number;
  nCols: number;
  data: Float32Array;
  indices: Int32Array;
  indptr: Int32Array;
}

export interface DenseMatrix {
  format: "dense";
  nRows: number;
  nCols: number;
  /** row-major, length nRows*nCols */
  data: Float32Array;
}

export type ExpressionMatrix = SparseMatrix | DenseMatrix;

export interface Dataset {
  nCells: number;
  nGenes: number;
  geneNames: string[];
  cellIds: string[];
  labels: LabelSet[];
  embeddings: Embedding[];
  /** null when X is absent or unreadable */
  X: ExpressionMatrix | null;
  /** non-fatal problems encountered while parsing, for display */
  warnings: string[];
}

/** What the worker sends back to the UI: everything except X (which stays in the worker). */
export type DatasetMeta = Omit<Dataset, "X"> & { hasX: boolean };

export function summarize(d: DatasetMeta): string {
  const labels = d.labels.map((l) => `${l.name}(${l.categories.length})`).join(", ");
  const embs = d.embeddings.map((e) => e.name).join(", ");
  return (
    `${d.nCells} cells x ${d.nGenes} genes, ` +
    `${d.labels.length} label columns [${labels}], ` +
    `${d.embeddings.length} embeddings [${embs}], X: ${d.hasX ? "yes" : "no"}`
  );
}
