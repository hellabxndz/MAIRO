// The Creative Library's types and filters, shared by the server loader
// (lib/creatives/library.ts) and the page. Pure.

export type LibrarySource = "suggested" | "generated" | "uploaded" | "launched";
export type LibraryStage = "draft" | "approved" | "launched" | "turned-down";

export type LibraryItem = {
  key: string;
  title: string;
  text: string | null;
  preview: string | null;
  kind: "image" | "video" | "words";
  source: LibrarySource;
  stage: LibraryStage;
  versions: number;
  versionNote: string;
  context: string | null;
  href: string;
  date: string;
  /** Meta's figures for a launched ad; null when there are none to show. */
  performance: { resultText: string; costPerResultCents: number | null; spendCents: number | null } | null;
};

export const LIBRARY_FILTERS: { key: "all" | LibrarySource | "draft" | "approved"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "suggested", label: "Suggested" },
  { key: "generated", label: "Generated" },
  { key: "uploaded", label: "Uploaded" },
  { key: "draft", label: "Drafts" },
  { key: "approved", label: "Approved" },
  { key: "launched", label: "Launched" },
];

/** Whether an item belongs under a filter. Pure; pinned by scripts/check-creative-readiness.ts. */
export function inFilter(item: Pick<LibraryItem, "source" | "stage">, filter: string): boolean {
  if (filter === "all") return true;
  if (filter === "draft" || filter === "approved") return item.stage === filter;
  if (filter === "launched") return item.stage === "launched";
  return item.source === filter;
}

export function matchesSearch(item: Pick<LibraryItem, "title" | "text" | "context">, q: string): boolean {
  const needle = q.trim().toLowerCase();
  return !needle || `${item.title} ${item.text ?? ""} ${item.context ?? ""}`.toLowerCase().includes(needle);
}
