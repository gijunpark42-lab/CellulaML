import type { MarkerResult } from "../lib/stats/markers";

interface Props {
  result: MarkerResult | null;
  computing: boolean;
  onGene: (name: string) => void;
}

const fmtQ = (q: number) => (q < 1e-3 ? q.toExponential(0) : q.toFixed(2));

export default function MarkerTable({ result, computing, onGene }: Props) {
  if (computing) return <p className="text-xs text-zinc-500">computing markers…</p>;
  if (!result) return null;
  if (result.nTested === 0)
    return <p className="text-xs text-zinc-500">no expression matrix in this file, cannot compute markers</p>;
  if (result.up.length === 0) return <p className="text-xs text-zinc-500">no genes higher in the selection</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-zinc-500">
          <tr>
            <th className="text-left font-medium">gene</th>
            <th className="text-right font-medium" title="mean(selected) - mean(rest)">logFC</th>
            <th className="text-right font-medium" title="fraction of cells expressing: selected / rest">pct</th>
            <th className="text-right font-medium" title="Wilcoxon rank-sum, BH-adjusted">q</th>
          </tr>
        </thead>
        <tbody>
          {result.up.slice(0, 25).map((m) => (
            <tr key={m.gene} className="border-t border-zinc-800/60">
              <td>
                <button
                  type="button"
                  onClick={() => onGene(m.gene)}
                  className="text-zinc-200 hover:underline"
                  title="color by this gene"
                >
                  {m.gene}
                </button>
              </td>
              <td className="text-right tabular-nums text-zinc-300">{m.logFC.toFixed(2)}</td>
              <td className="text-right tabular-nums text-zinc-400">
                {Math.round(m.pctIn * 100)}/{Math.round(m.pctOut * 100)}
              </td>
              <td className="text-right tabular-nums text-zinc-400">{fmtQ(m.q)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
