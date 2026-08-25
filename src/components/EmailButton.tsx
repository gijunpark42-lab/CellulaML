"use client";

import { useEffect, useRef, useState } from "react";

/** Email link as a popover: shows the address, copies it, and offers mailto for people who have a mail app. */
export default function EmailButton({ email, className }: { email: string; className: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the address is visible and selectable anyway */
    }
  };

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className={className} aria-expanded={open}>
        <MailIcon /> Email
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-72 rounded-lg border border-zinc-700 bg-zinc-900 p-3 shadow-xl">
          <p className="mb-2 text-xs text-zinc-500">Contact</p>
          <p className="select-all break-all font-mono text-sm text-zinc-100">{email}</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void copy()}
              className="rounded bg-emerald-500 px-3 py-1 text-xs font-medium text-zinc-900 hover:bg-emerald-400"
            >
              {copied ? "copied!" : "copy address"}
            </button>
            <a
              href={`mailto:${email}`}
              className="rounded border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              open mail app
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function MailIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}
