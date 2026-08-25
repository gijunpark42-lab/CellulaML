// External validation: annotate a file with the reference model and compare with its stored labels.
// Usage: node scripts/annotate-check.mjs <file.h5ad> [labelColumn]
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import h5wasm from "h5wasm/node";
import { parseH5ad } from "../src/lib/h5ad/parse.ts";
import { annotate } from "../src/lib/annotate/model.ts";

const [path, labelName, modelPath = "public/models/pbmc_v2.json"] = process.argv.slice(2);
const model = JSON.parse(readFileSync(resolve(modelPath), "utf8"));
const { FS } = await h5wasm.ready;
const tmp = join(tmpdir(), "cellulaml-annot.h5ad");
FS.writeFile(tmp, new Uint8Array(readFileSync(path)));
const f = new h5wasm.File(tmp, "r");
const d = parseH5ad(f);
const label = d.labels.find((l) => l.name === labelName) ?? d.labels[0];
const t0 = performance.now();
const r = annotate(d, model, label.codes, label.categories.length);
console.log(`${path}: ${d.nCells} cells, source=${r.source} (${r.inputKind}), genes matched ${r.genesMatched}/${model.genes.length}, ${(performance.now() - t0).toFixed(0)} ms`);
if (r.warnings.length) console.log("warnings:", r.warnings);

let ok = 0, accepted = 0, okAccepted = 0;
for (let i = 0; i < d.nCells; i++) {
  const truth = label.categories[label.codes[i]];
  const hit = r.classes[r.pred[i]] === truth;
  ok += hit ? 1 : 0;
  if (r.conf[i] >= model.abstain_below) {
    accepted++;
    okAccepted += hit ? 1 : 0;
  }
}
console.log(`cell-level: accuracy ${(ok / d.nCells).toFixed(3)}; abstain<${model.abstain_below}: coverage ${(accepted / d.nCells).toFixed(3)}, accuracy of accepted ${(okAccepted / accepted).toFixed(3)}`);

let cOk = 0, cCalled = 0;
console.log("cluster-level:");
for (const c of r.clusters) {
  const truth = label.categories[c.code];
  const call = r.classes[c.best];
  const hit = call === truth;
  if (!c.abstain) {
    cCalled++;
    cOk += hit ? 1 : 0;
  }
  console.log(`  ${truth.padEnd(20)} n=${String(c.nCells).padStart(4)} -> ${c.abstain ? "ABSTAIN " : "        "}${call.padEnd(20)} ${c.confidence.toFixed(2)} ${hit ? "OK  " : "MISS"} evidence: ${c.evidence.join(", ")}`);
}
console.log(`cluster-level: ${cOk}/${cCalled} called correctly, ${r.clusters.length - cCalled} abstained, ${r.clusters.length} clusters`);
f.close();
