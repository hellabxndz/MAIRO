import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { loadStrategy, strategyInputFor } from "@/lib/strategy/store";
import { JourneyFrame } from "@/components/strategy/journey";
import { PlanBuilder } from "@/components/strategy/plan-builder";
import { PlanReview } from "@/components/strategy/plan-review";

// The free stage: Mairo writes the plan, the business reviews it, asks for
// changes, and approves it. No dashboard yet — that comes with activation.

export const metadata = { title: "Your Mairo Advertising Plan" };
export const dynamic = "force-dynamic";
// Reading the website and writing the plan are AI calls.
export const maxDuration = 60;

export default async function PlanPage() {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  const [org, intake, loaded] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { name: true, website: true } }),
    db.onboardingIntake.findUnique({ where: { organizationId }, select: { id: true } }),
    loadStrategy(organizationId),
  ]);
  if (!org) redirect("/sign-in");
  if (!intake) redirect("/onboarding");
  if (loaded?.row.activatedAt) redirect("/dashboard/launch");

  if (!loaded) {
    return (
      <JourneyFrame step={2}>
        <PlanBuilder website={org.website} />
      </JourneyFrame>
    );
  }

  const [input, meta] = await Promise.all([
    strategyInputFor(organizationId),
    db.metaAdAccount.findUnique({ where: { organizationId }, select: { status: true } }),
  ]);
  const connected = meta?.status === "CONNECTED";
  const approved = loaded.row.status === "APPROVED";
  return (
    <JourneyFrame step={approved ? (connected ? 4 : 3) : 2} wide>
      <PlanReview
        plan={loaded.plan}
        version={loaded.row.version}
        status={loaded.row.status}
        revisions={loaded.revisions}
        businessName={org.name}
        purchaseTracking={input?.purchaseTracking ?? false}
        connected={connected}
      />
    </JourneyFrame>
  );
}
