import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader, Badge } from "@/components/ui";
import { activeOrganizationId } from "@/lib/active-org";
import { entitlementsFor } from "@/lib/entitlements";
import { PlanLock } from "@/components/plan-lock";
import { SocialStudio, type PostView } from "./social-studio";
import { findFacebookPage, PAGE_POSTING_CONNECT } from "@/lib/facebook/page-posting";
import { findInstagramAccount, POSTS_PER_DAY, postsInLastDay } from "@/lib/instagram/publish";
import { mediaLibrary } from "@/lib/instagram/library";
import { publishDuePosts } from "@/lib/instagram/scheduler";
import type { MediaType, Network } from "@/lib/instagram/social-logic";
import { describeStart, localInputValue, wallClockInZone } from "@/lib/campaigns/schedule";
import { executionAllowed } from "@/lib/billing/execution";
import { planFor } from "@/lib/plans";

// MAIRO posting on the customer's own profiles.
//
// This is the top plan's distinguishing feature, and it is a different promise
// from the rest of the product: everything else spends the customer's money on
// their behalf, and this writes on their public profile under their own name.
// So the page is built to make that obvious rather than smooth — you see the
// picture, you see the exact words, and nothing happens until you press post.

// One page per network (Instagram posts, Facebook posts), same flow on both:
// MAIRO asks first, shows each post exactly as it will look, and posts only
// what's approved.

export async function SocialPage({ network }: { network: Network }) {
  const facebook = network === "FACEBOOK";
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  const entitlements = await entitlementsFor(organizationId);

  // Named from plans.ts rather than written into the copy, so renaming the
  // plan doesn't leave the upsell advertising a plan that no longer exists.
  const topPlan = planFor("SCALE");

  if (!entitlements.social_posting) {
    return (
      <div>
        <PageHeader
          title={facebook ? "Facebook posts" : "Instagram posts"}
          description={facebook ? "MAIRO plans, writes and posts to your own Facebook Page." : "MAIRO plans, writes and posts to your own Instagram."}
        />
        <PlanLock
          title={`MAIRO posting for you comes with ${topPlan.name}`}
          body={`Ads reach people who don't follow you yet. Your own feed and Page are what they check before they buy — and keeping them alive is the job nobody has time for. On ${topPlan.name}, MAIRO plans your week, writes the captions and posts to your Instagram and Facebook Page on the schedule you approve.`}
        />
      </div>
    );
  }

  // Anything already due goes out now, rather than waiting for the daily run.
  await publishDuePosts({ organizationId, budgetMs: 15_000, limit: 3 }).catch(() => null);

  const [library, posts, igAccount, fbPage, todayCount, org, allowed] = await Promise.all([
    mediaLibrary(organizationId),
    db.instagramPost.findMany({
      where: { organizationId, network },
      orderBy: [{ scheduledFor: "asc" }, { createdAt: "desc" }],
      take: 60,
    }),
    facebook ? null : findInstagramAccount(organizationId),
    facebook ? findFacebookPage(organizationId) : null,
    facebook ? 0 : postsInLastDay(organizationId),
    db.organization.findUnique({ where: { id: organizationId }, select: { timezone: true, instagramOptInAt: true, facebookOptInAt: true } }),
    executionAllowed(organizationId),
  ]);
  const zone = org?.timezone || "America/New_York";
  const view = (p: (typeof posts)[number]): PostView => ({
    id: p.id,
    status: p.status,
    mediaType: (p.mediaType as MediaType) ?? "IMAGE",
    caption: p.caption,
    previewUrl: p.previewUrl,
    whenLabel: p.scheduledFor ? describeStart(p.scheduledFor, zone) : "As soon as it's approved",
    whenLocal: p.scheduledFor ? localInputValue(p.scheduledFor, zone) : "",
    error: p.error,
    images: p.mediaType === "REEL" ? [] : p.mediaRefs.map((_, i) => `/api/social/media/${p.id}/${i}`),
    hasTime: Boolean(p.scheduledFor),
    suggestedByMairo: p.suggestedByMairo,
  });
  const suggested = posts.filter((p) => p.status === "SUGGESTED").map(view);
  const upcoming = posts.filter((p) => p.status === "SCHEDULED" || p.status === "CREATED").map(view);
  const history = posts
    .filter((p) => p.status === "PUBLISHED" || p.status === "FAILED")
    .sort((x, y) => (y.postedAt ?? y.updatedAt).getTime() - (x.postedAt ?? x.updatedAt).getTime())
    .slice(0, 15);
  // The daily posting run is at 09:00 UTC; shown in the business's own time.
  const now = new Date();
  const runAt = wallClockInZone(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 9, 0)), zone).slice(11, 16);
  const tzLabel = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "short" }).formatToParts(now).find((x) => x.type === "timeZoneName")?.value ?? zone;

  const optedIn = Boolean(facebook ? org?.facebookOptInAt : org?.instagramOptInAt);
  const checkNote = (
    <p className="mb-6 max-w-3xl text-[13px] leading-relaxed text-muted">
      Approved posts go out at MAIRO&rsquo;s first check after their time: every morning at about {runAt} ({tzLabel}), and whenever you open this page. A post scheduled for the afternoon is published at the next of those checks.
    </p>
  );
  const historyList = <PostHistory history={history} network={network} />;

  if (fbPage) {
    const ready = fbPage.ok;
    const canPublish = fbPage.ok && fbPage.data.canPublish;
    const pageName = (fbPage.ok && fbPage.data.pageName) || "Your Page";
    return (
      <div>
        <PageHeader
          title="Facebook posts"
          description="MAIRO plans, writes and posts photos, multi-photo posts and videos to your own Facebook Page. Nothing goes out that you haven't approved."
          action={
            canPublish ? <Badge tone="green">{pageName}</Badge> : <Badge tone="yellow">{ready ? "Needs your OK" : "Page not ready"}</Badge>
          }
        />

        {!fbPage.ok && (
          <Card className="mb-8 border-amber-400/20 bg-amber-400/[0.05]">
            <p className="font-medium text-amber-200">Your Facebook Page isn&rsquo;t ready yet</p>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-neutral-300">{fbPage.error.message}</p>
            <Link
              href="/dashboard/meta"
              className="mt-4 inline-flex rounded-full bg-[image:var(--mairo-ramp)] shadow-[var(--mairo-glow-key)] px-5 py-2.5 text-xs font-medium text-white transition hover:brightness-110"
            >
              Open your Meta connection
            </Link>
          </Card>
        )}

        {/* Posting on a Page is its own Facebook permission, asked for only
            once the business has said yes — never in the everyday connect. */}
        {ready && !canPublish && optedIn && (
          <Card className="mb-8 border-violet/30 bg-violet/[0.06]">
            <p className="font-medium text-white">One step: let MAIRO post on {pageName}</p>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-neutral-300">
              Facebook asks you to allow posting on your Page once. You&rsquo;ll see Facebook&rsquo;s own screen, then come straight back here. MAIRO still posts only what you approve.
            </p>
            <a
              href={PAGE_POSTING_CONNECT}
              className="mt-4 inline-flex rounded-full bg-[image:var(--mairo-ramp)] shadow-[var(--mairo-glow-key)] px-5 py-2.5 text-xs font-medium text-white transition hover:brightness-110"
            >
              Allow posting on Facebook
            </a>
          </Card>
        )}

        {checkNote}

        <SocialStudio
          network="FACEBOOK"
          library={library}
          suggested={suggested}
          upcoming={upcoming}
          canPost={canPublish && allowed}
          canAnswer={ready}
          timeZoneLabel={tzLabel}
          username={pageName}
          optedIn={optedIn}
        />
        {historyList}
      </div>
    );
  }

  const connected = Boolean(igAccount?.ok && igAccount.data);
  const atDailyLimit = todayCount >= POSTS_PER_DAY;

  return (
    <div>
      <PageHeader
        title="Instagram posts"
        description="MAIRO plans, writes and posts photos, carousels and Reels to your own Instagram. Nothing goes out that you haven't approved."
        action={
          connected ? (
            <Badge tone="green">
              {igAccount?.ok && igAccount.data?.username ? `@${igAccount.data.username}` : "Instagram connected"}
            </Badge>
          ) : (
            <Badge tone="yellow">Instagram not ready</Badge>
          )
        }
      />

      {/* The two ways this isn't ready, told apart. "Reconnect Meta" and
          "convert your Instagram to a Business account" are completely
          different jobs and only one of them is on this website. */}
      {igAccount && !igAccount.ok && (
        <Card className="mb-8 border-amber-400/20 bg-amber-400/[0.05]">
          <p className="font-medium text-amber-200">Instagram isn&rsquo;t ready yet</p>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-neutral-300">
            {igAccount.error.message}
          </p>
          <Link
            href="/dashboard/meta"
            className="mt-4 inline-flex rounded-full bg-[image:var(--mairo-ramp)] shadow-[var(--mairo-glow-key)] px-5 py-2.5 text-xs font-medium text-white transition hover:brightness-110"
          >
            Open your Meta connection
          </Link>
        </Card>
      )}

      {igAccount?.ok && !igAccount.data && (
        <Card className="mb-8 border-amber-400/20 bg-amber-400/[0.05]">
          <p className="font-medium text-amber-200">
            Your Instagram needs to be a Business account
          </p>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-neutral-300">
            Instagram doesn&rsquo;t let any app — MAIRO or anyone else — post to a personal
            account. In the Instagram app: Settings → Account type and tools → Switch to
            professional account, then link it to your Facebook Page. It takes about two
            minutes and changes nothing your followers see.
          </p>
        </Card>
      )}

      {connected && atDailyLimit && (
        <Card className="mb-8 border-amber-400/20 bg-amber-400/[0.05]">
          <p className="text-sm text-amber-200">
            You&rsquo;ve used all {POSTS_PER_DAY} of Instagram&rsquo;s daily posts for this
            account. It resets as the day rolls over.
          </p>
        </Card>
      )}

      {checkNote}

      <SocialStudio
        network="INSTAGRAM"
        library={library}
        suggested={suggested}
        upcoming={upcoming}
        canPost={connected && !atDailyLimit && allowed}
        canAnswer={connected}
        timeZoneLabel={tzLabel}
        username={(igAccount?.ok && igAccount.data?.username) || "your_business"}
        optedIn={optedIn}
      />
      {historyList}
    </div>
  );
}

function PostHistory({ history, network }: { history: { id: string; caption: string; status: string; error: string | null; permalink: string | null; postedAt: Date | null; createdAt: Date }[]; network: Network }) {
  const name = network === "FACEBOOK" ? "Facebook" : "Instagram";
  return (
    <>
      {history.length > 0 && (
        <div className="mt-8">
          <p className="mb-4 text-sm uppercase tracking-[0.16em] text-neutral-400">
            What MAIRO has posted
          </p>
          <div className="space-y-3">
            {history.map((post) => (
              <Card key={post.id}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <p className="max-w-2xl whitespace-pre-wrap text-sm leading-relaxed text-neutral-300">
                    {post.caption.length > 220
                      ? `${post.caption.slice(0, 220)}…`
                      : post.caption}
                  </p>
                  <Badge
                    tone={
                      post.status === "PUBLISHED"
                        ? "green"
                        : post.status === "FAILED"
                          ? "red"
                          : "yellow"
                    }
                  >
                    {post.status === "CREATED" ? "processing" : post.status.toLowerCase()}
                  </Badge>
                </div>
                {/* Instagram accepted the picture but never published it. A
                    real state, not a loading spinner — it can sit here. */}
                {post.status === "CREATED" && (
                  <p className="mt-3 text-xs text-amber-200/90">
                    {name} has this but hasn&rsquo;t put it up yet.
                    {post.error ? ` ${post.error}` : ""}
                  </p>
                )}
                {post.status === "FAILED" && post.error && (
                  <p className="mt-3 max-w-2xl text-xs leading-relaxed text-red-300/90">
                    {post.error}
                  </p>
                )}
                <p className="mt-3 text-xs text-neutral-600">
                  {post.postedAt
                    ? post.postedAt.toLocaleString()
                    : post.createdAt.toLocaleString()}
                  {post.permalink && (
                    <>
                      {" · "}
                      <a
                        href={post.permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-4 hover:text-white"
                      >
                        See it on {name}
                      </a>
                    </>
                  )}
                </p>
              </Card>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
