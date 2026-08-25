// Broken/odd .h5ad fixtures: the parser must never throw on a readable HDF5 file,
// and must throw a clean Error on non-AnnData input. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import h5 from "h5wasm/node";
import { parseH5ad } from "../src/lib/h5ad/parse.ts";
import { fitView } from "../src/lib/viewer/ScatterGL.ts";
import { selectInPolygon } from "../src/lib/viewer/lasso.ts";
import { rankSum, benjaminiHochberg } from "../src/lib/stats/wilcoxon.ts";

await h5.ready;
let counter = 0;
const N = 6, G = 4;

/** Build a fixture with a callback that mutates the file, then reopen it read-only and parse. */
function withFixture(build) {
  const path = join(tmpdir(), `cellulaml-fixture-${process.pid}-${counter++}.h5ad`);
  const f = new h5.File(path, "w");
  build(f);
  f.close();
  const r = new h5.File(path, "r");
  try {
    return parseH5ad(r);
  } finally {
    r.close();
  }
}

function strings(g, name, values) {
  g.create_dataset({ name, data: values, dtype: "S" });
}

/** Modern AnnData skeleton: obs/var groups with _index, dense X, one umap, one categorical label. */
function modern(f, opts = {}) {
  const obs = f.create_group("obs");
  obs.create_attribute("_index", "cell_id");
  strings(obs, "cell_id", Array.from({ length: N }, (_, i) => `cell${i}`));
  const vars = f.create_group("var");
  vars.create_attribute("_index", "gene");
  if (opts.numericGenes) vars.create_dataset({ name: "gene", data: new Int32Array([100, 101, 102, 103]) });
  else strings(vars, "gene", Array.from({ length: G }, (_, i) => `G${i}`));
  if (!opts.noX) f.create_dataset({ name: "X", data: new Float32Array(N * G).map((_, i) => i % 3), shape: [N, G] });
  if (!opts.noObsm) {
    const obsm = f.create_group("obsm");
    obsm.create_dataset({ name: "X_umap", data: new Float32Array(N * 2).map((_, i) => i), shape: [N, 2] });
  }
  if (!opts.noLabel) {
    const cat = obs.create_group("louvain");
    cat.create_attribute("encoding-type", "categorical");
    cat.create_dataset({ name: "codes", data: new Int8Array([0, 1, 0, 1, 2, -1]) });
    strings(cat, "categories", ["T", "B", "NK"]);
  }
  return { obs, vars };
}

test("modern file parses fully", () => {
  const d = withFixture((f) => modern(f));
  assert.equal(d.nCells, N);
  assert.equal(d.nGenes, G);
  assert.deepEqual(d.geneNames, ["G0", "G1", "G2", "G3"]);
  assert.equal(d.labels.length, 1);
  assert.deepEqual(d.labels[0].categories, ["T", "B", "NK"]);
  assert.equal(d.labels[0].codes[5], -1);
  assert.equal(d.embeddings.length, 1);
  assert.equal(d.X?.format, "dense");
});

test("no obsm -> zero embeddings, no throw", () => {
  const d = withFixture((f) => modern(f, { noObsm: true }));
  assert.equal(d.embeddings.length, 0);
});

test("no X -> X null, counts still from obs/var", () => {
  const d = withFixture((f) => modern(f, { noX: true }));
  assert.equal(d.X, null);
  assert.equal(d.nCells, N);
});

test("numeric categories and numeric gene names are coerced to strings", () => {
  const d = withFixture((f) => {
    const { obs } = modern(f, { noLabel: true, numericGenes: true });
    const cat = obs.create_group("cluster");
    cat.create_dataset({ name: "codes", data: new Int32Array([0, 1, 1, 0, 2, 2]) });
    cat.create_dataset({ name: "categories", data: new Int32Array([10, 20, 30]) });
  });
  const cl = d.labels.find((l) => l.name === "cluster");
  assert.deepEqual(cl.categories, ["10", "20", "30"]);
  assert.ok(d.geneNames.every((g) => typeof g === "string"));
  assert.deepEqual(d.geneNames, ["100", "101", "102", "103"]);
});

test("float obs column is not a label; small-int column is", () => {
  const d = withFixture((f) => {
    const { obs } = modern(f, { noLabel: true });
    obs.create_dataset({ name: "n_counts", data: new Float32Array([1.5, 2, 3, 4, 5, 6]) });
    obs.create_dataset({ name: "batch", data: new Int32Array([0, 0, 1, 1, 1, 0]) });
  });
  assert.equal(d.labels.find((l) => l.name === "n_counts"), undefined);
  assert.deepEqual(d.labels.find((l) => l.name === "batch").categories, ["0", "1"]);
});

test("categorical with wrong code length is skipped, not fatal", () => {
  const d = withFixture((f) => {
    const { obs } = modern(f, { noLabel: true });
    const cat = obs.create_group("bad");
    cat.create_dataset({ name: "codes", data: new Int8Array([0, 1]) });
    strings(cat, "categories", ["a", "b"]);
  });
  assert.equal(d.labels.length, 0);
});

test("csr X group is read with format", () => {
  const d = withFixture((f) => {
    modern(f, { noX: true });
    const x = f.create_group("X");
    x.create_attribute("encoding-type", "csr_matrix");
    x.create_attribute("shape", new Int32Array([N, G]));
    x.create_dataset({ name: "data", data: new Float32Array([1, 2, 3]) });
    x.create_dataset({ name: "indices", data: new Int32Array([0, 2, 1]) });
    x.create_dataset({ name: "indptr", data: new Int32Array([0, 1, 2, 3, 3, 3, 3]) });
  });
  assert.equal(d.X?.format, "csr");
  assert.equal(d.X?.nRows, N);
});

test("embedding with wrong row count or 1 column is skipped", () => {
  const d = withFixture((f) => {
    modern(f, { noObsm: true });
    const obsm = f.create_group("obsm");
    obsm.create_dataset({ name: "X_bad", data: new Float32Array(4), shape: [2, 2] });
    obsm.create_dataset({ name: "X_1d", data: new Float32Array(N), shape: [N, 1] });
    obsm.create_dataset({ name: "X_ok", data: new Float32Array(N * 3), shape: [N, 3] });
  });
  assert.deepEqual(d.embeddings.map((e) => e.name), ["X_ok"]);
});

test("missing obs -> clean Error, not a crash", () => {
  assert.throws(() => withFixture((f) => f.create_group("var")), /not an AnnData/);
});

test("unrelated HDF5 file -> clean Error", () => {
  assert.throws(() => withFixture((f) => f.create_dataset({ name: "temperature", data: new Float32Array([1, 2]) })), /not an AnnData/);
});

test("fitView ignores NaN/Infinity and empty input", () => {
  const v = fitView(new Float32Array([NaN, 1, 0, 0, Infinity, 2, 10, 10]), 100, 100);
  assert.equal(v.cx, 5);
  assert.equal(v.cy, 5);
  assert.ok(Number.isFinite(v.unitsPerPx));
  assert.deepEqual(fitView(new Float32Array(0), 100, 100), { cx: 0, cy: 0, unitsPerPx: 1 });
});

test("selectInPolygon: square selects inside points only; degenerate polygon selects none", () => {
  const xy = new Float32Array([0.5, 0.5, 2, 2, 0.1, 0.9]);
  const sq = [[0, 0], [1, 0], [1, 1], [0, 1]];
  assert.deepEqual(Array.from(selectInPolygon(xy, sq)), [0, 2]);
  assert.equal(selectInPolygon(xy, [[0, 0], [1, 1]]).length, 0);
});

test("rankSum: clear separation gives large z, tiny p; constant gene gives p=1", () => {
  const v = new Float32Array([5, 6, 7, 8, 0, 0, 1, 1]);
  const grp = new Uint8Array([1, 1, 1, 1, 0, 0, 0, 0]);
  const r = rankSum(v, grp, 4, new Uint32Array(8));
  assert.ok(r.z > 2 && r.p < 0.05);
  const c = rankSum(new Float32Array(8), grp, 4, new Uint32Array(8));
  assert.equal(c.p, 1);
  const q = benjaminiHochberg(new Float64Array([0.01, 0.04, 0.5]));
  assert.ok(q[0] <= 0.03 + 1e-12 && q[2] === 0.5);
});
