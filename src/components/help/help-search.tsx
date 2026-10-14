"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { searchHelp, type HelpCategory, type HelpIndexEntry } from "@/lib/help/search";

// The help center's search: results as you type, every article grouped by
// topic when the box is empty, Enter opens the best match. Without
// JavaScript the same box submits to ?q=, and the server ranks with the same
// function.

export function HelpSearch({ entries, categories, basePath, initialQuery = "" }: { entries: HelpIndexEntry[]; categories: HelpCategory[]; basePath: string; initialQuery?: string }) {
  const [q, setQ] = useState(initialQuery);
  const results = useMemo(() => searchHelp(q, entries), [q, entries]);
  const searching = q.trim().length > 1;
  const router = useRouter();

  return (
    <div>
      <form role="search" action={basePath} onSubmit={(e) => {
          // Results are already on screen; Enter opens the best one.
          e.preventDefault();
          if (searching && results[0]) router.push(`${basePath}/${results[0].slug}`);
        }} className="relative">
        <label htmlFor="help-q" className="sr-only">
          Search help
        </label>
        <svg aria-hidden viewBox="0 0 20 20" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="9" cy="9" r="6" />
          <path d="m14 14 4 4" strokeLinecap="round" />
        </svg>
        <input
          id="help-q"
          name="q"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search: credits, pixel, cancel, approve…"
          autoComplete="off"
          className="w-full rounded-full border border-[color:var(--mairo-line)] bg-white/[0.04] py-3 pl-11 pr-4 text-[15px] text-white outline-none placeholder:text-faint focus:border-violet/70 focus:ring-2 focus:ring-violet/25"
        />
      </form>

      <p className="mt-3 text-[12.5px] text-faint" aria-live="polite">
        {searching ? (results.length ? `${results.length} article${results.length === 1 ? "" : "s"} match “${q.trim()}”` : `Nothing matches “${q.trim()}”. Try a different word, or ask the MAIRO team below.`) : `${entries.length} articles`}
      </p>

      {searching ? (
        <ul className="mt-4 grid gap-3">
          {results.map((e) => (
            <li key={e.slug}>
              <ArticleCard entry={e} basePath={basePath} showCategory />
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-6 space-y-8">
          {categories
            .filter((c) => entries.some((e) => e.category === c))
            .map((c) => (
              <section key={c} aria-labelledby={`help-cat-${slugOf(c)}`}>
                <h2 id={`help-cat-${slugOf(c)}`} className="text-[12px] font-semibold uppercase tracking-[0.14em] text-violet-bright">
                  {c}
                </h2>
                <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                  {entries
                    .filter((e) => e.category === c)
                    .map((e) => (
                      <li key={e.slug}>
                        <ArticleCard entry={e} basePath={basePath} />
                      </li>
                    ))}
                </ul>
              </section>
            ))}
        </div>
      )}
    </div>
  );
}

function slugOf(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function ArticleCard({ entry, basePath, showCategory = false }: { entry: HelpIndexEntry; basePath: string; showCategory?: boolean }) {
  return (
    <Link
      href={`${basePath}/${entry.slug}`}
      className="group flex h-full flex-col rounded-2xl border border-[color:var(--mairo-line)] bg-white/[0.03] p-5 transition hover:border-violet/45 hover:bg-white/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet"
    >
      {showCategory && <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-bright">{entry.category}</span>}
      <span className={`${showCategory ? "mt-1.5 " : ""}text-[15.5px] font-semibold text-white`}>{entry.title}</span>
      <span className="mt-1 flex-1 text-[13.5px] leading-relaxed text-muted">{entry.summary}</span>
      <span aria-hidden className="mt-3 text-[13px] text-violet-bright transition group-hover:translate-x-0.5">
        Read →
      </span>
    </Link>
  );
}
