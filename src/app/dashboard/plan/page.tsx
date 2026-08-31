import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader, Badge, EmptyState } from "@/components/ui";
import { currentMonthKey, formatMonthKey } from "@/lib/utils/month";
import { regeneratePlanAction, approvePlanAction } from "@/lib/actions/plan-actions";
import { RegenerateButton } from "./regenerate-button";

const statusTone = {
  DRAFT: "neutral",
  IN_REVIEW: "yellow",
  APPROVED: "blue",
  ACTIVE: "green",
  COMPLETE: "neutral",
} as const;

type BudgetLine = { channel: string; percent: number; rationale: string };
type MetricLine = { metric: string; target: string };

export default async function PlanPage() {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");

  const plan = await db.monthlyPlan.findUnique({
    where: {
      organizationId_month: {
        organizationId: session.user.organizationId,
        month: currentMonthKey(),
      },
    },
  });

  const budgetAllocation: BudgetLine[] = plan ? JSON.parse(plan.budgetAllocationJson || "[]") : [];
  const keyMetrics: MetricLine[] = plan?.keyMetrics ? JSON.parse(plan.keyMetrics) : [];

  return (
    <div>
      <PageHeader
        title={`${formatMonthKey(currentMonthKey())} plan`}
        description="Your AI-generated strategy for this month. Regenerate it any time your goal or budget changes."
        action={<RegenerateButton action={regeneratePlanAction} />}
      />

      {!plan ? (
        <EmptyState
          title="No plan yet"
          description="Finish onboarding to generate your first monthly plan."
        />
      ) : (
        <div className="space-y-6">
          <Card>
            <div className="mb-4 flex items-center gap-3">
              <Badge tone={statusTone[plan.status]}>{plan.status}</Badge>
              {plan.status === "IN_REVIEW" && (
                <form action={approvePlanAction}>
                  <button type="submit" className="text-xs font-medium text-emerald-400 hover:underline">
                    Approve this plan
                  </button>
                </form>
              )}
            </div>
            <p className="text-neutral-200">{plan.strategySummary}</p>
          </Card>

          {budgetAllocation.length > 0 && (
            <Card>
              <h2 className="mb-4 font-medium">Budget allocation</h2>
              <div className="space-y-3">
                {budgetAllocation.map((line) => (
                  <div key={line.channel}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{line.channel}</span>
                      <span className="text-neutral-400">{line.percent}%</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                      <div className="h-full bg-white" style={{ width: `${line.percent}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-neutral-500">{line.rationale}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {keyMetrics.length > 0 && (
            <Card>
              <h2 className="mb-4 font-medium">Targets to watch</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {keyMetrics.map((m) => (
                  <div key={m.metric} className="rounded-lg bg-white/5 p-4">
                    <p className="text-sm text-neutral-400">{m.metric}</p>
                    <p className="mt-1 font-medium">{m.target}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
