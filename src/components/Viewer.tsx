"use client";

import { useEffect, useMemo, useState } from "react";
import type { DatasetMeta } from "../lib/h5ad/types";
import type { MarkerResult } from "../lib/stats/markers";
import type { AnnotationResult } from "../lib/annotate/model";
import {
  colorsFromScalar,
  scalarScale,
  type ScalarScale,
} from "../lib/viewer/colormap";
import { categoryColor, colorsFromCodes } from "../lib/viewer/palette";
import ErrorBoundary from "./ErrorBoundary";
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
  fetchAnnotation: (modelUrl: string, codes: Int32Array, nCats: number) => Promise<AnnotationResult>;
  onReset: () => void;
}

const MODEL_URL = "/models/pbmc_v2.json";

type AnnotState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "error"; message: string }
  | { kind: "done"; result: AnnotationResult };

export default function Viewer({
  meta,
  fileName,
  fetchGene,
  fetchMarkers,
  fetchAnnotation,
  onReset,
}: Props) {
  const [embName, setEmbName] = useState(() =>
    pickDefault(meta.embeddings.map((e) => e.name)),
  );
  const [labelName, setLabelName] = useState(() => meta.labels[0]?.name ?? "");
  const [gene, setGene] = useState<string | null>(null);
  const [fetched, setFetched] = useState<{
    name: string;
    values: Float32Array;
    scale: ScalarScale;
  } | null>(null);
  // only use the fetched column while it matches the selected gene (stale data is ignored, not cleared)
  const geneData = gene && fetched?.name === gene ? fetched : null;

  const [annot, setAnnot] = useState<{ labelName: string; state: AnnotState }>({ labelName: "", state: { kind: "idle" } });
  const [colorByPred, setColorByPred] = useState(false);
  const [focusCluster, setFocusCluster] = useState<number | null>(null);
  const [lasso, setLasso] = useState(false);
  const [selected, setSelected] = useState<Uint32Array | null>(null);
  const [markers, setMarkers] = useState<{
    key: Uint32Array;
    result: MarkerResult;
  } | null>(null);

  const emb =
    meta.embeddings.find((e) => e.name === embName) ?? meta.embeddings[0];
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
  const markerResult =
    selected && markers?.key === selected ? markers.result : null;
  const computing = !!selected && selected.length > 0 && markerResult === null;

  useEffect(() => {
    if (!lasso) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLasso(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lasso]);

  // annotation belongs to one label set; switching label sets resets it
  const annotState: AnnotState = annot.labelName === labelName ? annot.state : { kind: "idle" };
  const annotation = annotState.kind === "done" ? annotState.result : null;
  const runAnnotation = () => {
    if (!label) return;
    const name = label.name;
    setAnnot({ labelName: name, state: { kind: "running" } });
    fetchAnnotation(MODEL_URL, label.codes, label.categories.length)
      .then((result) => {
        setAnnot({ labelName: name, state: { kind: "done", result } });
        setColorByPred(true);
      })
      .catch((err: Error) => setAnnot({ labelName: name, state: { kind: "error", message: err.message } }));
  };

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
    else if (label)
      base = colorsFromCodes(label.codes, label.categories.length);
    else base = colorsFromCodes(new Int32Array(meta.nCells), 1); // single color
    if (focusCluster !== null && label && !selected) {
      const out = new Float32Array(base.length);
      for (let i = 0; i < label.codes.length; i++) {
        const f = label.codes[i] === focusCluster ? 1 : 0.15;
        out[3 * i] = base[3 * i] * f;
        out[3 * i + 1] = base[3 * i + 1] * f;
        out[3 * i + 2] = base[3 * i + 2] * f;
      }
      return out;
    }
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
  }, [geneData, label, meta.nCells, selected, annotation, colorByPred, focusCluster]);

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
        <ErrorBoundary name="Scatter plot" className="m-4">
          <ScatterView
            xy={emb.xy}
            rgb={rgb}
            fitKey={emb.name}
            lasso={lasso}
            onLasso={onLasso}
          />
        </ErrorBoundary>
        <p className="pointer-events-none absolute bottom-2 left-3 text-xs text-zinc-600">
          drag to pan · wheel to zoom · double-click to reset
        </p>
      </div>
      <ErrorBoundary name="Side panel" className="m-4 w-64 self-start">
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
          lasso={lasso}
          onToggleLasso={() => setLasso((v) => !v)}
          nSelected={selected?.length ?? 0}
          onClearSelection={() => setSelected(null)}
          markers={markerResult}
          computing={computing}
          legend={
            geneData
              ? []
              : annotation && colorByPred
                ? annotation.classes.map((cat, i) => ({
                    name: cat,
                    color: categoryColor(i),
                    count: annotation.pred.reduce((a, p) => a + (p === i ? 1 : 0), 0),
                  }))
                : label
                  ? label.categories.map((cat, i) => ({ name: cat, color: categoryColor(i), count: counts[i] }))
                  : []
          }
          annotation={{
            clusterName: label?.name ?? "",
            clusterCategories: label?.categories ?? [],
            state: annotState,
            colorByPrediction: colorByPred,
            onRun: runAnnotation,
            onToggleColor: () => setColorByPred((v) => !v),
            onFocusCluster: setFocusCluster,
            focused: focusCluster,
          }}
          onReset={onReset}
        />
      </ErrorBoundary>
    </div>
  );
}
