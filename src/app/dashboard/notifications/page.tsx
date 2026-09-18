import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { PageHeader } from "@/components/ui";
import { GlassPanel, MairoButton } from "@/components/mairo";
import { kindInfo } from "@/lib/notifications/kinds";
import { whenLabel } from "@/lib/notifications/present";
import { markAllReadAction, dismissNotificationAction } from "@/lib/actions/notification-actions";
import type { NotificationSeverity } from "@/generated/prisma/enums";

// Everything MAIRO has told this business, in one place.
//
// The centre exists so the bell can stay short. Six rows behind a bell is a
// glance; forty is a list, and a list needs somewhere to live that is not a
// dropdown over the page somebody was reading.
//
// Nothing here is generated for display. Every row was written by a detector
// from figures that were true at the time, which is why each one can say what
// it says rather than hedging.

export const metadata = { title: "Notifications — MAIRO" };

const TONE: Record<NotificationSeverity, { dot: string; label: string }> = {
  INFO: { dot: "var(--color-blue-bright, #6c9eff)", label: "text-blue-bright" },
  OPPORTUNITY: { dot: "rgb(52,211,153)", label: "text-live" },
  WARNING: { dot: "rgb(251,191,36)", label: "text-warn" },
};

export default async function NotificationsPage() {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  const rows = await db.notification.findMany({
    where: { organizationId, dismissedAt: null },
    orderBy: { createdAt: "desc" },
    take: 60,
  });
  const unread = rows.filter((r) => r.readAt === null).length;
  const now = new Date();

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="What MAIRO noticed without being asked, and what it did about it."
        action={
          unread > 0 ? (
            <form action={markAllReadAction}>
              <MairoButton type="submit" tone="ghost">
                Mark all read
              </MairoButton>
            </form>
          ) : undefined
        }
      />

      {rows.length === 0 ? (
        <GlassPanel className="px-6 py-14 text-center">
          <h2 className="text-[16px] font-medium text-white">Nothing to tell you yet</h2>
          <p className="mx-auto mt-2.5 max-w-md text-[13px] leading-relaxed text-muted">
            MAIRO watches your campaigns and writes here when something is worth your
            attention — a campaign spending without results, one platform beating another,
            an ad account that has disconnected. Quiet means nothing needs you.
          </p>
        </GlassPanel>
      ) : (
        <ul className="space-y-3">
          {rows.map((n) => {
            const info = kindInfo(n.kind);
            const tone = TONE[n.severity];
            return (
              <li key={n.id}>
                <GlassPanel className="p-5" lit={n.readAt === null}>
                  <div className="flex items-start gap-3.5">
                    <span
                      aria-hidden
                      className="mt-[7px] h-2 w-2 shrink-0 rounded-full"
                      style={{ background: tone.dot, opacity: n.readAt === null ? 1 : 0.3 }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <span className={`font-mono text-[10px] uppercase tracking-[0.16em] ${tone.label}`}>
                          {info.label}
                        </span>
                        <span className="text-[11px] text-faint">{whenLabel(n.createdAt, now)}</span>
                      </div>
                      <h2 className="mt-1.5 text-[14.5px] font-medium leading-snug text-white">
                        {n.title}
                      </h2>
                      <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted">
                        {n.body}
                      </p>
                      <div className="mt-3.5 flex flex-wrap items-center gap-4">
                        {n.actionHref && (
                          <Link
                            href={n.actionHref}
                            className="text-[12.5px] text-blue-bright transition-colors hover:text-white"
                          >
                            {n.actionLabel ?? "Take a look"} →
                          </Link>
                        )}
                        {/* Asking MAIRO about it rather than reading a chart.
                            The notification already says what happened; the
                            question people actually have next is why. */}
                        <Link
                          href={`/dashboard/agents?ask=${encodeURIComponent(n.title)}`}
                          className="text-[12.5px] text-muted transition-colors hover:text-white"
                        >
                          Ask why
                        </Link>
                        <form action={dismissNotificationAction.bind(null, n.id)}>
                          <button
                            type="submit"
                            className="text-[12.5px] text-faint transition-colors hover:text-white"
                          >
                            Dismiss
                          </button>
                        </form>
                      </div>
                    </div>
                  </div>
                </GlassPanel>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
