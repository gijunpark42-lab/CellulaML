import { MODELS, type ModelCard } from "../../lib/annotate/registry";
import SiteHeader from "../../components/SiteHeader";

export const metadata = { title: "cellulaML - model cards" };

const STATUS: Record<ModelCard["status"], string> = {
  shipped: "bg-emerald-500/20 text-emerald-300 border-emerald-700",
  retired: "bg-zinc-700/40 text-zinc-300 border-zinc-600",
  experiment: "bg-amber-500/15 text-amber-300 border-amber-800",
};

export default function ModelsPage() {
  return (
    <>
      <SiteHeader current="models" />
      <main className="mx-auto max-w-3xl px-6 pb-16 pt-4 text-sm">
        <h1 className="mb-6 text-2xl font-semibold">Model cards</h1>
        <p className="mb-8 max-w-2xl text-zinc-400">
          Every version of the annotation model, what it was trained on, how it
          was validated, what it was tested on afterwards, and where it fails.
          Test sets are never used for training. The model is frozen at
          inference: it does not learn from your data.
        </p>
        <div className="flex flex-col gap-10">
          {MODELS.map((m) => (
            <Card key={m.version} m={m} />
          ))}
        </div>
      </main>
    </>
  );
}

function Card({ m }: { m: ModelCard }) {
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">{m.version}</h2>
        <span
          className={`rounded border px-2 py-0.5 text-xs ${STATUS[m.status]}`}
        >
          {m.status}
        </span>
        <span className="text-xs text-zinc-500">{m.date}</span>
        {m.file && (
          <a
            href={m.file}
            className="ml-auto text-xs text-zinc-500 underline underline-offset-2 hover:text-zinc-300"
          >
            weights (JSON)
          </a>
        )}
      </div>
      <p className="mb-4 text-zinc-300">{m.changes}</p>

      <H3>Algorithm</H3>
      <p className="mb-1 text-zinc-300">{m.algorithm}</p>
      <p className="mb-4 text-zinc-500">{m.preprocessing}</p>

      <H3>Training set</H3>
      <Table
        rows={[
          ["Dataset", m.training.dataset],
          [
            "Cells / donors",
            `${m.training.cells} cells, ${m.training.donors} donor(s)`,
          ],
          ["Classes", m.training.classes],
          ["Hyperparameters", m.training.hyperparams],
        ]}
      />

      <H3>Validation - {m.validation.scheme}</H3>
      <Table rows={m.validation.rows} />

      {m.tests.length > 0 && (
        <>
          <H3>External tests (labels hidden, model frozen)</H3>
          <div className="mb-4 flex flex-col gap-3">
            {m.tests.map((t) => (
              <div
                key={t.dataset}
                className="rounded border border-zinc-800 p-3"
              >
                <p className="font-medium text-zinc-200">{t.dataset}</p>
                <p className="text-xs text-zinc-500">
                  why it is hard: {t.whyItIsHard}
                </p>
                <p className="mt-1 text-zinc-300">{t.result}</p>
              </div>
            ))}
          </div>
        </>
      )}

      <H3>Known weaknesses</H3>
      <ul className="list-disc pl-5 text-zinc-300">
        {m.weaknesses.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
    </section>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-1 mt-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
      {children}
    </h3>
  );
}

function Table({ rows }: { rows: [string, string][] }) {
  return (
    <table className="mb-3 w-full">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k} className="border-t border-zinc-800/60 align-top">
            <td className="w-44 py-1 pr-3 text-zinc-500">{k}</td>
            <td className="py-1 text-zinc-200">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
