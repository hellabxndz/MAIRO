import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { hasActivePlan } from "@/lib/readiness";
import { SOCIAL_PAUSED_MESSAGE, socialAccess } from "@/lib/social/access";
import { pauseSocialIfLocked } from "@/lib/social/pause";

// Every Social Manager page starts here. Posting to Instagram or Facebook
// profiles was discontinued (lib/social/access.ts), so nobody gets the page: a
// business that had content there sees that it's saved and that nothing will
// be published; anyone else is sent back to the dashboard. The server actions
// and the publisher check again on their own; this is the screen, not the lock.

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
          <h1 className="mt-2 text-[26px] font-semibold text-white">Social posting has ended</h1>
          <p className="mt-2 max-w-[620px] text-[15px] leading-relaxed text-white/80">{SOCIAL_PAUSED_MESSAGE}</p>
          <p className="mt-3 text-[13px] text-muted">
            Saved: your goal and strategy{saved ? `, ${saved} post${saved === 1 ? "" : "s"}` : ""} and your posting history. Nothing scheduled will be published. To have them deleted, ask us or delete your account.
          </p>
          {access.reason === "inactive" && (
            <Link href={href} className="mt-5 inline-flex min-h-[44px] items-center rounded-lg bg-[#2f6bff] px-5 text-[14px] font-medium text-white hover:brightness-110">
              Fix billing to continue
            </Link>
          )}
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

  // Never had it: social media posting isn't offered any more, so there's
  // nothing to sell here — back to the dashboard.
  redirect("/dashboard");
}
