import Link from "next/link";

// The Overview's Performance Coach card: the most important thing the coach
// found, in plain words, or that nothing needs attention. Opens the Coach.

export function CoachCard({ top, count }: { top: { id: string; title: string; plain: string; severity: string } | null; count: number }) {
  return (
    <section aria-labelledby="coach-card" className="rounded-[28px] p-6 sm:p-7" style={{ background: "linear-gradient(160deg, rgba(124,92,255,0.10), rgba(var(--mairo-fg-rgb),0.015) 60%)" }}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="coach-card" className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-bright">Your AI Performance Coach</h2>
        <Link href="/dashboard/coach" className="text-[13px] text-muted hover:text-white">
          {count > 1 ? `See all ${count} →` : "Open →"}
        </Link>
      </div>
      {top ? (
        <>
          <p className="mt-3 text-[15.5px] font-medium text-white">{top.title}</p>
          <p className="mt-1.5 max-w-[760px] text-[14px] leading-relaxed text-white/80">{top.plain}</p>
          <Link href={`/dashboard/coach#${top.id}`} className="mt-4 inline-block rounded-full bg-[image:var(--mairo-ramp)] px-4 py-2 text-[13px] font-medium text-white">
            See what your AI team recommends
          </Link>
        </>
      ) : (
        <p className="mt-3 text-[14px] leading-relaxed text-white/80">
          Nothing needs your attention right now. Your coach follows your results from the ad to paying customers every day — mark what happens to your leads and it can follow them further.
        </p>
      )}
    </section>
  );
}
