import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { PageHeader } from "@/components/ui";
import { refreshMetrics, socialLearnings } from "@/lib/social/manager";
import { socialGate } from "../gate";
import { SocialTabs } from "../social-tabs";

// Social performance (Scale only): likes and comments on what MAIRO posted,
// by kind of content, and what MAIRO is changing because of it. Reach and
// impressions need Meta's insights permissions, which MAIRO doesn't request,
// so they're not shown or estimated.

export const maxDuration = 60;

export default async function SocialPerformancePage() {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  const gate = await socialGate(organizationId);
  if (gate) return gate;

  await refreshMetrics(organizationId, { limit: 10, budgetMs: 10_000 }).catch(() => 0);

  const [learnings, top, counts] = await Promise.all([
    socialLearnings(organizationId),
    db.instagramPost.findMany({
      where: { organizationId, status: "PUBLISHED", likeCount: { not: null } },
      orderBy: [{ likeCount: "desc" }, { commentCount: "desc" }],
      take: 5,
      select: { id: true, caption: true, contentType: true, network: true, likeCount: true, commentCount: true, permalink: true, postedAt: true },
    }),
    db.instagramPost.groupBy({ by: ["status"], where: { organizationId }, _count: { _all: true } }),
  ]);
  const count = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;
  const max = Math.max(1, ...learnings.byType.map((t) => t.avgEngagement));

  return (
    <div>
      <PageHeader title="Social performance" description="How your posts are doing, and what MAIRO is learning from them." />
      <SocialTabs active="/dashboard/social/performance" />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Published", count("PUBLISHED")],
          ["Scheduled", count("SCHEDULED")],
          ["Awaiting approval", count("SUGGESTED")],
          ["Skipped", count("SKIPPED")],
        ].map(([label, n]) => (
          <div key={label} className="rounded-xl border border-white/[0.07] bg-field/80 px-4 py-3">
            <p className="text-[11.5px] uppercase tracking-[0.14em] text-faint">{label}</p>
            <p className="mt-1 text-[24px] font-semibold tabular-nums text-white">{n}</p>
          </div>
        ))}
      </div>

      <section className="mb-6 rounded-2xl border border-white/[0.07] bg-field/80 p-5">
        <h2 className="text-[16px] font-semibold text-white">What MAIRO learned</h2>
        <ul className="mt-2 space-y-1.5 text-[14px] text-white/85">
          {learnings.notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
        <p className="mt-3 text-[12px] text-faint">MAIRO uses this when it plans your next posts: more of what works, less of what you skip.</p>
      </section>

      <section className="mb-6 rounded-2xl border border-white/[0.07] bg-field/80 p-5">
        <h2 className="text-[16px] font-semibold text-white">Engagement by kind of post</h2>
        <p className="text-[12.5px] text-muted">Average likes and comments per post. Read from Instagram and Facebook; reach isn&rsquo;t available without Meta&rsquo;s insights permission, so it isn&rsquo;t shown.</p>
        {learnings.byType.length === 0 ? (
          <p className="mt-4 text-[13.5px] text-muted">No results yet. Numbers appear here a few hours after MAIRO publishes your first posts.</p>
        ) : (
          <ul className="mt-4 space-y-2.5">
            {learnings.byType.map((t) => (
              <li key={t.type} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-[13px]">
                <span className="truncate text-white/85">{t.type}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <span className="block h-full rounded-full bg-[#7c5cff]" style={{ width: `${Math.max(4, (t.avgEngagement / max) * 100)}%` }} />
                </span>
                <span className="tabular-nums text-white/70">{t.avgEngagement} · {t.posts} post{t.posts === 1 ? "" : "s"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {top.length > 0 && (
        <section className="rounded-2xl border border-white/[0.07] bg-field/80 p-5">
          <h2 className="mb-3 text-[16px] font-semibold text-white">Top posts</h2>
          <ul className="space-y-2.5">
            {top.map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-4 text-[13px]">
                <div className="min-w-0">
                  <p className="text-[11.5px] uppercase tracking-[0.12em] text-faint">{p.network === "FACEBOOK" ? "Facebook" : "Instagram"} · {p.contentType ?? "Post"}</p>
                  <p className="line-clamp-2 text-white/85">{p.caption}</p>
                  {p.permalink && <a href={p.permalink} target="_blank" rel="noopener noreferrer" className="text-[12px] text-violet-bright underline underline-offset-4">See the post</a>}
                </div>
                <span className="shrink-0 tabular-nums text-white/80">{p.likeCount} likes · {p.commentCount ?? 0} comments</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
