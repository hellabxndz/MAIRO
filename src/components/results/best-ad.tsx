import Link from "next/link";
import { db } from "@/lib/db";
import { gatherDecisionInput } from "@/lib/decisions/gather";
import { toView } from "@/lib/decisions/store";
import { creativeReport, type CreativeReport } from "@/lib/creative/winner";
import { usd } from "@/lib/protection/rules";
import { DecisionControls } from "@/components/console/decision-controls";

// The agency loop on one screen: which ad is working in each campaign, the
// evidence in plain English (and how much data it rests on), what MAIRO
// still needs to see when it can't call it yet, and — from the same place —
// the next creative test MAIRO proposes, with the same Approve / Not now as
// the Approval Center. Nothing is built or changed until the owner approves.
//
// The verdict is lib/creative/winner.ts, the same one the next-test rule
// uses, so this screen and the recommendation can't disagree. Read from
// Meta as the page loads; streamed in (Suspense on the Results page) so the
// headline figures never wait for it.

/** Decisions that are the next creative test for a campaign. */
const TEST_KINDS = ["test-from-winner", "test-variation", "creative-fatigue", "pause-ad"];

const VERDICT: Record<CreativeReport["verdict"], { label: string; tone: string }> = {
  winner: { label: "Clear winner", tone: "text-white" },
  leading: { label: "Leading — not decided yet", tone: "text-white/80" },
  "only-one": { label: "One ad running", tone: "text-white/80" },
  "too-early": { label: "Too early to judge", tone: "text-white/70" },
  "no-data": { label: "No results yet", tone: "text-white/70" },
};

/** The first error a failed attempt recorded, as a sentence. */
function failureOf(resultJson: string | null): string {
  try {
    const rows = JSON.parse(resultJson ?? "[]") as { ok?: boolean; error?: string }[];
    const e = rows.find((r) => r.ok === false && r.error)?.error;
    if (e) return /[.!?]$/.test(e.trim()) ? e.trim() : `${e.trim()}.`;
  } catch {
    // Unreadable: the generic line below.
  }
  return "Meta or MAIRO couldn't complete it.";
}

export async function BestAd({ organizationId }: { organizationId: string }) {
  const input = await gatherDecisionInput(organizationId).catch(() => null);
  if (!input) {
    return (
      <section className="rounded-[24px] p-5 sm:p-6 mairo-glass" data-best-ad="unavailable">
        <h2 className="text-[16px] font-semibold text-white">Your best ad</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">Unavailable right now: MAIRO couldn&rsquo;t read your ads from Meta. Nothing here is zero — it&rsquo;s unknown until Meta answers.</p>
      </section>
    );
  }
  const reports = input.campaigns
    .filter((c) => c.ads.length > 0)
    .sort((a, b) => (b.week?.spendCents ?? 0) - (a.week?.spendCents ?? 0))
    .slice(0, 2)
    .map((c) => creativeReport(c, input.now));
  if (reports.length === 0) {
    return (
      <section className="rounded-[24px] p-5 sm:p-6 mairo-glass" data-best-ad="none">
        <h2 className="text-[16px] font-semibold text-white">Your best ad</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">Pending: once a campaign is running on Meta, MAIRO shows which ad works best here, and proposes the next one to test.</p>
      </section>
    );
  }

  // Scoped to this business and these campaigns only.
  const pending = await db.mairoDecision.findMany({
    // A test that failed to go through stays here, with why, and can be tried again (lib/decisions/apply.ts accepts it).
    where: { organizationId, status: { in: ["PENDING", "FAILED"] }, kind: { in: TEST_KINDS }, mairoCampaignId: { in: reports.map((r) => r.mairoCampaignId) } },
    orderBy: [{ urgent: "desc" }, { createdAt: "desc" }],
  });

  return (
    <section aria-labelledby="best-ad-title" className="space-y-4" data-best-ad="shown">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
        <h2 id="best-ad-title" className="text-[16px] font-semibold text-white">Your best ad, and what to test next</h2>
        <p className="text-[12.5px] text-faint">Last 7 days, as Meta reports it. The last day or two can still change.</p>
      </div>
      {reports.map((r) => {
        const next = pending.find((d) => d.mairoCampaignId === r.mairoCampaignId) ?? null;
        const v = VERDICT[r.verdict];
        return (
          <article key={r.mairoCampaignId} className="rounded-[24px] p-5 sm:p-6 mairo-glass" data-verdict={r.verdict}>
            <p className="v3-label">{r.campaign}</p>
            <div className="mt-3 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="min-w-0">
                <p className={`text-[13px] font-medium ${v.tone}`}>{v.label}</p>
                {r.best && (
                  <p className="mt-1 text-[19px] font-semibold leading-snug tracking-[-0.01em] text-white">
                    {r.best.headline ? <>&ldquo;{r.best.headline}&rdquo;</> : r.best.label}
                  </p>
                )}
                <p className="mt-2 text-[14.5px] leading-relaxed text-white/85">{r.evidence}</p>
                {r.needs && <p className="mt-2 text-[14px] leading-relaxed text-white/65" data-needs>{r.needs}</p>}
                <p className="mt-3 text-[12.5px] text-faint">
                  Based on {usd(r.basis.spendCents)} spent and {r.basis.results} {r.word}
                  {r.basis.results === 1 ? "" : "s"} across {r.ads.length} ad{r.ads.length === 1 ? "" : "s"}.
                </p>
                {r.ads.length > 1 && (
                  <table className="mt-4 w-full text-left text-[13px]">
                    <caption className="sr-only">Each ad in {r.campaign}, last 7 days</caption>
                    <thead className="text-faint">
                      <tr>
                        <th scope="col" className="pb-1.5 font-normal">Ad</th>
                        <th scope="col" className="pb-1.5 text-right font-normal">Spent</th>
                        <th scope="col" className="pb-1.5 text-right font-normal capitalize">{r.word}s</th>
                        <th scope="col" className="pb-1.5 text-right font-normal">Per {r.word}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.ads.map((a) => (
                        <tr key={a.label} className={`border-t ${a === r.best ? "text-white" : "text-white/70"}`} style={{ borderColor: "var(--v3-line)" }}>
                          <td className="max-w-[180px] truncate py-1.5">{a.headline ?? a.label}</td>
                          <td className="py-1.5 text-right tabular-nums">{a.spendCents === null ? "—" : usd(a.spendCents)}</td>
                          <td className="py-1.5 text-right tabular-nums">{a.results ?? "—"}</td>
                          <td className="py-1.5 text-right tabular-nums">{a.costPerResultCents === null ? "—" : usd(a.costPerResultCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="min-w-0 rounded-[18px] border p-4" style={{ borderColor: "var(--v3-line)" }}>
                <p className="v3-label">Next test</p>
                {next ? (
                  <>
                    <p className="mt-2 text-[16px] font-medium leading-snug text-white">{next.title}</p>
                    <p className="mt-1.5 text-[14px] leading-relaxed text-white/75">{next.recommendation}</p>
                    <p className="mt-1.5 text-[13px] text-white/60">{next.impact}</p>
                    {next.status === "FAILED" && (
                      <p className="mt-2 rounded-xl border border-amber-300/30 bg-amber-300/[0.06] px-3 py-2 text-[13px] leading-relaxed text-amber-100" data-next-test-failed>
                        Your last approval didn&rsquo;t go through: {failureOf(next.resultJson)} {/nothing was changed/i.test(failureOf(next.resultJson)) ? "" : "Nothing was changed in your ad account. "}You can approve it again.
                      </p>
                    )}
                    <div className="mt-4" data-next-test>
                      <DecisionControls decision={toView(next)} />
                    </div>
                  </>
                ) : (
                  <p className="mt-2 text-[14px] leading-relaxed text-white/70" data-next-test="none">
                    {r.verdict === "winner"
                      ? "MAIRO is preparing a new version of the winning ad. It appears here, and in your approvals, after its next daily check."
                      : r.needs ?? "Nothing to test right now. MAIRO checks every day and asks here first."}
                  </p>
                )}
                <p className="mt-3 text-[12px] text-faint">New ads never go live without your approval. <Link href="/dashboard/decisions" className="underline underline-offset-4 hover:text-white">All approvals</Link></p>
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}
