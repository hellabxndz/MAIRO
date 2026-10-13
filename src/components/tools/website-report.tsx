"use client";

import Link from "next/link";
import { useState } from "react";
import type { Finding } from "@/lib/website/audit";
import type { ScanProgress, ScanResult } from "@/lib/website/scan";
import type { ScanState } from "./use-website-scan";
import { CopyButton, inputCls, primaryBtn, secondaryBtn } from "./ui";

// The pieces every website tool and the in-app report share: the address form,
// real progress, finding cards with their evidence, and the facts found.

const STEPS: ScanProgress["step"][] = ["address", "home", "pages", "links", "speed", "audit", "done"];

export function ScanProgressView({ progress }: { progress: ScanProgress | null }) {
  const step = progress?.step ?? "address";
  const at = STEPS.indexOf(step);
  return (
    <div role="status" aria-live="polite" className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <p className="text-[14px] font-medium text-white">{progress?.label ?? "Starting"}{progress?.total ? ` — ${progress.done ?? 0} of ${progress.total}` : ""}</p>
      <ol className="mt-3 flex flex-wrap gap-2 text-[12px]">
        {(["home", "pages", "links", "audit"] as const).map((s) => {
          const i = STEPS.indexOf(s);
          return (
            <li key={s} className={`rounded-full px-2.5 py-1 ${i < at ? "bg-emerald-400/15 text-emerald-300" : i === at ? "bg-violet/15 text-white" : "bg-white/[0.05] text-white/45"}`}>
              {i < at ? "✓ " : ""}{s === "home" ? "Home page" : s === "pages" ? "Other pages" : s === "links" ? "Links" : "Report"}
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-[12px] text-white/50">Each step is MAIRO&rsquo;s server actually reading the site — up to 4 pages and 8 links.</p>
    </div>
  );
}

export function ScanForm({ onScan, state, label = "Check my page", withAdMessage = false, placeholder = "yourbusiness.com" }: { onScan: (url: string, adMessage?: string) => void; state: ScanState; label?: string; withAdMessage?: boolean; placeholder?: string }) {
  const [url, setUrl] = useState("");
  const [ad, setAd] = useState("");
  const running = state.phase === "running";
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (url.trim()) onScan(url.trim(), ad.trim() || undefined);
      }}
      className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
    >
      <label htmlFor="scan-url" className="block text-[13.5px] font-medium text-white">Website address</label>
      <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
        <input id="scan-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={placeholder} inputMode="url" autoComplete="url" maxLength={300} className={inputCls} />
        <button type="submit" className={`${primaryBtn} shrink-0`} disabled={running || !url.trim()}>{running ? "Checking…" : label}</button>
      </div>
      {withAdMessage && (
        <div className="mt-3">
          <label htmlFor="scan-ad" className="block text-[13px] text-white/80">What will your ad say? <span className="text-white/45">· optional — checks the page repeats it</span></label>
          <input id="scan-ad" value={ad} onChange={(e) => setAd(e.target.value)} maxLength={500} className={`${inputCls} mt-1.5`} placeholder="e.g. Same-day drain repair in Eastfield" />
        </div>
      )}
      <p className="mt-2 text-[12px] text-white/50">MAIRO&rsquo;s server reads public pages only. Free checks are limited to 5 an hour per visitor.</p>
    </form>
  );
}

const CONF: Record<Finding["confidence"], string> = { observed: "Seen on the page", inferred: "MAIRO's judgement", "not checked": "Not checked" };
const PRI: Record<Finding["priority"], string> = { high: "bg-rose-400/15 text-rose-300", medium: "bg-amber-400/15 text-amber-200", low: "bg-white/[0.07] text-white/65" };

export function FindingCard({ f, resolved, onResolve, compact }: { f: Finding; resolved?: boolean; onResolve?: (resolved: boolean) => void; compact?: boolean }) {
  return (
    <li className={`rounded-2xl border p-4 sm:p-5 ${resolved ? "border-emerald-400/30 bg-emerald-400/[0.04]" : "border-white/10 bg-white/[0.03]"}`}>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium">
        <span className={`rounded-full px-2 py-0.5 ${PRI[f.priority]}`}>{f.priority === "high" ? "High priority" : f.priority === "medium" ? "Medium priority" : "Low priority"}</span>
        <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-white/65">{f.category}</span>
        <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-white/65">{CONF[f.confidence]}</span>
        {f.effort && <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-white/65">Effort: {f.effort}</span>}
        {resolved && <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-emerald-300">Marked resolved</span>}
      </div>
      <p className="mt-2 text-[16px] font-semibold leading-snug text-white">{f.title}</p>
      {f.evidence && (
        <p className="mt-1.5 text-[13px] leading-relaxed text-white/70">
          <span className="text-white/45">Evidence: </span>{f.evidence}{" "}
          {f.evidenceUrl && <a href={f.evidenceUrl} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-violet-bright underline underline-offset-2">{f.evidenceUrl}</a>}
        </p>
      )}
      {!compact && f.why && <p className="mt-1.5 text-[13px] leading-relaxed text-white/70"><span className="text-white/45">Why it matters: </span>{f.why}</p>}
      {f.change && <p className="mt-1.5 text-[13.5px] leading-relaxed text-white"><span className="text-white/45">Suggested change: </span>{f.change}</p>}
      {f.copy.length > 0 && (
        <ul className="mt-2.5 space-y-1.5">
          {f.copy.map((c) => (
            <li key={c} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-paper/60 px-3 py-2">
              <span className="text-[14px] text-white">{c}</span>
              <CopyButton text={c} label="Copy suggestion" />
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11.5px] text-white/45">A hypothesis to test, not a promised improvement.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {f.next.href && (
          <Link href={f.next.href} className={secondaryBtn} target={f.next.href.startsWith("http") ? "_blank" : undefined}>{f.next.label}</Link>
        )}
        {onResolve && (
          <button type="button" className={secondaryBtn} aria-pressed={Boolean(resolved)} onClick={() => onResolve(!resolved)}>{resolved ? "Reopen" : "Mark resolved"}</button>
        )}
      </div>
    </li>
  );
}

export function FactsList({ result }: { result: ScanResult }) {
  return (
    <dl className="grid gap-2 sm:grid-cols-2">
      {result.facts.map((f) => (
        <div key={f.field} className="rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-2.5">
          <dt className="flex items-center justify-between gap-2 text-[12px] text-white/55">
            {f.label}
            <span className={`rounded-full px-1.5 py-0.5 text-[10.5px] ${f.kind === "found" ? "bg-emerald-400/15 text-emerald-300" : f.kind === "inferred" ? "bg-amber-400/15 text-amber-200" : "bg-white/[0.06] text-white/55"}`}>{f.kind === "found" ? "Found" : f.kind === "inferred" ? "MAIRO's guess" : f.kind === "not checked" ? "Not checked" : "Not found"}</span>
          </dt>
          <dd className="mt-0.5 break-words text-[13.5px] text-white">{f.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Coverage({ result, cached }: { result: ScanResult; cached?: boolean }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-[12.5px] leading-relaxed text-white/60">
      <p>
        Read {new Date(result.fetchedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}{cached ? " (a recent reading, reused)" : ""}:{" "}
        {result.pages.map((p, i) => (
          <span key={p.url}>{i ? ", " : ""}<a href={p.url} target="_blank" rel="noopener noreferrer nofollow" className="break-all underline underline-offset-2">{p.url}</a></span>
        ))}
        {result.failedPages.length ? ` · ${result.failedPages.length} page${result.failedPages.length === 1 ? "" : "s"} couldn't be read` : ""}
      </p>
      <ul className="mt-1.5 list-disc space-y-0.5 pl-5">{result.coverage.map((c) => <li key={c}>{c}</li>)}</ul>
    </div>
  );
}

export function ScanError({ message }: { message: string }) {
  return <p role="alert" className="rounded-xl border border-amber-300/30 bg-amber-300/[0.07] px-4 py-3 text-[13.5px] text-amber-100">{message}</p>;
}

export function RecheckButton({ onClick, busy }: { onClick: () => void; busy: boolean }) {
  return <button type="button" className={secondaryBtn} onClick={onClick} disabled={busy}>{busy ? "Rechecking…" : "Recheck the page"}</button>;
}
