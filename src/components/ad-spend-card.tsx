import { Card, Badge } from "@/components/ui";
import { PlatformIcon } from "@/components/platform-icons";
import { NO_VALUE } from "@/components/metrics";
import { metaAdsManagerUrl, type BillingStatus } from "@/lib/ad-platforms/billing";

// "Where do I pay for the ads?"
//
// The question this answers is one every first-time advertiser asks and the
// product had no answer to. It matters more than it looks: a business owner who
// has connected their ad account reasonably assumes they are done, and there is
// nothing anywhere to tell them a campaign will not deliver until Meta has a
// card to charge.
//
// Two things it must never do. It must not collect a payment — the customer
// pays Meta directly, MAIRO never touches ad spend, and the card says so
// plainly rather than leaving them to wonder whether the subscription covers
// it. And it must not claim a problem it did not verify: an unreadable billing
// state is shown as unknown, not as "no payment method", because telling
// somebody their billing is broken when Meta merely timed out is worse than
// saying nothing.

function money(cents: number | null, currency: string | null): string {
  if (cents === null) return NO_VALUE;
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: currency ?? "USD",
    maximumFractionDigits: 2,
  });
}

const TONE: Record<BillingStatus["state"], "green" | "yellow" | "red" | "neutral"> = {
  funded: "green",
  no_payment_method: "red",
  out_of_credit: "red",
  account_disabled: "red",
  unknown: "neutral",
};

const LABEL: Record<BillingStatus["state"], string> = {
  funded: "Ready to spend",
  no_payment_method: "No payment method",
  out_of_credit: "Out of credit",
  account_disabled: "Account disabled",
  unknown: "Not known",
};

export function AdSpendCard({
  billing,
  accountId,
  monthToDateCents,
  plannedMonthlyCents,
}: {
  billing: BillingStatus;
  accountId: string | null;
  /** What Meta says it has actually charged this month. */
  monthToDateCents: number | null;
  /** What the customer told MAIRO they intend to spend. */
  plannedMonthlyCents: number | null;
}) {
  const needsAttention = billing.state !== "funded" && billing.state !== "unknown";

  return (
    <Card className={needsAttention ? "border-amber-500/30 bg-amber-500/[0.05]" : ""}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <span className="mt-0.5 flex h-10 w-10 flex-none items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-neutral-300">
            <PlatformIcon platform={billing.platform} className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base text-white">Paying for your ads</h2>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-neutral-400">
              Your ad budget goes straight from you to Meta — MAIRO never takes a cut of
              it and never holds it. This is separate from your MAIRO subscription.
            </p>
          </div>
        </div>
        <Badge tone={TONE[billing.state]}>{LABEL[billing.state]}</Badge>
      </div>

      {billing.message && (
        <p className="mt-5 max-w-2xl text-sm leading-relaxed text-amber-200">
          {billing.message}
        </p>
      )}

      <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-4">
        <Figure
          label="Spent this month"
          value={money(monthToDateCents, billing.currency)}
          hint="Charged by Meta"
        />
        <Figure
          label="You planned"
          value={money(plannedMonthlyCents, billing.currency)}
          hint="From your brief"
        />
        <Figure
          label={billing.prepay ? "Balance" : "Payment method"}
          value={
            billing.prepay
              ? money(billing.balanceCents, billing.currency)
              : (billing.paymentMethod ?? NO_VALUE)
          }
        />
        <Figure
          label="Your Meta limit"
          value={billing.spendCapCents ? money(billing.spendCapCents, billing.currency) : "None set"}
          hint="Set on Meta"
        />
      </div>

      <div className="mt-7 flex flex-wrap gap-3">
        {billing.actionUrl && (
          <a
            href={billing.actionUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-white px-5 py-2.5 text-xs font-medium text-black transition hover:bg-neutral-200"
          >
            {billing.actionLabel ?? "Manage payment on Meta"} →
          </a>
        )}
        {accountId && (
          <a
            href={metaAdsManagerUrl(accountId)}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-white/10 px-5 py-2.5 text-xs text-neutral-300 transition hover:border-white/25 hover:text-white"
          >
            Open Ads Manager
          </a>
        )}
      </div>

      <p className="mt-5 text-xs leading-relaxed text-neutral-500">
        These open Meta in a new tab. You are already signed in there — it is the same
        account you connected — so you will land on your own billing page. MAIRO never
        sees your card.
      </p>
    </Card>
  );
}

function Figure({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">{label}</p>
      <p className="mt-1.5 truncate text-base font-light tabular-nums text-white">{value}</p>
      {hint && <p className="mt-0.5 text-[10px] text-neutral-600">{hint}</p>}
    </div>
  );
}
