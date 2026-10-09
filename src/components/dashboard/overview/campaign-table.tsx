/* eslint-disable @next/next/no-img-element -- ad thumbnails are remote blob URLs, as in the Creative Studio */
"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { CampaignRow } from "@/lib/dashboard/overview";
import { count, GOAL_WORD, money, PANEL, pct, roas } from "./format";

// Every campaign with its figures for the period.
//
// Advanced gets the full instrument: sortable columns, a search, a column
// picker and a CSV export of exactly what's on screen. Simple gets the five
// numbers that matter and a link to the rest.

type Col = {
  key: string;
  label: string;
  value: (r: CampaignRow) => number | null;
  show: (v: number | null) => string;
};

const COLUMNS: Record<string, Col> = {
  spend: {
    key: "spend",
    label: "Amount spent",
    value: (r) => r.metrics.spendCents,
    show: (v) => money(v),
  },
  revenue: {
    key: "revenue",
    label: "Sales / Revenue",
    value: (r) => r.metrics.revenueCents,
    show: (v) => money(v),
  },
  impressions: {
    key: "impressions",
    label: "Impressions",
    value: (r) => r.metrics.impressions,
    show: count,
  },
  clicks: {
    key: "clicks",
    label: "Clicks",
    value: (r) => r.metrics.clicks,
    show: count,
  },
  ctr: { key: "ctr", label: "CTR", value: (r) => r.metrics.ctr, show: pct },
  cpc: {
    key: "cpc",
    label: "CPC",
    value: (r) => r.metrics.cpcCents,
    show: (v) => money(v),
  },
  purchases: {
    key: "purchases",
    label: "Purchases",
    value: (r) => r.metrics.purchases,
    show: count,
  },
  cpp: {
    key: "cpp",
    label: "Cost per purchase",
    value: (r) => r.metrics.costPerPurchaseCents,
    show: (v) => money(v),
  },
  roas: {
    key: "roas",
    label: "ROAS",
    value: (r) => r.metrics.roas,
    show: roas,
  },
};

const ADVANCED = [
  "spend",
  "impressions",
  "clicks",
  "ctr",
  "cpc",
  "purchases",
  "cpp",
  "roas",
];
const SIMPLE = ["spend", "revenue", "purchases", "cpp", "roas"];
const SIMPLE_LABEL: Record<string, string> = {
  spend: "Money spent",
  cpp: "Cost per sale",
};

function Status({ row }: { row: CampaignRow }) {
  const [label, tone] =
    row.status === "ACTIVE"
      ? row.testing
        ? ["Testing", "bg-amber-400/12 text-amber-300"]
        : ["Active", "bg-emerald-400/12 text-emerald-300"]
      : row.status === "PAUSED"
        ? ["Paused", "bg-white/[0.06] text-white/60"]
        : row.status === "PENDING_REVIEW"
          ? ["In review", "bg-sky-400/12 text-sky-300"]
          : ["Draft", "bg-white/[0.06] text-white/50"];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11.5px] font-medium ${tone}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

function Thumb({ row }: { row: CampaignRow }) {
  return row.thumbnailUrl ? (
    <img
      src={row.thumbnailUrl}
      alt=""
      className="h-9 w-9 shrink-0 rounded-lg object-cover"
      loading="lazy"
    />
  ) : (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#312e81] to-[#6d28d9] text-[13px] font-semibold text-white/85">
      {row.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function CampaignTable({
  rows,
  variant,
  range,
}: {
  rows: CampaignRow[];
  variant: "simple" | "advanced";
  range: { since: string; until: string };
}) {
  const advanced = variant === "advanced";
  const [query, setQuery] = useState("");
  const [visible, setVisible] = useState<string[]>(
    advanced ? ADVANCED : SIMPLE,
  );
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({
    key: "spend",
    dir: -1,
  });
  const [picker, setPicker] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleAds = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const pickerBox = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!picker) return;
    const close = (e: MouseEvent) =>
      !pickerBox.current?.contains(e.target as Node) && setPicker(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [picker]);

  const cols = visible.map((k) => COLUMNS[k]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter((r) => !q || r.name.toLowerCase().includes(q));
    const col = COLUMNS[sort.key];
    if (col)
      list.sort(
        (a, b) =>
          ((col.value(a) ?? -Infinity) - (col.value(b) ?? -Infinity)) *
          sort.dir,
      );
    else if (sort.key === "name")
      list.sort((a, b) => a.name.localeCompare(b.name) * sort.dir);
    return advanced ? list : list.slice(0, 5);
  }, [rows, query, sort, advanced]);

  const toggleSort = (key: string) =>
    setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : -1 }));

  const exportCsv = () => {
    const header = ["Campaign", "Goal", "Status", ...cols.map((c) => c.label)];
    const lines = shown.map((r) => [
      r.name,
      GOAL_WORD[r.objective] ?? r.objective,
      r.status,
      ...cols.map((c) => c.show(c.value(r))),
    ]);
    const csv = [header, ...lines]
      .map((l) => l.map(csvCell).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `mairo-campaigns-${range.since}-to-${range.until}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const arrow = (key: string) =>
    sort.key === key ? (sort.dir === 1 ? " ↑" : " ↓") : "";

  return (
    <section className={`${PANEL} overflow-hidden`}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-4">
        <h2 className="text-[17px] font-semibold text-white">
          {advanced ? "Campaign performance" : "Your campaigns"}
        </h2>
        {advanced ? (
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-[12.5px] text-muted focus-within:border-violet/60">
              <svg
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                className="h-4 w-4"
                aria-hidden
              >
                <circle cx="9" cy="9" r="5.5" />
                <path d="m13.5 13.5 3.5 3.5" />
              </svg>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search campaigns…"
                className="w-40 bg-transparent text-white outline-none placeholder:text-faint"
              />
            </label>
            <div ref={pickerBox} className="relative">
              <button
                type="button"
                onClick={() => setPicker((v) => !v)}
                aria-expanded={picker}
                className="flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-[12.5px] text-white/85 hover:border-white/25"
              >
                <svg
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="h-4 w-4 text-muted"
                  aria-hidden
                >
                  <rect x="3" y="4" width="14" height="12" rx="2" />
                  <path d="M8 4v12M13 4v12" />
                </svg>
                Columns
              </button>
              {picker && (
                <ul className="absolute right-0 z-30 mt-2 w-52 rounded-xl border border-white/10 bg-field-2 p-1.5 shadow-2xl">
                  {Object.values(COLUMNS).map((c) => (
                    <li key={c.key}>
                      <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-white/85 hover:bg-white/[0.05]">
                        <input
                          type="checkbox"
                          checked={visible.includes(c.key)}
                          onChange={(e) =>
                            setVisible((v) =>
                              e.target.checked
                                ? Object.keys(COLUMNS).filter(
                                    (k) => v.includes(k) || k === c.key,
                                  )
                                : v.filter((k) => k !== c.key),
                            )
                          }
                          className="accent-[#7c5cff]"
                        />
                        {c.label}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button
              type="button"
              onClick={exportCsv}
              disabled={shown.length === 0}
              className="flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-[12.5px] text-white/85 hover:border-white/25 disabled:opacity-40"
            >
              <svg
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                className="h-4 w-4 text-muted"
                aria-hidden
              >
                <path d="M10 3v10M6 9l4 4 4-4M4 16h12" />
              </svg>
              Export
            </button>
          </div>
        ) : (
          <Link
            href="/dashboard/campaigns"
            className="text-[13px] text-violet-bright hover:text-white"
          >
            View all campaigns →
          </Link>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="border-t border-white/[0.06] px-5 py-8 text-center">
          <p className="text-[14px] text-white">No campaigns yet</p>
          <p className="mt-1 text-[13px] text-muted">
            Build one and its results show up here.
          </p>
          <Link
            href="/dashboard/create"
            className="mt-4 inline-flex rounded-lg bg-[#7c5cff] px-4 py-2 text-[13px] font-medium text-white hover:brightness-110"
          >
            Create a campaign
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[13px]">
            <thead>
              <tr className="border-y border-white/[0.06] text-left text-[11.5px] text-faint">
                <th className="px-5 py-2.5 font-medium">
                  <button
                    type="button"
                    onClick={() => toggleSort("name")}
                    className="hover:text-white"
                  >
                    Campaign{arrow("name")}
                  </button>
                </th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                {cols.map((c) => (
                  <th
                    key={c.key}
                    className="px-3 py-2.5 text-right font-medium"
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(c.key)}
                      className="whitespace-nowrap hover:text-white"
                    >
                      {(!advanced && SIMPLE_LABEL[c.key]) || c.label}
                      {arrow(c.key)}
                    </button>
                  </th>
                ))}
                <th className="w-10 px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {shown.map((r) => (
                <Fragment key={r.id}>
                  <tr className="transition hover:bg-white/[0.02]">
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-2">
                        {advanced && (
                          <button
                            type="button"
                            onClick={() => toggleAds(r.id)}
                            disabled={!r.ads?.length}
                            aria-expanded={expanded.has(r.id)}
                            aria-label={`Show ads in ${r.name}`}
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded text-faint transition hover:bg-white/[0.06] hover:text-white disabled:invisible ${expanded.has(r.id) ? "rotate-90" : ""}`}
                          >
                            ›
                          </button>
                        )}
                        <Link
                          href={`/dashboard/campaigns/${r.id}`}
                          className="flex items-center gap-3"
                        >
                          <Thumb row={r} />
                          <span className="min-w-0">
                            <span className="block max-w-[220px] truncate font-medium text-white">
                              {r.name}
                            </span>
                            {advanced && (
                              <span className="block text-[11.5px] text-faint">
                                {GOAL_WORD[r.objective] ?? r.objective} •{" "}
                                {r.adCount} ad{r.adCount === 1 ? "" : "s"}
                              </span>
                            )}
                          </span>
                        </Link>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <Status row={r} />
                    </td>
                    {cols.map((c) => (
                      <td
                        key={c.key}
                        className="px-3 py-2.5 text-right tabular-nums text-white/85"
                      >
                        {r.hasData ? c.show(c.value(r)) : "—"}
                      </td>
                    ))}
                    <td className="px-3 py-2.5 text-right">
                      <Link
                        href={`/dashboard/campaigns/${r.id}`}
                        aria-label={`Open ${r.name}`}
                        title="Open campaign"
                        className="rounded-md px-1.5 py-0.5 text-faint hover:bg-white/[0.06] hover:text-white"
                      >
                        •••
                      </Link>
                    </td>
                  </tr>
                  {advanced &&
                    expanded.has(r.id) &&
                    (r.ads ?? []).map((ad) => {
                      const withData =
                        ad.metrics.impressions !== null ||
                        ad.metrics.spendCents !== null;
                      const row = { ...r, metrics: ad.metrics };
                      return (
                        <tr
                          key={`${r.id}-${ad.label}`}
                          className="bg-white/[0.015] text-[12.5px]"
                        >
                          <td className="py-2 pl-[5.25rem] pr-5 text-muted">
                            {ad.label}
                          </td>
                          <td className="px-3 py-2 text-faint">Ad</td>
                          {cols.map((c) => (
                            <td
                              key={c.key}
                              className="px-3 py-2 text-right tabular-nums text-white/70"
                            >
                              {withData ? c.show(c.value(row)) : "—"}
                            </td>
                          ))}
                          <td />
                        </tr>
                      );
                    })}
                </Fragment>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td
                    colSpan={cols.length + 3}
                    className="px-5 py-6 text-center text-muted"
                  >
                    No campaign matches &ldquo;{query}&rdquo;.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
