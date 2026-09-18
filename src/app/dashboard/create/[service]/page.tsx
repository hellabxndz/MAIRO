import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { connectionSummaries } from "@/lib/ad-platforms/connections";
import { entitlementsForTier } from "@/lib/entitlements";
import type { AdPlatform } from "@/generated/prisma/enums";
import { LaunchFlow } from "./launch-flow";

// One route for every service on the create screen.
//
// Three services, one flow. What changes between them is which networks the
// campaign runs on and what the budget explanation names — nothing else — so
// three routes would be three copies of the same four questions, and the third
// one would be the one that quietly stops matching.

export const dynamic = "force-dynamic";

const SERVICES: Record<string, { name: string; platforms: AdPlatform[]; needs: "tiktok_ads" | "cross_platform_campaigns" | null }> = {
  meta: { name: "Meta", platforms: ["META"], needs: null },
  tiktok: { name: "TikTok", platforms: ["TIKTOK"], needs: "tiktok_ads" },
  multi: { name: "Meta and TikTok", platforms: ["META", "TIKTOK"], needs: "cross_platform_campaigns" },
};

export default async function CreateServicePage({
  params,
}: {
  params: Promise<{ service: string }>;
}) {
  const { service: slug } = await params;
  const service = SERVICES[slug];
  if (!service) notFound();

  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  const [organization, connections] = await Promise.all([
    db.organization.findUnique({
      where: { id: organizationId },
      select: {
        name: true,
        website: true,
        phone: true,
        subscriptionTier: true,
        defaultDestination: true,
        defaultMessageChannel: true,
      },
    }),
    connectionSummaries(organizationId),
  ]);
  if (!organization) redirect("/sign-in");

  // The plan check happens here as well as in the action. Not belt and braces:
  // the action's refusal is the one that protects the data, but arriving at a
  // four-question flow only to be told at the end that the plan does not cover
  // it is a worse way to find out than not being able to start.
  const limits = await entitlementsForTier(organization.subscriptionTier);
  if (service.needs && !limits[service.needs]) redirect("/dashboard/plan");

  const connected = service.platforms.filter((p) => connections.get(p)?.connected);

  return (
    <div>
      <Link
        href="/dashboard/create"
        className="mb-8 inline-flex items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-white"
      >
        <span aria-hidden>←</span>
        All services
      </Link>

      <LaunchFlow
        service={{ slug, name: service.name, platforms: service.platforms }}
        connected={connected}
        business={{
          name: organization.name,
          website: organization.website,
          phone: organization.phone,
          destinationType: organization.defaultDestination,
          messageChannel: organization.defaultMessageChannel,
        }}
      />
    </div>
  );
}
