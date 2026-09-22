import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { connectionSummaries } from "@/lib/ad-platforms/connections";
import { entitlementsForTier } from "@/lib/entitlements";
import { planFor } from "@/lib/plans";
import { PlatformCard, type ServiceStatus } from "@/components/mairo/campaign-parts";
import { PageHeader } from "@/components/ui";
import { MetaMark, TikTokMark, GoogleMark } from "@/components/mairo/marks";
import { deleteCampaignDraftAction } from "@/lib/actions/campaign-wizard-actions";
import { WIZARD_STEPS } from "@/lib/campaigns/plan";

// Ad services: what MAIRO should run, rather than what to buy.
//
// This screen replaces a signpost — four links to pages you had to already
// understand — with the actual decision: which of these should MAIRO operate
// for this business. Every card carries real state, not a brochure: whether the
// account is connected, how many campaigns the plan allows, how many are
// already running.
//
// Deliberately not a store. No prices, no basket, no "buy" — the plan is
// already paid for and what is being chosen here is work to delegate. The plan
// line is on the card because the limit is real and finding out after building
// a campaign is worse than seeing it here.
//
// The three networks that do not work yet are shown rather than hidden, dimmed
// and unclickable. Somebody deciding whether this product will grow with them
// should be able to see where it is going; an empty page tells them it is
// finished. They carry no date, because a date is a promise.

export const dynamic = "force-dynamic";

const ICON = "h-full w-full";

/** Longer than any build takes. */
const BUILD_STALE_MS = 15 * 60 * 1000;
function staleBuildCutoff(): Date {
  return new Date(Date.now() - BUILD_STALE_MS);
}

const SERVICE_NAME: Record<string, string> = { meta: "Meta", tiktok: "TikTok", multi: "Meta + TikTok" };

export default async function CreatePage() {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  const [organization, connections, campaignCount, drafts] = await Promise.all([
    db.organization.findUnique({
      where: { id: organizationId },
      select: { subscriptionTier: true },
    }),
    connectionSummaries(organizationId),
    db.mairoCampaign.count({
      where: { organizationId, status: { not: "ARCHIVED" } },
    }),
    db.campaignDraft.findMany({
      // One stuck mid-build (the server stopped before it could say how the
      // build went) drops off after a while; Campaigns shows what it made.
      where: { organizationId, OR: [{ step: { not: "BUILDING" } }, { updatedAt: { gte: staleBuildCutoff() } }] },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: { id: true, label: true, service: true, step: true, updatedAt: true },
    }),
  ]);

  const tier = organization?.subscriptionTier ?? "NONE";
  const plan = planFor(tier);
  const limits = await entitlementsForTier(tier);
  const tiktokAllowed = limits.tiktok_ads;
  const crossPlatform = limits.cross_platform_campaigns;

  const metaOn = connections.get("META")?.connected ?? false;
  const tiktokOn = connections.get("TIKTOK")?.connected ?? false;

  // campaign_limit is a number, and Infinity is how an unlimited plan says so.
  const campaignsLine = Number.isFinite(limits.campaign_limit)
    ? `${plan.name} · ${campaignCount} of ${limits.campaign_limit} campaigns used`
    : `${plan.name} · ${campaignCount} running`;

  const status = (on: boolean, what: string): ServiceStatus =>
    on
      ? { kind: "connected", detail: `${what} connected` }
      : { kind: "available", detail: `${what} not connected` };

  return (
    <div>
      <PageHeader
        title="What should MAIRO run?"
        description="Pick where you want to advertise. MAIRO builds the campaign, writes the ads and manages it from there — you approve before anything goes live."
      />

      {drafts.length > 0 && (
        <section className="mb-8">
          <h2 className="text-[15px] font-medium text-white">Pick up where you left off</h2>
          <ul className="mt-3 divide-y overflow-hidden rounded-xl border" style={{ borderColor: "var(--mairo-line)" }}>
            {drafts.map((d) => {
              const building = d.step === "BUILDING";
              const step = WIZARD_STEPS.find((s) => s.id === d.step)?.label;
              return (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" style={{ borderColor: "var(--mairo-line)" }}>
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] text-white">{d.label}</p>
                    <p className="mt-0.5 text-[11.5px] text-faint">
                      {SERVICE_NAME[d.service] ?? d.service} · {building ? "Being built now" : `Stopped at ${step ?? "the start"}`} · saved{" "}
                      {d.updatedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </p>
                  </div>
                  {!building && (
                    <div className="flex items-center gap-2">
                      <form action={deleteCampaignDraftAction.bind(null, d.id)}>
                        <button type="submit" className="rounded-full px-3 py-1.5 text-[12px] text-muted transition hover:text-white">
                          Delete
                        </button>
                      </form>
                      <Link
                        href={`/dashboard/create/${d.service}?draft=${d.id}`}
                        className="rounded-full px-4 py-1.5 text-[12px] font-medium text-white"
                        style={{ backgroundImage: "var(--mairo-ramp)" }}
                      >
                        Continue
                      </Link>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <PlatformCard
          name="Meta Ads"
          tagline="Facebook and Instagram"
          icon={<MetaMark className={ICON} />}
          recommended={!metaOn || !tiktokOn}
          capabilities={[
            "Campaigns built and managed by MAIRO",
            "Ad creative written for each placement",
            "Audience targeting from what you sell",
            "Budget moved toward what is working",
          ]}
          status={status(metaOn, "Meta")}
          planNote={campaignsLine}
          href="/dashboard/create/meta"
        />

        <PlatformCard
          name="TikTok Ads"
          tagline="TikTok"
          icon={<TikTokMark className={ICON} />}
          capabilities={[
            "Campaigns built and managed by MAIRO",
            "Creative written the way TikTok rewards",
            "Audience targeting from what you sell",
            "Budget moved toward what is working",
          ]}
          status={
            tiktokAllowed
              ? status(tiktokOn, "TikTok")
              : { kind: "available", detail: `Not on ${plan.name}` }
          }
          planNote={tiktokAllowed ? campaignsLine : "Available on a higher plan"}
          href={tiktokAllowed ? "/dashboard/create/tiktok" : "/dashboard/plan"}
        />

        <PlatformCard
          name="Meta + TikTok"
          tagline="One campaign, both networks"
          icon={
            <span className="flex items-center gap-1">
              <MetaMark className="h-full w-1/2" />
              <TikTokMark className="h-full w-1/2" />
            </span>
          }
          recommended={metaOn && tiktokOn}
          capabilities={[
            "One campaign you control from MAIRO",
            "Creative made for each network separately",
            "Results from both in one place",
            "Budget split by what each is returning",
          ]}
          status={
            !crossPlatform
              ? { kind: "available", detail: `Not on ${plan.name}` }
              : metaOn && tiktokOn
                ? { kind: "connected", detail: "Both connected" }
                : { kind: "available", detail: "Needs both connected" }
          }
          planNote={crossPlatform ? campaignsLine : "Available on a higher plan"}
          href={crossPlatform ? "/dashboard/create/multi" : "/dashboard/plan"}
        />

        {/* Where this is going. Dimmed, unclickable, and carrying no date. */}
        <PlatformCard
          name="Google Ads"
          tagline="Search and YouTube"
          icon={<GoogleMark className={ICON} />}
          capabilities={[
            "Search campaigns from what you sell",
            "YouTube placements",
            "Keyword and audience work handled by MAIRO",
          ]}
          status={{ kind: "soon", detail: "Not available yet" }}
          href={null}
        />

        <PlatformCard
          name="Retargeting"
          tagline="People who already visited"
          icon={
            <svg viewBox="0 0 20 20" fill="none" className={ICON} aria-hidden>
              <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.3" />
              <circle cx="10" cy="10" r="3.2" stroke="currentColor" strokeWidth="1.3" />
              <circle cx="10" cy="10" r="0.9" fill="currentColor" />
            </svg>
          }
          capabilities={[
            "Ads for people who visited but did not buy",
            "Built from your own tracking",
            "Across every network you run on",
          ]}
          status={{ kind: "soon", detail: "Not available yet" }}
          href={null}
        />

        <PlatformCard
          name="Search visibility"
          tagline="Being found without paying per click"
          icon={
            <svg viewBox="0 0 20 20" fill="none" className={ICON} aria-hidden>
              <circle cx="8.6" cy="8.6" r="5.4" stroke="currentColor" strokeWidth="1.3" />
              <path d="M12.6 12.6L17 17" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          }
          capabilities={[
            "What your site should say to rank",
            "Written for what people actually search",
            "Alongside the ads, not instead of them",
          ]}
          status={{ kind: "soon", detail: "Not available yet" }}
          href={null}
        />
      </div>
    </div>
  );
}
