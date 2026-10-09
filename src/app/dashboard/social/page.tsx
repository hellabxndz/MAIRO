import { after } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { PageHeader } from "@/components/ui";
import { mediaLibrary } from "@/lib/instagram/library";
import { publishDuePosts } from "@/lib/instagram/scheduler";
import { AUTOPILOT_MIN_APPROVED, PROMOTION_KINDS, goalInfo } from "@/lib/social/goals";
import { loadStrategy, socialLearnings } from "@/lib/social/manager";
import { socialGate } from "./gate";
import { SocialTabs } from "./social-tabs";
import { GoalSetup } from "./goal-setup";
import { ApprovalModePicker, ChangeGoal, PlanButtons, PostingSettings, ResumeBanner } from "./manager-controls";
import { PostCard } from "./post-card";
import { POST_SELECT, toCalendarPost } from "./manager-data";
import { findInstagramAccount } from "@/lib/instagram/publish";
import { findFacebookPage } from "@/lib/facebook/page-posting";
import { executionAllowed } from "@/lib/billing/execution";
import { POSTING_PENDING, metaPostingApproved } from "@/lib/social/publishing-status";

// MAIRO Social Manager (Scale only). The business says what it wants to
// achieve; MAIRO works out the strategy, plans the posts, and shows each one
// with why it was made. Nothing is posted until it's approved.

export const maxDuration = 60;

const card = "rounded-2xl border border-white/[0.07] bg-field/80 p-5";

export default async function SocialManagerPage() {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  const gate = await socialGate(organizationId);
  if (gate) return gate;

  // Anything already due goes out — after the page is sent, so opening the
  // screen never waits on Instagram. The next look shows it posted.
  after(() => publishDuePosts({ organizationId, budgetMs: 10_000, limit: 2 }).catch(() => null));

  const [view, org, brain] = await Promise.all([
    loadStrategy(organizationId),
    db.organization.findUnique({ where: { id: organizationId }, select: { name: true, timezone: true } }),
    db.businessBrain.findUnique({ where: { organizationId }, select: { id: true } }),
  ]);
  const businessName = org?.name ?? "";

  if (!view) {
    return (
      <div>
        <PageHeader title="MAIRO Social Manager" description="Tell MAIRO what you want your business to achieve. MAIRO figures out how to market toward it." />
        {!metaPostingApproved() && (
          <p role="status" className="mb-6 rounded-xl border border-amber-400/30 bg-amber-400/[0.06] px-4 py-3 text-[13px] leading-relaxed text-amber-100">
            {POSTING_PENDING}
          </p>
        )}
        <GoalSetup businessName={businessName} />
        {!brain && (
          <p className="mt-4 text-[13px] text-muted">
            Tip: MAIRO plans better when it knows your business. <Link href="/dashboard/business" className="text-violet-bright underline underline-offset-4">Check your Business Brain</Link>.
          </p>
        )}
      </div>
    );
  }

  const zone = org?.timezone || "America/New_York";
  const now = new Date();
  const [upcoming, library, learnings, approvedSoFar, promotions, paused, meta] = await Promise.all([
    db.instagramPost.findMany({
      where: { organizationId, scheduledFor: { gt: now, lte: new Date(now.getTime() + 8 * 86_400_000) }, status: { notIn: ["SKIPPED", "FAILED"] } },
      orderBy: { scheduledFor: "asc" },
      take: 14,
      select: POST_SELECT,
    }),
    mediaLibrary(organizationId),
    socialLearnings(organizationId),
    db.instagramPost.count({ where: { organizationId, approvedAt: { not: null }, autoApproved: false } }),
    db.socialPromotion.count({ where: { organizationId, status: "ACTIVE" } }),
    db.instagramPost.count({ where: { organizationId, status: "PAUSED" } }),
    db.metaAdAccount.findUnique({ where: { organizationId }, select: { pageName: true } }),
  ]);
  // Whether a post can actually go out on each network right now: connected,
  // with the posting permission granted, and paid execution allowed. The
  // approve-and-post buttons follow this, rather than offering a publish that
  // can only fail.
  const [ig, fb, allowed] = await Promise.all([
    findInstagramAccount(organizationId).catch(() => null),
    findFacebookPage(organizationId).catch(() => null),
    executionAllowed(organizationId),
  ]);
  const canPostOn = {
    INSTAGRAM: Boolean(allowed && ig?.ok && ig.data),
    FACEBOOK: Boolean(allowed && fb?.ok && fb.data.canPublish),
  };
  const posts = upcoming.map((p) => toCalendarPost(p, zone));
  const awaiting = posts.filter((p) => p.status === "SUGGESTED").length;
  const g = goalInfo(view.strategy.goal);
  const chosen = goalInfo(view.goal);

  return (
    <div>
      <PageHeader title="MAIRO Social Manager" description="Your AI marketing strategist for Instagram and Facebook. Everything MAIRO posts serves your goal." />
      <SocialTabs active="/dashboard/social" />
      <p className="-mt-3 mb-5 text-[13px] text-muted">
        Your accounts: <Link href="/dashboard/social/instagram" className="text-violet-bright hover:underline">Instagram</Link> · <Link href="/dashboard/social/facebook" className="text-violet-bright hover:underline">Facebook Page</Link>
      </p>

      {(view.pausedAt || paused > 0) && <ResumeBanner />}

      <section className={`${card} mb-6`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-violet-bright">Your goal</p>
            <h2 className="mt-1 text-[22px] font-semibold text-white">{g.label}</h2>
            {view.goal === "RECOMMEND" && <p className="text-[12.5px] text-muted">You asked MAIRO to recommend; this fits what your business sells.</p>}
            {view.goalDetail && <p className="mt-1 max-w-[640px] text-[13.5px] italic text-white/75">&ldquo;{view.goalDetail}&rdquo;</p>}
          </div>
          <ChangeGoal current={{ goal: view.goal, goalDetail: view.goalDetail, platforms: view.platforms, postsPerWeek: view.postsPerWeek }} businessName={businessName} />
        </div>
        <p className="mt-4 max-w-[760px] text-[14px] leading-relaxed text-white/85">{view.strategy.summary}</p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {view.strategy.pillars.map((p) => (
            <div key={p.name} className="rounded-xl bg-white/[0.03] p-3">
              <p className="flex items-baseline justify-between gap-2 text-[13.5px] font-medium text-white">{p.name}<span className="text-[12px] tabular-nums text-faint">{Math.round(p.share)}%</span></p>
              <p className="mt-1 text-[12.5px] text-muted">{p.purpose}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {view.strategy.contentTypes.map((c) => (
            <span key={c.type} title={c.purpose} className={`rounded-full px-2.5 py-1 text-[12px] ${c.promotional ? "bg-amber-400/10 text-amber-200" : "bg-white/[0.05] text-white/75"}`}>{c.type}</span>
          ))}
        </div>
        <p className="mt-3 text-[12px] text-faint">
          Built for: {view.strategy.audience}{!view.aiUsed && " · Planned from MAIRO's playbook (AI wasn't available when this was built)."}
          {chosen.key !== g.key && ` · You chose "${chosen.label}".`}
        </p>
      </section>

      <section className={`${card} mb-6`}>
        <h2 className="text-[16px] font-semibold text-white">How posts are approved</h2>
        <p className="mb-3 mt-0.5 text-[12.5px] text-muted">MAIRO never posts anything you haven&rsquo;t approved, unless you turn on Autopilot.</p>
        <ApprovalModePicker mode={view.approvalMode} approvedSoFar={approvedSoFar} minForAutopilot={AUTOPILOT_MIN_APPROVED} />
        <div className="mt-4 border-t border-white/[0.06] pt-4">
          <PostingSettings platforms={view.platforms} postsPerWeek={view.postsPerWeek} />
        </div>
      </section>

      <section className={`${card} mb-6`}>
        <h2 className="text-[16px] font-semibold text-white">Anything happening at your business?</h2>
        <p className="mt-0.5 text-[12.5px] text-muted">Tell MAIRO and it plans the posts around it, mixed with useful content so your feed doesn&rsquo;t turn into ads.{promotions ? ` ${promotions} running now.` : ""}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {PROMOTION_KINDS.map((k) => (
            <Link key={k.key} href={`/dashboard/social/promotions?kind=${k.key}`} className="rounded-full border border-white/12 px-3.5 py-1.5 text-[13px] text-white/85 hover:border-violet-400">
              {k.label}
            </Link>
          ))}
          <span className="rounded-full px-3.5 py-1.5 text-[13px] text-faint">Nothing right now</span>
        </div>
      </section>

      <section className="mb-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-semibold text-white">The next 7 days</h2>
            <p className="text-[12.5px] text-muted">{awaiting ? `${awaiting} post${awaiting === 1 ? "" : "s"} waiting for your approval.` : "Open the Content Calendar for the whole month."}</p>
          </div>
          <PlanButtons awaiting={awaiting} weekly={view.approvalMode === "WEEKLY"} />
        </div>
        {posts.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/12 px-4 py-8 text-center text-[13.5px] text-muted">Nothing planned for this week yet. Press &ldquo;Plan next week&rdquo; and MAIRO plans it around your goal.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {posts.map((p) => (
              <PostCard key={p.id} post={p} library={library} accountName={p.network === "FACEBOOK" ? meta?.pageName || businessName : businessName || "your_business"} canPost={canPostOn[p.network === "FACEBOOK" ? "FACEBOOK" : "INSTAGRAM"]} compact />
            ))}
          </div>
        )}
      </section>

      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[16px] font-semibold text-white">What MAIRO is learning</h2>
          <Link href="/dashboard/social/performance" className="text-[13px] text-violet-bright underline underline-offset-4">See performance</Link>
        </div>
        <ul className="mt-2 space-y-1.5 text-[13.5px] text-white/80">
          {learnings.notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
      </section>
    </div>
  );
}
