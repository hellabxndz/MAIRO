import { Sparkles, UserRound } from "lucide-react";
import Link from "next/link";
import { BusinessSwitcher } from "@/components/dashboard/business-switcher";
import { NAV_ITEMS } from "@/components/dashboard/nav-items";
import { DesktopSidebar, MobileNav } from "@/components/dashboard/sidebar";
import { ViewToggle } from "@/components/dashboard/view-toggle";
import { ButtonLink } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { requireBusiness } from "@/lib/tenancy/context";
import { ROLE_LABELS } from "@/lib/tenancy/permissions";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireBusiness();
  const supabase = await createClient();
  const [{ data: profile }, { count: attention }, { count: approvals }] = await Promise.all([
    supabase.from("users").select("full_name, email, dashboard_view").eq("id", ctx.user.id).single(),
    supabase.from("conversations").select("id", { count: "exact", head: true }).eq("business_id", ctx.business.id).eq("status", "needs_attention"),
    supabase.from("order_action_requests").select("id", { count: "exact", head: true }).eq("business_id", ctx.business.id).eq("status", "awaiting_approval"),
  ]);

  const items = NAV_ITEMS.filter((i) => ctx.permissions.has(i.permission)).map(({ href, label, icon }) => ({ href, label, icon }));
  const badges: Record<string, number> = {};
  if (attention) badges["/dashboard/inbox"] = attention;
  if (approvals) badges["/dashboard/approvals"] = approvals;

  const displayName = profile?.full_name || profile?.email || ctx.user.email;

  // Everyone who can see billing can explore plans; only the top plans don't need the nudge.
  const showUpgrade = ctx.permissions.has("billing.view");
  const upgradeLabel = ctx.plan.key === "pro" || ctx.plan.key === "enterprise" ? "Plans" : "Upgrade Plan";

  const footer = (
    <div className="space-y-2">
      {showUpgrade && (
        <ButtonLink href="/dashboard/upgrade" size="sm" className="w-full" data-testid="nav-upgrade">
          <Sparkles aria-hidden /> {upgradeLabel}
        </ButtonLink>
      )}
    <div className="flex items-center gap-2">
      <Link href="/account" className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-white/5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/10">
          <UserRound className="size-4 text-fg-muted" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm">{displayName}</span>
          <span className="block text-[11px] text-fg-subtle">Account settings</span>
        </span>
      </Link>
      <form action="/auth/signout" method="post">
        <button className="rounded-lg px-2 py-1.5 text-xs text-fg-muted hover:bg-white/5 hover:text-fg">Sign out</button>
      </form>
    </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-ink-950">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-72 bg-[radial-gradient(800px_280px_at_30%_-40%,rgb(124_92_255/0.18),transparent)]" aria-hidden />
      <DesktopSidebar items={items} badges={badges} footer={footer} />
      <div className="relative lg:pl-64">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-ink-950/80 px-4 py-3 backdrop-blur-xl sm:px-6">
          <MobileNav items={items} badges={badges} footer={footer} />
          <BusinessSwitcher
            current={{ id: ctx.business.id, name: ctx.business.name, roleLabel: ROLE_LABELS[ctx.role] }}
            businesses={ctx.memberships.map((m) => ({ id: m.business.id, name: m.business.name, roleLabel: ROLE_LABELS[m.role] }))}
          />
          <div className="ml-auto flex items-center gap-2">
            {showUpgrade && ctx.plan.key === "free" && (
              <ButtonLink href="/dashboard/upgrade" size="sm" variant="secondary" className="hidden sm:inline-flex">
                <Sparkles aria-hidden /> Upgrade
              </ButtonLink>
            )}
            <ViewToggle view={profile?.dashboard_view === "advanced" ? "advanced" : "simple"} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
