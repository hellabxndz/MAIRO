// Carrying a free tool's result into setup, with the owner's say-so.
//
// A tool result ("use this budget", "use these hooks", "continue with this
// website") is kept in this browser's storage — nothing is sent to MAIRO.
// Setup reads it and offers each item; only what the owner chooses to use is
// filled in, visibly, where they can still change it. Items expire after 30
// days and are removed once used or dismissed.

export type HandoffInput =
  | { kind: "budget"; monthlyBudget: number; label: string; tool: string }
  | { kind: "website"; url: string; tool: string }
  | { kind: "hooks"; hooks: string[]; tool: string }
  | { kind: "offer"; offer: string; tool: string }
  | { kind: "note"; text: string; label: string; tool: string };

export type Handoff = HandoffInput & { at: string };

export const HANDOFF_KEY = "mairo:handoff:v1";
const KEY = HANDOFF_KEY;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function read(): Handoff[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as Handoff[];
    if (!Array.isArray(list)) return [];
    return list.filter((h) => h && typeof h.kind === "string" && Date.now() - Date.parse(h.at) < MAX_AGE_MS);
  } catch {
    return [];
  }
}

function write(list: Handoff[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(-8)));
  } catch {
    // Storage blocked: the handoff is simply not offered later.
  }
}

/** Notes accumulate (one per tool); everything else keeps only the latest of its kind. */
export function saveHandoff(item: HandoffInput) {
  const list = read().filter((h) => (item.kind === "note" ? !(h.kind === "note" && h.tool === item.tool) : h.kind !== item.kind));
  write([...list, { ...item, at: new Date().toISOString() }]);
}

export function readHandoffs(): Handoff[] {
  return read();
}

export function dropHandoff(match: Pick<Handoff, "kind" | "tool">) {
  write(read().filter((h) => !(h.kind === match.kind && h.tool === match.tool)));
}

export function describeHandoff(h: Handoff): { title: string; detail: string } {
  switch (h.kind) {
    case "budget":
      return { title: `Monthly budget: $${Math.round(h.monthlyBudget).toLocaleString("en-US")}`, detail: h.label };
    case "website":
      return { title: `Website: ${h.url}`, detail: "From a free website tool" };
    case "hooks":
      return { title: `${h.hooks.length} ad hook${h.hooks.length === 1 ? "" : "s"} to test`, detail: h.hooks.slice(0, 2).map((x) => `“${x}”`).join(" · ") };
    case "offer":
      return { title: `Offer: ${h.offer}`, detail: "From the offer clarity checker" };
    case "note":
      return { title: h.label, detail: h.text };
  }
}
