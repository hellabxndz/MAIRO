// The tab list, in a module with no "use client" on it.
//
// It lives apart from tabs.tsx because both sides need it and only one of them
// is a client component: the bar renders the labels in the browser, and the
// page resolves ?tab= on the server to decide which section to fetch data for.
// Exporting parseTab from the client file made the server import a client
// function, which Next refuses at runtime — the page threw on every load and
// took the timeline down with it.

export type TabKey = "performance" | "creatives" | "audience" | "budget" | "decisions" | "history" | "advanced";

export const TABS: { key: TabKey; label: string }[] = [
  { key: "performance", label: "Performance" },
  { key: "creatives", label: "Creatives" },
  { key: "audience", label: "Audience" },
  { key: "budget", label: "Budget" },
  { key: "decisions", label: "MAIRO Decisions" },
  { key: "history", label: "History" },
  { key: "advanced", label: "Advanced Settings" },
];

/** The old tab names still land somewhere sensible. */
const OLD: Record<string, TabKey> = { overview: "performance", timeline: "history", analytics: "advanced", actions: "decisions", settings: "advanced" };

/** An unknown or missing ?tab= is Performance, never a blank screen. */
export function parseTab(value: string | undefined): TabKey {
  if (value && OLD[value]) return OLD[value];
  return TABS.some((t) => t.key === value) ? (value as TabKey) : "performance";
}
