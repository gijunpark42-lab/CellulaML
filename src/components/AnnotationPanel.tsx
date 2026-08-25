"use client";

import type { AnnotationResult } from "../lib/annotate/model";
import { categoryColor } from "../lib/viewer/palette";

interface Props {
  /** label set used as clusters */
  clusterName: string;
  clusterCategories: string[];
  state: { kind: "idle" } | { kind: "running" } | { kind: "error"; message: string } | { kind: "done"; result: AnnotationResult };
  colorByPrediction: boolean;
  onRun: () => void;
  onToggleColor: () => void;
  onFocusCluster: (code: number | null) => void;
  focused: number | null;
}

export default function AnnotationPanel(p: Props) {
  const { state } = p;
  return (
    <div className="flex flex-col gap-2">
      {state.kind !== "done" && (
        <button
          type="button"
          disabled={state.kind === "running"}
          onClick={p.onRun}
          className="rounded bg-emerald-500 px-3 py-1.5 text-xs font-medium text-zinc-900 hover:bg-emerald-400 disabled:opacity-50"
        >
          {state.kind === "running" ? "annotating…" : `annotate ${p.clusterName} clusters (PBMC reference)`}
        </button>
      )}
      {state.kind === "error" && (
        <p className="rounded border border-red-900 bg-red-950/40 p-2 text-xs text-red-300">{state.message}</p>
      )}
      {state.kind === "done" && <Results {...p} result={state.result} />}
    </div>
  );
}

function Results(p: Props & { result: AnnotationResult }) {
  const r = p.result;
  const called = r.clusters.filter((c) => !c.abstain).length;
  return (
    <>
      <p className="text-xs text-zinc-500">
        {called} of {r.clusters.length} clusters called, {r.clusters.length - called} abstained · {r.genesMatched} model genes matched · from{" "}
        {r.source} ({r.inputKind})
      </p>
      {r.warnings.map((w) => (
        <p key={w} className="text-xs text-amber-300/80">{w}</p>
      ))}
      <label className="flex items-center gap-2 text-xs text-zinc-300">
        <input type="checkbox" checked={p.colorByPrediction} onChange={p.onToggleColor} />
        color cells by predicted type
      </label>
      <ul className="flex flex-col gap-1.5">
        {r.clusters.map((c) => {
          const name = p.clusterCategories[c.code] ?? String(c.code);
          const focused = p.focused === c.code;
          const runnerUp = [...c.probs.keys()].filter((k) => k !== c.best).sort((a, b) => c.probs[b] - c.probs[a])[0];
          return (
            <li key={c.code}>
              <button
                type="button"
                onClick={() => p.onFocusCluster(focused ? null : c.code)}
                className={`w-full rounded border p-2 text-left text-xs ${
                  focused ? "border-emerald-500 bg-zinc-800" : "border-zinc-800 bg-zinc-900 hover:border-zinc-600"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: categoryColor(c.code) }} />
                  <span className="truncate text-zinc-400" title={name}>{name}</span>
                  <span className="ml-auto shrink-0 text-zinc-600">{c.nCells} cells</span>
                </div>
                {c.abstain ? (
                  <div className="mt-1 text-amber-300">
                    unsure — {r.classes[c.best]} {c.probs[c.best].toFixed(2)}
                    {runnerUp !== undefined && ` / ${r.classes[runnerUp]} ${c.probs[runnerUp].toFixed(2)}`}
                  </div>
                ) : (
                  <div className="mt-1 text-zinc-100">
                    <span className="font-medium">{r.classes[c.best]}</span>
                    <span className="ml-2 tabular-nums text-emerald-300">{c.confidence.toFixed(2)}</span>
                  </div>
                )}
                <div className="mt-0.5 text-zinc-500">evidence: {c.evidence.join(", ")}</div>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
