import DropZone from "../components/DropZone";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-semibold tracking-tight">cellulaML</h1>
      <p className="max-w-md text-center text-zinc-400">
        Drop an <code>.h5ad</code> file to view your single-cell analysis
        instantly. No questions, no server — everything runs in your browser.
      </p>
      <DropZone />
    </main>
  );
}
