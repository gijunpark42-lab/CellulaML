"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { summarize, type DatasetMeta } from "../lib/h5ad/types";
import type { WorkerRequest, WorkerResponse } from "../workers/parser.worker";
import DropZone from "./DropZone";
import Viewer from "./Viewer";

export type Status =
  | { kind: "idle" }
  | { kind: "loading"; name: string }
  | { kind: "loaded"; name: string; meta: DatasetMeta; ms: number }
  | { kind: "error"; name: string; message: string };

export default function App() {
  const workerRef = useRef<Worker | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const geneReq = useRef(0);
  const geneResolvers = useRef(new Map<number, (v: Float32Array) => void>());

  useEffect(() => {
    const w = new Worker(new URL("../workers/parser.worker.ts", import.meta.url));
    workerRef.current = w;
    return () => w.terminate();
  }, []);

  const load = useCallback(async (file: File) => {
    const w = workerRef.current;
    if (!w) return;
    setStatus({ kind: "loading", name: file.name });
    const buffer = await file.arrayBuffer();
    w.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const r = ev.data;
      if (r.type === "gene") {
        geneResolvers.current.get(r.requestId)?.(r.values);
        geneResolvers.current.delete(r.requestId);
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
    </main>
  );
}
