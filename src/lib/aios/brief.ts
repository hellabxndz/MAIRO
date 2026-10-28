// The founder's daily briefing, from the platform's own records. Pure: the
// signals come in (aios/signals.ts reads them), the lines and the state of
// the AI core come out. Nothing is estimated or made up — a line exists only
// when a record says so, and a source we can't read says that instead of
// reading as zero.

export type Tone = "alert" | "attention" | "good" | "info";

export type RevenueSignal =
  | { state: "verified"; cents: number; invoices: number; truncated: boolean; currency: string }
  | { state: "not_configured" }
  | { state: "error"; message: string };

export type FounderSignals = {
  subscriptions: {
    /** Paying or trialing (Stripe status active, trialing or past_due). */
    entitled: number;
    trialing: number;
    pastDue: number;
    incomplete: number;
    canceled30: number;
    byTier: { tier: string; label: string; count: number }[];
    /** Sum of list prices of active (not trialing) subscriptions. An estimate, not Stripe's number. */
    listMrrCents: number;
  };
  revenue: RevenueSignal;
  stripe: { configured: boolean; mode: "test" | "live" | "unknown"; pricesSet: number; pricesExpected: number };
  signups: { users7: number; users30: number; businesses7: number; daily: number[] };
  meta: {
    connected: number;
    needsReconnect: number;
    operations: { label: string; state: "ok" | "paused" | "investigate"; reason: string | null }[];
    apiErrors24h: number;
  };
  jobs: { done24h: number; failed24h: number; stuck: number; lastFinishedAt: Date | null };
  approvals: { pending: number; urgent: number; businesses: number };
  alerts: { unread: number; critical: number };
  support: { open: number; inProgress: number };
  billing: { stopped: number; awaitingPayment: number };
  work: { openTasks: number; overdue: number; dueToday: number; activeProjects: number };
};

export type BriefLine = { tone: Tone; text: string; href: string; source: string };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function money(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: 0 }).format(cents / 100);
}

/** Most urgent first; "good" lines only when nothing in that area is wrong. */
export function founderBrief(s: FounderSignals): BriefLine[] {
  const out: BriefLine[] = [];
  const push = (tone: Tone, text: string, href: string, source: string) => out.push({ tone, text, href, source });

  if (s.stripe.configured && s.stripe.pricesSet < s.stripe.pricesExpected)
    push("alert", `${plural(s.stripe.pricesExpected - s.stripe.pricesSet, "plan price")} not set — those plans can't be bought.`, "/aios/setup", "Environment");
  if (!s.stripe.configured) push("alert", "Stripe isn't configured on this deployment, so nobody can subscribe.", "/aios/setup", "Environment");

  const paused = s.meta.operations.filter((o) => o.state === "paused");
  if (paused.length) push("alert", `Meta is failing ${paused.map((o) => o.label.toLowerCase()).join(", ")} for everyone — MAIRO has paused ${paused.length === 1 ? "it" : "them"}.`, "/aios/meta-intelligence?tab=errors", "Meta operations");
  if (s.alerts.critical) push("alert", `${plural(s.alerts.critical, "critical alert")} unread.`, "/aios/meta-intelligence", "Platform alerts");
  if (s.jobs.stuck) push("alert", `${plural(s.jobs.stuck, "background run")} started over an hour ago and never finished.`, "/aios/operations", "Agent runs");
  if (s.jobs.failed24h) push("attention", `${plural(s.jobs.failed24h, "background run")} failed in the last 24 hours.`, "/aios/operations", "Agent runs");

  if (s.subscriptions.pastDue) push("attention", `${plural(s.subscriptions.pastDue, "subscription")} past due — Stripe is retrying the card.`, "/aios/billing", "Stripe (webhook)");
  if (s.subscriptions.incomplete) push("attention", `${plural(s.subscriptions.incomplete, "checkout")} left incomplete.`, "/aios/billing", "Stripe (webhook)");
  if (s.billing.stopped) push("attention", `${plural(s.billing.stopped, "business", "businesses")} stopped because a trial ended unpaid.`, "/aios/billing", "Billing records");

  if (s.meta.needsReconnect) push("attention", `${plural(s.meta.needsReconnect, "Meta connection")} expired or erroring — those businesses need to reconnect.`, "/aios/customers", "Meta connections");
  if (s.meta.apiErrors24h) push("info", `Meta returned ${plural(s.meta.apiErrors24h, "distinct error")} in the last 24 hours.`, "/aios/meta-intelligence?tab=errors", "Meta API errors");

  if (s.approvals.urgent) push("attention", `${plural(s.approvals.urgent, "urgent decision")} waiting on customers across ${plural(s.approvals.businesses, "business", "businesses")}.`, "/aios/operations", "MAIRO decisions");
  else if (s.approvals.pending) push("info", `${plural(s.approvals.pending, "decision")} waiting on customers across ${plural(s.approvals.businesses, "business", "businesses")}.`, "/aios/operations", "MAIRO decisions");

  if (s.support.open) push("attention", `${plural(s.support.open, "piece")} of customer feedback not picked up yet.`, "/aios/customers", "Customer feedback");

  if (s.work.overdue) push("attention", `${plural(s.work.overdue, "task")} of yours overdue.`, "/aios/projects", "Your projects");
  else if (s.work.dueToday) push("info", `${plural(s.work.dueToday, "task")} due today.`, "/aios/projects", "Your projects");

  if (s.revenue.state === "verified")
    push("info", `${money(s.revenue.cents, s.revenue.currency)} collected in the last 30 days across ${plural(s.revenue.invoices, "paid invoice")}${s.revenue.truncated ? " (first 500 read)" : ""}.`, "/aios/billing", "Stripe invoices");
  if (s.signups.users7) push("good", `${plural(s.signups.users7, "new account")} this week, ${plural(s.signups.businesses7, "new business", "new businesses")}.`, "/aios/organizations", "Sign-ups");
  if (s.subscriptions.entitled) push("good", `${plural(s.subscriptions.entitled, "business", "businesses")} on a paid plan or trial.`, "/aios/billing", "Stripe (webhook)");

  if (!out.some((l) => l.tone === "alert" || l.tone === "attention")) push("good", "Nothing needs you right now.", "/aios", "All sources above");
  const rank: Record<Tone, number> = { alert: 0, attention: 1, info: 2, good: 3 };
  return out.sort((a, b) => rank[a.tone] - rank[b.tone]);
}

/** What the AI core shows: the worst line in the brief. */
export function coreState(lines: BriefLine[]): "steady" | "attention" | "alert" {
  if (lines.some((l) => l.tone === "alert")) return "alert";
  if (lines.some((l) => l.tone === "attention")) return "attention";
  return "steady";
}
