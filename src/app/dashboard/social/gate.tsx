import Link from "next/link";
import { db } from "@/lib/db";
import { hasActivePlan } from "@/lib/readiness";
import { planFor } from "@/lib/plans";
import { SOCIAL_PAUSED_MESSAGE, socialAccess } from "@/lib/social/access";
import { pauseSocialIfLocked } from "@/lib/social/pause";

// Every Social Manager page starts here. Active Scale gets the page; anyone
// else gets the upgrade screen — or, if they had Social Manager before, a
// "Paused" screen that says their content is saved. The server actions and
// the publisher check again on their own; this is the screen, not the lock.

const SCALE = planFor("SCALE");

const BENEFITS = [
  "AI determines what your business should post",
  "Content built around sales, leads, bookings, launches and promotions",
  "AI-generated captions and creatives",
  "Smart content calendar",
  "Instagram and Facebook scheduling",
  "Automatic publishing of what you approve",
  "Promotion campaigns",
  "Performance learning",
];

function upgradeHref(org: { paymentRequired: boolean; subscriptionTier: string; subscriptionStatus: string | null }): string {
  // A free-plan account that hasn't subscribed picks a plan on its own page.
  return org.paymentRequired && !hasActivePlan(org) ? "/plan/activate" : "/dashboard/billing";
}

export async function socialGate(organizationId: string): Promise<React.ReactNode | null> {
  const access = await socialAccess(organizationId);
  if (access.ok) return null;
  await pauseSocialIfLocked(organizationId).catch(() => null);

  const [org, strategy, published, saved] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { paymentRequired: true, subscriptionTier: true, subscriptionStatus: true } }),
    db.socialStrategy.findUnique({ where: { organizationId }, select: { id: true } }),
    db.instagramPost.findMany({
      where: { organizationId, status: "PUBLISHED" },
      orderBy: { postedAt: "desc" },
      take: 6,
      select: { id: true, caption: true, network: true, postedAt: true, permalink: true },
    }),
    db.instagramPost.count({ where: { organizationId } }),
  ]);
  const href = org ? upgradeHref(org) : "/dashboard/billing";
  const hadIt = Boolean(strategy) || saved > 0;

  if (hadIt) {
    return (
      <div className="mx-auto max-w-[860px]">
        <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.05] p-6 sm:p-8">
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-amber-200/90">Social Manager</p>
          <h1 className="mt-2 text-[26px] font-semibold text-white">Social Manager Paused</h1>
          <p className="mt-2 max-w-[620px] text-[15px] leading-relaxed text-white/80">{SOCIAL_PAUSED_MESSAGE}</p>
          <p className="mt-3 text-[13px] text-muted">
            Saved: your goal and strategy{saved ? `, ${saved} post${saved === 1 ? "" : "s"}` : ""} and your posting history. Nothing scheduled will be published while Social Manager is paused.
          </p>
          <Link href={href} className="mt-5 inline-flex min-h-[44px] items-center rounded-lg bg-[#7c5cff] px-5 text-[14px] font-medium text-white hover:brightness-110">
            {access.reason === "inactive" ? `Reactivate ${SCALE.name}` : `Upgrade back to ${SCALE.name}`}
          </Link>
        </div>
        {published.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-[15px] font-semibold text-white">Your posting history</h2>
            <ul className="space-y-2">
              {published.map((p) => (
                <li key={p.id} className="rounded-xl border border-white/[0.07] bg-field/80 px-4 py-3 text-[13px] text-white/80">
                  <span className="text-[11.5px] uppercase tracking-[0.12em] text-faint">
                    {p.network === "FACEBOOK" ? "Facebook" : "Instagram"} · {p.postedAt?.toLocaleDateString() ?? ""}
                  </span>
                  <p className="mt-1 line-clamp-2">{p.caption}</p>
                  {p.permalink && (
                    <a href={p.permalink} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-[12px] text-violet-bright underline underline-offset-4">
                      See the post
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[920px]">
      <div className="overflow-hidden rounded-2xl border border-violet/30 bg-gradient-to-b from-violet/[0.12] to-transparent p-6 sm:p-9">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-violet/40 px-3 py-1 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-violet-bright">
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" />
            <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
          </svg>
          {SCALE.name} only
        </span>
        <h1 className="mt-4 text-[30px] font-semibold leading-tight text-white">Social Manager</h1>
        <p className="mt-2 text-[19px] text-white/90">Let MAIRO manage your social media.</p>
        <p className="mt-3 max-w-[640px] text-[15px] leading-relaxed text-white/70">
          MAIRO creates content based on your business goals, builds your posting strategy, lets you approve the content, and publishes approved posts for you.
        </p>
        <p className="mt-4 text-[14px] font-medium text-white">Available exclusively with MAIRO {SCALE.name}.</p>
        <ul className="mt-6 grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
          {BENEFITS.map((b) => (
            <li key={b} className="flex gap-2.5 text-[14px] text-white/85">
              <span aria-hidden className="text-emerald-300">✓</span>
              {b}
            </li>
          ))}
        </ul>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link href={href} className="inline-flex min-h-[46px] items-center rounded-lg bg-[#7c5cff] px-6 text-[14.5px] font-medium text-white hover:brightness-110">
            Upgrade to {SCALE.name}
          </Link>
          <span className="text-[13px] text-muted">{SCALE.tagline}</span>
        </div>
      </div>
      <p className="mt-4 text-[12.5px] text-faint">Your ads keep working exactly as they do on your current plan. Social Manager adds organic posting on your own Instagram and Facebook Page.</p>
    </div>
  );
}
