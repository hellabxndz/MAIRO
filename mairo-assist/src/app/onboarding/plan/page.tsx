import { Check, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PlanCard } from "@/components/billing/plan-card";
import { Button, ButtonLink } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { isPlanKey, PLAN_LIST, PLANS } from "@/lib/billing/plans";
import { selectPlanIntent } from "@/lib/onboarding/actions";
import { getBusinessContext } from "@/lib/tenancy/context";

export const metadata: Metadata = { title: "Choose your plan" };

const SALES_EMAIL = process.env.NEXT_PUBLIC_SALES_EMAIL;

export default async function ChoosePlanPage({ searchParams }: PageProps<"/onboarding/plan">) {
  await requireUser("/onboarding/plan");
  const sp = await searchParams;
  const picked = isPlanKey(sp.plan) ? sp.plan : "free";
  // Already set up: plans are managed from the dashboard.
  if (await getBusinessContext()) redirect(picked === "free" ? "/dashboard" : `/dashboard/upgrade?plan=${picked}`);

  const choose = (plan: string, label: string, primary = false) => (
    <form action={selectPlanIntent}>
      <input type="hidden" name="plan" value={plan} />
      <Button type="submit" className="w-full" variant={primary ? "primary" : "secondary"}>{label}</Button>
    </form>
  );

  return (
    <div className="space-y-10 pt-4">
      <div className="space-y-2 text-center">
        <p className="inline-flex items-center gap-2 rounded-full border border-violet/30 bg-violet/10 px-3 py-1 text-xs text-violet-glow">
          <Sparkles className="size-3.5" aria-hidden /> Welcome to Mairo Assist!
        </p>
        <p className="text-fg-muted">Let&apos;s get your AI employee ready.</p>
      </div>

      <div className="space-y-2 text-center">
        <p className="text-xs font-medium uppercase tracking-widest text-fg-subtle">Choose Your Plan</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Start Free. Upgrade Whenever You&apos;re Ready.</h1>
        <p className="mx-auto max-w-xl text-fg-muted">Every business starts somewhere. Choose the AI employee that fits yours.</p>
      </div>

      {/* Free first and largest: nobody should feel they have to pay. */}
      <div className="glass glow-ring mx-auto max-w-2xl rounded-3xl p-6 sm:p-8" data-testid="free-plan-offer">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-3">
            <p className="text-2xl font-semibold">Free <span className="text-base font-normal text-fg-muted">$0/month</span></p>
            <ul className="space-y-1.5 text-sm">
              {["Free Forever", "100 AI Responses / Month", "No Credit Card Required"].map((t) => (
                <li key={t} className="flex items-center gap-2"><Check className="size-4 text-success" aria-hidden /> {t}</li>
              ))}
            </ul>
          </div>
          <form action={selectPlanIntent} className="sm:w-56">
            <input type="hidden" name="plan" value="free" />
            <Button type="submit" size="lg" className="w-full">Continue With Free</Button>
          </form>
        </div>
      </div>

      <div>
        <p className="mb-4 text-center text-sm text-fg-muted">Or compare every plan — you can upgrade any time later.</p>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {PLAN_LIST.map((p) => (
            <PlanCard
              key={p.key}
              plan={p}
              compact
              selected={picked === p.key && p.key !== "free"}
              action={
                p.key === "free"
                  ? choose("free", "Continue With Free", true)
                  : p.key === "enterprise"
                    ? SALES_EMAIL
                      ? <ButtonLink href={`mailto:${SALES_EMAIL}?subject=Mairo%20Assist%20Enterprise`} variant="secondary" className="w-full">Contact Sales</ButtonLink>
                      : <p className="text-center text-xs text-fg-subtle">Start on Free, then contact us from your dashboard.</p>
                    : choose(p.key, `Choose ${p.name}`, picked === p.key)
              }
              note={p.key !== "free" && p.key !== "enterprise" ? <p className="mt-3 text-xs text-fg-subtle">You&apos;ll confirm and pay after setting up your business.</p> : undefined}
            />
          ))}
        </div>
        {picked !== "free" && isPlanKey(picked) && (
          <p className="mt-4 text-center text-xs text-fg-subtle">You picked {PLANS[picked].name} earlier. You can still continue with Free.</p>
        )}
      </div>
    </div>
  );
}
