// Sanity check: markers of one stored label vs rest. Usage: node scripts/markers-check.mjs <file> <category>
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import h5wasm from "h5wasm/node";
import { parseH5ad } from "../src/lib/h5ad/parse.ts";
import { computeMarkers } from "../src/lib/stats/markers.ts";

const [path, category = "B cells"] = process.argv.slice(2);
const { FS } = await h5wasm.ready;
const tmp = join(tmpdir(), "cellulaml-check.h5ad");
FS.writeFile(tmp, new Uint8Array(readFileSync(path)));
const f = new h5wasm.File(tmp, "r");
const d = parseH5ad(f);
const label = d.labels[0];
const code = label.categories.indexOf(category);
const sel = Uint32Array.from(label.codes.map((c, i) => (c === code ? i : -1)).filter((i) => i >= 0));
const t0 = performance.now();
const r = computeMarkers(d, sel, 10);
console.log(`${category}: ${r.nSelected} cells, ${r.nTested} genes, ${(performance.now() - t0).toFixed(0)} ms`);
for (const m of r.up) console.log(m.gene.padEnd(10), "z", m.z.toFixed(1), "logFC", m.logFC.toFixed(2), "pct", m.pctIn.toFixed(2), m.pctOut.toFixed(2), "q", m.q.toExponential(1));
f.close();
