import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { OnboardingForm } from "./onboarding-form";
import { activeOrganizationId } from "@/lib/active-org";
import { parseDraft, resumeScreen } from "@/lib/onboarding/draft";
import { loadOnboarding } from "@/lib/onboarding/progress-store";
import { focusStep } from "@/lib/onboarding/progress";
import { recommendGoal } from "@/lib/onboarding/goal";
import { setupWork } from "@/lib/onboarding/team";
import { loadBrain } from "@/lib/business/brain";
import { JourneyFrame } from "@/components/strategy/journey";
import { businessTypeFrom } from "@/lib/onboarding/business-types";
import { normalizeUrl } from "@/lib/campaigns/destination";
import { SetupTeam } from "@/components/onboarding/setup-team";
import { deniedFor } from "@/lib/members/authorize";

// Steps 1 to 3 of ten: the business, what MAIRO learns from its website, and
// the goal. Opens on the screen they stopped at — the answers so far are
// saved on the organization (onboardingDraft) as they go.

export const metadata = { title: "Set up MAIRO" };
export const dynamic = "force-dynamic";
// Reading the website is a web fetch (and an AI call when configured).
export const maxDuration = 60;

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ step?: string; type?: string; website?: string }> }) {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");

  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  const existingIntake = await db.onboardingIntake.findUnique({ where: { organizationId } });
  if (existingIntake) redirect("/dashboard");

  // A teammate whose role can't set up the business waits for someone who can,
  // rather than filling in a form the server would refuse.
  const denied = await deniedFor("business.edit");
  if (denied) {
    return (
      <JourneyFrame steps={null}>
        <div className="mx-auto max-w-[560px] py-10 text-center">
          <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-white">This business is still being set up</h1>
          <p className="mt-3 text-[14.5px] leading-relaxed text-neutral-400">An owner, administrator or marketing manager finishes setting up MAIRO for it. You&rsquo;ll see everything here as soon as they do.</p>
        </div>
      </JourneyFrame>
    );
  }

  const { step, type, website: carriedWebsite } = await searchParams;
  const [org, steps, work, brain] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { website: true, industry: true, onboardingDraft: true, timezone: true } }),
    loadOnboarding(organizationId),
    setupWork(organizationId),
    loadBrain(organizationId),
  ]);
  if (!org) redirect("/sign-in");
  const draft = parseDraft(org.onboardingDraft);

  const screen = resumeScreen(draft, org.website, step);

  const business = {
    // Saved answers win; otherwise the address typed on the landing page.
    website: draft.business?.website ?? org.website ?? (carriedWebsite ? normalizeUrl(carriedWebsite.slice(0, 300)) ?? "" : ""),
    industry: draft.business?.industry ?? org.industry ?? "",
    offering: draft.business?.offering ?? "",
    customerLocation: draft.business?.customerLocation ?? "",
    // A type chosen earlier wins; otherwise the one carried from the website's
    // walkthrough (?type=), which the owner can still change.
    businessType: draft.business?.businessType ?? businessTypeFrom(type)?.id ?? "",
    reach: draft.business?.reach ?? "",
  };
  const suggestion = recommendGoal({ industry: business.industry, offering: business.offering, primaryCta: brain.analyzedAt ? brain.profile.primaryCta : null, presence: brain.analyzedAt ? brain.profile.presence : null });

  return (
    <JourneyFrame steps={steps} here={screen === "business" ? "business" : screen === "learn" ? "learn" : "goal"}>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <OnboardingForm initialScreen={screen} business={business} goal={draft.goal ?? {}} defaultDestination={null} initialSuggestion={suggestion} />
        </div>
        <aside className="min-w-0">
          <SetupTeam work={work} focus={steps ? (focusStep(steps)?.id ?? null) : null} timeZone={org.timezone} />
        </aside>
      </div>
    </JourneyFrame>
  );
}
