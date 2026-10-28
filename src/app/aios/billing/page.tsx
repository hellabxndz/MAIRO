import Link from "next/link";
import { db } from "@/lib/db";
import { ALL_PLANS } from "@/lib/plans";
import { billingConfigured, priceEnvFor, purchasableTiers, stripeMode } from "@/lib/stripe/client";
import { verifiedRevenue } from "@/lib/aios/signals";
import { money } from "@/lib/aios/brief";

// Billing diagnostics for MAIRO staff: is Stripe set up here, what it
// collected, and the businesses whose billing needs a look. Read-only — plans
// are changed by the customer in Stripe's portal, never from here. Price
// variables are named, never shown.

export const dynamic = "force-dynamic";
export const metadata = { title: "Billing" };

const eyebrow = "text-[11px] font-semibold uppercase tracking-[0.18em] text-signal";
const date = (d: Date | null) => (d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");
const planName = (tier: string) => ALL_PLANS.find((p) => p.tier === tier)?.name ?? tier;

type Row = { id: string; name: string; subscriptionTier: string; subscriptionStatus: string | null; currentPeriodEnd: Date | null; subscriptionCancelAt: Date | null; executionStoppedReason: string | null; createdAt: Date };
const select = { id: true, name: true, subscriptionTier: true, subscriptionStatus: true, currentPeriodEnd: true, subscriptionCancelAt: true, executionStoppedReason: true, createdAt: true } as const;

function Group({ title, note, rows, empty }: { title: string; note: string; rows: Row[]; empty: string }) {
  return (
    <section className="rounded-[22px] border border-[color:var(--mairo-line)] p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-medium text-white">{title}</h2>
        <span className="rounded-full bg-[rgba(var(--mairo-fg-rgb),0.06)] px-2 text-[12px] tabular-nums text-neutral-400">{rows.length}</span>
      </div>
      <p className="mt-1 text-[12.5px] text-neutral-500">{note}</p>
      {rows.length === 0 ? (
        <p className="mt-3 text-[13.5px] text-neutral-400">{empty}</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-[13px]">
            <thead className="text-neutral-500">
              <tr>
                <th className="py-1.5 font-normal">Business</th>
                <th className="py-1.5 font-normal">Plan</th>
                <th className="py-1.5 font-normal">Stripe status</th>
                <th className="py-1.5 font-normal">Period ends</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-[color:var(--mairo-line)]">
                  <td className="py-2"><Link href={`/aios/organizations/${r.id}`} className="text-white hover:text-signal">{r.name}</Link>{r.executionStoppedReason && <span className="block text-[11.5px] text-neutral-500">{r.executionStoppedReason}</span>}</td>
                  <td className="py-2 text-neutral-300">{planName(r.subscriptionTier)}</td>
                  <td className="py-2 text-neutral-300">{r.subscriptionStatus ?? "none"}{r.subscriptionCancelAt && <span className="block text-[11.5px] text-amber-200">ends {date(r.subscriptionCancelAt)}</span>}</td>
                  <td className="py-2 tabular-nums text-neutral-400">{date(r.currentPeriodEnd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default async function BillingPage() {
  const now = new Date();
  const [byStatus, pastDue, incomplete, cancelling, stopped, awaiting, revenue] = await Promise.all([
    db.organization.groupBy({ by: ["subscriptionStatus"], where: { stripeSubscriptionId: { not: null } }, _count: true }),
    db.organization.findMany({ where: { subscriptionStatus: "past_due" }, select, orderBy: { currentPeriodEnd: "asc" } }),
    db.organization.findMany({ where: { subscriptionStatus: { in: ["incomplete", "incomplete_expired", "unpaid"] } }, select, orderBy: { updatedAt: "desc" }, take: 50 }),
    db.organization.findMany({ where: { subscriptionCancelAt: { gt: now } }, select, orderBy: { subscriptionCancelAt: "asc" } }),
    db.organization.findMany({ where: { executionStoppedAt: { not: null } }, select, orderBy: { executionStoppedAt: "desc" }, take: 50 }),
    db.organization.findMany({ where: { paymentRequired: true, hasPaid: false, stripeSubscriptionId: null, createdAt: { gte: new Date(now.getTime() - 30 * 86_400_000) } }, select, orderBy: { createdAt: "desc" }, take: 50 }),
    verifiedRevenue(now),
  ]);
  const configured = billingConfigured();
  const buyable = purchasableTiers();

  return (
    <div className="mx-auto max-w-[1180px] space-y-6">
      <header>
        <p className={eyebrow}>AIOS · Billing</p>
        <h1 className="mt-2 text-[clamp(24px,3vw,32px)] font-semibold tracking-[-0.02em] text-white">Billing diagnostics</h1>
        <p className="mt-2 max-w-[680px] text-[14.5px] text-neutral-400">From Stripe&rsquo;s webhook copy on each business and, for money collected, Stripe&rsquo;s paid invoices. Nothing here changes a subscription.</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-[color:var(--mairo-line)] p-4">
          <p className="text-[12.5px] text-neutral-400">Stripe on this deployment</p>
          <p className="mt-1.5 text-[20px] font-medium text-white">{configured ? (stripeMode() === "live" ? "Live" : stripeMode() === "test" ? "Test mode" : "Configured") : "Not configured"}</p>
          <p className="mt-1 text-[12px] text-neutral-500">
            {(["PRO", "SCALE_V2"] as const).map((t) => `${planName(t)}: ${buyable.includes(t) ? "price set" : `${priceEnvFor(t)} missing`}`).join(" · ")}
          </p>
        </div>
        <div className="rounded-2xl border border-[color:var(--mairo-line)] p-4">
          <p className="text-[12.5px] text-neutral-400">Collected, last 30 days</p>
          <p className="mt-1.5 text-[20px] font-medium tabular-nums text-white">{revenue.state === "verified" ? money(revenue.cents, revenue.currency) : revenue.state === "not_configured" ? "—" : "Couldn't read"}</p>
          <p className="mt-1 text-[12px] text-neutral-500">{revenue.state === "verified" ? `${revenue.invoices} paid invoices${revenue.truncated ? " (first 500)" : ""} · Stripe invoices` : revenue.state === "error" ? revenue.message : "Stripe isn't configured"}</p>
        </div>
        <div className="rounded-2xl border border-[color:var(--mairo-line)] p-4">
          <p className="text-[12.5px] text-neutral-400">Subscriptions by Stripe status</p>
          {byStatus.length ? (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {byStatus.map((b) => (
                <li key={b.subscriptionStatus ?? "none"} className="rounded-full border border-[color:var(--mairo-line)] px-2.5 py-1 text-[12px] text-white">
                  {b.subscriptionStatus ?? "unknown"} <span className="tabular-nums text-neutral-400">{b._count}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1.5 text-[14px] text-neutral-400">No subscriptions yet.</p>
          )}
        </div>
      </div>

      <Group title="Past due" note="Stripe is retrying the card. The plan keeps working while it does." rows={pastDue} empty="None." />
      <Group title="Incomplete or unpaid" note="Checkout started but the first payment didn't go through." rows={incomplete} empty="None." />
      <Group title="Cancelling at period end" note="They cancelled; the plan runs until the date shown." rows={cancelling} empty="None." />
      <Group title="Stopped" note="MAIRO stopped everything because a trial ended unpaid or was cancelled before any payment." rows={stopped} empty="None." />
      <Group title="Signed up, not paid yet (30 days)" note="Free-plan sign-ups that haven't subscribed. Building and launching need a plan." rows={awaiting} empty="None." />
    </div>
  );
}
