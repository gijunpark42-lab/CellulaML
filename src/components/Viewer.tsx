"use client";

import { useEffect, useMemo, useState } from "react";
import type { DatasetMeta } from "../lib/h5ad/types";
import type { MarkerResult } from "../lib/stats/markers";
import { colorsFromScalar, scalarScale, type ScalarScale } from "../lib/viewer/colormap";
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
  fetchGene: (index: number) => Promise<Float32Array>;
  fetchMarkers: (selected: Uint32Array) => Promise<MarkerResult>;
  onReset: () => void;
}

export default function Viewer({ meta, fileName, fetchGene, fetchMarkers, onReset }: Props) {
  const [embName, setEmbName] = useState(() => pickDefault(meta.embeddings.map((e) => e.name)));
  const [labelName, setLabelName] = useState(() => meta.labels[0]?.name ?? "");
  const [gene, setGene] = useState<string | null>(null);
  const [fetched, setFetched] = useState<{ name: string; values: Float32Array; scale: ScalarScale } | null>(null);
  // only use the fetched column while it matches the selected gene (stale data is ignored, not cleared)
  const geneData = gene && fetched?.name === gene ? fetched : null;

  const [lasso, setLasso] = useState(false);
  const [selected, setSelected] = useState<Uint32Array | null>(null);
  const [markers, setMarkers] = useState<{ key: Uint32Array; result: MarkerResult } | null>(null);

  const emb = meta.embeddings.find((e) => e.name === embName) ?? meta.embeddings[0];
  const label = meta.labels.find((l) => l.name === labelName) ?? null;

  // markers for the current selection (stale results are ignored via the key check)
  useEffect(() => {
    if (!selected || selected.length === 0) return;
    let cancelled = false;
    fetchMarkers(selected).then((result) => {
      if (!cancelled) setMarkers({ key: selected, result });
    });
    return () => {
      cancelled = true;
    };
  }, [selected, fetchMarkers]);
  const markerResult = selected && markers?.key === selected ? markers.result : null;
  const computing = !!selected && selected.length > 0 && markerResult === null;

  useEffect(() => {
    if (!lasso) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLasso(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lasso]);

  const onLasso = (idx: Uint32Array) => {
    setSelected(idx.length > 0 ? idx : null);
    setLasso(false);
  };

  // fetch the gene column from the worker whenever the selected gene changes
  useEffect(() => {
    if (!gene) return;
    let cancelled = false;
    const index = meta.geneNames.indexOf(gene);
    fetchGene(index).then((values) => {
      if (cancelled || values.length !== meta.nCells) return;
      setFetched({ name: gene, values, scale: scalarScale(values) });
    });
    return () => {
      cancelled = true;
    };
  }, [gene, meta.geneNames, meta.nCells, fetchGene]);

  const rgb = useMemo(() => {
    let base: Float32Array;
    if (geneData) base = colorsFromScalar(geneData.values, geneData.scale);
    else if (label) base = colorsFromCodes(label.codes, label.categories.length);
    else base = colorsFromCodes(new Int32Array(meta.nCells), 1); // single color
    if (!selected || selected.length === 0) return base;
    // dim everything outside the selection
    const out = new Float32Array(base.length);
    for (let i = 0; i < base.length; i++) out[i] = base[i] * 0.18;
    for (const i of selected) {
      out[3 * i] = base[3 * i];
      out[3 * i + 1] = base[3 * i + 1];
      out[3 * i + 2] = base[3 * i + 2];
    }
    return out;
  }, [geneData, label, meta.nCells, selected]);

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
        <ScatterView xy={emb.xy} rgb={rgb} fitKey={emb.name} lasso={lasso} onLasso={onLasso} />
        <button
          type="button"
          onClick={() => setLasso((v) => !v)}
          className={`absolute left-3 top-3 rounded px-3 py-1 text-xs ${
            lasso ? "bg-emerald-400 text-zinc-900" : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
          }`}
        >
          {lasso ? "lasso: on (Esc)" : "lasso select"}
        </button>
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
        onLabel={(name) => {
          setLabelName(name);
          setGene(null);
        }}
        gene={gene}
        onGene={setGene}
        geneScale={geneData?.scale ?? null}
        nSelected={selected?.length ?? 0}
        onClearSelection={() => setSelected(null)}
        markers={markerResult}
        computing={computing}
        legend={label && !geneData ? label.categories.map((cat, i) => ({ name: cat, color: categoryColor(i), count: counts[i] })) : []}
        onReset={onReset}
      />
    </div>
  );
}
