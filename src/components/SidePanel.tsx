"use client";

import type { DatasetMeta } from "../lib/h5ad/types";
import type { ScalarScale } from "../lib/viewer/colormap";
import Colorbar from "./Colorbar";
import GeneSearch from "./GeneSearch";

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
        <GeneSearch geneNames={meta.geneNames} selected={p.gene} onSelect={p.onGene} />
        {p.gene && p.geneScale && (
          <div className="mt-2">
            <Colorbar scale={p.geneScale} label="expression" />
          </div>
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
