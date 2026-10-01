import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { activeOrganizationId } from "@/lib/active-org";
import { PageHeader, EmptyState, primaryButtonClass } from "@/components/ui";
import { loadCreativeHub } from "@/lib/creatives/hub";
import { AdCard, NewCard, PastList } from "./hub-client";

// Creatives: one page for everything about ads' pictures and videos.
//
//   Active          running in a campaign now, with its result for the goal
//   New             made by MAIRO (or in Creative Studio), not running yet
//   Past            creative history, searchable
//   Top Performing  ranked by the business's goal — purchases for sales,
//                   leads for leads — never by likes or clicks
//
// Making one starts from the button at the top: the AI Creative Studio (images)
// or "write an ad from a photo". Both tools are unchanged; this is their home.

export const maxDuration = 30;

const TABS = [
  { key: "active", label: "Active" },
  { key: "new", label: "New" },
  { key: "past", label: "Past" },
  { key: "top", label: "Top Performing" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const WORDS: Record<string, string> = { sales: "purchases", leads: "leads", bookings: "bookings", calls: "calls and messages", traffic: "website visits", awareness: "people reached", visits: "people reached", social: "engagement" };

export default async function CreativesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  const hub = await loadCreativeHub(organizationId);
  const requested = (await searchParams).tab;
  const counts: Record<Tab, number> = { active: hub.active.length, new: hub.newItems.length, past: hub.past.length, top: hub.top.length };
  const tab: Tab = TABS.some((t) => t.key === requested) ? (requested as Tab) : hub.active.length ? "active" : hub.newItems.length ? "new" : "active";

  return (
    <div className="mx-auto max-w-[1180px]">
      <PageHeader
        title="Creatives"
        description="Every ad picture and video: what's running, what's new, what ran before, and what works best for your goal."
        action={<Link href="/dashboard/creative-studio" className={primaryButtonClass}>+ Create new creative</Link>}
      />

      <nav aria-label="Creatives" className="-mx-1 mb-6 flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none]">
        {TABS.map((t) => (
          <Link key={t.key} href={`/dashboard/creatives?tab=${t.key}`} aria-current={t.key === tab ? "page" : undefined}
            className={`shrink-0 rounded-full px-4 py-2 text-[13.5px] transition ${t.key === tab ? "bg-white/[0.1] text-white" : "text-muted hover:text-white"}`}>
            {t.label}{counts[t.key] > 0 && t.key !== "top" ? <span className="ml-1.5 text-faint">{counts[t.key]}</span> : null}
          </Link>
        ))}
      </nav>

      {tab === "active" && (hub.active.length === 0 ? (
        <EmptyState title="Nothing running right now" description="Creatives appear here while they're in a live campaign, with their results for your goal." />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">{hub.active.map((a) => <AdCard key={a.id} ad={a} />)}</div>
      ))}

      {tab === "new" && (hub.newItems.length === 0 ? (
        <EmptyState title="No new creatives" description="When MAIRO or Creative Studio makes something that isn't running yet, it waits here for you." />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">{hub.newItems.map((i) => <NewCard key={i.key} item={i} />)}</div>
      ))}

      {tab === "past" && (hub.past.length === 0 ? (
        <EmptyState title="No past creatives yet" description="Creatives from paused and finished campaigns are kept here." />
      ) : (
        <PastList ads={hub.past} />
      ))}

      {tab === "top" && (
        <>
          <p className="mb-4 text-[13.5px] text-muted">Ranked by {WORDS[hub.family]}{hub.goal ? ` — your goal is to ${hub.goal.toLowerCase()}` : ""}: the most results at the lowest cost, from the last 90 days. Never by likes or clicks when your goal is sales.</p>
          {hub.top.length === 0 ? (
            <EmptyState title="Not enough results to rank yet" description={`Once your ads bring in ${WORDS[hub.family]}, the best ones appear here.`} />
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">{hub.top.map((a, i) => <AdCard key={a.id} ad={a} rank={i + 1} />)}</div>
          )}
        </>
      )}

      <p className="mt-10 text-[13px] text-faint">
        Prefer to start from a photo of what you sell? <Link href="/dashboard/creatives/requests" className="text-violet-bright hover:underline">Write an ad from a photo</Link>.
      </p>
    </div>
  );
}
