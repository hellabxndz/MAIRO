/* eslint-disable @next/next/no-img-element -- remote blob URLs and MAIRO's own image route */
"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Drawer } from "@/components/mairo/overlay";
import { actionClass, quietClass } from "@/components/mairo/action-styles";
import { attachCreativeToCampaignAction } from "@/lib/actions/creative-studio-actions";
import { regenerateConceptAction } from "@/lib/actions/creative-actions";
import type { HubAd, NewItem } from "@/lib/creatives/hub";

const tile = "rounded-[22px] overflow-hidden transition hover:bg-white/[0.045]";
const surface = { background: "linear-gradient(180deg, rgba(var(--mairo-fg-rgb),0.035), rgba(var(--mairo-fg-rgb),0.015))" };

function Preview({ src, kind, label }: { src: string | null; kind?: string; label: string }) {
  return src ? (
    <div className="relative aspect-[4/5] w-full bg-field-3">
      <img src={src} alt={label} className="h-full w-full object-cover" loading="lazy" />
      {kind === "VIDEO" && <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-[#fff]">▶ Video</span>}
    </div>
  ) : (
    <div className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-2 px-5 text-center" style={{ background: "radial-gradient(90% 70% at 50% 35%, rgba(124,92,255,0.14), transparent 70%), rgba(var(--mairo-fg-rgb),0.025)" }}>
      <span aria-hidden className="text-[26px] opacity-80">{kind === "EXISTING_AD" ? "📣" : "🖼️"}</span>
      <span className="text-[13px] text-white/60">{kind === "EXISTING_AD" ? "Your existing ad" : "No picture yet"}</span>
    </div>
  );
}

/** An ad that is (or was) running. Click for the detail. */
export function AdCard({ ad, rank }: { ad: HubAd; rank?: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`${tile} text-left`} style={surface}>
        <div className="relative">
          <Preview src={ad.preview} kind={ad.kind} label={ad.name} />
          {rank && <span className="absolute right-2 top-2 rounded-full px-2.5 py-1 text-[12px] font-medium text-white" style={{ backgroundImage: "var(--mairo-ramp)" }}>#{rank}</span>}
        </div>
        <div className="p-4">
          <p className="line-clamp-1 text-[15px] font-medium text-white">{ad.name}</p>
          <p className="mt-0.5 line-clamp-1 text-[12.5px] text-muted">{ad.campaignName}</p>
          <p className="mt-3 flex items-center justify-between gap-2 text-[12.5px]">
            <span className="text-white/75">{ad.status} · Goal: {ad.goal}</span>
          </p>
          <p className="mt-1 text-[15px] text-white">{ad.resultText}</p>
        </div>
      </button>
      <Drawer open={open} onClose={() => setOpen(false)} title={ad.name}>
        <div className="overflow-hidden rounded-2xl"><Preview src={ad.preview} kind={ad.kind} label={ad.name} /></div>
        <dl className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white/[0.04] px-4 py-3"><dt className="text-[12px] text-muted">Result</dt><dd className="mt-1 text-[16px] text-white">{ad.resultText}</dd></div>
          <div className="rounded-2xl bg-white/[0.04] px-4 py-3"><dt className="text-[12px] text-muted">Cost per result</dt><dd className="mt-1 text-[16px] text-white">{ad.costPerResultCents !== null ? `$${(ad.costPerResultCents / 100).toFixed(2)}` : "—"}</dd></div>
        </dl>
        {ad.primaryText && <p className="mt-5 whitespace-pre-wrap text-[14px] leading-relaxed text-white/85">{ad.primaryText}</p>}
        {ad.reason && <p className="mt-4 rounded-2xl bg-violet/[0.08] px-4 py-3 text-[13px] text-white/85"><span className="text-violet-bright">Why MAIRO made it: </span>{ad.reason}</p>}
        <p className="mt-4 text-[12.5px] text-faint">Results are from the last 90 days, counted by your goal.</p>
        <Link href={`/dashboard/campaigns/${ad.campaignId}?tab=creatives`} className={`${actionClass} mt-5`}>Open {ad.campaignName}</Link>
      </Drawer>
    </>
  );
}

/** Something MAIRO made that isn't running yet. */
export function NewCard({ item }: { item: NewItem }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const tone = item.status === "Ready to review" || item.status === "Ready to use" ? "text-emerald-300" : item.status === "Being checked" ? "text-amber-200" : "text-white/70";
  return (
    <div className={tile} style={surface}>
      <Preview src={item.preview} label={item.title} />
      <div className="p-4">
        <p className={`text-[12px] font-medium ${tone}`}>{item.status}</p>
        <p className="mt-1 line-clamp-2 text-[14.5px] text-white">{item.title}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {item.kind === "request" ? (
            <>
              <Link href={`/dashboard/creatives/requests#req-${item.id}`} className={item.status === "Ready to review" ? actionClass : quietClass}>{item.status === "Ready to review" ? "Review & approve" : "Edit"}</Link>
              {item.status === "Approved" && <Link href="/dashboard/create" className={actionClass}>Use in campaign</Link>}
              {!item.hasConcept && (
                <button type="button" disabled={pending} className={quietClass} onClick={() => start(async () => { const r = await regenerateConceptAction(item.id).catch(() => ({ error: "Something went wrong." })); setNote(r?.error ?? null); router.refresh(); })}>
                  {pending ? "Working…" : "Regenerate"}
                </button>
              )}
            </>
          ) : (
            <>
              <button type="button" disabled={pending} className={actionClass} onClick={() => start(async () => { const r = await attachCreativeToCampaignAction(item.id).catch(() => ({ error: "Something went wrong." })); setNote(r && "error" in r && r.error ? r.error : "Ready — it's now available when you create a campaign."); router.refresh(); })}>
                {pending ? "Working…" : "Use in campaign"}
              </button>
              <Link href="/dashboard/creative-studio" className={quietClass}>Edit</Link>
            </>
          )}
        </div>
        {note && <p className="mt-2 text-[12px] text-white/70">{note}</p>}
      </div>
    </div>
  );
}

/** Creative history, searchable, without cluttering anything else. */
export function PastList({ ads }: { ads: HubAd[] }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const statuses = useMemo(() => [...new Set(ads.map((a) => a.status))], [ads]);
  const shown = ads.filter((a) => (status === "all" || a.status === status) && `${a.name} ${a.campaignName} ${a.primaryText ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search creatives or campaigns" aria-label="Search past creatives"
          className="min-h-[42px] flex-1 rounded-full border border-[color:var(--mairo-line)] bg-[rgba(var(--mairo-bg-rgb),0.6)] px-4 text-[14px] text-white placeholder-faint outline-none focus:border-[color:var(--mairo-line-lit)]" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status"
          className="min-h-[42px] rounded-full border border-[color:var(--mairo-line)] bg-[rgba(var(--mairo-bg-rgb),0.6)] px-4 text-[14px] text-white">
          <option value="all">All statuses</option>
          {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      {shown.length === 0 ? (
        <p className="py-10 text-center text-[14px] text-muted">Nothing matches.</p>
      ) : (
        <ul className="space-y-2">
          {shown.map((a) => (
            <li key={a.id}>
              <Link href={`/dashboard/campaigns/${a.campaignId}?tab=creatives`} className="flex items-center gap-4 rounded-2xl px-3 py-3 transition hover:bg-white/[0.04]">
                <span className="h-14 w-12 shrink-0 overflow-hidden rounded-lg bg-white/[0.04]">{a.preview && <img src={a.preview} alt="" className="h-full w-full object-cover" loading="lazy" />}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] text-white">{a.name}</span>
                  <span className="block truncate text-[12.5px] text-muted">{a.campaignName} · {new Date(`${a.date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</span>
                </span>
                <span className="hidden shrink-0 text-right sm:block">
                  <span className="block text-[13.5px] text-white">{a.resultText}</span>
                  <span className="block text-[12px] text-faint">{a.status}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
