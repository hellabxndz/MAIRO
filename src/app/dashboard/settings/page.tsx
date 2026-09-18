import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import { BusinessForm, BriefForm } from "./settings-forms";
import { BillingSection } from "./billing-section";
import { AutoOptimizeSection } from "./auto-optimize-section";
import { AutoLaunchSection } from "./auto-launch-section";
import { AssistantSection } from "./assistant-section";
import { autoLaunchIntent } from "@/lib/campaigns/auto-launch";
import { activeOrganizationId } from "@/lib/active-org";
import { entitlementsFor } from "@/lib/entitlements";
import { planFor, PLANS } from "@/lib/plans";
import { assistantNameOf } from "@/lib/ai/agents";
import { maskPhone } from "@/lib/sms/send";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  const [organization, intake, autoOptimize, entitlements, autoLaunch, sms] = await Promise.all([
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
        assistantName: true,
      },
    }),
    db.onboardingIntake.findUnique({ where: { organizationId } }),
    db.autoOptimizeSettings.findUnique({ where: { organizationId } }),
    entitlementsFor(organizationId),
    autoLaunchIntent(organizationId),
    db.smsPreference.findUnique({ where: { organizationId } }),
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

      {/* Directly under billing, because it is the other thing on this page
          that lets MAIRO act on its own. */}
      <div className="mb-8">
        <AutoLaunchSection
          held={autoLaunch.held}
          waitingCount={autoLaunch.waitingCount}
          lastLaunchedAt={autoLaunch.lastLaunchedAt}
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

      {/* Above the brief, because this is the setting people come looking
          for — the assistant is the part of MAIRO they actually talk to. */}
      <div className="mb-8">
        <AssistantSection
          assistantName={assistantNameOf(organization.assistantName)}
          phone={{
            masked: sms?.phone ? maskPhone(sms.phone) : null,
            verified: Boolean(sms?.verifiedAt) && !sms?.optedOutAt,
            // A code that has expired is not a code they are waiting on, so
            // the form goes back to asking for a number rather than for a
            // code that will never be accepted.
            awaitingCode: Boolean(
              sms?.verifyCode && sms.verifyExpiresAt && sms.verifyExpiresAt > new Date(),
            ),
            prefs: {
              onCampaignLive: sms?.onCampaignLive ?? true,
              onNeedsAttention: sms?.onNeedsAttention ?? true,
              onWeeklySummary: sms?.onWeeklySummary ?? false,
              onBudgetChange: sms?.onBudgetChange ?? false,
            },
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
