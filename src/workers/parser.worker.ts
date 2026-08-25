/// <reference lib="webworker" />
import h5wasm from "h5wasm";
import { parseH5ad } from "../lib/h5ad/parse";
import type { Dataset, DatasetMeta } from "../lib/h5ad/types";

export type WorkerRequest = { type: "load"; buffer: ArrayBuffer; name: string };
export type WorkerResponse =
  | { type: "loaded"; meta: DatasetMeta; ms: number }
  | { type: "error"; message: string };

/** The full dataset (including X) lives here; the UI only ever sees DatasetMeta. */
let current: Dataset | null = null;

function post(msg: WorkerResponse, transfer: Transferable[] = []) {
  (self as unknown as Worker).postMessage(msg, transfer);
}

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data;
  if (req.type !== "load") return;
  const t0 = performance.now();
  const path = "/current.h5ad";
  try {
    const { FS } = await h5wasm.ready;
    try {
      FS.unlink(path);
    } catch {
      /* first load */
    }
    FS.writeFile(path, new Uint8Array(req.buffer));
    let file: InstanceType<typeof h5wasm.File>;
    try {
      file = new h5wasm.File(path, "r");
    } catch {
      throw new Error("not a valid HDF5 file (is this really an .h5ad?)");
    }
    try {
      current = parseH5ad(file);
    } finally {
      file.close();
    }
    const { X, ...rest } = current;
    const meta: DatasetMeta = { ...rest, hasX: X !== null };
    // copy typed arrays so the worker keeps its own dataset intact
    const copies: Transferable[] = [];
    meta.labels = meta.labels.map((l) => {
      const codes = l.codes.slice();
      copies.push(codes.buffer);
      return { ...l, codes };
    });
    meta.embeddings = meta.embeddings.map((e) => {
      const xy = e.xy.slice();
      copies.push(xy.buffer);
      return { ...e, xy };
    });
    post({ type: "loaded", meta, ms: performance.now() - t0 }, copies);
  } catch (err) {
    current = null;
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
