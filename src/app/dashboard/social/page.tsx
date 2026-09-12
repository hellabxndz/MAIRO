import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader, Badge, EmptyState } from "@/components/ui";
import { activeOrganizationId } from "@/lib/active-org";
import { entitlementsFor } from "@/lib/entitlements";
import { PlanLock } from "@/components/plan-lock";
import { PostForm, type PostableImage } from "./post-form";
import { findInstagramAccount, POSTS_PER_DAY, postsInLastDay } from "@/lib/instagram/publish";
import { parseAdCopy } from "@/lib/meta/creative-copy";
import { planFor } from "@/lib/plans";

// MAIRO posting on the customer's own profiles.
//
// This is the top plan's distinguishing feature, and it is a different promise
// from the rest of the product: everything else spends the customer's money on
// their behalf, and this writes on their public profile under their own name.
// So the page is built to make that obvious rather than smooth — you see the
// picture, you see the exact words, and nothing happens until you press post.

// Reading the Instagram account is a Graph call, and it happens on load.
export const maxDuration = 30;

export default async function SocialPage() {
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
          title="Your social posts"
          description="MAIRO writes and publishes to your own Instagram and TikTok."
        />
        <PlanLock
          title={`MAIRO posting for you comes with ${topPlan.name}`}
          body={`Ads reach people who don't follow you yet. Your own feed is what they check before they buy — and keeping it alive is the job nobody has time for. On ${topPlan.name}, MAIRO posts your approved creatives to your Instagram and TikTok for you.`}
        />
      </div>
    );
  }

  // Everything this page can publish: approved creatives with a final picture.
  const [requests, posts, igAccount, todayCount] = await Promise.all([
    db.creativeRequest.findMany({
      where: {
        organizationId,
        status: { in: ["APPROVED", "DELIVERED"] },
        images: { some: { isFinal: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 12,
      include: { images: { where: { isFinal: true }, orderBy: { version: "desc" }, take: 1 } },
    }),
    db.instagramPost.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    findInstagramAccount(organizationId),
    postsInLastDay(organizationId),
  ]);

  const images: PostableImage[] = requests.flatMap((request) => {
    const image = request.images[0];
    if (!image) return [];
    // The caption starts as the ad copy MAIRO already wrote for this creative,
    // because writing one from scratch is the step people stall on. It is a
    // starting point in an editable box, not something published unread.
    const copy = parseAdCopy(request.aiConcept);
    const suggested = [copy.primaryText, copy.headline].filter(Boolean).join("\n\n");
    return [
      {
        imageId: image.id,
        imageData: image.imageData,
        brief: request.brief,
        suggested: suggested || request.brief,
      },
    ];
  });

  const connected = igAccount.ok && igAccount.data;
  const atDailyLimit = todayCount >= POSTS_PER_DAY;

  return (
    <div>
      <PageHeader
        title="Your social posts"
        description="MAIRO writes and publishes to your own Instagram. Nothing goes out until you press post."
        action={
          connected ? (
            <Badge tone="green">
              {igAccount.data?.username ? `@${igAccount.data.username}` : "Instagram connected"}
            </Badge>
          ) : (
            <Badge tone="yellow">Instagram not ready</Badge>
          )
        }
      />

      {/* The two ways this isn't ready, told apart. "Reconnect Meta" and
          "convert your Instagram to a Business account" are completely
          different jobs and only one of them is on this website. */}
      {!igAccount.ok && (
        <Card className="mb-8 border-amber-400/20 bg-amber-400/[0.05]">
          <p className="font-medium text-amber-200">Instagram isn&rsquo;t ready yet</p>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-neutral-300">
            {igAccount.error.message}
          </p>
          <Link
            href="/dashboard/meta"
            className="mt-4 inline-flex rounded-full bg-white px-5 py-2.5 text-xs font-medium text-black transition hover:bg-neutral-200"
          >
            Open your Meta connection
          </Link>
        </Card>
      )}

      {igAccount.ok && !igAccount.data && (
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

      {images.length === 0 ? (
        <EmptyState
          title="Nothing approved to post yet"
          description="MAIRO posts the creatives you've already approved. Make one on the Creatives page and it shows up here."
        />
      ) : (
        connected &&
        !atDailyLimit && (
          <Card className="mb-8">
            <PostForm images={images} />
          </Card>
        )
      )}

      {posts.length > 0 && (
        <div className="mt-8">
          <p className="mb-4 text-sm uppercase tracking-[0.16em] text-neutral-400">
            What MAIRO has posted
          </p>
          <div className="space-y-3">
            {posts.map((post) => (
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
                    Instagram has this but hasn&rsquo;t put it on your profile yet.
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
                        See it on Instagram
                      </a>
                    </>
                  )}
                </p>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* TikTok posting already exists and lives with the rest of the TikTok
          setup, so this points at it rather than building a second half of the
          same screen in a different place. */}
      <Card className="mt-8 border-white/[0.06] bg-white/[0.015]">
        <p className="text-sm text-white">TikTok posts</p>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-neutral-400">
          MAIRO posts videos to your TikTok too. That one lives with your TikTok setup,
          because connecting a creator account is its own thing.
        </p>
        <Link
          href="/dashboard/integrations"
          className="mt-4 inline-flex text-xs text-neutral-400 underline decoration-white/20 underline-offset-4 transition hover:text-white"
        >
          Open TikTok posting
        </Link>
      </Card>
    </div>
  );
}
