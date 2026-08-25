"use client";

import { useMemo, useState } from "react";

interface Props {
  geneNames: string[];
  /** currently colored gene, or null */
  selected: string | null;
  onSelect: (name: string | null) => void;
}

const MAX_SUGGESTIONS = 12;

/** Gene search with suggestions. Matching is defensive: every name is treated as a string, never throws. */
export default function GeneSearch({ geneNames, selected, onSelect }: Props) {
  const [query, setQuery] = useState("");

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const starts: string[] = [];
    const contains: string[] = [];
    for (const raw of geneNames) {
      const name = String(raw);
      const lower = name.toLowerCase();
      if (lower === q) {
        starts.unshift(name);
      } else if (lower.startsWith(q)) {
        starts.push(name);
      } else if (lower.includes(q)) {
        contains.push(name);
      }
      if (starts.length >= MAX_SUGGESTIONS) break;
    }
    const byLength = (a: string, b: string) => a.length - b.length || a.localeCompare(b);
    return [...starts.sort(byLength), ...contains.sort(byLength)].slice(0, MAX_SUGGESTIONS);
  }, [query, geneNames]);

  const choose = (name: string) => {
    onSelect(name);
    setQuery("");
  };

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && suggestions[0]) choose(suggestions[0]);
          if (e.key === "Escape") setQuery("");
        }}
        placeholder="gene name, e.g. MS4A1"
        spellCheck={false}
        className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-200 placeholder:text-zinc-600"
      />
      {suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded border border-zinc-700 bg-zinc-900 shadow-lg">
          {suggestions.map((g) => (
            <li key={g}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(g)}
                className="w-full px-2 py-1 text-left text-zinc-200 hover:bg-zinc-800"
              >
                {g}
              </button>
            </li>
          ))}
        </ul>
      )}
      {query && suggestions.length === 0 && (
        <p className="mt-1 text-xs text-zinc-500">no gene matches</p>
      )}
      {selected && (
        <div className="mt-2 flex items-center gap-2 text-zinc-200">
          <span className="font-medium">{selected}</span>
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="ml-auto text-xs text-zinc-500 underline underline-offset-2 hover:text-zinc-300"
          >
            back to labels
          </button>
        </div>
      )}
    </div>
  );
}
