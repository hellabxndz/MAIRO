"use client";

import Link from "next/link";
import type { BrandRules } from "@/lib/brain/brand-check";
import type { ConfirmedFacts } from "@/lib/suggested-ads/directions";
import { aspectOf, readiness, type Readiness, type ReadinessInput } from "@/lib/creative/readiness";

// The readiness check on a suggested ad: a score out of 100 from seven plain
// areas, what each one looked at, and the fixes MAIRO can make itself. It's a
// heuristic for avoidable weaknesses and says so; it never predicts results.

export type TrackingFacts = { pixelSeesResult: boolean | null; leadFormReady: boolean; stage: string | null };
type VideoLike = { meta: { width: number; height: number }; edits: { aspect: string }; render: { status: string | null; width: number | null; height: number | null } | null } | null;

/** The readiness of these words with this picture or video (or nothing yet). */
export function adReadiness(input: {
  words: { hook: string; body: string; cta: string };
  facts: ConfirmedFacts;
  brand: BrandRules | null;
  media: "image" | "video" | "none";
  video?: VideoLike;
  tracking: TrackingFacts;
}): Readiness {
  let aspect: ReadinessInput["media"]["aspect"] = null;
  if (input.media === "image") aspect = "4:5";
  if (input.media === "video" && input.video) {
    const v = input.video;
    const rendered = v.render?.status === "READY" && v.render.width && v.render.height ? aspectOf(v.render.width, v.render.height) : null;
    aspect = rendered ?? (v.edits.aspect !== "original" ? (v.edits.aspect as "9:16" | "4:5" | "1:1") : aspectOf(v.meta.width, v.meta.height));
  }
  return readiness({
    words: input.words,
    facts: input.facts,
    brand: input.brand,
    media: { kind: input.media, aspect },
    tracking: { pixelSeesResult: input.tracking.pixelSeesResult, leadFormReady: input.tracking.leadFormReady },
  });
}

export function readinessBand(score: number, blocked = false): { label: string; tone: "live" | "warn" | "muted" } {
  if (blocked) return { label: "Fix before running", tone: "warn" };
  if (score >= 85) return { label: "Ready to run", tone: "live" };
  if (score >= 65) return { label: "Nearly ready", tone: "live" };
  if (score >= 40) return { label: "Needs work", tone: "warn" };
  return { label: "Not ready yet", tone: "warn" };
}

const MARK: Record<string, { sign: string; cls: string; word: string }> = {
  good: { sign: "✓", cls: "bg-live/15 text-live", word: "Good" },
  improve: { sign: "!", cls: "bg-amber-300/15 text-warn", word: "Could be better" },
  fix: { sign: "✕", cls: "bg-red-400/15 text-warn", word: "Fix before running" },
  na: { sign: "–", cls: "bg-white/[0.06] text-muted", word: "Doesn't apply" },
};

/** Links for fixes MAIRO can't make itself. */
const ELSEWHERE: Partial<Record<string, { label: string; href: string }>> = {
  tracking: { label: "Set up tracking", href: "/dashboard/pixel" },
  landing: { label: "Open your Business Brain", href: "/dashboard/settings/business-brain" },
};

const blocked = (r: Readiness) => r.areas.some((a) => a.state === "fix");

export function ReadinessChip({ r }: { r: Readiness }) {
  const band = readinessBand(r.score, blocked(r));
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium ${band.tone === "live" ? "bg-live/12 text-live" : "bg-amber-300/12 text-warn"}`} title="Readiness check — a heuristic, not a prediction">
      <span className="tabular-nums">{r.score}</span>
      <span className="opacity-80">/ 100 · {band.label}</span>
    </span>
  );
}

export function ReadinessPanel({ r, onImprove, improving, onCreate }: { r: Readiness; onImprove?: () => void; improving?: boolean; onCreate?: () => void }) {
  const band = readinessBand(r.score, blocked(r));
  const pct = Math.max(4, Math.min(100, r.score));
  return (
    <section aria-labelledby="ready-h" className="rounded-2xl border px-4 py-4" style={{ borderColor: "var(--mairo-line)" }}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="ready-h" className="text-[13.5px] font-semibold text-white">Readiness check</h3>
        <p className="text-[12px] text-muted"><span className="text-[18px] font-semibold tabular-nums text-white">{r.score}</span> / 100 · {band.label}</p>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={r.score} aria-label="Readiness score">
        <div className={`h-full rounded-full ${band.tone === "live" ? "bg-live" : "bg-amber-300"}`} style={{ width: `${pct}%` }} />
      </div>
      <ul className="mt-3 space-y-2.5">
        {r.areas.map((a) => {
          const m = MARK[a.state];
          const elsewhere = a.state !== "good" && a.state !== "na" && !a.fix ? ELSEWHERE[a.key] : undefined;
          return (
            <li key={a.key} className="flex gap-2.5 text-[12.5px]">
              <span aria-hidden className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${m.cls}`}>{m.sign}</span>
              <div className="min-w-0">
                <p className="text-white/90"><span className="font-medium text-white">{a.label}</span><span className="sr-only">: {m.word}.</span> — {a.note}</p>
                {a.suggestion && <p className="mt-0.5 text-muted">{a.suggestion}{elsewhere && <> <Link href={elsewhere.href} className="text-violet-bright underline-offset-4 hover:underline">{elsewhere.label}</Link></>}</p>}
                {a.key === "format" && a.state === "fix" && onCreate && <button type="button" onClick={onCreate} className="mt-1 text-violet-bright underline-offset-4 hover:underline">Create the picture</button>}
              </div>
            </li>
          );
        })}
      </ul>
      {r.fixes.length > 0 && onImprove && (
        <div className="mt-4 rounded-xl bg-violet/[0.08] px-3.5 py-3">
          <p className="text-[12.5px] text-white/90">MAIRO can make {r.fixes.length === 1 ? "this change" : "these changes"} for you: {r.fixes.map((f) => f.label.charAt(0).toLowerCase() + f.label.slice(1)).join(", ")}. It&rsquo;s saved as a new version — you can go back to the current one.</p>
          <button type="button" disabled={improving} onClick={onImprove} className="mt-2 inline-flex min-h-[36px] items-center rounded-full bg-[image:var(--mairo-ramp)] px-4 text-[12.5px] font-semibold text-black disabled:opacity-60">{improving ? "Improving…" : "Improve this ad"}</button>
        </div>
      )}
      <p className="mt-3 text-[11.5px] leading-relaxed text-faint">{r.label}</p>
    </section>
  );
}
