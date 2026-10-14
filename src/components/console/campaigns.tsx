"use client";

import { Go, Panel, Pill, type PillTone } from "./kit";

// Campaigns at a glance: how many are running, paused, waiting or still
// drafts, and the few most recent with what each spent and returned. A
// campaign says "Live" only when Meta reported it active.

export type CampaignSummaryRow = {
  id: string;
  name: string;
  status: { label: string; tone: PillTone };
  goal: string;
  budget: string | null;
  result: string | null;
  thumbnailUrl: string | null;
  href?: string | null;
};

export type CampaignCounts = { live: number; paused: number; review: number; draft: number };

const COUNT_LABEL: { key: keyof CampaignCounts; label: string; tone: string }[] = [
  { key: "live", label: "Live", tone: "text-emerald-300" },
  { key: "review", label: "Waiting", tone: "text-amber-300" },
  { key: "paused", label: "Paused", tone: "text-white/80" },
  { key: "draft", label: "Drafts", tone: "text-violet-200" },
];

export function CampaignsPanel({ counts, rows, allHref, createHref, emptyText }: { counts: CampaignCounts; rows: CampaignSummaryRow[]; allHref?: string | null; createHref?: string | null; emptyText: string }) {
  return (
    <Panel id="campaigns-panel" title="Campaigns" action={{ href: allHref, label: "All campaigns" }}>
      <dl className="grid grid-cols-4 gap-2">
        {COUNT_LABEL.map((c) => (
          <div key={c.key} className="rounded-2xl border px-3 py-2.5 text-center" style={{ borderColor: "var(--mairo-line)", background: "rgba(var(--mairo-fg-rgb),0.02)" }}>
            <dt className="text-[11px] text-faint">{c.label}</dt>
            <dd className={`mt-0.5 text-[20px] font-semibold tabular-nums ${counts[c.key] ? c.tone : "text-white/30"}`}>{counts[c.key]}</dd>
          </div>
        ))}
      </dl>
      {rows.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed px-4 py-6 text-center" style={{ borderColor: "var(--mairo-line)" }}>
          <p className="text-[13.5px] text-muted">{emptyText}</p>
          {createHref && (
            <Go href={createHref} className="mt-2 inline-block text-[13px] text-violet-bright hover:text-white">
              Create a campaign →
            </Go>
          )}
        </div>
      ) : (
        <ul className="mt-4 divide-y" style={{ borderColor: "var(--mairo-line)" }}>
          {rows.map((r) => (
            <li key={r.id} style={{ borderColor: "var(--mairo-line)" }}>
              <Go href={r.href} className="group flex items-center gap-3 py-3">
                <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl border" style={{ borderColor: "var(--mairo-line)", background: "linear-gradient(140deg, rgba(121,82,255,0.35), rgba(53,108,255,0.25))" }}>
                  {r.thumbnailUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium text-white group-hover:underline group-hover:decoration-white/30 group-hover:underline-offset-4">{r.name}</span>
                  <span className="block truncate text-[12px] text-faint">
                    {r.goal}
                    {r.budget ? ` · ${r.budget}` : ""}
                  </span>
                </span>
                <span className="hidden shrink-0 text-right text-[12.5px] text-white/80 @md:block">{r.result ?? <span className="text-faint">No results yet</span>}</span>
                <Pill tone={r.status.tone} dot>
                  {r.status.label}
                </Pill>
              </Go>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
