import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { activeOrganizationId } from "@/lib/active-org";
import { loadChangeHistory, loadFindings, type FindingView } from "@/lib/coach/store";
import { CoachLive } from "@/components/coach/overview";
import { FindingCard, type FindingCardData } from "@/components/coach/finding-card";
import { ReviewNow } from "@/components/coach/review-now";

// Your AI Performance Coach: the journey from ad to customer, what MAIRO's AI
// team found along it and what it recommends, and what followed the changes
// already made. Findings come from the daily review (and "Review now"); the
// figures at the top are read live. Nothing here is an example.

export const metadata = { title: "Your AI Performance Coach — MAIRO" };
export const dynamic = "force-dynamic";

const eyebrow = "text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-bright";
const panel = { background: "linear-gradient(180deg, rgba(var(--mairo-fg-rgb),0.035), rgba(var(--mairo-fg-rgb),0.015))" };

const VERDICT: Record<string, { label: string; cls: string }> = {
  IMPROVED: { label: "Improved afterwards", cls: "bg-live/15 text-live" },
  WORSENED: { label: "Worse afterwards", cls: "bg-alert/15 text-alert" },
  INCONCLUSIVE: { label: "No clear change", cls: "bg-white/[0.07] text-muted" },
  NOT_MEASURABLE: { label: "Not enough data to tell", cls: "bg-white/[0.07] text-muted" },
};

const toCard = (v: FindingView): FindingCardData => ({
  id: v.id,
  severity: v.severity,
  confidence: v.confidence,
  status: v.status,
  campaignName: v.campaignName,
  title: v.title,
  plain: v.plain,
  noticed: v.noticed,
  explanations: v.explanations,
  shownRecommendation: v.shownRecommendation,
  hasAnother: v.hasAnother,
  evidence: v.evidence,
  limitations: v.limitations,
  missing: v.missing,
  steps: v.steps,
  agents: v.agents,
  decisionId: v.decisionId,
  decisionStatus: v.decisionStatus,
  feedback: v.feedback,
  verdictNote: v.verdictNote,
  checkAfter: v.checkAfter?.toISOString() ?? null,
  lastSeenAt: v.lastSeenAt.toISOString(),
});

const when = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default async function CoachPage() {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  const now = new Date();
  const [{ active, past, lastReviewedAt }, changes] = await Promise.all([loadFindings(organizationId, now), loadChangeHistory(organizationId, now)]);

  return (
    <div className="mx-auto max-w-[1100px]">
      <header className="mb-6">
        <p className={eyebrow}>Your MAIRO AI Team</p>
        <h1 className="mt-2 text-[clamp(26px,3.4vw,34px)] font-semibold tracking-[-0.02em] text-white">Your AI Performance Coach</h1>
        <p className="mt-3 max-w-[720px] text-[15px] leading-relaxed text-white/80">
          Follows your results from the ad all the way to paying customers, finds where things slow down, and says what may help — with the numbers behind it, and what it can&rsquo;t be sure of.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <ReviewNow />
          <p className="text-[12.5px] text-faint">{lastReviewedAt ? `Last reviewed ${lastReviewedAt.toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })}. Reviews run once a day.` : "Your first review runs with the daily check, or now if you ask."}</p>
        </div>
      </header>

      <section aria-labelledby="journey" className="mb-6 rounded-[28px] p-5 sm:p-7" style={panel}>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="journey" className={eyebrow}>The last two weeks, from ad to customer</h2>
          <p className="text-[12px] text-faint">Compared with the two weeks before</p>
        </div>
        <div className="mt-4">
          <Suspense fallback={<p className="text-[14px] text-muted">Reading your latest results from Meta…</p>}>
            <CoachLive organizationId={organizationId} />
          </Suspense>
        </div>
      </section>

      <section aria-labelledby="insights" className="mb-6">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="insights" className={eyebrow}>What your AI team found</h2>
          <Link href="/dashboard/team#activity" className="text-[12.5px] text-muted hover:text-white">
            See every step your AI team took →
          </Link>
        </div>
        {active.length === 0 ? (
          <div className="rounded-[24px] p-6 text-[14px] text-muted" style={panel}>
            {lastReviewedAt
              ? "Nothing needs your attention right now. Your AI team looks again every day and tells you when something changes."
              : "Nothing yet. Your AI team investigates once your campaigns have run long enough to compare — and once leads come in, marking what happens to them lets it follow results all the way to customers."}
          </div>
        ) : (
          <div className="grid gap-4">
            {active.map((f) => (
              <FindingCard key={f.id} f={toCard(f)} />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="history" className="rounded-[28px] p-5 sm:p-7" style={panel}>
        <h2 id="history" className={eyebrow}>What was tried, and what followed</h2>
        <p className="mt-2 max-w-[760px] text-[12.5px] text-muted">
          Two weeks after a change, MAIRO compares the two weeks before with the two weeks after. Other things change at the same time, so this shows what followed — not proof of what caused it. MAIRO avoids suggesting again what was followed by worse results.
        </p>
        {changes.length === 0 && past.length === 0 ? (
          <p className="mt-4 text-[14px] text-muted">Nothing yet. Once a recommendation is carried out, what followed shows here.</p>
        ) : (
          <ul className="mt-4 divide-y divide-[color:var(--mairo-line)]">
            {changes.map((c) => {
              const v = c.verdict ? VERDICT[c.verdict] : null;
              return (
                <li key={c.id} className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-start sm:gap-4">
                  <span className="w-[160px] shrink-0">
                    <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] ${v?.cls ?? "bg-violet/10 text-violet-bright"}`}>{v?.label ?? "Being measured"}</span>
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13.5px] text-white">
                      {c.title} <span className="text-[12px] text-faint">· {c.decidedAt ? when(c.decidedAt) : ""}{c.automatic ? " · made within your limits" : " · you approved"}</span>
                    </span>
                    <span className="block text-[12.5px] leading-relaxed text-muted">{c.verdictNote ?? "Carried out on Meta. MAIRO compares results two weeks after."}</span>
                  </span>
                </li>
              );
            })}
            {past.map((f) => (
              <li key={f.id} className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-start sm:gap-4">
                <span className="w-[160px] shrink-0">
                  <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] ${f.status === "DISMISSED" ? "bg-white/[0.07] text-muted" : f.verdict ? (VERDICT[f.verdict]?.cls ?? "") : "bg-live/15 text-live"}`}>
                    {f.status === "DISMISSED" ? "You dismissed it" : f.verdict ? VERDICT[f.verdict]?.label : "No longer seen"}
                  </span>
                </span>
                <span className="min-w-0">
                  <span className="block text-[13.5px] text-white">
                    {f.title} <span className="text-[12px] text-faint">· {when(f.resolvedAt ?? f.decidedAt ?? f.lastSeenAt)}</span>
                  </span>
                  {f.verdictNote && <span className="block text-[12.5px] leading-relaxed text-muted">{f.verdictNote}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
