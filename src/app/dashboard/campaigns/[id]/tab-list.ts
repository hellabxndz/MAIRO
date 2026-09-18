// The tab list, in a module with no "use client" on it.
//
// It lives apart from tabs.tsx because both sides need it and only one of them
// is a client component: the bar renders the labels in the browser, and the
// page resolves ?tab= on the server to decide which section to fetch data for.
// Exporting parseTab from the client file made the server import a client
// function, which Next refuses at runtime — the page threw on every load and
// took the timeline down with it.

export type TabKey =
  | "overview"
  | "timeline"
  | "creatives"
  | "analytics"
  | "actions"
  | "settings";

export const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "timeline", label: "Timeline" },
  { key: "creatives", label: "Creatives" },
  { key: "analytics", label: "Analytics" },
  { key: "actions", label: "MAIRO actions" },
  { key: "settings", label: "Settings" },
];

/** An unknown or missing ?tab= is the overview, never a blank screen. */
export function parseTab(value: string | undefined): TabKey {
  return TABS.some((t) => t.key === value) ? (value as TabKey) : "overview";
}
