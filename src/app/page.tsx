export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-semibold tracking-tight">cellulaML</h1>
      <p className="max-w-md text-center text-zinc-400">
        Drop an <code>.h5ad</code> file to view your single-cell analysis
        instantly. No questions, no server — everything runs in your browser.
      </p>
      <div className="flex h-40 w-full max-w-xl items-center justify-center rounded-xl border-2 border-dashed border-zinc-700 text-zinc-500">
        Drop zone (coming in step 2)
      </div>
      <a
        href="/demo/pbmc3k_small.h5ad"
        className="text-sm text-zinc-500 underline underline-offset-4"
      >
        Demo file: pbmc3k_small.h5ad (6.4 MB)
      </a>
    </main>
  );
}
