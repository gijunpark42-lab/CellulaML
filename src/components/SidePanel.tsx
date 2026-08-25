"use client";

import type { DatasetMeta } from "../lib/h5ad/types";
import type { ScalarScale } from "../lib/viewer/colormap";
import Colorbar from "./Colorbar";
import ErrorBoundary from "./ErrorBoundary";
import GeneSearch from "./GeneSearch";
import MarkerTable from "./MarkerTable";
import type { MarkerResult } from "../lib/stats/markers";

interface LegendItem {
  name: string;
  color: string;
  count: number;
}

interface Props {
  meta: DatasetMeta;
  fileName: string;
  embName: string;
  onEmb: (name: string) => void;
  labelName: string;
  onLabel: (name: string) => void;
  gene: string | null;
  onGene: (name: string | null) => void;
  geneScale: ScalarScale | null;
  lasso: boolean;
  onToggleLasso: () => void;
  nSelected: number;
  onClearSelection: () => void;
  markers: MarkerResult | null;
  computing: boolean;
  legend: LegendItem[];
  onReset: () => void;
}

const H2 = "mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500";

export default function SidePanel(p: Props) {
  const { meta } = p;
  return (
    <aside className="flex w-72 shrink-0 flex-col gap-5 overflow-y-auto border-l border-zinc-800 bg-zinc-950 p-4 text-sm">
      <div>
        <h1 className="text-lg font-semibold">cellulaML</h1>
        <p className="truncate text-zinc-400" title={p.fileName}>
          {p.fileName}
        </p>
        <p className="text-zinc-500">
          {meta.nCells.toLocaleString()} cells · {meta.nGenes.toLocaleString()} genes
        </p>
        <button
          onClick={p.onReset}
          className="mt-1 text-xs text-zinc-500 underline underline-offset-2 hover:text-zinc-300"
        >
          open another file
        </button>
      </div>

      <section>
        <h2 className={H2}>Embedding</h2>
        <div className="flex flex-wrap gap-1">
          {meta.embeddings.map((e) => (
            <button
              key={e.name}
              onClick={() => p.onEmb(e.name)}
              className={`rounded px-2 py-1 text-xs ${
                e.name === p.embName
                  ? "bg-zinc-200 text-zinc-900"
                  : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
              }`}
            >
              {e.name.replace(/^X_/, "")}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className={H2}>Color by</h2>
        {meta.labels.length === 0 ? (
          <p className="text-zinc-500">no labels stored in this file</p>
        ) : (
          <select
            value={p.labelName}
            onChange={(e) => p.onLabel(e.target.value)}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-200"
          >
            {meta.labels.map((l) => (
              <option key={l.name} value={l.name}>
                {l.name} ({l.categories.length})
              </option>
            ))}
          </select>
        )}
      </section>

      <section>
        <h2 className={H2}>Gene expression</h2>
        <ErrorBoundary name="Gene search">
          <GeneSearch geneNames={meta.geneNames} selected={p.gene} onSelect={p.onGene} />
        </ErrorBoundary>
        {p.gene && p.geneScale && (
          <div className="mt-2">
            <Colorbar scale={p.geneScale} label="expression" />
          </div>
        )}
      </section>

      <section>
        <div className="mb-1 flex items-baseline">
          <h2 className={H2}>Selection</h2>
          {p.nSelected > 0 && (
            <>
              <span className="ml-2 text-xs text-zinc-400">{p.nSelected.toLocaleString()} cells</span>
              <button
                type="button"
                onClick={p.onClearSelection}
                className="ml-auto text-xs text-zinc-500 underline underline-offset-2 hover:text-zinc-300"
              >
                clear
              </button>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={p.onToggleLasso}
          className={`flex w-full items-center justify-center gap-2 rounded px-3 py-1.5 text-xs ${
            p.lasso
              ? "bg-emerald-400 text-zinc-900"
              : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
          }`}
        >
          <LassoIcon />
          {p.lasso ? "drawing - draw around cells (Esc to cancel)" : "lasso select"}
        </button>
        {p.nSelected > 0 && (
          <>
            <p className="mb-1 mt-2 text-xs text-zinc-500">genes higher in selection vs rest (Wilcoxon)</p>
            <ErrorBoundary name="Marker table">
              <MarkerTable result={p.markers} computing={p.computing} onGene={(g) => p.onGene(g)} />
            </ErrorBoundary>
          </>
        )}
      </section>

      {p.legend.length > 0 && (
        <section>
          <h2 className={H2}>Legend</h2>
          <ul className="flex flex-col gap-1">
            {p.legend.map((it) => (
              <li key={it.name} className="flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 shrink-0 rounded-full"
                  style={{ background: it.color }}
                />
                <span className="truncate text-zinc-200" title={it.name}>
                  {it.name}
                </span>
                <span className="ml-auto text-xs text-zinc-500">{it.count}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {meta.warnings.length > 0 && (
        <section>
          <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-amber-500">Warnings</h2>
          <ul className="list-disc pl-4 text-xs text-amber-300/80">
            {meta.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}

function LassoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M7 22a5 5 0 0 1-2-4" />
      <path d="M3.3 14A6.8 6.8 0 0 1 2 10c0-4.4 4.5-8 10-8s10 3.6 10 8-4.5 8-10 8a12 12 0 0 1-5-1" />
      <path d="M5 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
    </svg>
  );
}
