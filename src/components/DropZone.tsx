"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { summarize, type DatasetMeta } from "../lib/h5ad/types";
import type { WorkerRequest, WorkerResponse } from "../workers/parser.worker";

type Status =
  | { kind: "idle" }
  | { kind: "loading"; name: string }
  | { kind: "loaded"; name: string; meta: DatasetMeta; ms: number }
  | { kind: "error"; name: string; message: string };

export default function DropZone() {
  const workerRef = useRef<Worker | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [over, setOver] = useState(false);

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

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files[0];
    if (f) void load(f);
  };

  const loadDemo = async () => {
    const res = await fetch("/demo/pbmc3k_small.h5ad");
    const blob = await res.blob();
    void load(new File([blob], "pbmc3k_small.h5ad"));
  };

  return (
    <div className="flex w-full max-w-xl flex-col gap-3">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={`flex h-40 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed text-center transition-colors ${
          over ? "border-emerald-400 bg-emerald-950/30 text-emerald-200" : "border-zinc-700 text-zinc-500"
        }`}
      >
        <input
          type="file"
          accept=".h5ad"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void load(f);
          }}
        />
        Drop an .h5ad file here, or click to choose
      </label>

      <button
        type="button"
        onClick={() => void loadDemo()}
        className="self-center text-sm text-zinc-500 underline underline-offset-4 hover:text-zinc-300"
      >
        or try the demo (pbmc3k, 6.4 MB)
      </button>

      <StatusView status={status} />
    </div>
  );
}

function StatusView({ status }: { status: Status }) {
  if (status.kind === "idle") return null;
  if (status.kind === "loading")
    return <p className="text-sm text-zinc-400">Reading {status.name}…</p>;
  if (status.kind === "error")
    return (
      <p className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
        Could not read {status.name}: {status.message}
      </p>
    );
  const m = status.meta;
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-sm">
      <p className="font-medium text-zinc-200">
        {status.name} — {m.nCells.toLocaleString()} cells × {m.nGenes.toLocaleString()} genes
        <span className="ml-2 text-zinc-500">({status.ms.toFixed(0)} ms)</span>
      </p>
      <p className="mt-1 text-zinc-400">
        Labels: {m.labels.length ? m.labels.map((l) => `${l.name} (${l.categories.length})`).join(", ") : "none"}
      </p>
      <p className="text-zinc-400">
        Embeddings: {m.embeddings.length ? m.embeddings.map((e) => e.name).join(", ") : "none"}
      </p>
      <p className="text-zinc-400">Expression matrix: {m.hasX ? "yes" : "no"}</p>
      {m.warnings.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-amber-300/80">
          {m.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
