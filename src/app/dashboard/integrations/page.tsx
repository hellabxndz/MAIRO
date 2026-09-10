import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader, Badge } from "@/components/ui";
import { activeOrganizationId } from "@/lib/active-org";
import { connectionSummaries } from "@/lib/ad-platforms/connections";
import { allPlatforms, platformMeta } from "@/lib/ad-platforms/registry";
import { entitlementsFor } from "@/lib/entitlements";
import { planFor, PLANS } from "@/lib/plans";
import { PlatformIcon } from "@/components/platform-icons";
import type { AdPlatform } from "@/generated/prisma/enums";

// Where a business connects the places it wants to advertise.
//
// This replaces the single-purpose /dashboard/meta screen for everything
// except Meta's own connect flow, which still lives there because it does more
// than connect (it picks a Page, and explains Meta's particular failure
// modes). The old page still works and is still linked; this is the one that
// scales past two networks.

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
    TIKTOK: entitlements.tiktok_ads,
    GOOGLE: false,
    SNAPCHAT: false,
    PINTEREST: false,
    LINKEDIN: false,
  };

  const tiktok = connections.get("TIKTOK");
  const tiktokConnected = tiktok?.connected ?? false;

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
            {params.connected === "tiktok" ? "TikTok" : "Account"} connected. MAIRO can run
            campaigns on it now.
          </p>
        </div>
      )}
      {params.upgrade && (
        <div className="mb-6 rounded-2xl border border-sky-400/20 bg-sky-400/[0.05] p-4">
          <p className="text-sm text-sky-200">
            TikTok is part of {upgradeTarget.name}.{" "}
            <Link href="/dashboard/settings#billing" className="underline underline-offset-4">
              Upgrade to connect it
            </Link>
            .
          </p>
        </div>
      )}

      <div className="space-y-4">
        {allPlatforms().map((meta) => {
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
                      href="/dashboard/settings#billing"
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
                      className="rounded-full bg-white px-4 py-2 text-xs font-medium text-black transition hover:bg-neutral-200"
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

      {/* The path for a business with no TikTok presence at all, which is most
          of the businesses MAIRO is for. Shown until they connect, because
          until then it is the question they actually have. */}
      {!tiktokConnected && entitlements.tiktok_ads && <StartFromZero />}

      {tiktokConnected && <GrowthModeCard />}
    </div>
  );
}

function StartFromZero() {
  return (
    <Card className="mt-8">
      <div className="flex items-start gap-4">
        <span
          className="mt-0.5 flex h-10 w-10 flex-none items-center justify-center rounded-xl border border-white/10 bg-white/[0.03]"
          style={{ color: platformMeta("TIKTOK").accent }}
        >
          <PlatformIcon platform="TIKTOK" className="h-5 w-5" />
        </span>
        <div>
          <h3 className="text-base text-white">Don&rsquo;t have a TikTok presence yet?</h3>
          <p className="mt-1 text-sm text-neutral-400">Start from zero with Mairo.</p>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-neutral-400">
            You don&rsquo;t need a following to advertise on TikTok. Paid campaigns are
            shown to people based on what they watch, not on who follows you — a business
            with nine followers and a good first three seconds will outperform one with
            ninety thousand and a dull ad. What you need is a TikTok Business account,
            which is free, takes about ten minutes, and is the only thing standing between
            you and running ads there.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a
              href="https://www.tiktok.com/business/en/solutions/business-account"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-white px-4 py-2 text-xs font-medium text-black transition hover:bg-neutral-200"
            >
              Create a TikTok Business account
            </a>
            <Link
              href="/dashboard/agents/strategist"
              className="rounded-full border border-white/10 px-4 py-2 text-xs text-neutral-300 transition hover:border-white/25 hover:text-white"
            >
              Ask MAIRO to walk me through it
            </Link>
          </div>
        </div>
      </div>
    </Card>
  );
}

const GROWTH_FEATURES = [
  "TikTok-native creatives",
  "Short-form video concepts",
  "Paid TikTok campaigns",
  "Spark Ad support",
  "Creative performance testing",
  "Audience growth tracking",
];

function GrowthModeCard() {
  return (
    <Card className="mt-8">
      <h3 className="text-base text-white">TikTok Growth Mode</h3>
      <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-neutral-400">
        For a business with little or no TikTok following. Turn it on when you create a
        campaign and MAIRO writes for TikTok rather than adapting a Meta ad — vertical,
        fast, subtitled, several hooks to test against each other — while building the
        account up alongside the paid spend.
      </p>
      <ul className="mt-5 grid gap-2.5 sm:grid-cols-2">
        {GROWTH_FEATURES.map((feature) => (
          <li key={feature} className="flex items-center gap-2.5 text-sm text-neutral-300">
            <svg viewBox="0 0 16 16" className="h-4 w-4 flex-none text-sky-400" fill="none" aria-hidden>
              <path
                d="m3.5 8.5 3 3 6-7"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {feature}
          </li>
        ))}
      </ul>
      <p className="mt-5 text-xs leading-relaxed text-neutral-500">
        Spark Ads — promoting a post already on your profile — need an extra TikTok
        permission and are switched on per account.{" "}
        <a href="/api/tiktok/connect?spark=1" className="underline underline-offset-4 hover:text-neutral-300">
          Grant it now
        </a>
        .
      </p>
    </Card>
  );
}
