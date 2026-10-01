import type { PlatformMetrics } from "@/lib/ad-platforms/types";
import type { MetricFamily } from "@/lib/mission/goals";

// The simplified Overview's rules, pure: which four numbers a business sees
// for its goal, how a date is said ("Today", "Tomorrow", "Friday"), what goes
// in "What's next", and which single insight is worth showing.
//
// The Overview answers five questions — what am I trying to do, what is
// MAIRO doing, how is the business doing, does MAIRO need me, what's next —
// and nothing else. Every rule here is pinned by scripts/check-simple-ui.ts.

export type Tile = { label: string; value: string; hint?: string };

const NOT_TRACKED = "—";

export function money(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return NOT_TRACKED;
  const dollars = cents / 100;
  return dollars.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: dollars >= 1000 ? 0 : 2, minimumFractionDigits: dollars >= 1000 ? 0 : 2 });
}

export function num(n: number | null | undefined): string {
  return n === null || n === undefined ? NOT_TRACKED : Math.round(n).toLocaleString("en-US");
}

const per = (spend: number | null, results: number | null | undefined) => (spend !== null && results ? Math.round(spend / results) : null);

/**
 * The four numbers for a goal, in a business owner's words. Never CPM, CTR,
 * CPC, frequency, impressions or reach for a goal that isn't about reach —
 * those live in Analytics → Advanced.
 */
export function performanceTiles(family: MetricFamily, m: PlatformMetrics): Tile[] {
  const spent: Tile = { label: "Money spent", value: money(m.spendCents) };
  const leads = m.leads ?? null;
  const bookings = m.bookings ?? null;
  const contacts = m.contacts ?? null;
  switch (family) {
    case "leads":
      return [spent, { label: "Leads", value: num(leads) }, { label: "Cost per lead", value: money(per(m.spendCents, leads)) }, { label: "Contact actions", value: num(contacts), hint: "Calls and messages started from your ads." }];
    case "bookings":
      return [spent, { label: "Bookings", value: num(bookings) }, { label: "Cost per booking", value: money(per(m.spendCents, bookings)) }, { label: "Booking leads", value: num(leads), hint: "People who asked about booking." }];
    case "calls":
      return [spent, { label: "Calls & messages", value: num(contacts) }, { label: "Cost per contact", value: money(per(m.spendCents, contacts)) }, { label: "Leads", value: num(leads) }];
    case "traffic":
      return [spent, { label: "Website visits", value: num(m.landingPageViews ?? null), hint: "People who actually loaded your page." }, { label: "Cost per visit", value: money(per(m.spendCents, m.landingPageViews)) }, { label: "Clicks", value: num(m.clicks) }];
    case "awareness":
    case "visits":
      return [spent, { label: "People reached", value: num(m.reach) }, { label: "Cost per 1,000 people", value: money(m.reach ? Math.round(((m.spendCents ?? 0) / m.reach) * 1000) : null) }, { label: "Video views", value: num(m.videoViews ?? null) }];
    case "social":
      return [spent, { label: "Engagement", value: num(m.engagement ?? null), hint: "Likes, comments and shares on your ads." }, { label: "People reached", value: num(m.reach) }, { label: "Cost per engagement", value: money(per(m.spendCents, m.engagement)) }];
    case "sales":
    default:
      return [spent, { label: "Revenue", value: money(m.revenueCents), hint: "Sales Meta tracked back to your ads." }, { label: "Sales", value: num(m.purchases) }, { label: "Cost per sale", value: money(m.costPerPurchaseCents ?? per(m.spendCents, m.purchases)) }];
  }
}

/** YYYY-MM-DD in a time zone. */
export function localDay(d: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/** "Today", "Tomorrow", a weekday within the week, otherwise "Mon, Oct 12". */
export function dayLabel(day: string, today: string): string {
  const diff = Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  const d = new Date(`${day}T12:00:00Z`);
  if (diff > 1 && diff < 7) return d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

export type NextItem = { day: string; text: string; href?: string };

/** What's next, soonest first, one line each, at most four — and always something for today. */
export function whatsNext(input: {
  today: string;
  /** Day → what happens, from posts, starts, promotions, reports. */
  events: NextItem[];
  campaignsRunning: number;
  goalPhrase: string | null;
}): { label: string; text: string; href?: string }[] {
  const upcoming = input.events.filter((e) => e.day >= input.today).sort((a, b) => a.day.localeCompare(b.day));
  const todayLine = upcoming.find((e) => e.day === input.today) ?? {
    day: input.today,
    text: input.campaignsRunning > 0 ? `MAIRO is monitoring your campaign${input.campaignsRunning === 1 ? "" : "s"}${input.goalPhrase ? ` for ${input.goalPhrase}` : ""}.` : "MAIRO is ready when your first campaign is.",
  };
  const rest = upcoming.filter((e) => e !== todayLine && e.day !== input.today);
  // One line per day keeps it a glance, not a schedule.
  const seen = new Set<string>([input.today]);
  const picked = rest.filter((e) => (seen.has(e.day) ? false : (seen.add(e.day), true))).slice(0, 3);
  return [todayLine, ...picked].map((e) => ({ label: dayLabel(e.day, input.today), text: e.text, href: e.href }));
}

export type InsightCandidate = { text: string; why: string; evidence: { label: string; value: string }[]; href: string; source: "learning" | "intelligence"; strength: number };

/** ONE insight: the strongest the business's own data supports — or none. */
export function pickInsight(candidates: InsightCandidate[]): InsightCandidate | null {
  return [...candidates].sort((a, b) => b.strength - a.strength)[0] ?? null;
}
