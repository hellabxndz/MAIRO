import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader, Badge } from "@/components/ui";
import { activeOrganizationId } from "@/lib/active-org";
import { connectionSummaries } from "@/lib/ad-platforms/connections";
import { allPlatforms } from "@/lib/ad-platforms/registry";
import { entitlementsFor } from "@/lib/entitlements";
import { planFor, PLANS } from "@/lib/plans";
import { PlatformIcon } from "@/components/platform-icons";
import { billingUrlFor } from "@/lib/ad-platforms/billing";
import type { AdPlatform } from "@/generated/prisma/enums";

// Where a business connects the places it wants to advertise.
//
// This replaces the single-purpose /dashboard/meta screen for everything
// except Meta's own connect flow, which still lives there because it does more
// than connect (it picks a Page, and explains Meta's particular failure
// modes). The old page still works and is still linked; this is the one that
// scales to further networks. MAIRO runs Meta only; TikTok was offered once
// and retired, so it isn't listed at all rather than shown as "coming soon".

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string; upgrade?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");

  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  const params = await searchParams;

  const [connections, entitlements, organization] = await Promise.all([
    connectionSummaries(organizationId),
    entitlementsFor(organizationId),
    db.organization.findUnique({
      where: { id: organizationId },
      select: { subscriptionTier: true },
    }),
  ]);

  const plan = planFor(organization?.subscriptionTier ?? "NONE");
  const upgradeTarget =
    PLANS.find((p) => p.priceMonthly > plan.priceMonthly) ?? PLANS[PLANS.length - 1];

  const allowed: Record<AdPlatform, boolean> = {
    META: entitlements.meta_ads,
    TIKTOK: false,
    GOOGLE: false,
    SNAPCHAT: false,
    PINTEREST: false,
    LINKEDIN: false,
  };

  return (
    <div>
      <PageHeader
        title="Where you advertise"
        description="Connect an account once and MAIRO runs your campaigns on it. You never need to open an ads manager."
      />

      {params.error && (
        <div className="mb-6 rounded-2xl border border-red-400/20 bg-red-400/[0.05] p-4">
          <p className="text-sm text-red-300">{params.error}</p>
        </div>
      )}
      {params.connected && (
        <div className="mb-6 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.05] p-4">
          <p className="text-sm text-emerald-300">
            Account connected.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {allPlatforms().filter((p) => p.platform !== "TIKTOK").map((meta) => {
          const summary = connections.get(meta.platform);
          const connected = summary?.connected ?? false;
          const permitted = allowed[meta.platform];

          return (
            <Card key={meta.platform}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <span
                    className="mt-0.5 flex h-10 w-10 flex-none items-center justify-center rounded-xl border border-white/10 bg-white/[0.03]"
                    style={{ color: meta.implemented ? meta.accent : undefined }}
                  >
                    <PlatformIcon platform={meta.platform} className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h3 className="text-base text-white">{meta.name}</h3>
                      {connected ? (
                        <Badge tone="green">Connected</Badge>
                      ) : !meta.implemented ? (
                        <Badge tone="neutral">Coming soon</Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-neutral-500">{meta.surfaces}</p>
                    {summary?.accountName && (
                      <p className="mt-1.5 text-xs text-neutral-400">{summary.accountName}</p>
                    )}
                    {/* Connecting an account and putting a card on it are two
                        different things, and nothing in the product used to say
                        so. This is where someone looks when they wonder how the
                        ads get paid for. */}
                    {connected && summary?.accountId && billingUrlFor(meta.platform, summary.accountId) && (
                      <p className="mt-2 text-xs text-neutral-500">
                        You pay {meta.name} directly for ad spend.{" "}
                        <a
                          href={billingUrlFor(meta.platform, summary.accountId)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline underline-offset-4 hover:text-neutral-300"
                        >
                          Manage payment on {meta.name}
                        </a>
                      </p>
                    )}
                    {summary?.problem && (
                      <p className="mt-2 max-w-md text-xs text-amber-200/80">{summary.problem}</p>
                    )}
                    {meta.implemented && !meta.configured() && (
                      <p className="mt-2 max-w-md text-xs text-neutral-500">
                        Not configured on this deployment yet.
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {!meta.implemented ? null : !permitted ? (
                    <Link
                      href="/dashboard/billing"
                      className="rounded-full border border-sky-400/30 bg-sky-400/10 px-4 py-2 text-xs text-sky-200 transition hover:bg-sky-400/20"
                    >
                      Included in {upgradeTarget.name}
                    </Link>
                  ) : connected ? (
                    <a
                      href={meta.platform === "META" ? "/dashboard/meta" : meta.connectPath}
                      className="rounded-full border border-white/10 px-4 py-2 text-xs text-neutral-300 transition hover:border-white/25 hover:text-white"
                    >
                      Reconnect
                    </a>
                  ) : (
                    <a
                      href={meta.platform === "META" ? "/dashboard/meta" : meta.connectPath}
                      className="rounded-full bg-[image:var(--mairo-ramp)] shadow-[var(--mairo-glow-key)] px-4 py-2 text-xs font-medium text-white transition hover:brightness-110"
                    >
                      Connect {meta.name}
                    </a>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

    </div>
  );
}
