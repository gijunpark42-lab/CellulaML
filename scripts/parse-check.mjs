// Node-side check of the parser against a real .h5ad. Usage: node scripts/parse-check.mjs <file>
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import h5wasm from "h5wasm/node";
import { parseH5ad } from "../src/lib/h5ad/parse.ts";
import { summarize } from "../src/lib/h5ad/types.ts";

const path = process.argv[2];
const { FS } = await h5wasm.ready;
const tmp = join(tmpdir(), "cellulaml-check.h5ad");
FS.writeFile(tmp, new Uint8Array(readFileSync(path)));
const f = new h5wasm.File(tmp, "r");
const t0 = performance.now();
const d = parseH5ad(f);
console.log(summarize({ ...d, hasX: !!d.X }), `(${(performance.now() - t0).toFixed(0)} ms)`);
if (d.X) console.log("X:", d.X.format, d.X.nRows, "x", d.X.nCols, "data.length", d.X.data.length);
console.log("genes:", d.geneNames.slice(0, 5), "cells:", d.cellIds.slice(0, 2));
for (const l of d.labels) console.log("label", l.name, l.categories.slice(0, 10));
if (d.warnings.length) console.log("warnings:", d.warnings);
f.close();
