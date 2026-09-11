import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader, Badge } from "@/components/ui";
import { activeOrganizationId } from "@/lib/active-org";
import { entitlementsFor } from "@/lib/entitlements";
import { planFor, PLANS } from "@/lib/plans";
import { connectionSummaries } from "@/lib/ad-platforms/connections";
import { fetchOrganizationPerformance } from "@/lib/ad-platforms/performance";
import { pixelsFor } from "@/lib/tracking/pixels";
import { ensureIngest } from "@/lib/tracking/orders";
import {
  compareRoas,
  explainReading,
  measuredSales,
  recentOrders,
} from "@/lib/tracking/roas";
import { NO_VALUE } from "@/components/metrics";
import { PlatformIcon } from "@/components/platform-icons";
import { PixelCard } from "./pixel-card";
import { ManualOrderForm, StoreCard } from "./store-card";
import { GtmCard } from "./gtm-card";
import { allNiches, nicheById } from "@/lib/tracking/niches";
import { dataLayerSnippet, gtmSnippet } from "@/lib/tracking/gtm";
import { ensureTrackingProfile } from "@/lib/actions/tracking-actions";
import { gtmConnectionSummary } from "@/lib/tracking/gtm-connection";
import { gtmApiConfigured } from "@/lib/tracking/gtm-api/oauth";
import type { AdPlatform } from "@/generated/prisma/enums";

// "Is the advertising actually making me money?"
//
// The one question every business owner has and the one the product could not
// answer. ROAS was a dash on every dashboard because no customer had a pixel —
// nothing in MAIRO had ever mentioned one — and a dash is indistinguishable
// from a zero to somebody who does not know what a pixel is.
//
// This page has two halves and they are not interchangeable. The pixel tells
// the ad network that a sale happened, which is what makes the network report
// revenue and what makes its optimization work at all. The shop connection
// tells MAIRO what was actually sold, which is what makes the number on this
// page true rather than merely reported. Either alone is worth having; the two
// together are the only way to know both what you earned and which ad earned
// it.

export const maxDuration = 30;

function money(cents: number | null, currency: string): string {
  if (cents === null) return NO_VALUE;
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 0,
  });
}

function ratio(value: number | null): string {
  return value === null ? NO_VALUE : `${value.toFixed(2)}x`;
}

const PERIOD_DAYS = 30;

export default async function TrackingPage() {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");

  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  const until = new Date();
  const since = new Date(until.getTime() - PERIOD_DAYS * 864e5);

  const [pixels, entitlements, organization, connections, ingest, measured, orders, report, profile, gtm] =
    await Promise.all([
      pixelsFor(organizationId),
      entitlementsFor(organizationId),
      db.organization.findUnique({
        where: { id: organizationId },
        select: { subscriptionTier: true, name: true },
      }),
      connectionSummaries(organizationId),
      ensureIngest(organizationId),
      measuredSales(organizationId, { since, until }),
      recentOrders(organizationId),
      fetchOrganizationPerformance(organizationId),
      ensureTrackingProfile(organizationId),
      gtmConnectionSummary(organizationId),
    ]);

  const niche = nicheById(profile.nicheId);

  const plan = planFor(organization?.subscriptionTier ?? "NONE");
  const upgradeTarget =
    PLANS.find((p) => p.priceMonthly > plan.priceMonthly) ?? PLANS[PLANS.length - 1];

  const comparison = compareRoas({
    spendCents: report.total.spendCents ?? 0,
    attributedRevenueCents: report.total.revenueCents,
    measured,
  });

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000");
  const ingestUrl = `${appUrl}/api/orders/${ingest.token}`;

  const platforms: { platform: AdPlatform; name: string; allowed: boolean }[] = [
    { platform: "META", name: "Meta", allowed: entitlements.meta_ads },
    { platform: "TIKTOK", name: "TikTok", allowed: entitlements.tiktok_ads },
  ];

  return (
    <div>
      <PageHeader
        title="Measuring sales"
        description="What it takes for MAIRO to tell you whether the ads made you money — and for the ads to get better at it."
      />

      {/* The headline comparison. Deliberately first: somebody who opens this
          page wants the number, and the setup below is the price of it. */}
      <Card className="mb-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base text-white">Last {PERIOD_DAYS} days</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-neutral-400">
              Two answers to the same question. One is what the ad networks claim; the other
              is what you actually sold.
            </p>
          </div>
          {comparison.mixedCurrency && (
            <Badge tone="yellow">Mixed currencies — showing {comparison.currency}</Badge>
          )}
        </div>

        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Figure
            label="Ad spend"
            value={money(comparison.spendCents, comparison.currency)}
            hint="What the networks charged"
            large
          />
          <Figure
            label="ROAS the networks report"
            value={ratio(comparison.attributedRoas)}
            hint="Attributed to ads"
            large
          />
          <Figure
            label="What you actually sold"
            value={money(comparison.measuredRevenueCents, comparison.currency)}
            hint={`${comparison.orderCount} order${comparison.orderCount === 1 ? "" : "s"}`}
            large
          />
          <Figure
            label="Everything sold ÷ ad spend"
            value={ratio(comparison.measuredRoas)}
            hint="Not only from ads"
            large
          />
        </div>

        <div
          className={`mt-6 rounded-xl border p-4 ${
            comparison.reading === "agrees"
              ? "border-emerald-400/20 bg-emerald-400/[0.04]"
              : comparison.reading === "over_claiming" ||
                  comparison.reading === "under_reporting"
                ? "border-amber-400/20 bg-amber-400/[0.04]"
                : "border-white/10 bg-white/[0.02]"
          }`}
        >
          <p className="max-w-3xl text-sm leading-relaxed text-neutral-300">
            {explainReading(comparison.reading, comparison.unmatchedCount)}
          </p>
        </div>

        <p className="mt-4 max-w-3xl text-xs leading-relaxed text-neutral-500">
          The two are measured differently on purpose. The networks only count sales they can
          trace back to someone who saw your ad — that is the number their optimization runs
          on, and the only one that can tell you which ad worked. The second is plain
          arithmetic on everything you sold, including sales the ads had nothing to do with.
          Neither is wrong; they answer different questions.
        </p>
      </Card>

      <h2 className="mb-3 text-sm font-medium text-neutral-300">
        1. Tell the ad networks when someone buys
      </h2>
      <p className="mb-4 max-w-3xl text-sm leading-relaxed text-neutral-400">
        A pixel is a few lines of code on your website. Without one, Meta and TikTok have no
        idea anybody ever bought anything — so they report no revenue, they can&rsquo;t
        optimise towards buyers, and every ROAS figure MAIRO shows you stays blank.
      </p>

      <div className="space-y-4">
        {platforms.map(({ platform, name, allowed }) => {
          const snapshot = pixels.find((p) => p.platform === platform);
          return (
            <PixelCard
              key={platform}
              platform={platform}
              name={name}
              allowed={allowed}
              upgradeName={upgradeTarget.name}
              connected={connections.get(platform)?.connected ?? false}
              snapshot={
                snapshot
                  ? {
                      platform: snapshot.platform,
                      pixelId: snapshot.pixelId,
                      status: snapshot.status,
                      lastFiredAt: snapshot.lastFiredAt?.toISOString() ?? null,
                      lastCheckedAt: snapshot.lastCheckedAt?.toISOString() ?? null,
                      lastError: snapshot.lastError,
                      baseSnippet: snapshot.baseSnippet,
                      purchaseSnippet: snapshot.purchaseSnippet,
                    }
                  : null
              }
            />
          );
        })}
      </div>

      <h2 className="mb-3 mt-10 text-sm font-medium text-neutral-300">
        2. Put it on your website, without touching code
      </h2>
      <p className="mb-4 max-w-3xl text-sm leading-relaxed text-neutral-400">
        Google Tag Manager does the installing. MAIRO writes a file with every tag already
        built — the pixels, and the specific things a{" "}
        {niche.label.toLowerCase()} converts on — and Tag Manager imports the lot in one go.
        It&rsquo;s free, and it means you never paste code into your site again.
      </p>

      <Card>
        <GtmCard
          niches={allNiches().map((n) => ({ id: n.id, label: n.label }))}
          currentNicheId={niche.id}
          nicheConfirmed={profile.nicheConfirmed}
          nicheSummary={niche.summary}
          actions={niche.actions.map((a) => ({
            id: a.id,
            label: a.label,
            why: a.why,
            metaEvent: a.metaEvent,
            tiktokEvent: a.tiktokEvent,
            hasValue: a.hasValue,
            primary: Boolean(a.primary),
            detection: a.detection,
            match: a.match ?? null,
          }))}
          gtmContainerId={profile.gtmContainerId}
          hasAnyPixel={pixels.length > 0}
          dataLayer={dataLayerSnippet(niche)}
          gtmSnippetForContainer={
            profile.gtmContainerId ? gtmSnippet(profile.gtmContainerId) : null
          }
          gtmApiConfigured={gtmApiConfigured()}
          connection={{
            connected: gtm.connected,
            googleEmail: gtm.googleEmail,
            containerPublic: gtm.containerPublic,
            containerName: gtm.containerName,
            canPublish: gtm.canPublish,
            lastPublishedAt: gtm.lastPublishedAt?.toISOString() ?? null,
            publishedTagCount: gtm.publishedTagCount,
            problem: gtm.problem,
          }}
        />
      </Card>

      <h2 className="mb-3 mt-10 text-sm font-medium text-neutral-300">
        3. Tell MAIRO what you actually sold
      </h2>
      <p className="mb-4 max-w-3xl text-sm leading-relaxed text-neutral-400">
        Worth doing even with the pixel working. Ad blockers and iPhone privacy settings stop
        a real share of sales from ever reaching the networks — connecting your shop lets
        MAIRO send those the back way, and gives the figures above something true to be
        checked against.
      </p>

      <Card>
        <StoreCard
          ingestUrl={ingestUrl}
          hasShopifySecret={ingest.hasShopifySecret}
          lastReceivedAt={ingest.lastReceivedAt?.toISOString() ?? null}
          receivedCount={ingest.receivedCount}
        />
        <ManualOrderForm currency={comparison.currency} />
      </Card>

      {orders.length > 0 && (
        <>
          <h2 className="mb-3 mt-10 text-sm font-medium text-neutral-300">Recent orders</h2>
          <Card>
            <div className="space-y-2.5">
              {orders.map((o) => (
                <div
                  key={o.id}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-2.5 last:border-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-white">
                      {money(o.valueCents, o.currency)}{" "}
                      <span className="text-neutral-500">· {o.externalOrderId}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-600">
                      {o.source.toLowerCase()} · {o.occurredAt.toLocaleDateString()}
                      {!o.hashedEmail && " · no email, so harder to match"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {o.forwards
                      .filter((f) => f.status !== "SKIPPED")
                      .map((f) => (
                        <span
                          key={f.platform}
                          title={f.message ?? undefined}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${
                            f.status === "SENT"
                              ? "border-emerald-400/25 text-emerald-300"
                              : f.status === "FAILED"
                                ? "border-red-400/25 text-red-300"
                                : "border-amber-400/25 text-amber-200"
                          }`}
                        >
                          <PlatformIcon platform={f.platform} className="h-3 w-3" />
                          {f.status === "SENT"
                            ? "sent"
                            : f.status === "FAILED"
                              ? "failed"
                              : "no match"}
                        </span>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      <p className="mt-8 max-w-3xl text-xs leading-relaxed text-neutral-500">
        MAIRO never stores your customers&rsquo; email addresses or phone numbers. They are
        turned into an irreversible fingerprint the moment an order arrives — which is all the
        ad networks need to match a sale to an ad, and is the same thing they do at their end.{" "}
        <Link href="/privacy" className="underline underline-offset-4 hover:text-neutral-300">
          How MAIRO handles data
        </Link>
        .
      </p>
    </div>
  );
}

function Figure({
  label,
  value,
  hint,
  large,
}: {
  label: string;
  value: string;
  hint?: string;
  large?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">{label}</p>
      <p
        className={`mt-1.5 truncate font-light tabular-nums text-white ${
          large ? "text-2xl" : "text-base"
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[10px] text-neutral-600">{hint}</p>}
    </div>
  );
}
