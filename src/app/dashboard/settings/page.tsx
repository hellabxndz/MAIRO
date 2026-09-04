import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import { BusinessForm, BriefForm } from "./settings-forms";
import { BillingSection } from "./billing-section";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = session.user.organizationId;

  const [organization, intake] = await Promise.all([
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
  ]);
  if (!organization) redirect("/sign-in");

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
