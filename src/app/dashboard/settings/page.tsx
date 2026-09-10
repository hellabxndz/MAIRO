import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import { BusinessForm, BriefForm } from "./settings-forms";
import { BillingSection } from "./billing-section";
import { AutoOptimizeSection } from "./auto-optimize-section";
import { activeOrganizationId } from "@/lib/active-org";
import { entitlementsFor } from "@/lib/entitlements";
import { planFor, PLANS } from "@/lib/plans";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  const [organization, intake, autoOptimize, entitlements] = await Promise.all([
    db.organization.findUnique({
      where: { id: organizationId },
      select: {
        name: true,
        industry: true,
        website: true,
        subscriptionTier: true,
        subscriptionStatus: true,
        currentPeriodEnd: true,
        stripeCustomerId: true,
      },
    }),
    db.onboardingIntake.findUnique({ where: { organizationId } }),
    db.autoOptimizeSettings.findUnique({ where: { organizationId } }),
    entitlementsFor(organizationId),
  ]);
  if (!organization) redirect("/sign-in");

  const plan = planFor(organization.subscriptionTier);
  // The plan to point at, found by price rather than named, so changing which
  // tier includes Auto Optimize changes this with it.
  const upgradeTarget =
    PLANS.find((p) => p.priceMonthly > plan.priceMonthly) ?? PLANS[PLANS.length - 1];

  return (
    <div>
      <PageHeader
        title="Settings"
        description="What we know about your business. Change any of it — the AI uses these answers every time it writes a plan or an ad."
      />

      <Card className="mb-8">
        <h2 className="mb-1 text-sm font-medium">Business details</h2>
        <p className="mb-6 text-sm text-neutral-400">
          Your name as customers know it, and where to find you.
        </p>
        <BusinessForm
          name={organization.name}
          industry={organization.industry ?? ""}
          website={organization.website ?? ""}
        />
      </Card>

      <div className="mb-8">
        <BillingSection
          tier={organization.subscriptionTier}
          status={organization.subscriptionStatus}
          periodEnd={organization.currentPeriodEnd}
          hasCustomer={Boolean(organization.stripeCustomerId)}
        />
      </div>

      <div className="mb-8">
        <AutoOptimizeSection
          allowed={entitlements.auto_optimize}
          upgradePlanName={upgradeTarget.name}
          values={{
            // Defaults chosen to be safe rather than useful: a ceiling of
            // twice what they spend now, and a 20% daily step. Someone who
            // switches this on without reading the fields gets conservative
            // behaviour, not a blank cheque.
            enabled: autoOptimize?.enabled ?? false,
            maxDailyBudget: autoOptimize ? autoOptimize.maxDailyBudgetCents / 100 : 100,
            maxDailyIncreasePercent: autoOptimize?.maxDailyIncreasePercent ?? 20,
            minRoas: autoOptimize?.minRoas ?? null,
            maxCpa: autoOptimize?.maxCpaCents ? autoOptimize.maxCpaCents / 100 : null,
            platforms: autoOptimize?.platforms ?? [],
          }}
        />
      </div>

      <Card>
        <h2 className="mb-1 text-sm font-medium">Your brief</h2>
        <p className="mb-6 text-sm text-neutral-400">
          The answers you gave when you signed up. Update them whenever the business
          changes and the next plan will follow.
        </p>
        <BriefForm
          primaryGoal={intake?.primaryGoal ?? "LEADS"}
          monthlyBudget={intake ? intake.monthlyBudgetCents / 100 : 1000}
          targetAudience={intake?.targetAudience ?? ""}
          brandVoice={intake?.brandVoice ?? ""}
          competitors={intake?.competitors ?? ""}
          notes={intake?.notes ?? ""}
        />
      </Card>
    </div>
  );
}
