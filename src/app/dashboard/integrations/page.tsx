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
import { billingUrlFor } from "@/lib/ad-platforms/billing";
import { creatorConnectionSummary } from "@/lib/tiktok/creator-connection";
import { latestSetupFor, SETUP_STATUS_COPY } from "@/lib/tiktok/managed-setup";
import { tiktokPostingAudited, tiktokPostingConfigured } from "@/lib/ad-platforms/tiktok/content";
import { TikTokSetupForm } from "./tiktok-setup-form";
import { TikTokPostForm } from "./tiktok-post-form";
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

  const [connections, entitlements, organization, posting, setup] = await Promise.all([
    connectionSummaries(organizationId),
    entitlementsFor(organizationId),
    db.organization.findUnique({
      where: { id: organizationId },
      select: { subscriptionTier: true },
    }),
    creatorConnectionSummary(organizationId),
    latestSetupFor(organizationId, "TIKTOK"),
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
            {params.connected === "tiktok_posting"
              ? "TikTok posting connected. MAIRO can post videos to your profile."
              : params.connected === "tiktok_drafts"
                ? "TikTok connected — but only for drafts. MAIRO can put videos in your TikTok drafts for you to post. Reconnect and approve the posting permission to have MAIRO post them."
                : params.connected === "tiktok"
                  ? "TikTok connected. MAIRO can run campaigns on it now."
                  : "Account connected."}
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
      {!tiktokConnected && (
        <StartFromZero
          canHaveItBuilt={entitlements.tiktok_account_setup}
          upgradeName={upgradeTarget.name}
          setup={
            setup
              ? { status: setup.status, handle: setup.createdHandle, note: setup.internalNotes }
              : null
          }
        />
      )}

      <PostingCard
        allowed={entitlements.social_posting}
        upgradeName={upgradeTarget.name}
        posting={posting}
      />

      {tiktokConnected && <GrowthModeCard />}
    </div>
  );
}

type SetupSnapshot = {
  status: keyof typeof SETUP_STATUS_COPY;
  handle: string | null;
  note: string | null;
};

/**
 * The offer for a business that has no TikTok at all — which is most of them.
 *
 * Two honest paths, in the order most people want them. MAIRO builds it for
 * you, which is real work by a real person rather than an API call, because no
 * platform has an endpoint that registers an account: that is where TikTok
 * runs its identity and age checks, and it is deliberately not automatable.
 * Or you build it yourself in ten minutes, which is genuinely fine and stays
 * on the page for the people who would rather.
 */
function StartFromZero({
  canHaveItBuilt,
  upgradeName,
  setup,
}: {
  canHaveItBuilt: boolean;
  upgradeName: string;
  setup: SetupSnapshot | null;
}) {
  const live = setup && setup.status !== "DECLINED" ? setup : null;

  return (
    <Card className="mt-8">
      <div className="flex items-start gap-4">
        <span
          className="mt-0.5 flex h-10 w-10 flex-none items-center justify-center rounded-xl border border-white/10 bg-white/[0.03]"
          style={{ color: platformMeta("TIKTOK").accent }}
        >
          <PlatformIcon platform="TIKTOK" className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="text-base text-white">Don&rsquo;t have a TikTok yet?</h3>
            {live && (
              <Badge tone={SETUP_STATUS_COPY[live.status].tone}>
                {SETUP_STATUS_COPY[live.status].label}
              </Badge>
            )}
          </div>

          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-neutral-400">
            You don&rsquo;t need a following to advertise on TikTok. Paid campaigns are shown
            to people based on what they watch, not on who follows you — a business with nine
            followers and a good first three seconds will outperform one with ninety thousand
            and a dull ad. What you need is a TikTok Business account, and MAIRO can build
            that for you.
          </p>

          {live ? (
            <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-sm leading-relaxed text-neutral-300">
                {SETUP_STATUS_COPY[live.status].detail}
              </p>
              {live.handle && (
                <p className="mt-2.5 text-sm text-white">
                  Your handle: <span className="font-medium">@{live.handle}</span>
                </p>
              )}
              {live.note && (
                <p className="mt-2.5 text-sm leading-relaxed text-amber-200/90">{live.note}</p>
              )}
            </div>
          ) : canHaveItBuilt ? (
            <>
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-neutral-400">
                Tell us what the business is called and MAIRO registers the account, turns it
                into a Business account, sets up the advertising side, and hands you the login.
                A person at MAIRO does this with you — TikTok has no way to create an account
                automatically, because that is where it runs its own identity checks — so it
                takes a day or two rather than a second, and we email you when it&rsquo;s yours.
              </p>
              <TikTokSetupForm />
            </>
          ) : (
            <div className="mt-5 rounded-xl border border-sky-400/20 bg-sky-400/[0.05] p-4">
              <p className="text-sm leading-relaxed text-sky-200">
                Having MAIRO build your TikTok for you is part of {upgradeName}. Starter covers
                Meta — Facebook and Instagram — and everything MAIRO does to run it.
              </p>
              <Link
                href="/dashboard/settings#billing"
                className="mt-3 inline-block rounded-full border border-sky-400/30 bg-sky-400/10 px-4 py-2 text-xs text-sky-200 transition hover:bg-sky-400/20"
              >
                See {upgradeName}
              </Link>
            </div>
          )}

          <p className="mt-5 text-xs leading-relaxed text-neutral-500">
            Would rather do it yourself? It&rsquo;s free and takes about ten minutes.{" "}
            <a
              href="https://www.tiktok.com/business/en/solutions/business-account"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4 hover:text-neutral-300"
            >
              Create a TikTok Business account
            </a>
            , or{" "}
            <Link
              href="/dashboard/agents/strategist"
              className="underline underline-offset-4 hover:text-neutral-300"
            >
              ask MAIRO to walk you through it
            </Link>
            .
          </p>
        </div>
      </div>
    </Card>
  );
}

/**
 * MAIRO posting to the customer's own TikTok, as opposed to buying ads on it.
 *
 * This is a second authorization and the card says so, because TikTok genuinely
 * treats them as unrelated: advertising is the Business API against an
 * advertiser id, posting is Login Kit against a creator, and connecting one
 * grants nothing on the other.
 *
 * The card is also careful about which of the two things it is promising.
 * Posting straight to a profile needs the video.publish permission AND an app
 * TikTok has audited for it. Without both, MAIRO puts the video in the
 * customer's drafts and they tap post — useful, but not the same, and said in
 * those words rather than described as posting.
 */
function PostingCard({
  allowed,
  upgradeName,
  posting,
}: {
  allowed: boolean;
  upgradeName: string;
  posting: {
    connected: boolean;
    username: string | null;
    nickname: string | null;
    canPublish: boolean;
    canUpload: boolean;
    problem: string | null;
  };
}) {
  const configured = tiktokPostingConfigured();
  const audited = tiktokPostingAudited();
  const postsDirectly = posting.connected && posting.canPublish && audited;

  return (
    <Card className="mt-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <span
            className="mt-0.5 flex h-10 w-10 flex-none items-center justify-center rounded-xl border border-white/10 bg-white/[0.03]"
            style={{ color: platformMeta("TIKTOK").accent }}
          >
            <PlatformIcon platform="TIKTOK" className="h-5 w-5" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h3 className="text-base text-white">Let MAIRO post to your TikTok</h3>
              {posting.connected && (
                <Badge tone={postsDirectly ? "green" : "yellow"}>
                  {postsDirectly ? "Posting" : "Drafts only"}
                </Badge>
              )}
            </div>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-neutral-400">
              Separate from advertising, and a separate TikTok permission — TikTok treats
              buying ads and posting videos as two different things, so connecting one
              doesn&rsquo;t grant the other.
            </p>
            {posting.connected && (posting.username || posting.nickname) && (
              <p className="mt-2 text-xs text-neutral-400">
                {posting.username ? `@${posting.username}` : posting.nickname}
              </p>
            )}
            {posting.problem && (
              <p className="mt-2 max-w-md text-xs text-amber-200/80">{posting.problem}</p>
            )}
          </div>
        </div>

        {allowed && configured && (
          <a
            href="/api/tiktok/creator/connect"
            className={
              posting.connected
                ? "rounded-full border border-white/10 px-4 py-2 text-xs text-neutral-300 transition hover:border-white/25 hover:text-white"
                : "rounded-full bg-white px-4 py-2 text-xs font-medium text-black transition hover:bg-neutral-200"
            }
          >
            {posting.connected ? "Reconnect" : "Connect TikTok posting"}
          </a>
        )}
      </div>

      {!allowed ? (
        <div className="mt-5 rounded-xl border border-sky-400/20 bg-sky-400/[0.05] p-4">
          <p className="text-sm leading-relaxed text-sky-200">
            MAIRO posting for you is part of {upgradeName}. Starter covers Meta advertising —
            Facebook and Instagram — and everything MAIRO does to run it.
          </p>
          <Link
            href="/dashboard/settings#billing"
            className="mt-3 inline-block rounded-full border border-sky-400/30 bg-sky-400/10 px-4 py-2 text-xs text-sky-200 transition hover:bg-sky-400/20"
          >
            See {upgradeName}
          </Link>
        </div>
      ) : !configured ? (
        <p className="mt-5 max-w-2xl text-xs leading-relaxed text-neutral-500">
          Not configured on this deployment yet. TikTok posting uses its own Login Kit
          credentials, separate from the advertising ones.
        </p>
      ) : posting.connected ? (
        <>
          {!postsDirectly && (
            <p className="mt-5 max-w-2xl text-sm leading-relaxed text-amber-200/90">
              {!posting.canPublish
                ? "MAIRO can put videos in your TikTok drafts, ready for you to post. Reconnect and approve the posting permission to have MAIRO publish them for you."
                : "MAIRO will put videos in your TikTok drafts for now. TikTok is still reviewing MAIRO for posting straight to profiles — until that clears, the last tap is yours."}
            </p>
          )}
          <TikTokPostForm postsDirectly={postsDirectly} />
        </>
      ) : null}
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
