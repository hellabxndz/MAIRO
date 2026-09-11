import Link from "next/link";
import { Card } from "@/components/ui";
import { PLANS } from "@/lib/plans";

// What a locked feature looks like.
//
// Shows the thing rather than hiding it: somebody who can see three named
// specialists and a padlock understands what they would get, and somebody who
// sees an empty page assumes the product is thin. The plans go underneath,
// because the answer to "why can't I use this" is "here is what it costs" and
// making them go and find the pricing page loses most of them.

export function PlanLock({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <Card className="border-sky-400/20 bg-sky-400/[0.04]">
      <div className="flex items-start gap-4">
        <span className="mt-0.5 flex h-10 w-10 flex-none items-center justify-center rounded-xl border border-sky-400/30 bg-sky-400/10 text-sky-200">
          <svg viewBox="0 0 20 20" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <rect x="4" y="8.5" width="12" height="8" rx="2" />
            <path d="M7 8.5V6a3 3 0 0 1 6 0v2.5" strokeLinecap="round" />
          </svg>
        </span>
        <div className="min-w-0">
          <h2 className="text-base text-white">{title}</h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-neutral-300">{body}</p>
        </div>
      </div>

      <div className="mt-7 grid gap-3 sm:grid-cols-3">
        {PLANS.map((plan) => (
          <div
            key={plan.tier}
            className={`rounded-xl border p-4 ${
              plan.featured
                ? "border-white/25 bg-white/[0.05]"
                : "border-white/10 bg-white/[0.02]"
            }`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm text-white">{plan.name}</p>
              <p className="text-sm tabular-nums text-neutral-300">
                ${plan.priceMonthly}
                <span className="text-xs text-neutral-500">/mo</span>
              </p>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-neutral-400">{plan.tagline}</p>
            <p className="mt-2 text-[11px] text-neutral-600">{plan.spendGuidance}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <Link
          href="/dashboard/settings#billing"
          className="rounded-full bg-white px-5 py-2.5 text-xs font-medium text-black transition hover:bg-neutral-200"
        >
          Choose a plan
        </Link>
        <p className="text-xs text-neutral-500">
          This is what you pay MAIRO. What you spend on the ads themselves is separate and
          goes straight to Meta.
        </p>
      </div>
    </Card>
  );
}
