import type { Group, Dataset as H5Dataset, Entity } from "h5wasm";
import type { Dataset, LabelSet, Embedding, ExpressionMatrix, RawMatrix } from "./types";

/** Max distinct categories for an obs column to count as a label set (filters out cell-id-like columns). */
const MAX_CATEGORIES = 200;

type Warn = (s: string) => void;

// ---------- small defensive helpers ----------

function isGroup(e: Entity | null | undefined): e is Group {
  return !!e && (e as { type?: string }).type === "Group";
}
function isDataset(e: Entity | null | undefined): e is H5Dataset {
  return !!e && (e as { type?: string }).type === "Dataset";
}

function safeGet(g: Group, name: string): Entity | null {
  try {
    return g.get(name);
  } catch {
    return null;
  }
}

function readAttr(e: Group | H5Dataset, name: string): unknown {
  try {
    const a = e.attrs[name];
    return a ? a.value : undefined;
  } catch {
    return undefined;
  }
}

/** Coerce any array-ish value to string[] (numbers, bigints, bytes: everything becomes a string). */
function toStrings(v: unknown): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map((x) => String(x));
  if (ArrayBuffer.isView(v)) return Array.from(v as unknown as ArrayLike<unknown>, (x) => String(x));
  return [String(v)];
}

function toFloat32(v: unknown): Float32Array | null {
  if (v instanceof Float32Array) return v;
  if (ArrayBuffer.isView(v)) return Float32Array.from(v as unknown as ArrayLike<number>, Number);
  if (Array.isArray(v)) return Float32Array.from(v as unknown[], Number);
  return null;
}

function toInt32(v: unknown): Int32Array | null {
  if (v instanceof Int32Array) return v;
  if (ArrayBuffer.isView(v)) return Int32Array.from(v as unknown as ArrayLike<number>, Number);
  if (Array.isArray(v)) return Int32Array.from(v as unknown[], Number);
  return null;
}

/** Is this HDF5 dtype a float type? (h5wasm dtypes look like "<f", "<d", "<q", "S", "A16", ...) */
function isFloatDtype(dtype: unknown): boolean {
  const s = String(dtype);
  return s.includes("f") || s.includes("d");
}

// ---------- dataframe abstraction (obs / var) ----------

type Column =
  | { kind: "categorical"; categories: string[]; codes: Int32Array }
  | { kind: "values"; values: unknown; dtype: string };

interface Table {
  index: string[];
  columns: Map<string, Column>;
}

/** Read an anndata >= 0.7 dataframe stored as a Group. */
function readTableGroup(g: Group, warn: Warn, label: string): Table {
  const columns = new Map<string, Column>();
  const idxName = readAttr(g, "_index");
  const indexKey = typeof idxName === "string" ? idxName : "_index";
  let index: string[] = [];
  const legacyCats = safeGet(g, "__categories");

  for (const name of g.keys()) {
    if (name === "__categories") continue;
    try {
      const e = safeGet(g, name);
      let col: Column | null = null;

      if (isGroup(e)) {
        const enc = String(readAttr(e, "encoding-type") ?? "");
        const codesE = safeGet(e, "codes");
        const catsE = safeGet(e, "categories");
        const valuesE = safeGet(e, "values");
        if (isDataset(codesE) && isDataset(catsE)) {
          const codes = toInt32(codesE.value);
          if (codes) col = { kind: "categorical", categories: toStrings(catsE.value), codes };
        } else if (isDataset(valuesE)) {
          // nullable-string-array / nullable-integer / nullable-boolean: values (+ mask)
          col = { kind: "values", values: valuesE.value, dtype: String(valuesE.dtype) };
        } else {
          warn(`${label}/${name}: unknown group encoding "${enc}", skipped`);
        }
      } else if (isDataset(e)) {
        // anndata < 0.8 categorical: codes dataset + __categories/<name>
        const legacyCatE = isGroup(legacyCats) ? safeGet(legacyCats, name) : null;
        if (isDataset(legacyCatE)) {
          const codes = toInt32(e.value);
          if (codes) col = { kind: "categorical", categories: toStrings(legacyCatE.value), codes };
        } else {
          col = { kind: "values", values: e.value, dtype: String(e.dtype) };
        }
      }

      if (!col) continue;
      if (name === indexKey || (index.length === 0 && (name === "_index" || name === "index"))) {
        index = col.kind === "values" ? toStrings(col.values) : col.categories.map((c) => c);
        if (name === indexKey) continue;
      }
      columns.set(name, col);
    } catch (err) {
      warn(`${label}/${name}: skipped (${String(err)})`);
    }
  }
  return { index, columns };
}

/** Read a legacy (anndata <= 0.6) dataframe stored as a compound Dataset. Rows are arrays of fields. */
function readTableCompound(ds: H5Dataset, root: Group, warn: Warn, label: string): Table {
  const columns = new Map<string, Column>();
  const dtype = ds.dtype as unknown;
  const fields: string[] = Array.isArray(dtype) ? dtype.map((f) => String((f as unknown[])[0])) : [];
  const ftypes: string[] = Array.isArray(dtype) ? dtype.map((f) => String((f as unknown[])[1])) : [];
  const rows = ds.value;
  if (!Array.isArray(rows) || fields.length === 0) return { index: [], columns };

  let index: string[] = [];
  const uns = safeGet(root, "uns");
  for (let i = 0; i < fields.length; i++) {
    const name = fields[i];
    try {
      const values = rows.map((r) => (Array.isArray(r) ? r[i] : undefined));
      if (name === "index" || (i === 0 && index.length === 0)) {
        index = toStrings(values);
        if (name === "index") continue;
      }
      // legacy categorical: integer column + uns/<name>_categories
      const catE = isGroup(uns) ? safeGet(uns, `${name}_categories`) : null;
      if (isDataset(catE) && !isFloatDtype(ftypes[i])) {
        const codes = toInt32(values);
        if (codes) {
          columns.set(name, { kind: "categorical", categories: toStrings(catE.value), codes });
          continue;
        }
      }
      columns.set(name, { kind: "values", values, dtype: ftypes[i] });
    } catch (err) {
      warn(`${label}/${name}: skipped (${String(err)})`);
    }
  }
  return { index, columns };
}

function readTable(root: Group, name: string, warn: Warn): Table | null {
  const e = safeGet(root, name);
  if (isGroup(e)) return readTableGroup(e, warn, name);
  if (isDataset(e)) return readTableCompound(e, root, warn, name);
  return null;
}

// ---------- labels from obs columns ----------

function columnToLabel(name: string, col: Column, nCells: number): LabelSet | null {
  if (col.kind === "categorical") {
    if (col.codes.length !== nCells) return null;
    if (col.categories.length === 0 || col.categories.length > MAX_CATEGORIES) return null;
    return { name, categories: col.categories, codes: col.codes };
  }
  if (isFloatDtype(col.dtype)) return null; // continuous covariate, not a label
  const values = toStrings(col.values);
  if (values.length !== nCells) return null;
  const uniq = new Map<string, number>();
  for (const v of values) {
    if (!uniq.has(v)) {
      if (uniq.size >= MAX_CATEGORIES) return null;
      uniq.set(v, uniq.size);
    }
  }
  if (uniq.size < 2) return null;
  const codes = new Int32Array(nCells);
  for (let i = 0; i < nCells; i++) codes[i] = uniq.get(values[i])!;
  return { name, categories: Array.from(uniq.keys()), codes };
}

// ---------- obsm ----------

function readEmbeddings(root: Group, nCells: number, warn: Warn): Embedding[] {
  const obsm = safeGet(root, "obsm");
  const out: Embedding[] = [];

  if (isGroup(obsm)) {
    for (const name of obsm.keys()) {
      try {
        const e = safeGet(obsm, name);
        if (!isDataset(e)) continue;
        const shape = e.shape;
        if (!shape || shape.length !== 2 || shape[0] !== nCells || shape[1] < 2) continue;
        const flat = toFloat32(e.value);
        if (!flat) continue;
        const d = shape[1];
        const xy = new Float32Array(nCells * 2);
        for (let i = 0; i < nCells; i++) {
          xy[2 * i] = flat[i * d];
          xy[2 * i + 1] = flat[i * d + 1];
        }
        out.push({ name, xy });
      } catch (err) {
        warn(`obsm/${name}: skipped (${String(err)})`);
      }
    }
    return out;
  }

  // legacy: compound dataset, one row per cell, each field an array of coordinates
  if (isDataset(obsm)) {
    try {
      const dtype = obsm.dtype as unknown;
      const rows = obsm.value;
      if (!Array.isArray(dtype) || !Array.isArray(rows) || rows.length !== nCells) return out;
      dtype.forEach((f, i) => {
        const name = String((f as unknown[])[0]);
        const xy = new Float32Array(nCells * 2);
        for (let r = 0; r < nCells; r++) {
          const row = rows[r];
          const v = Array.isArray(row) ? row[i] : undefined;
          const arr = ArrayBuffer.isView(v) || Array.isArray(v) ? (v as ArrayLike<number>) : null;
          if (!arr || arr.length < 2) return; // skip this field entirely
          xy[2 * r] = Number(arr[0]);
          xy[2 * r + 1] = Number(arr[1]);
        }
        out.push({ name, xy });
      });
    } catch (err) {
      warn(`obsm: skipped (${String(err)})`);
    }
  }
  return out;
}

// ---------- X ----------

function readX(root: Group, nCells: number, nGenes: number, warn: Warn, key = "X"): ExpressionMatrix | null {
  const x = safeGet(root, key);
  try {
    if (isDataset(x)) {
      const shape = x.shape;
      if (!shape || shape.length !== 2) return null;
      const data = toFloat32(x.value);
      if (!data || data.length !== shape[0] * shape[1]) return null;
      return { format: "dense", nRows: shape[0], nCols: shape[1], data };
    }
    if (isGroup(x)) {
      const enc = String(readAttr(x, "encoding-type") ?? readAttr(x, "h5sparse_format") ?? "");
      const format: "csr" | "csc" | null = enc.startsWith("csr")
        ? "csr"
        : enc.startsWith("csc")
          ? "csc"
          : null;
      const shapeAttr = readAttr(x, "shape") ?? readAttr(x, "h5sparse_shape");
      const shape = ArrayBuffer.isView(shapeAttr)
        ? Array.from(shapeAttr as unknown as ArrayLike<number>, Number)
        : Array.isArray(shapeAttr)
          ? shapeAttr.map(Number)
          : [nCells, nGenes];
      const dE = safeGet(x, "data");
      const iE = safeGet(x, "indices");
      const pE = safeGet(x, "indptr");
      if (!isDataset(dE) || !isDataset(iE) || !isDataset(pE)) return null;
      const data = toFloat32(dE.value);
      const indices = toInt32(iE.value);
      const indptr = toInt32(pE.value);
      if (!data || !indices || !indptr) return null;
      // infer format from indptr length when the attribute is missing
      const fmt = format ?? (indptr.length === shape[0] + 1 ? "csr" : "csc");
      return { format: fmt, nRows: shape[0], nCols: shape[1], data, indices, indptr };
    }
  } catch (err) {
    warn(`${key}: unreadable (${String(err)})`);
  }
  return null;
}

/** .raw: modern files store a group "raw" (X, var); legacy files store "raw.X" and "raw.var" at the root. */
function readRaw(root: Group, nCells: number, warn: Warn): RawMatrix | null {
  try {
    const rawGroup = safeGet(root, "raw");
    let X: ExpressionMatrix | null = null;
    let geneNames: string[] = [];
    if (isGroup(rawGroup)) {
      const table = readTable(rawGroup, "var", warn);
      geneNames = table?.index ?? [];
      X = readX(rawGroup, nCells, geneNames.length, warn);
    } else if (safeGet(root, "raw.X")) {
      const table = readTable(root, "raw.var", warn);
      geneNames = table?.index ?? [];
      X = readX(root, nCells, geneNames.length, warn, "raw.X");
    }
    if (!X) return null;
    if (X.nRows !== nCells) {
      warn(`raw: ${X.nRows} rows but ${nCells} cells, ignored`);
      return null;
    }
    if (geneNames.length !== X.nCols) {
      warn(`raw: ${geneNames.length} gene names for ${X.nCols} columns, ignored`);
      return null;
    }
    return { X, geneNames };
  } catch (err) {
    warn(`raw: skipped (${String(err)})`);
    return null;
  }
}

// ---------- entry point ----------

export function parseH5ad(root: Group): Dataset {
  const warnings: string[] = [];
  const warn: Warn = (s) => warnings.push(s);

  const obs = readTable(root, "obs", warn);
  const vars = readTable(root, "var", warn);
  if (!obs) throw new Error("not an AnnData file: missing obs");
  if (!vars) throw new Error("not an AnnData file: missing var");

  let nCells = obs.index.length;
  let nGenes = vars.index.length;

  const X = readX(root, nCells, nGenes, warn);
  if (X) {
    if (nCells === 0) nCells = X.nRows;
    if (nGenes === 0) nGenes = X.nCols;
    if (X.nRows !== nCells || X.nCols !== nGenes) {
      warn(`X shape ${X.nRows}x${X.nCols} disagrees with obs/var (${nCells}x${nGenes})`);
    }
  }
  if (nCells === 0) throw new Error("could not determine number of cells");

  const cellIds =
    obs.index.length === nCells ? obs.index : Array.from({ length: nCells }, (_, i) => String(i));
  const geneNames =
    vars.index.length === nGenes ? vars.index : Array.from({ length: nGenes }, (_, i) => `gene_${i}`);

  const labels: LabelSet[] = [];
  for (const [name, col] of obs.columns) {
    if (name.startsWith("_")) continue;
    try {
      const l = columnToLabel(name, col, nCells);
      if (l) labels.push(l);
    } catch (err) {
      warn(`obs/${name}: skipped (${String(err)})`);
    }
  }

  const embeddings = readEmbeddings(root, nCells, warn);
  const raw = readRaw(root, nCells, warn);

  return { nCells, nGenes, geneNames, cellIds, labels, embeddings, X, raw, warnings };
}
