"use client";

import { useState } from "react";
import type { Status } from "./App";

interface Props {
  status: Status;
  onFile: (f: File) => void;
  onDemo: () => void;
}

export default function DropZone({ status, onFile, onDemo }: Props) {
  const [over, setOver] = useState(false);

  return (
    <div className="flex w-full max-w-xl flex-col gap-3">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files[0];
          if (f) onFile(f);
        }}
        className={`flex h-40 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed text-center transition-colors ${
          over
            ? "border-emerald-400 bg-emerald-950/30 text-emerald-200"
            : "border-zinc-700 text-zinc-500"
        }`}
      >
        <input
          type="file"
          accept=".h5ad"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
        Drop an .h5ad file here, or click to choose
      </label>

      <button
        type="button"
        onClick={onDemo}
        className="self-center text-sm text-zinc-500 underline underline-offset-4 hover:text-zinc-300"
      >
        or try the demo (pbmc3k, 6.4 MB)
      </button>

      {status.kind === "loading" && (
        <p className="text-center text-sm text-zinc-400">Reading {status.name}…</p>
      )}
      {status.kind === "error" && (
        <p className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
          Could not read {status.name}: {status.message}
        </p>
      )}
    </div>
  );
}
