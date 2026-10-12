import { NICHES } from "@/lib/tracking/niches";

// The kinds of business the setup screen offers, from the same configurable
// catalogue the tracking and results pages use (lib/tracking/niches.ts) — so
// adding a business type there adds it here.
//
// Service businesses come first: MAIRO's first focus is owners who want
// qualified leads and booked appointments. Online shops keep everything they
// had; "Something else" and "Not sure" are always there.

export type BusinessKind = "service" | "shop" | "other";
export type BusinessType = { id: string; label: string; kind: BusinessKind };

const SHOP = new Set(["ecommerce"]);
const OTHER = new Set(["saas", "events", "restaurant"]);

export const BUSINESS_TYPES: BusinessType[] = [
  ...NICHES.filter((n) => n.id !== "general" && !SHOP.has(n.id) && !OTHER.has(n.id)).map((n) => ({ id: n.id, label: n.label, kind: "service" as const })),
  ...NICHES.filter((n) => SHOP.has(n.id)).map((n) => ({ id: n.id, label: n.label, kind: "shop" as const })),
  ...NICHES.filter((n) => OTHER.has(n.id)).map((n) => ({ id: n.id, label: n.label, kind: "other" as const })),
  { id: "general", label: "Something else", kind: "other" },
];

export const UNSURE = "unsure";

/** A type id from a link or form, or null when it isn't one MAIRO knows. */
export function businessTypeFrom(raw: string | null | undefined): BusinessType | null {
  if (!raw) return null;
  return BUSINESS_TYPES.find((t) => t.id === raw) ?? null;
}

/** The follow-up worth asking for this kind of business — and only this one. */
export function reachQuestion(kind: BusinessKind | null): { label: string; options: string[] } | null {
  if (kind === "service") return { label: "How far do you travel, or how far do customers come?", options: ["Within 5 miles", "Within 10 miles", "Within 20 miles", "Within 50 miles", "My whole state or region", "Not sure"] };
  if (kind === "shop") return { label: "Where do you sell?", options: ["My country", "Worldwide", "My state or region", "Locally only", "Not sure"] };
  return null;
}
