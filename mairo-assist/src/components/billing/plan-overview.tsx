import { ArrowRight, Sparkles } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { CreditSummary } from "@/lib/billing/credits";
import { formatPlanPrice, PLANS } from "@/lib/billing/plans";
import { formatDate } from "@/lib/utils";
import { CreditsMeter } from "./credits-meter";

/** Plan, credits and reset date on the Overview; Free businesses also see what upgrading unlocks. */
export function PlanOverview({ credits, canSeePlans }: { credits: CreditSummary; canSeePlans: boolean }) {
  const free = credits.plan.key === "free";
  return (
    <section aria-label="Your plan" className="space-y-4">
      <Card>
        <CardContent className="space-y-5 pt-5">
          {free && (
            <div>
              <h2 className="text-lg font-semibold">Welcome to Mairo Assist!</h2>
              <p className="text-sm text-fg-muted">Your AI employee is ready to help your business grow.</p>
            </div>
          )}
          <div className="grid gap-5 sm:grid-cols-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-fg-subtle">Current plan</p>
              <p className="mt-1 text-xl font-semibold" data-testid="overview-plan">{free ? "Free Forever" : credits.plan.name}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-fg-subtle">AI credits</p>
              <div className="mt-1"><CreditsMeter used={credits.used} limit={credits.limit} /></div>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-fg-subtle">Next reset</p>
              <p className="mt-1 text-xl font-semibold">{formatDate(credits.resetsAt.toISOString())}</p>
            </div>
          </div>
          {canSeePlans && (
            <ButtonLink href="/dashboard/upgrade" size="sm" variant={free ? "primary" : "secondary"}>
              <Sparkles aria-hidden /> {free ? "Explore Upgrades" : "View plans"}
            </ButtonLink>
          )}
        </CardContent>
      </Card>

      {free && canSeePlans && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Unlock More From Your AI Employee.</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {(["starter", "growth", "pro"] as const).map((key) => {
              const p = PLANS[key];
              return (
                <div key={key} className={key === "growth" ? "glass glow-ring rounded-2xl p-5" : "rounded-2xl border border-line bg-white/[0.02] p-5"}>
                  <p className="font-semibold">{p.name} — {formatPlanPrice(p)}/month</p>
                  <ul className="mt-2 space-y-1 text-sm text-fg-muted">
                    {p.highlights.slice(0, 4).map((h) => <li key={h}>· {h}</li>)}
                  </ul>
                  <ButtonLink href={`/dashboard/upgrade?plan=${key}`} size="sm" variant={key === "growth" ? "primary" : "secondary"} className="mt-4">
                    Upgrade to {p.name} <ArrowRight aria-hidden />
                  </ButtonLink>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-fg-subtle">No pressure — Free never expires, and you can compare plans any time.</p>
        </div>
      )}
    </section>
  );
}
