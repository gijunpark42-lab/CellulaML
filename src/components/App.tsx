"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { summarize, type DatasetMeta } from "../lib/h5ad/types";
import type { MarkerResult } from "../lib/stats/markers";
import type { AnnotationResult } from "../lib/annotate/model";
import type { WorkerRequest, WorkerResponse } from "../workers/parser.worker";
import DropZone from "./DropZone";
import Viewer from "./Viewer";

/** Above this we refuse: the whole file must fit in browser memory twice (bytes + parsed arrays). */
const MAX_BYTES = 1.5 * 1024 ** 3;
/** Above this we still load, but warn that it may take a while. */
const WARN_BYTES = 300 * 1024 ** 2;

export type Status =
  | { kind: "idle" }
  | { kind: "loading"; name: string; note: string }
  | { kind: "loaded"; name: string; meta: DatasetMeta; ms: number }
  | { kind: "error"; name: string; message: string };

export default function App() {
  const workerRef = useRef<Worker | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const geneReq = useRef(0);
  const geneResolvers = useRef(new Map<number, (v: Float32Array) => void>());
  const markerResolvers = useRef(new Map<number, (r: MarkerResult) => void>());
  const annotResolvers = useRef(new Map<number, (r: AnnotationResult | null, err?: string) => void>());

  const spawnRef = useRef<() => void>(() => {});
  /** (Re)create the parser worker. Called on mount and after a worker crash. */
  const spawnWorker = useCallback(() => {
    workerRef.current?.terminate();
    const w = new Worker(new URL("../workers/parser.worker.ts", import.meta.url));
    w.onerror = (e) => {
      console.error("[cellulaML] worker crashed, restarting:", e.message);
      setStatus({ kind: "error", name: "parser", message: `internal error (${e.message}); please reopen the file` });
      geneResolvers.current.clear();
      markerResolvers.current.clear();
      annotResolvers.current.clear();
      spawnRef.current();
    };
    workerRef.current = w;
    return w;
  }, []);

  spawnRef.current = spawnWorker;

  useEffect(() => {
    spawnWorker();
    return () => workerRef.current?.terminate();
  }, [spawnWorker]);

  const load = useCallback(async (file: File) => {
    const w = workerRef.current;
    if (!w) return;
    const mb = file.size / 1024 ** 2;
    if (file.size > MAX_BYTES) {
      setStatus({
        kind: "error",
        name: file.name,
        message: `${mb.toFixed(0)} MB is too large to open in a browser tab (limit ${(MAX_BYTES / 1024 ** 3).toFixed(1)} GB). Subset the file first, e.g. adata[:, adata.var.highly_variable].write("small.h5ad").`,
      });
      return;
    }
    const big = file.size > WARN_BYTES ? " - large file, this may take a minute" : "";
    setStatus({ kind: "loading", name: file.name, note: `reading ${mb.toFixed(1)} MB${big}` });
    let buffer: ArrayBuffer;
    try {
      buffer = await file.arrayBuffer();
    } catch (err) {
      setStatus({ kind: "error", name: file.name, message: `could not read file: ${String(err)}` });
      return;
    }
    setStatus({ kind: "loading", name: file.name, note: `parsing${big}` });
    w.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const r = ev.data;
      if (r.type === "gene") {
        geneResolvers.current.get(r.requestId)?.(r.values);
        geneResolvers.current.delete(r.requestId);
        return;
      }
      if (r.type === "annotate") {
        console.log(`[cellulaML] annotate: ${r.result ? `${r.result.clusters.length} clusters, ${r.result.genesMatched} genes matched` : r.error}, ${r.ms.toFixed(0)} ms`);
        annotResolvers.current.get(r.requestId)?.(r.result, r.error);
        annotResolvers.current.delete(r.requestId);
        return;
      }
      if (r.type === "markers") {
        console.log(`[cellulaML] markers: ${r.result.nSelected} cells, ${r.result.nTested} genes, ${r.ms.toFixed(0)} ms`);
        markerResolvers.current.get(r.requestId)?.(r.result);
        markerResolvers.current.delete(r.requestId);
        return;
      }
      if (r.type === "loaded") {
        console.log(`[cellulaML] ${file.name}: ${summarize(r.meta)} (${r.ms.toFixed(0)} ms)`);
        if (r.meta.warnings.length) console.warn("[cellulaML] warnings:", r.meta.warnings);
        setStatus({ kind: "loaded", name: file.name, meta: r.meta, ms: r.ms });
      } else {
        console.error(`[cellulaML] ${file.name}: ${r.message}`);
        setStatus({ kind: "error", name: file.name, message: r.message });
      }
    };
    const req: WorkerRequest = { type: "load", buffer, name: file.name };
    w.postMessage(req, [buffer]);
  }, []);

  /** Ask the worker for one gene column. Resolves to zeros if anything goes wrong. */
  const fetchGene = useCallback((index: number) => {
    return new Promise<Float32Array>((resolve) => {
      const w = workerRef.current;
      if (!w) return resolve(new Float32Array(0));
      const requestId = ++geneReq.current;
      geneResolvers.current.set(requestId, resolve);
      const req: WorkerRequest = { type: "gene", index, requestId };
      w.postMessage(req);
    });
  }, []);

  const fetchMarkers = useCallback((selected: Uint32Array) => {
    return new Promise<MarkerResult>((resolve) => {
      const w = workerRef.current;
      if (!w) return resolve({ nSelected: 0, nTested: 0, up: [] });
      const requestId = ++geneReq.current;
      markerResolvers.current.set(requestId, resolve);
      const req: WorkerRequest = { type: "markers", selected, requestId };
      w.postMessage(req);
    });
  }, []);

  const fetchAnnotation = useCallback((modelUrl: string, codes: Int32Array, nCats: number) => {
    return new Promise<AnnotationResult>((resolve, reject) => {
      const w = workerRef.current;
      if (!w) return reject(new Error("worker not ready"));
      const requestId = ++geneReq.current;
      annotResolvers.current.set(requestId, (r, err) => (r ? resolve(r) : reject(new Error(err ?? "annotation failed"))));
      const req: WorkerRequest = { type: "annotate", modelUrl, codes: codes.slice(), nCats, requestId };
      w.postMessage(req);
    });
  }, []);

  const loadDemo = useCallback(async () => {
    const res = await fetch("/demo/pbmc3k_small.h5ad");
    const blob = await res.blob();
    void load(new File([blob], "pbmc3k_small.h5ad"));
  }, [load]);

  if (status.kind === "loaded") {
    return (
      <Viewer
        meta={status.meta}
        fileName={status.name}
        fetchGene={fetchGene}
        fetchMarkers={fetchMarkers}
        fetchAnnotation={fetchAnnotation}
        onReset={() => setStatus({ kind: "idle" })}
      />
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-semibold tracking-tight">cellulaML</h1>
      <p className="max-w-md text-center text-zinc-400">
        Drop an <code>.h5ad</code> file to view your single-cell analysis instantly. No questions,
        no server — everything runs in your browser.
      </p>
      <DropZone status={status} onFile={load} onDemo={loadDemo} />
      <p className="text-xs text-zinc-600">
        Annotation model: PBMC reference v2 (8 cell types){" "}
        <Link href="/models" className="underline underline-offset-2 hover:text-zinc-400">
          model cards: training data, validation, tests
        </Link>
      </p>
    </main>
  );
}
