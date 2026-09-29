import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import type { AdPlatform } from "@/generated/prisma/enums";
import { CampaignWizard } from "./campaign-wizard";
import { assistantNameOf } from "@/lib/ai/agents";
import { openAiImageConfigured } from "@/lib/ai/openai-image";
import { storageConfigured } from "@/lib/storage/blob";
import { creditBalance } from "@/lib/creative-studio/credits";
import { creditCosts } from "@/lib/creative-studio/pricing";
import { viewMode } from "@/lib/view-mode";
import { asDefaultDestination } from "@/lib/campaigns/destination";
import { isWizardStep, newPlan, type CampaignPlan, type WizardStep } from "@/lib/campaigns/plan";
import { canOptimizeTowards } from "@/lib/tracking/pixels";
import { connectionSummaries } from "@/lib/ad-platforms/connections";
import { brainFacts, loadBrain } from "@/lib/business/brain";

// The Create wizard's route.
//
// MAIRO runs Meta only. The old TikTok and Meta+TikTok addresses redirect
// here rather than 404, so a bookmark or an old link still lands somewhere
// that works.

export const dynamic = "force-dynamic";

const SERVICES: Record<string, { name: string; platforms: AdPlatform[] }> = {
  meta: { name: "Meta", platforms: ["META"] },
};
const RETIRED = new Set(["tiktok", "multi"]);

export default async function CreateServicePage({
  params,
  searchParams,
}: {
  params: Promise<{ service: string }>;
  searchParams: Promise<{ draft?: string | string[]; posts?: string; connected?: string }>;
}) {
  const { service: slug } = await params;
  if (RETIRED.has(slug)) redirect("/dashboard/create/meta");
  const service = SERVICES[slug];
  if (!service) notFound();
  const { draft: draftParam, posts: postsParam, connected: connectedParam } = await searchParams;
  const draftId = typeof draftParam === "string" ? draftParam.slice(0, 64) : null;

  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  const [organization, intake, pixel, draft, balance, costs, mode, connections] = await Promise.all([
    db.organization.findUnique({
      where: { id: organizationId },
      select: {
        name: true,
        website: true,
        phone: true,
        subscriptionTier: true,
        defaultDestination: true,
        defaultMessageChannel: true,
        assistantName: true,
        autoLaunchHeld: true,
      },
    }),
    db.onboardingIntake.findUnique({
      where: { organizationId },
      select: { offering: true, targetAudience: true, differentiator: true },
    }),
    db.trackingPixel.findUnique({
      where: { organizationId_platform: { organizationId, platform: "META" } },
      select: { status: true },
    }),
    draftId
      ? db.campaignDraft.findFirst({
          where: { id: draftId, organizationId, step: { not: "BUILDING" } },
          select: { id: true, service: true, step: true, data: true },
        })
      : Promise.resolve(null),
    creditBalance(organizationId),
    creditCosts(),
    viewMode(),
    connectionSummaries(organizationId),
  ]);
  // The Business Brain fills anything the signup answers left empty, so a
  // business that analyzed its website doesn't type its own description again.
  const brain = brainFacts((await loadBrain(organizationId)).profile);
  // A draft made from the approved free plan goes back to the launch review
  // once it's built, where the plan and the campaign are compared.
  const fromPlan = draft
    ? Boolean(await db.strategyPlan.findFirst({ where: { organizationId, campaignDraftId: draft.id }, select: { id: true } }))
    : false;
  if (!organization) redirect("/sign-in");

  // A draft opened under another service's address goes to its own.
  if (draft && draft.service !== slug && SERVICES[draft.service]) {
    redirect(`/dashboard/create/${draft.service}?draft=${draft.id}`);
  }

  const defaultDestination = asDefaultDestination(organization.defaultDestination);
  const pixelActive = pixel ? canOptimizeTowards(pixel.status) : false;
  const fresh = newPlan({
    service: slug as CampaignPlan["service"],
    businessName: organization.name,
    website: organization.website,
    offering: intake?.offering || brain.offering || null,
    targetAudience: intake?.targetAudience || brain.targetAudience || null,
    differentiator: intake?.differentiator || brain.differentiator || null,
    messageChannel: organization.defaultMessageChannel,
    // Filled in by the browser, which knows where the customer is.
    timeZone: "",
    // Every campaign is Meta, so all of the budget goes there.
    metaPercent: 100,
  });

  // A saved draft over today's defaults, so a field added since it was saved
  // still has a value.
  const saved = draft && typeof draft.data === "object" && draft.data !== null && !Array.isArray(draft.data)
    ? (draft.data as Partial<CampaignPlan>)
    : null;
  const initialPlan: CampaignPlan = saved ? { ...fresh, ...saved, service: fresh.service } : fresh;
  // A review is never saved — it's re-run against the account as it is now.
  const savedStep: WizardStep = draft && isWizardStep(draft.step) ? draft.step : "business";
  const initialStep: WizardStep = savedStep === "launch" ? "review" : savedStep;

  return (
    <div>
      <Link
        href="/dashboard/create"
        className="mb-8 inline-flex items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-white"
      >
        <span aria-hidden>←</span>
        All services
      </Link>

      {fromPlan && (
        <p className="mb-6 rounded-xl border border-violet/30 bg-violet/[0.06] px-4 py-3 text-[13.5px] text-white/90">
          Prefilled from your approved plan. Check each step, confirm your location, and make your final creatives — the campaign is built switched off, and nothing spends until you press Launch Campaign.
        </p>
      )}
      <CampaignWizard
        afterLaunchHref={fromPlan ? "/dashboard/launch" : undefined}
        initialPlan={initialPlan}
        initialDraftId={draft?.id ?? null}
        initialStep={initialStep}
        orgName={organization.name}
        platforms={service.platforms}
        defaultDestination={defaultDestination}
        pixelActive={pixelActive}
        businessPhone={organization.phone}
        autoLaunchHeld={organization.autoLaunchHeld}
        connected={service.platforms.filter((p) => connections.get(p)?.connected)}
        justConnected={connectedParam === "1"}
        openPosts={postsParam === "1"}
        mode={mode}
        studio={{
          assistantName: assistantNameOf(organization.assistantName),
          configured: openAiImageConfigured() && storageConfigured(),
          storageReady: storageConfigured(),
          organizationId,
          creditBalance: balance,
          costs,
          mode,
        }}
      />
    </div>
  );
}
