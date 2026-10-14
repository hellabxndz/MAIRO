/* eslint-disable @next/next/no-img-element -- remote blob URLs */
"use client";

import Link from "next/link";
import { useState } from "react";
import { LIBRARY_FILTERS, inFilter, matchesSearch, type LibraryItem } from "@/lib/creatives/library-view";

// The Creative Library on the Creatives page: everything in one list, by where
// it came from and where it is, searchable. Results appear only for ads Meta
// reported figures for; everything else says what it is, not how it might do.

const STAGE: Record<LibraryItem["stage"], { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-white/[0.08] text-white/80" },
  approved: { label: "Approved", cls: "bg-live/15 text-live" },
  launched: { label: "Launched", cls: "bg-violet/20 text-white" },
  "turned-down": { label: "Turned down", cls: "bg-white/[0.05] text-muted" },
};
const SOURCE: Record<LibraryItem["source"], string> = { suggested: "Suggested by MAIRO", generated: "Made in Creative Studio", uploaded: "Your upload", launched: "Ran in a campaign" };

export function LibraryList({ items }: { items: LibraryItem[] }) {
  const [filter, setFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const shown = items.filter((i) => inFilter(i, filter) && matchesSearch(i, q));
  const count = (key: string) => items.filter((i) => inFilter(i, key)).length;
  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div role="group" aria-label="Show" className="-mx-1 flex flex-wrap gap-1">
          {LIBRARY_FILTERS.map((f) => (
            <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}
              className={`rounded-full px-3.5 py-1.5 text-[13px] ${filter === f.key ? "bg-white/[0.1] text-white" : "text-muted hover:text-white"}`}>
              {f.label}<span className="ml-1.5 text-faint">{count(f.key)}</span>
            </button>
          ))}
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search words, campaigns, pictures" aria-label="Search the creative library"
          className="min-h-[42px] w-full rounded-full border border-[color:var(--mairo-line)] bg-[rgba(var(--mairo-bg-rgb),0.6)] px-4 text-[14px] text-white placeholder-faint outline-none focus:border-[color:var(--mairo-line-lit)] lg:ml-auto lg:max-w-[320px]" />
      </div>
      {shown.length === 0 ? (
        <p className="py-10 text-center text-[14px] text-muted">{items.length ? "Nothing matches." : "Nothing here yet. Suggested ads, pictures you make and ads that run all appear here."}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {shown.map((i) => (
            <li key={i.key}>
              <Link href={i.href} className="flex h-full flex-col overflow-hidden rounded-[22px] transition hover:bg-white/[0.045]" style={{ background: "linear-gradient(180deg, rgba(var(--mairo-fg-rgb),0.035), rgba(var(--mairo-fg-rgb),0.015))" }}>
                <div className="relative aspect-[4/3] w-full bg-white/[0.03]">
                  {i.preview ? (
                    <img src={i.preview} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <p className="flex h-full items-center justify-center px-5 text-center text-[13px] font-medium leading-snug text-white/80">{i.text ? `“${i.text.slice(0, 90)}${i.text.length > 90 ? "…" : ""}”` : "Words only"}</p>
                  )}
                  {i.kind === "video" && <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-[#fff]">▶ Video</span>}
                  <span className={`absolute right-2 top-2 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${STAGE[i.stage].cls}`}>{STAGE[i.stage].label}</span>
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <p className="text-[11.5px] text-muted">{SOURCE[i.source]}</p>
                  <p className="mt-0.5 line-clamp-2 text-[14px] font-medium text-white">{i.title}</p>
                  {i.context && <p className="mt-0.5 line-clamp-1 text-[12px] text-muted">{i.context}</p>}
                  <p className="mt-2 text-[12px] text-faint">{i.versionNote}{i.versions > 1 ? ` · ${i.versions} versions kept` : ""}</p>
                  {i.performance && (
                    <p className="mt-auto pt-3 text-[13px] text-white">{i.performance.resultText}{i.performance.costPerResultCents !== null ? <span className="text-muted"> · ${(i.performance.costPerResultCents / 100).toFixed(2)} each</span> : null}</p>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-[12px] text-faint">Results are shown only for ads Meta reported figures for, from the last 90 days.</p>
    </div>
  );
}
