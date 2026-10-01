import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { PageHeader } from "@/components/ui";
import { mediaLibrary } from "@/lib/instagram/library";
import { findInstagramAccount } from "@/lib/instagram/publish";
import { socialGate } from "../gate";
import { SocialTabs } from "../social-tabs";
import { POST_SELECT, toCalendarPost } from "../manager-data";
import { PostCard } from "../post-card";

// Social Manager's lists: what's coming up, what needs the owner's approval,
// and what has been published — across Instagram and Facebook, in one place.

export const maxDuration = 60;

const VIEWS = {
  upcoming: { title: "Upcoming posts", description: "Everything scheduled or planned, soonest first.", empty: "Nothing planned yet. Plan the week from the Content Calendar." },
  approval: { title: "Needs your approval", description: "Posts MAIRO made that are waiting for your yes. Approve, edit or skip each one.", empty: "Nothing waiting for you." },
  published: { title: "Published", description: "What went out, newest first.", empty: "Nothing published yet." },
} as const;
type View = keyof typeof VIEWS;

export default async function SocialPostsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  const gate = await socialGate(organizationId);
  if (gate) return gate;

  const requested = (await searchParams).view;
  const view: View = requested === "approval" || requested === "published" ? requested : "upcoming";
  const now = new Date();
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { timezone: true, name: true } });
  const zone = org?.timezone || "America/New_York";

  const [rows, library, ig, meta] = await Promise.all([
    db.instagramPost.findMany({
      where:
        view === "published"
          ? { organizationId, status: "PUBLISHED" }
          : view === "approval"
            ? { organizationId, status: "SUGGESTED", scheduledFor: { gte: now } }
            : { organizationId, status: { in: ["SCHEDULED", "SUGGESTED", "DRAFT"] }, scheduledFor: { gte: now } },
      orderBy: view === "published" ? [{ postedAt: "desc" }] : [{ scheduledFor: "asc" }],
      take: 40,
      select: POST_SELECT,
    }),
    mediaLibrary(organizationId),
    findInstagramAccount(organizationId),
    db.metaAdAccount.findUnique({ where: { organizationId }, select: { pageName: true } }),
  ]);
  const posts = rows.map((p) => toCalendarPost(p, zone));
  const v = VIEWS[view];

  return (
    <div>
      <PageHeader title={v.title} description={v.description} />
      <SocialTabs active={`/dashboard/social/posts?view=${view}`} />
      {posts.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-white/12 px-4 py-10 text-center text-[14px] text-muted">
          {v.empty} {view !== "published" && <Link href="/dashboard/social/calendar" className="text-violet-bright underline underline-offset-4">Open the calendar</Link>}
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {posts.map((p) => (
            <PostCard key={p.id} post={p} library={library} accountName={p.network === "FACEBOOK" ? meta?.pageName || org?.name || "Your Page" : (ig.ok && ig.data?.username) || org?.name || "your_business"} canPost={view !== "published"} />
          ))}
        </div>
      )}
    </div>
  );
}
