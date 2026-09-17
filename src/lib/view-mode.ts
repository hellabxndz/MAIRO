import { cookies } from "next/headers";

// Simple View and Advanced View.
//
// One account, one database, one set of campaigns, one billing record, one
// assistant. This is a presentation preference and nothing else — there is no
// second campaign system behind it, and any code that starts branching business
// logic on the mode is a bug.
//
// Stored in a cookie rather than on the user row for two reasons. It has to be
// readable on the server during the layout render, or the first paint shows the
// wrong mode and then snaps; and it is a per-device preference — somebody who
// wants the dense view on their desktop often wants the simple one on their
// phone, and a column on the user would force those to agree.

export type ViewMode = "simple" | "advanced";

export const VIEW_MODE_COOKIE = "mairo_view";

/** New accounts start simple. Someone who wants the full instrument finds it. */
export const DEFAULT_VIEW_MODE: ViewMode = "simple";

export function parseViewMode(value: string | undefined): ViewMode {
  return value === "advanced" ? "advanced" : DEFAULT_VIEW_MODE;
}

/** The mode for this request. Server components only. */
export async function viewMode(): Promise<ViewMode> {
  const jar = await cookies();
  return parseViewMode(jar.get(VIEW_MODE_COOKIE)?.value);
}
