"use client";

import { useMemo, useState } from "react";
import type { DatasetMeta } from "../lib/h5ad/types";
import { categoryColor, colorsFromCodes } from "../lib/viewer/palette";
import ScatterView from "./ScatterView";
import SidePanel from "./SidePanel";

const PREFERRED_EMBEDDINGS = ["X_umap", "X_tsne", "X_draw_graph_fr", "X_pca"];

function pickDefault(names: string[]): string {
  return PREFERRED_EMBEDDINGS.find((p) => names.includes(p)) ?? names[0];
}

interface Props {
  meta: DatasetMeta;
  fileName: string;
  onReset: () => void;
}

export default function Viewer({ meta, fileName, onReset }: Props) {
  const [embName, setEmbName] = useState(() => pickDefault(meta.embeddings.map((e) => e.name)));
  const [labelName, setLabelName] = useState(() => meta.labels[0]?.name ?? "");

  const emb = meta.embeddings.find((e) => e.name === embName) ?? meta.embeddings[0];
  const label = meta.labels.find((l) => l.name === labelName) ?? null;

  const rgb = useMemo(() => {
    if (label) return colorsFromCodes(label.codes, label.categories.length);
    return colorsFromCodes(new Int32Array(meta.nCells), 1); // single color
  }, [label, meta.nCells]);

  const counts = useMemo(() => {
    if (!label) return [];
    const c = new Array<number>(label.categories.length).fill(0);
    for (const code of label.codes) if (code >= 0 && code < c.length) c[code]++;
    return c;
  }, [label]);

  if (!emb) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 text-zinc-400">
        <p>{fileName} has no 2D embedding (obsm) to display.</p>
        <button onClick={onReset} className="underline">
          open another file
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen">
      <div className="relative min-w-0 flex-1">
        <ScatterView xy={emb.xy} rgb={rgb} fitKey={emb.name} />
        <p className="pointer-events-none absolute bottom-2 left-3 text-xs text-zinc-600">
          drag to pan · wheel to zoom · double-click to reset
        </p>
      </div>
      <SidePanel
        meta={meta}
        fileName={fileName}
        embName={emb.name}
        onEmb={setEmbName}
        labelName={labelName}
        onLabel={setLabelName}
        legend={label ? label.categories.map((cat, i) => ({ name: cat, color: categoryColor(i), count: counts[i] })) : []}
        onReset={onReset}
      />
    </div>
  );
}
