import { viridisCss } from "../lib/viewer/colormap";
import type { ScalarScale } from "../lib/viewer/colormap";

const STEPS = Array.from({ length: 16 }, (_, i) => viridisCss(i / 15));

export default function Colorbar({ scale, label }: { scale: ScalarScale; label: string }) {
  const fmt = (v: number) => (scale.log ? Math.expm1(v) : v).toFixed(v !== 0 && Math.abs(v) < 1 ? 2 : 1);
  return (
    <div className="text-xs text-zinc-400">
      <div className="mb-1 flex justify-between">
        <span>{fmt(scale.lo)}</span>
        <span className="text-zinc-500">{label}{scale.log ? " (log)" : ""}</span>
        <span>{fmt(scale.hi)}+</span>
      </div>
      <div
        className="h-2 w-full rounded"
        style={{ background: `linear-gradient(to right, ${STEPS.join(",")})` }}
      />
    </div>
  );
}
