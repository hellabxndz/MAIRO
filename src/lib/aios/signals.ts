import { db } from "@/lib/db";
import { ALL_PLANS } from "@/lib/plans";
import { billingConfigured, purchasableTiers, stripe, stripeMode } from "@/lib/stripe/client";
import { currentOperationHealth } from "@/lib/meta-intelligence/operations";
import { OPERATION_LABEL } from "@/lib/meta-intelligence/operations/rules";
import type { FounderSignals, RevenueSignal } from "./brief";

// Reads the founder's signals from the platform's records — counts across
// every business, never a customer's details. Each source is read on its own,
// so one failing (Stripe unreachable, say) shows as that, not as a blank page.

const DAY = 86_400_000;
const ENTITLING = ["active", "trialing", "past_due"];

/** Money Stripe actually collected: paid invoices in the last 30 days. Read-only. */
export async function verifiedRevenue(now: Date): Promise<RevenueSignal> {
  if (!billingConfigured()) return { state: "not_configured" };
  try {
    const created = { gte: Math.floor((now.getTime() - 30 * DAY) / 1000) };
    let cents = 0;
    let invoices = 0;
    let currency = "usd";
    let truncated = false;
    for await (const inv of stripe().invoices.list({ status: "paid", created, limit: 100 })) {
      cents += inv.amount_paid;
      currency = inv.currency || currency;
      if (++invoices >= 500) {
        truncated = true;
        break;
      }
    }
    return { state: "verified", cents, invoices, truncated, currency };
  } catch (e) {
    return { state: "error", message: e instanceof Error ? e.message.slice(0, 160) : "Stripe didn't answer." };
  }
}

export async function loadFounderSignals(now = new Date()): Promise<FounderSignals> {
  const since = (days: number) => new Date(now.getTime() - days * DAY);
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay.getTime() + DAY);

  const [subs, canceled30, users7, users30, businesses7, recentUsers, meta, operations, apiErrors24h, runs, stuck, lastRun, pending, urgent, waitingOrgs, alerts, critical, feedback, stopped, awaitingPayment, openTasks, overdue, dueToday, activeProjects, revenue] =
    await Promise.all([
      db.organization.groupBy({ by: ["subscriptionStatus", "subscriptionTier"], where: { stripeSubscriptionId: { not: null } }, _count: true }),
      db.organization.count({ where: { subscriptionStatus: "canceled", updatedAt: { gte: since(30) } } }),
      db.user.count({ where: { role: { not: "OWNER" }, createdAt: { gte: since(7) } } }),
      db.user.count({ where: { role: { not: "OWNER" }, createdAt: { gte: since(30) } } }),
      db.organization.count({ where: { kind: "BUSINESS", createdAt: { gte: since(7) } } }),
      db.user.findMany({ where: { role: { not: "OWNER" }, createdAt: { gte: since(14) } }, select: { createdAt: true } }),
      db.metaAdAccount.groupBy({ by: ["status"], _count: true }),
      currentOperationHealth(now).catch(() => []),
      db.platformApiError.count({ where: { lastAt: { gte: since(1) } } }),
      db.agentRun.groupBy({ by: ["status"], where: { startedAt: { gte: since(1) } }, _count: true }),
      db.agentRun.count({ where: { status: "RUNNING", startedAt: { lt: new Date(now.getTime() - 3_600_000) } } }),
      db.agentRun.findFirst({ where: { finishedAt: { not: null } }, orderBy: { finishedAt: "desc" }, select: { finishedAt: true } }),
      db.mairoDecision.count({ where: { status: "PENDING" } }),
      db.mairoDecision.count({ where: { status: "PENDING", urgent: true } }),
      db.mairoDecision.groupBy({ by: ["organizationId"], where: { status: "PENDING" } }),
      db.platformAdminAlert.count({ where: { readAt: null } }),
      db.platformAdminAlert.count({ where: { readAt: null, severity: "CRITICAL" } }),
      db.customerFeedback.groupBy({ by: ["status"], where: { status: { not: "RESOLVED" } }, _count: true }),
      db.organization.count({ where: { executionStoppedAt: { not: null } } }),
      db.organization.count({ where: { paymentRequired: true, hasPaid: false, stripeSubscriptionId: null, createdAt: { gte: since(30) } } }),
      db.founderItem.count({ where: { kind: { in: ["TASK", "MILESTONE"] }, doneAt: null } }),
      db.founderItem.count({ where: { kind: { in: ["TASK", "MILESTONE"] }, doneAt: null, dueAt: { lt: startOfDay } } }),
      db.founderItem.count({ where: { kind: { in: ["TASK", "MILESTONE"] }, doneAt: null, dueAt: { gte: startOfDay, lt: endOfDay } } }),
      db.founderProject.count({ where: { status: "ACTIVE" } }),
      verifiedRevenue(now),
    ]);

  const count = (status: string) => subs.filter((s) => s.subscriptionStatus === status).reduce((n, s) => n + s._count, 0);
  const tiers = new Map<string, number>();
  let listMrrCents = 0;
  for (const s of subs) {
    if (!s.subscriptionStatus || !ENTITLING.includes(s.subscriptionStatus)) continue;
    tiers.set(s.subscriptionTier, (tiers.get(s.subscriptionTier) ?? 0) + s._count);
    const plan = ALL_PLANS.find((p) => p.tier === s.subscriptionTier);
    if (plan && s.subscriptionStatus !== "trialing") listMrrCents += Math.round(plan.priceMonthly * 100) * s._count;
  }

  const daily = Array.from({ length: 14 }, (_, i) => {
    const start = new Date(startOfDay.getTime() - (13 - i) * DAY);
    const end = new Date(start.getTime() + DAY);
    return recentUsers.filter((u) => u.createdAt >= start && u.createdAt < end).length;
  });
  const metaCount = (s: string) => meta.find((m) => m.status === s)?._count ?? 0;
  const runCount = (s: string) => runs.find((r) => r.status === s)?._count ?? 0;

  return {
    subscriptions: {
      entitled: ENTITLING.reduce((n, s) => n + count(s), 0),
      trialing: count("trialing"),
      pastDue: count("past_due"),
      incomplete: count("incomplete"),
      canceled30,
      byTier: [...tiers].map(([tier, n]) => ({ tier, label: ALL_PLANS.find((p) => p.tier === tier)?.name ?? tier, count: n })).sort((a, b) => b.count - a.count),
      listMrrCents,
    },
    revenue,
    stripe: { configured: billingConfigured(), mode: stripeMode(), pricesSet: purchasableTiers().length, pricesExpected: 2 },
    signups: { users7, users30, businesses7, daily },
    meta: {
      connected: metaCount("CONNECTED"),
      needsReconnect: metaCount("TOKEN_EXPIRED") + metaCount("ERROR"),
      operations: operations.map((o) => ({ label: OPERATION_LABEL[o.operation], state: o.state, reason: o.reason })),
      apiErrors24h,
    },
    jobs: { done24h: runCount("DONE") + runCount("NOTHING"), failed24h: runCount("FAILED"), stuck, lastFinishedAt: lastRun?.finishedAt ?? null },
    approvals: { pending, urgent, businesses: waitingOrgs.length },
    alerts: { unread: alerts, critical },
    support: { open: feedback.find((f) => f.status === "OPEN")?._count ?? 0, inProgress: feedback.find((f) => f.status === "IN_PROGRESS")?._count ?? 0 },
    billing: { stopped, awaitingPayment },
    work: { openTasks, overdue, dueToday, activeProjects },
  };
}
