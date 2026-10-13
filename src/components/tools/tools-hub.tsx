"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ToolCategory } from "@/lib/tools/registry";

// The /tools hub's search and filters. Only tools that work are links; the
// rest are listed once, plainly, as not available yet.

export type HubTool = { slug: string; name: string; summary: string; category: ToolCategory; processing: "browser" | "server" | "ai"; keywords: string[]; usable: boolean; partial: boolean };

const PROCESSING: Record<HubTool["processing"], string> = {
  browser: "Runs in your browser",
  server: "Reads public pages on MAIRO's server",
  ai: "Uses MAIRO's server and an AI provider",
};

export function ToolsHub({ tools, categories }: { tools: HubTool[]; categories: ToolCategory[] }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<ToolCategory | "All">("All");
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return tools.filter((t) => t.usable && (cat === "All" || t.category === cat) && (!needle || [t.name, t.summary, t.category, ...t.keywords].join(" ").toLowerCase().includes(needle)));
  }, [tools, q, cat]);
  const later = tools.filter((t) => !t.usable);
  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block w-full sm:max-w-[360px]">
          <span className="sr-only">Search the tools</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: ROAS, hooks, UTM, cost per lead…" className="w-full rounded-full border border-white/12 bg-white/[0.04] px-4 py-2.5 text-[14px] text-white placeholder:text-white/40 outline-none focus:border-violet/70 focus:ring-2 focus:ring-violet/25" />
        </label>
        <div role="group" aria-label="Filter by kind" className="flex flex-wrap gap-2">
          {(["All", ...categories] as const).map((c) => (
            <button key={c} type="button" aria-pressed={cat === c} onClick={() => setCat(c)} className={`min-h-[38px] rounded-full border px-3.5 text-[13px] transition ${cat === c ? "border-violet/60 bg-violet/[0.12] text-white" : "border-white/12 text-white/70 hover:border-white/30"}`}>
              {c}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-4 text-[12.5px] text-white/55" aria-live="polite">{shown.length} tool{shown.length === 1 ? "" : "s"}</p>
      <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((t) => (
          <li key={t.slug}>
            <Link href={`/tools/${t.slug}`} className="group flex h-full flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-violet/45 hover:bg-white/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-bright">{t.category}</span>
              <span className="mt-2 text-[16.5px] font-semibold text-white">{t.name}</span>
              <span className="mt-1.5 flex-1 text-[13.5px] leading-relaxed text-white/70">{t.summary}</span>
              <span className="mt-4 flex items-center justify-between text-[12px] text-white/50">
                <span>{PROCESSING[t.processing]}{t.partial ? " · check the rates" : ""}</span>
                <span aria-hidden className="text-violet-bright transition group-hover:translate-x-0.5">→</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {!shown.length && (
        <p className="mt-6 text-[14px] text-white/70">
          {cat !== "All" && !q.trim() && later.some((t) => t.category === cat) ? `None of the ${cat.toLowerCase()} tools work yet — they're listed below and will appear here once they do.` : "No tool matches that. Try another word, or show all."}
        </p>
      )}
      {later.length > 0 && (
        <div className="mt-12 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <p className="text-[14px] font-semibold text-white">Not available yet</p>
          <p className="mt-1 text-[13px] text-white/60">These need MAIRO&rsquo;s server to read public web pages safely. They&rsquo;ll appear above once they work — not before.</p>
          <ul className="mt-3 grid gap-x-6 gap-y-1.5 text-[13px] text-white/55 sm:grid-cols-2">
            {later.map((t) => <li key={t.slug}>{t.name}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
