import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { PageHeader } from "@/components/ui";
import { instantFromLocal } from "@/lib/campaigns/schedule";
import { mediaLibrary } from "@/lib/instagram/library";
import { findInstagramAccount } from "@/lib/instagram/publish";
import { loadStrategy, localDate } from "@/lib/social/manager";
import { socialGate } from "../gate";
import { SocialTabs } from "../social-tabs";
import { POST_SELECT, toCalendarPost } from "../manager-data";
import { PlanButtons } from "../manager-controls";
import { CalendarView } from "./calendar-view";

// The Social Content Calendar: every planned, scheduled and published post,
// by week or by month, each with why MAIRO made it.

export const maxDuration = 60;

const DAY = 86_400_000;
function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * DAY).toISOString().slice(0, 10);
}
function weekStart(date: string): string {
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addDays(date, -((dow + 6) % 7));
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ view?: string; from?: string }> }) {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  const gate = await socialGate(organizationId);
  if (gate) return gate;

  const sp = await searchParams;
  const view = sp.view === "month" ? "month" : "week";
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { timezone: true, name: true } });
  const zone = org?.timezone || "America/New_York";
  const today = localDate(new Date(), zone);
  const anchor = sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : today;

  let start: string;
  let days: number;
  if (view === "month") {
    const first = `${anchor.slice(0, 7)}-01`;
    start = weekStart(first);
    const nextMonth = new Date(Date.UTC(Number(anchor.slice(0, 4)), Number(anchor.slice(5, 7)), 1)).toISOString().slice(0, 10);
    days = Math.ceil(((Date.parse(nextMonth) - Date.parse(start)) / DAY) / 7) * 7;
  } else {
    start = weekStart(anchor);
    days = 7;
  }
  const from = instantFromLocal(`${start}T00:00`, zone) ?? new Date();
  const to = instantFromLocal(`${addDays(start, days)}T00:00`, zone) ?? new Date(from.getTime() + days * DAY);

  const [rows, library, strategy, ig, meta] = await Promise.all([
    db.instagramPost.findMany({
      where: {
        organizationId,
        OR: [
          { scheduledFor: { gte: from, lt: to } },
          { scheduledFor: null, postedAt: { gte: from, lt: to } },
        ],
      },
      orderBy: [{ scheduledFor: "asc" }, { postedAt: "asc" }],
      select: POST_SELECT,
    }),
    mediaLibrary(organizationId),
    loadStrategy(organizationId),
    findInstagramAccount(organizationId),
    db.metaAdAccount.findUnique({ where: { organizationId }, select: { pageName: true } }),
  ]);
  const posts = rows.map((p) => toCalendarPost(p, zone));
  const awaiting = posts.filter((p) => p.status === "SUGGESTED" && p.date >= today).length;

  const step = view === "month" ? null : 7;
  const prev = view === "month" ? addDays(`${anchor.slice(0, 7)}-01`, -1) : addDays(start, -(step ?? 7));
  const next = view === "month" ? new Date(Date.UTC(Number(anchor.slice(0, 4)), Number(anchor.slice(5, 7)), 1)).toISOString().slice(0, 10) : addDays(start, 7);
  const title = view === "month"
    ? new Date(`${anchor.slice(0, 7)}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
    : `${new Date(`${start}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} – ${new Date(`${addDays(start, 6)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}`;

  return (
    <div>
      <PageHeader title="Content Calendar" description="Every post MAIRO planned for your goal, and why. Approve, edit or skip any of them." />
      <SocialTabs active="/dashboard/social/calendar" />

      {!strategy ? (
        <p className="rounded-2xl border border-dashed border-white/12 px-4 py-8 text-center text-[14px] text-muted">
          Your calendar fills once MAIRO knows your goal. <Link href="/dashboard/social" className="text-violet-bright underline underline-offset-4">Tell MAIRO your goal</Link>.
        </p>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Link href={`/dashboard/social/calendar?view=${view}&from=${prev}`} aria-label="Previous" className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/12 text-white/80 hover:border-white/30">‹</Link>
              <Link href={`/dashboard/social/calendar?view=${view}&from=${next}`} aria-label="Next" className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/12 text-white/80 hover:border-white/30">›</Link>
              <h2 className="ml-1 text-[17px] font-semibold text-white">{title}</h2>
              <Link href={`/dashboard/social/calendar?view=${view}`} className="ml-1 text-[12.5px] text-faint underline underline-offset-4 hover:text-white">Today</Link>
            </div>
            <div role="tablist" aria-label="Calendar view" className="inline-flex rounded-full border border-white/10 bg-white/[0.03] p-1">
              {(["week", "month"] as const).map((v) => (
                <Link key={v} role="tab" aria-selected={v === view} href={`/dashboard/social/calendar?view=${v}&from=${anchor}`}
                  className={`rounded-full px-4 py-1.5 text-[13px] ${v === view ? "bg-[#7c5cff] text-white" : "text-white/65 hover:text-white"}`}>
                  {v === "week" ? "Week" : "Month"}
                </Link>
              ))}
            </div>
          </div>
          <div className="mb-5"><PlanButtons awaiting={awaiting} weekly={strategy.approvalMode === "WEEKLY"} /></div>
          <CalendarView
            view={view}
            start={start}
            days={days}
            month={anchor.slice(0, 7)}
            today={today}
            posts={posts}
            library={library}
            instagramName={(ig.ok && ig.data?.username) || org?.name || "your_business"}
            pageName={meta?.pageName || org?.name || "Your Page"}
          />
        </>
      )}
    </div>
  );
}
