import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { loadStrategy, strategyInputFor } from "@/lib/strategy/store";
import { JourneyFrame } from "@/components/strategy/journey";
import { PlanBuilder } from "@/components/strategy/plan-builder";
import { PlanReview } from "@/components/strategy/plan-review";
import { loadOnboarding } from "@/lib/onboarding/progress-store";
import { PlanGuide } from "@/components/strategy/plan-guide";
import { loadBrain } from "@/lib/business/brain";
import { canOptimizeTowards } from "@/lib/tracking/pixels";

// The free stage: MAIRO writes the plan, the business reviews it, asks for
// changes, and approves it. No dashboard yet — that comes with activation.

export const metadata = { title: "Your MAIRO Advertising Plan" };
export const dynamic = "force-dynamic";
// Reading the website and writing the plan are AI calls.
export const maxDuration = 60;

export default async function PlanPage() {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  const [org, intake, loaded, steps] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { name: true, website: true } }),
    db.onboardingIntake.findUnique({ where: { organizationId }, select: { id: true } }),
    loadStrategy(organizationId),
    loadOnboarding(organizationId),
  ]);
  if (!org) redirect("/sign-in");
  if (!intake) redirect("/onboarding");
  if (loaded?.row.activatedAt) redirect("/dashboard/launch");

  if (!loaded) {
    return (
      <JourneyFrame steps={steps} here="plan">
        <PlanBuilder website={org.website} />
      </JourneyFrame>
    );
  }

  const [input, meta, intakeFull, pixel, store, brain] = await Promise.all([
    strategyInputFor(organizationId),
    db.metaAdAccount.findUnique({ where: { organizationId }, select: { status: true } }),
    db.onboardingIntake.findUnique({ where: { organizationId }, select: { offering: true, customerLocation: true, serviceReach: true, currentOffer: true, targetAudience: true, monthlyBudgetCents: true, budgetSuggested: true } }),
    db.trackingPixel.findUnique({ where: { organizationId_platform: { organizationId, platform: "META" } }, select: { status: true } }),
    db.storeIngest.findUnique({ where: { organizationId }, select: { lastReceivedAt: true } }),
    loadBrain(organizationId),
  ]);
  const connected = meta?.status === "CONNECTED";
  const approved = loaded.row.status === "APPROVED";
  return (
    <JourneyFrame steps={steps} here={approved ? "connect" : "approve"} wide>
      <PlanReview
        plan={loaded.plan}
        version={loaded.row.version}
        status={loaded.row.status}
        revisions={loaded.revisions}
        businessName={org.name}
        purchaseTracking={input?.purchaseTracking ?? false}
        connected={connected}
      />
      <PlanGuide
        plan={loaded.plan}
        facts={{
          website: org.website,
          pagesRead: brain.analysis?.pagesRead ?? [],
          offering: intakeFull?.offering ?? null,
          location: [intakeFull?.customerLocation, intakeFull?.serviceReach && intakeFull.serviceReach !== "Not sure" ? intakeFull.serviceReach.toLowerCase() : null].filter(Boolean).join(", ") || null,
          offer: intakeFull?.currentOffer ?? null,
          targetAudience: intakeFull?.targetAudience ?? null,
          monthlyBudgetCents: intakeFull && !intakeFull.budgetSuggested ? intakeFull.monthlyBudgetCents : null,
        }}
        tracking={{ pixelActive: pixel ? canOptimizeTowards(pixel.status) : false, storeConnected: Boolean(store?.lastReceivedAt) }}
        siteIssues={brain.analysis?.conversionIssues ?? []}
      />
    </JourneyFrame>
  );
}
