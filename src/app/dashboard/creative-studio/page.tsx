import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { hasActivePlan } from "@/lib/readiness";
import { entitlementsFor } from "@/lib/entitlements";
import { viewMode } from "@/lib/view-mode";
import { PageHeader } from "@/components/ui";
import { PlanLock } from "@/components/plan-lock";
import { GlassPanel, HudLabel } from "@/components/mairo";
import { assistantNameOf } from "@/lib/ai/agents";
import { openAiImageConfigured } from "@/lib/ai/openai-image";
import { storageConfigured } from "@/lib/storage/blob";
import { creditBalance } from "@/lib/creative-studio/credits";
import { creditCosts } from "@/lib/creative-studio/pricing";
import { libraryFor, variationGroup } from "@/lib/creative-studio/library";
import { StudioWorkspace } from "@/components/creative-studio/studio-workspace";
import { LibraryGrid } from "@/components/creative-studio/library-grid";

// AI Creative Studio — where a business turns a sentence, or a product
// photo, into an advertising image, and where every one of those images
// lives afterwards.
//
// This page is deliberately not a new design language. Every visual choice
// here — GlassPanel, the ramp button, the credit meter's colours — is a
// component this session's rebuild of the rest of the product already
// established. A customer who has been anywhere else in the new dashboard
// should recognise this as the same product, not a bolted-on tool.

export const metadata = { title: "AI Creative Studio — MAIRO" };

export default async function CreativeStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  const { group } = await searchParams;

  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { name: true, assistantName: true, subscriptionTier: true, subscriptionStatus: true },
  });
  if (!org) redirect("/sign-in");

  const assistant = assistantNameOf(org.assistantName);

  if (!hasActivePlan(org)) {
    return (
      <div>
        <PageHeader
          title="AI Creative Studio"
          description="Create scroll-stopping ads with the power of AI."
        />
        <PlanLock
          title="Creative Studio comes with a plan"
          body={`Describe an ad and ${assistant} generates it, transforms your product photos into advertising images, and keeps every version so you can keep refining by just describing the change. Pick a plan and it opens up straight away.`}
        />
      </div>
    );
  }

  const configured = openAiImageConfigured() && storageConfigured();

  const [entitlements, balance, costs, library, groupItems, mode] = await Promise.all([
    entitlementsFor(organizationId),
    creditBalance(organizationId),
    creditCosts(),
    libraryFor(organizationId),
    group ? variationGroup(organizationId, group) : Promise.resolve(null),
    viewMode(),
  ]);

  return (
    <div>
      <PageHeader
        title="AI Creative Studio"
        description="Create scroll-stopping ads with the power of AI."
      />

      {!configured ? (
        <GlassPanel className="p-6" lit>
          <h2 className="text-[15px] font-medium text-white">Not switched on for this deployment yet</h2>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted">
            {!openAiImageConfigured() && (
              <>
                AI Creative Studio needs an OpenAI key. Add <code className="text-white/80">OPENAI_API_KEY</code> in
                your hosting environment variables and redeploy.
              </>
            )}
            {!openAiImageConfigured() && !storageConfigured() && <br />}
            {!storageConfigured() && (
              <>
                Generated and uploaded images need somewhere to live. Add{" "}
                <code className="text-white/80">BLOB_READ_WRITE_TOKEN</code> (a Vercel Blob store) and redeploy.
              </>
            )}
          </p>
        </GlassPanel>
      ) : (
        <StudioWorkspace
          assistantName={assistant}
          creditBalance={balance}
          costs={costs}
          mode={mode}
        />
      )}

      {groupItems && groupItems.length > 0 && (
        <section className="mt-10">
          <HudLabel className="mb-4">Variations</HudLabel>
          <LibraryGrid items={groupItems} />
        </section>
      )}

      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <HudLabel>Creative library</HudLabel>
          <p className="text-[11.5px] text-faint">
            {balance.used} of {entitlements.studio_credits_monthly} credits used this month
          </p>
        </div>
        <LibraryGrid items={library} />
      </section>
    </div>
  );
}
