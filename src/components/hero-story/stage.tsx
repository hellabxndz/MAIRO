import type { CSSProperties, ReactNode } from "react";
import type { Example } from "@/lib/demo/examples";
import { reveal, type Box } from "@/lib/demo/timeline";
import { BusinessArt } from "./art";

// The pieces of the 60-second walkthrough (components/walkthrough), drawn on
// a dark surface: the website, the website box, concepts, the feed and story
// previews, the review and the dashboard. The landing story's own scenes are
// in story-stage.tsx; it borrows Layer and the two ad previews from here.
//
// Everything visible is labelled sample data. Nothing here is clickable: it's
// a picture of the product, kept apart from the real preview controls.

export const surface: CSSProperties = { background: "linear-gradient(160deg, rgba(24,22,48,0.96), rgba(12,12,28,0.96))", border: "1px solid rgba(167,139,250,0.22)", boxShadow: "0 30px 70px -30px rgba(0,0,0,0.9), 0 0 0 1px rgba(124,92,255,0.06)" };

export function Layer({ b, children, style, className = "" }: { b: Box; children: ReactNode; style?: CSSProperties; className?: string }) {
  if (b.o <= 0.001) return null;
  return (
    <div
      className={`absolute overflow-hidden ${className}`}
      style={{ left: b.x, top: b.y, width: b.w, height: b.h, opacity: Math.min(1, b.o), transform: `scale(${b.s})`, zIndex: b.z, ...style }}
    >
      {children}
    </div>
  );
}

export function Browser({ ex, t, narrow, marks = { start: 3700, end: 5600 } }: { ex: Example; t: number; narrow: boolean; marks?: { start: number; end: number } }) {
  const c = ex.colors;
  // Each highlight hugs the thing MAIRO read, so it stays on it as the browser changes size.
  const scan = (a: number) => reveal(t, a, a + 350) * (1 - reveal(t, marks.end, marks.end + 400));
  return (
    <div className="flex h-full flex-col rounded-[14px] bg-white text-[#111]" style={{ boxShadow: "0 30px 80px -30px rgba(0,0,0,0.85)" }}>
      <div className="flex items-center gap-1.5 border-b border-black/10 bg-[#f1f1f4] px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-2 truncate rounded-md bg-white px-2 py-0.5 text-[11px] text-black/60">{ex.url}</span>
      </div>
      <div className="relative flex-1 overflow-hidden" style={{ background: c.paper }}>
        <div className="flex items-center justify-between px-4 py-2.5" style={{ color: c.ink }}>
          <span className="text-[13px] font-bold tracking-tight">{ex.name}</span>
          <span className="flex gap-3 text-[11px] opacity-75">{ex.site.nav.map((n) => <span key={n}>{n}</span>)}</span>
        </div>
        <div className={narrow ? "flex flex-col-reverse gap-2 px-4" : "grid grid-cols-[1.1fr_1fr] gap-3 px-4"}>
          <div className="pt-1">
            <Mark label="Offer" o={scan(marks.start)}>
              <p className="text-[19px] font-extrabold leading-[1.1] tracking-[-0.02em]" style={{ color: c.ink }}>{ex.site.headline}</p>
            </Mark>
            <p className="mt-1.5 text-[11.5px] leading-snug" style={{ color: c.ink, opacity: 0.75 }}>{ex.site.sub}</p>
            <Mark label="Location" o={scan(marks.start + 500)} className="mt-1">
              <p className="text-[11px]" style={{ color: c.ink, opacity: 0.7 }}>{ex.profile.location}</p>
            </Mark>
            <span className="mt-2.5 inline-block rounded-md px-3 py-1.5 text-[11.5px] font-semibold text-white" style={{ background: c.a }}>{ex.site.button}</span>
          </div>
          <Mark label="Brand style" o={scan(marks.start + 1000)}>
            <div className={`overflow-hidden rounded-lg ${narrow ? "h-[120px]" : "h-[178px]"}`}>
              <BusinessArt type={ex.type} variant="site" className="h-full w-full" />
            </div>
          </Mark>
        </div>
      </div>
    </div>
  );
}

function Mark({ label, o, className = "", children }: { label: string; o: number; className?: string; children: ReactNode }) {
  return (
    <div className={`relative ${className}`}>
      {children}
      {o > 0.01 && (
        <div className="pointer-events-none absolute -inset-1 rounded-md" style={{ opacity: o, border: "2px solid #a78bfa", background: "rgba(124,92,255,0.10)", boxShadow: "0 0 0 4px rgba(124,92,255,0.16)" }}>
          <span className="absolute -top-2.5 left-2 rounded bg-[#7c5cff] px-1.5 py-[1px] text-[9.5px] font-semibold text-white">{label}</span>
        </div>
      )}
    </div>
  );
}

export function InputPill({ ex, t, invite = false }: { ex: Example; t: number; invite?: boolean }) {
  const chars = invite ? 0 : Math.floor(ex.url.length * reveal(t, 800, 2300));
  const typed = ex.url.slice(0, chars);
  const caret = !invite && Math.floor(t / 450) % 2 === 0;
  const pressed = !invite && t > 2550 && t < 2800;
  return (
    <div className="flex h-full items-center gap-2 rounded-full px-2 pl-4" style={{ ...surface, borderColor: "rgba(167,139,250,0.4)" }}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#c4b5fd]">MAIRO</span>
      <span className="min-w-0 flex-1 truncate text-[14px] text-white">
        {typed || <span className="text-white/45">Enter your business website</span>}
        {caret && <span className="ml-[1px] inline-block h-[15px] w-[2px] translate-y-[2px] bg-white/80" />}
      </span>
      <span className="shrink-0 rounded-full bg-gradient-to-r from-[#5b6cff] to-[#8b4dfb] px-4 py-2 text-[12.5px] font-semibold text-white" style={{ transform: pressed ? "scale(0.94)" : "none" }}>
        See Your Free Plan
      </span>
    </div>
  );
}

export function ConceptCard({ ex, i, t, selected, ringAt = 8000, hook }: { ex: Example; i: number; t: number; selected: boolean; ringAt?: number; hook?: string }) {
  const c = ex.concepts[i];
  const ring = selected ? reveal(t, ringAt, ringAt + 600) : 0;
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl bg-white text-[#111]" style={{ boxShadow: `0 24px 60px -24px rgba(0,0,0,0.9), 0 0 0 ${3 * ring}px rgba(167,139,250,${0.9 * ring})` }}>
      <div className="relative min-h-0 flex-[1.15]">
        <BusinessArt type={ex.type} variant={c.art} className="absolute inset-0 h-full w-full" />
        <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white">{c.format}</span>
        {ring > 0.05 && <span className="absolute right-2 top-2 rounded-full bg-[#7c5cff] px-2 py-0.5 text-[10px] font-semibold text-white" style={{ opacity: ring }}>Selected</span>}
      </div>
      <div className="flex flex-1 flex-col p-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: ex.colors.a }}>{c.angle}</p>
        <p className="mt-1 text-[16px] font-bold leading-[1.15] tracking-[-0.01em]">{hook ?? c.hook}</p>
        <div className="mt-auto flex items-center justify-between pt-2">
          <span className="text-[10.5px] text-black/50">{ex.name}</span>
          <span className="rounded-md px-2.5 py-1 text-[11px] font-semibold text-white" style={{ background: ex.colors.a }}>{c.cta}</span>
        </div>
      </div>
    </div>
  );
}

export function FeedPreview({ ex, hook }: { ex: Example; hook?: string }) {
  const c = ex.concepts[ex.selected];
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[26px] border-[6px] border-[#141428] bg-white text-[#111]">
      <div className="flex items-center gap-2 px-3 pb-2 pt-3">
        <span className="h-7 w-7 rounded-full" style={{ background: ex.colors.a }} />
        <div className="leading-tight">
          <p className="text-[12px] font-semibold">{ex.name}</p>
          <p className="text-[10px] text-black/50">Sponsored</p>
        </div>
        <span className="ml-auto text-[10px] text-black/45">Feed</span>
      </div>
      <p className="px-3 pb-2 text-[12px] leading-snug">{c.body}</p>
      <div className="relative min-h-0 flex-1">
        <BusinessArt type={ex.type} variant={c.art} className="absolute inset-0 h-full w-full" />
      </div>
      <div className="flex items-center justify-between gap-2 bg-[#f0f2f5] px-3 py-2.5">
        <p className="min-w-0 truncate text-[12.5px] font-semibold">{hook ?? c.hook}</p>
        <span className="shrink-0 rounded-md bg-[#e4e6eb] px-2.5 py-1 text-[11px] font-semibold">{c.cta}</span>
      </div>
    </div>
  );
}

export function StoryPreview({ ex, hook }: { ex: Example; hook?: string }) {
  const c = ex.concepts[ex.selected];
  return (
    <div className="relative h-full overflow-hidden rounded-[22px] border-[5px] border-[#141428] bg-black">
      <BusinessArt type={ex.type} variant={c.art} className="absolute inset-0 h-full w-full" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/60" />
      <div className="absolute left-0 right-0 top-[14%] border-t border-dashed border-white/25" />
      <div className="absolute bottom-[20%] left-0 right-0 border-t border-dashed border-white/25" />
      <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5">
        <span className="h-5 w-5 rounded-full ring-2 ring-white" style={{ background: ex.colors.a }} />
        <span className="max-w-[58%] truncate text-[10px] font-semibold text-white">{ex.name}</span>
      </div>
      <p className="absolute left-3 right-3 top-[22%] text-[15px] font-extrabold leading-tight text-white" style={{ textShadow: "0 2px 12px rgba(0,0,0,0.6)" }}>{hook ?? c.hook}</p>
      <span className="absolute bottom-[8%] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-black">{c.cta}</span>
      <span className="absolute right-2.5 top-2.5 rounded bg-black/40 px-1.5 text-[9px] text-white/80">9:16</span>
    </div>
  );
}

export function Review({ ex, t, compact, pressAt = 12500 }: { ex: Example; t: number; compact: boolean; pressAt?: number }) {
  const approved = t >= pressAt + 300;
  const pressed = t >= pressAt && t < pressAt + 300;
  const rows: [string, string][] = [
    ["Budget (example)", ex.review.budget],
    ["Where", ex.review.where],
    ["Objective", ex.review.objective],
  ];
  return (
    <div className={`flex h-full flex-col rounded-2xl ${compact ? "p-3" : "p-4"}`} style={surface}>
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[#c4b5fd]">Review before launch</p>
      <dl className={`mt-2 ${compact ? "grid grid-cols-3 gap-2" : "space-y-2.5"}`}>
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="text-[10px] text-white/50">{k}</dt>
            <dd className="text-[12.5px] leading-snug text-white">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-auto pt-3">
        <span
          className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-[12.5px] font-semibold ${approved ? "bg-emerald-400/15 text-emerald-300" : "bg-gradient-to-r from-[#5b6cff] to-[#8b4dfb] text-white"}`}
          style={{ transform: pressed ? "scale(0.95)" : "none" }}
        >
          {approved ? "✓ Approved by you" : "Approve campaign"}
        </span>
        {!compact && <p className="mt-1.5 text-[10.5px] leading-snug text-white/50">Nothing runs until you approve. Ad spend is paid to Meta, separately from MAIRO.</p>}
      </div>
    </div>
  );
}

/** The metric the sample lead moves into counts it only once it has moved, so the figures agree with the row below them. */
function countedValue(label: string, value: string, movesTo: string, moved: boolean): string {
  if (moved || label !== movesTo || !/^\d+$/.test(value)) return value;
  return String(Math.max(0, Number(value) - 1));
}

export type DashboardTimes = { metrics: number; lead: number; move: number; next: number };

export function Dashboard({ ex, t, narrow, times }: { ex: Example; t: number; narrow: boolean; times: DashboardTimes }) {
  const d = ex.dashboard;
  const moved = t >= times.move;
  return (
    <div className={`flex h-full flex-col rounded-2xl ${narrow ? "p-3.5" : "p-5"}`} style={surface}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[#c4b5fd]">This week</p>
          <p className="text-[15px] font-semibold text-white">{ex.name}</p>
        </div>
        <span className="rounded-full border border-amber-300/40 bg-amber-300/10 px-2 py-0.5 text-[10px] font-medium text-amber-200">Sample figures</span>
      </div>
      <div className={`mt-3 grid gap-2 ${narrow ? "grid-cols-2" : "grid-cols-4"}`}>
        {d.metrics.map((m, i) => {
          const o = reveal(t, times.metrics + i * 180, times.metrics + 400 + i * 180);
          return (
            <div key={m.label} className="rounded-xl bg-white/[0.05] px-3 py-2.5" style={{ opacity: 0.15 + 0.85 * o }}>
              <p className="text-[10.5px] text-white/55">{m.label}</p>
              <p className={`mt-0.5 font-semibold ${m.unavailable ? "text-[12px] text-white/60" : "text-[20px] text-white"}`}>{countedValue(m.label, m.value, d.lead.to, moved)}</p>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-white/[0.04] px-3 py-2.5" style={{ opacity: reveal(t, times.lead, times.lead + 400) }}>
        <p className="min-w-0 truncate text-[12px] text-white/85">{d.lead.name}</p>
        <span className="shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold" style={{ background: moved ? "rgba(52,211,153,0.15)" : "rgba(255,255,255,0.08)", color: moved ? "#6fe0b4" : "rgba(255,255,255,0.75)" }}>
          {moved ? d.lead.to : d.lead.from}
        </span>
      </div>
      <div className="mt-3 rounded-xl border border-[#a78bfa]/35 bg-[#7c5cff]/[0.08] p-3" style={{ opacity: reveal(t, times.next, times.next + 500), transform: `translateY(${(1 - reveal(t, times.next, times.next + 500)) * 8}px)` }}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#c4b5fd]">Proposed next action</p>
        <p className="mt-0.5 text-[14px] font-semibold text-white">{d.next.title}</p>
        <p className="mt-1 text-[11.5px] leading-snug text-white/70">{d.next.why}</p>
        <p className="mt-1 text-[10.5px] text-white/50">{d.next.when}</p>
      </div>
    </div>
  );
}
