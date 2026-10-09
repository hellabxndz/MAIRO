import Link from "next/link";
import { db } from "@/lib/db";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { successAccounts } from "@/lib/success/accounts";
import { recentFailedRuns } from "@/lib/team/runs";

// Customer success: who's getting value from MAIRO, who's struggling and
// why, and the program's numbers — for the first founding customers and
// everyone after them. Every figure comes from real account activity; there
// is nothing here to fill in by hand except notes.

export const dynamic = "force-dynamic";

const TONE = { struggling: "red", watch: "yellow", healthy: "green", cancelled: "neutral" } as const;
const LEVEL = { struggling: "Struggling", watch: "Watch", healthy: "On track", cancelled: "Cancelled" } as const;
const KIND = { PROBLEM: "Problem", CONFUSING: "Confusing", IDEA: "Idea", CANCELLATION: "Cancelling", PULSE: "Pulse" } as const;

const ago = (d: Date | null) => {
  if (!d) return "never";
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  return days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
};
const pct = (v: number | null) => (v === null ? "—" : `${v}%`);

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ founding?: string }> }) {
  const foundingOnly = (await searchParams).founding === "1";
  const [{ accounts, metrics }, inbox, failedRuns] = await Promise.all([
    successAccounts({ foundingOnly }),
    db.customerFeedback.findMany({
      where: { status: { not: "RESOLVED" }, kind: { not: "PULSE" } },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { organization: { select: { name: true } } },
    }),
    // AI Team work that failed or never finished, so it gets looked at.
    recentFailedRuns(),
  ]);

  return (
    <div>
      <PageHeader
        title="Customers"
        description="Who's getting value from MAIRO, who's struggling and why. Struggling accounts are listed first."
        action={
          <Link href={foundingOnly ? "/aios/customers" : "/aios/customers?founding=1"} className="rounded-lg border border-white/15 px-4 py-2 text-xs text-neutral-300 hover:text-white">
            {foundingOnly ? "All customers" : "Founding customers only"}
          </Link>
        }
      />

      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        {[
          ["Accounts", String(metrics.accounts)],
          ["Struggling", String(metrics.struggling)],
          ["Set up (day 1 done)", pct(metrics.activatedPct)],
          ["Median days to first campaign", metrics.medianDaysToFirstCampaign === null ? "—" : String(metrics.medianDaysToFirstCampaign)],
          ["Still paying (of ever paid)", pct(metrics.retainedPct)],
          ["Active in last 7 days", pct(metrics.activeLast7Pct)],
          ['"MAIRO is easier": yes', metrics.pulseAnswers ? `${pct(metrics.easierPct)} of ${metrics.pulseAnswers}` : "—"],
          ["Cancelled", String(metrics.cancelled)],
        ].map(([label, value]) => (
          <Card key={label} className="!p-4">
            <p className="text-xl font-medium text-white">{value}</p>
            <p className="mt-1 text-[11px] leading-snug text-neutral-500">{label}</p>
          </Card>
        ))}
      </div>

      {accounts.length === 0 ? (
        <EmptyState title={foundingOnly ? "No founding customers yet" : "No customers yet"} description={foundingOnly ? "Mark a business as a founding customer on its page." : undefined} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-white/[0.03] text-neutral-400">
              <tr>
                <th className="px-4 py-3 font-medium">Business</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">First 30 days</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Last visit</th>
                <th className="px-4 py-3 font-medium">Why</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => {
                const current = a.journey.stages.find((s) => s.state === "current");
                return (
                  <tr key={a.id} className="border-t border-white/10 align-top hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <Link href={`/aios/organizations/${a.id}`} className="font-medium hover:underline">{a.name}</Link>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {a.founding && <Badge tone="blue">Founding</Badge>}
                        {a.consent && <Badge tone="neutral">Case study OK</Badge>}
                        {a.openIssues > 0 && <Badge tone="yellow">{a.openIssues} open</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3"><Badge tone={TONE[a.health.level]}>{LEVEL[a.health.level]}</Badge></td>
                    <td className="px-4 py-3 text-neutral-400">
                      Day {a.journey.day} · {a.journey.done}/{a.journey.total}
                      <div className="text-[12px] text-neutral-500">{current ? current.title : "All done"}</div>
                    </td>
                    <td className="px-4 py-3 text-neutral-400">
                      {a.plan === "NONE" ? "No plan" : a.plan}
                      <div className="text-[12px] text-neutral-500">{a.status ?? "—"}{a.daysToFirstCampaign !== null ? ` · 1st campaign day ${a.daysToFirstCampaign}` : ""}</div>
                    </td>
                    <td className="px-4 py-3 text-neutral-400">{ago(a.lastActiveAt)}</td>
                    <td className="px-4 py-3 text-[13px] text-neutral-300">
                      {a.health.flags.length ? a.health.flags.slice(0, 3).join(" · ") : "—"}
                      {a.cancelReason && <div className="text-[12px] text-neutral-500">Reason given: {a.cancelReason}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mb-3 mt-10 text-sm font-medium text-neutral-300">AI Team tasks that failed or got stuck (48 hours)</h2>
      {failedRuns.length === 0 ? (
        <p className="text-[13px] text-neutral-500">None.</p>
      ) : (
        <div className="space-y-2">
          {failedRuns.map((r) => (
            <Card key={r.id} className="!p-4">
              <p className="text-sm text-white">
                <Badge tone="red">{r.status === "RUNNING" ? "Stuck" : "Failed"}</Badge>{" "}
                <Link href={`/aios/organizations/${r.organizationId}`} className="hover:underline">{r.organization.name}</Link>
                <span className="text-neutral-500"> · {r.agent.toLowerCase()} · {r.task} · {ago(r.startedAt)}</span>
              </p>
              {(r.detail || r.summary) && <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] text-neutral-400">{r.detail ?? r.summary}</p>}
            </Card>
          ))}
        </div>
      )}

      <h2 className="mb-3 mt-10 text-sm font-medium text-neutral-300">Open problems, questions and ideas</h2>
      {inbox.length === 0 ? (
        <EmptyState title="Nothing open" description="Problem reports, ideas and 'this is confusing' from customers land here." />
      ) : (
        <div className="space-y-2">
          {inbox.map((f) => (
            <Card key={f.id} className="!p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm text-white">
                  <Badge tone={f.kind === "PROBLEM" ? "red" : f.kind === "CANCELLATION" ? "yellow" : "neutral"}>{KIND[f.kind]}</Badge>{" "}
                  <Link href={`/aios/organizations/${f.organizationId}`} className="hover:underline">{f.organization.name}</Link>
                </p>
                <p className="text-[12px] text-neutral-500">{ago(f.createdAt)}{f.page ? ` · ${f.page}` : ""} · {f.status.replace("_", " ").toLowerCase()}</p>
              </div>
              {f.text && <p className="mt-2 whitespace-pre-wrap text-[13px] text-neutral-300">{f.text}</p>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
