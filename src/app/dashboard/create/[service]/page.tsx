import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { entitlementsForTier } from "@/lib/entitlements";
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
import { recommendAllocation } from "@/lib/budget/allocation";
import { canOptimizeTowards } from "@/lib/tracking/pixels";

// One route for every service on the create screen.
//
// Three services, one wizard. What changes between them is which networks the
// campaign runs on and which goals are open to it — nothing else — so three
// routes would be three copies of the same seven questions, and the third one
// would be the one that quietly stops matching.

export const dynamic = "force-dynamic";

const SERVICES: Record<string, { name: string; platforms: AdPlatform[]; needs: "tiktok_ads" | "cross_platform_campaigns" | null }> = {
  meta: { name: "Meta", platforms: ["META"], needs: null },
  tiktok: { name: "TikTok", platforms: ["TIKTOK"], needs: "tiktok_ads" },
  multi: { name: "Meta and TikTok", platforms: ["META", "TIKTOK"], needs: "cross_platform_campaigns" },
};

export default async function CreateServicePage({
  params,
  searchParams,
}: {
  params: Promise<{ service: string }>;
  searchParams: Promise<{ draft?: string | string[] }>;
}) {
  const { service: slug } = await params;
  const service = SERVICES[slug];
  if (!service) notFound();
  const { draft: draftParam } = await searchParams;
  const draftId = typeof draftParam === "string" ? draftParam.slice(0, 64) : null;

  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  const [organization, intake, pixel, draft, balance, costs, mode] = await Promise.all([
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
  ]);
  if (!organization) redirect("/sign-in");

  // The plan check happens here as well as in the action. Not belt and braces:
  // the action's refusal is the one that protects the data, but arriving at a
  // seven-question flow only to be told at the end that the plan does not cover
  // it is a worse way to find out than not being able to start.
  const limits = await entitlementsForTier(organization.subscriptionTier);
  if (service.needs && !limits[service.needs]) redirect("/dashboard/plan");

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
    offering: intake?.offering ?? null,
    targetAudience: intake?.targetAudience ?? null,
    differentiator: intake?.differentiator ?? null,
    messageChannel: organization.defaultMessageChannel,
    // Filled in by the browser, which knows where the customer is.
    timeZone: "",
    metaPercent: recommendAllocation(["META", "TIKTOK"], "TRAFFIC", 10000).find((a) => a.platform === "META")?.percent ?? 60,
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

      <CampaignWizard
        initialPlan={initialPlan}
        initialDraftId={draft?.id ?? null}
        initialStep={initialStep}
        orgName={organization.name}
        platforms={service.platforms}
        defaultDestination={defaultDestination}
        pixelActive={pixelActive}
        businessPhone={organization.phone}
        autoLaunchHeld={organization.autoLaunchHeld}
        mode={mode}
        studio={{
          assistantName: assistantNameOf(organization.assistantName),
          configured: openAiImageConfigured() && storageConfigured(),
          creditBalance: balance,
          costs,
          mode,
        }}
      />
    </div>
  );
}
