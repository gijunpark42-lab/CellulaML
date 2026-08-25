import Link from "next/link";
import { SITE } from "../lib/site";
import EmailButton from "./EmailButton";

/** Top bar: brand on the left, model cards + author links on the right. */
export default function SiteHeader({ current }: { current?: "app" | "models" }) {
  return (
    <header className="flex w-full items-center gap-4 px-6 py-4 text-sm">
      <Link href="/" className="font-semibold tracking-tight text-zinc-100 hover:text-white">
        cellulaML
      </Link>
      <nav className="ml-auto flex items-center gap-2">
        <Link
          href="/models"
          className={`rounded-md border px-3 py-1.5 font-medium transition-colors ${
            current === "models"
              ? "border-emerald-500 bg-emerald-500/15 text-emerald-200"
              : "border-emerald-700 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
          }`}
        >
          Model cards
        </Link>
        <span className="mx-1 h-5 w-px bg-zinc-800" />
        <a href={SITE.github} target="_blank" rel="noreferrer" className={LINK} title="GitHub">
          <GitHubIcon /> GitHub
        </a>
        {SITE.linkedin && (
          <a href={SITE.linkedin} target="_blank" rel="noreferrer" className={LINK} title="LinkedIn">
            <LinkedInIcon /> LinkedIn
          </a>
        )}
        <EmailButton email={SITE.email} className={LINK} />
      </nav>
    </header>
  );
}

const LINK =
  "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100";

function GitHubIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.2.8-.6v-2c-3.2.7-3.9-1.4-3.9-1.4-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.2c0 .3.2.7.8.6 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5z" />
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20.4 2H3.6A1.6 1.6 0 0 0 2 3.6v16.8A1.6 1.6 0 0 0 3.6 22h16.8a1.6 1.6 0 0 0 1.6-1.6V3.6A1.6 1.6 0 0 0 20.4 2zM8 19H5V9h3v10zM6.5 7.7a1.7 1.7 0 1 1 0-3.4 1.7 1.7 0 0 1 0 3.4zM19 19h-3v-4.9c0-1.2 0-2.7-1.6-2.7s-1.9 1.3-1.9 2.6V19h-3V9h2.9v1.4h.1c.4-.8 1.4-1.6 2.8-1.6 3 0 3.6 2 3.6 4.6V19z" />
    </svg>
  );
}

