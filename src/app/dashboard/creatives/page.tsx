import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { activeOrganizationId } from "@/lib/active-org";
import { PageHeader, EmptyState, primaryButtonClass } from "@/components/ui";
import { loadCreativeHub } from "@/lib/creatives/hub";
import { loadCreativeLibrary } from "@/lib/creatives/library";
import { AdCard, NewCard, PastList } from "./hub-client";
import { LibraryList } from "./library-client";
import { SuggestedAdsPrompt } from "@/components/suggested-ads-prompt";

// Creatives: one page for everything about ads' pictures and videos.
//
//   Active          running in a campaign now, with its result for the goal
//   New             made by MAIRO (or in Creative Studio), not running yet
//   Past            creative history, searchable
//   Top Performing  ranked by the business's goal — purchases for sales,
//                   leads for leads — never by likes or clicks
//   Library         everything in one list: suggested, generated, uploaded,
//                   drafts, approved and launched, searchable, with versions
//
// Making one starts from the button at the top: the AI Creative Studio (images)
// or "write an ad from a photo". Both tools are unchanged; this is their home.

export const maxDuration = 30;

// Three tabs on screen — what's waiting for the owner, what's running, and
// everything — with Top performing and Past one tap away beneath them.
const TABS = [
  { key: "new", label: "To review" },
  { key: "active", label: "Running" },
  { key: "library", label: "Library" },
  { key: "top", label: "Top performing" },
  { key: "past", label: "Past" },
] as const;
type Tab = (typeof TABS)[number]["key"];
const SHOWN: Tab[] = ["new", "active", "library"];

const WORDS: Record<string, string> = { sales: "purchases", leads: "leads", bookings: "bookings", calls: "calls and messages", traffic: "website visits", awareness: "people reached", visits: "people reached", social: "engagement" };

export default async function CreativesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  const hub = await loadCreativeHub(organizationId);
  const requested = (await searchParams).tab;
  const library = await loadCreativeLibrary(organizationId, [...hub.active, ...hub.past]);
  const counts: Record<Tab, number> = { active: hub.active.length, new: hub.newItems.length, past: hub.past.length, top: hub.top.length, library: library.length };
  const tab: Tab = TABS.some((t) => t.key === requested) ? (requested as Tab) : hub.newItems.length ? "new" : hub.active.length ? "active" : "library";

  return (
    <div className="mx-auto max-w-[1180px]">
      <PageHeader
        title="Creatives"
        description="Your ad pictures, videos and headlines. Approve them, ask for changes, or make new ones — approved ones can go into any campaign."
        action={<Link href="/dashboard/creative-studio" className={primaryButtonClass}>+ Create ad</Link>}
      />

      <SuggestedAdsPrompt organizationId={organizationId} className="mb-6" />

      <nav aria-label="Creatives" className="-mx-1 mb-2 flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none]">
        {TABS.filter((t) => SHOWN.includes(t.key) || t.key === tab).map((t) => (
          <Link key={t.key} href={`/dashboard/creatives?tab=${t.key}`} aria-current={t.key === tab ? "page" : undefined}
            className={`shrink-0 rounded-full px-4 py-2 text-[13.5px] transition ${t.key === tab ? "bg-white/[0.1] text-white" : "text-muted hover:text-white"}`}>
            {t.label}{counts[t.key] > 0 && t.key !== "top" && t.key !== "library" ? <span className="ml-1.5 text-faint">{counts[t.key]}</span> : null}
          </Link>
        ))}
      </nav>
      <p className="mb-6 px-1 text-[13px] text-muted">
        {TABS.filter((t) => !SHOWN.includes(t.key) && t.key !== tab).map((t, i) => (
          <span key={t.key}>
            {i > 0 && <span aria-hidden> · </span>}
            <Link href={`/dashboard/creatives?tab=${t.key}`} className="hover:text-white hover:underline">{t.label}</Link>
          </span>
        ))}
      </p>

      {tab === "active" && (hub.active.length === 0 ? (
        <EmptyState title="Nothing running right now" description="Creatives appear here while they're in a live campaign, with their results for your goal." />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">{hub.active.map((a) => <AdCard key={a.id} ad={a} />)}</div>
      ))}

      {tab === "new" && (hub.newItems.length === 0 ? (
        <EmptyState title="Nothing to review" description="When MAIRO or Creative Studio makes an ad, it waits here for you to approve, change or regenerate." />
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

      {tab === "library" && <LibraryList items={JSON.parse(JSON.stringify(library))} />}

      <p className="mt-10 text-[13px] text-faint">
        Prefer to start from a photo of what you sell? <Link href="/dashboard/creatives/requests" className="text-violet-bright hover:underline">Write an ad from a photo</Link>.
      </p>
    </div>
  );
}
