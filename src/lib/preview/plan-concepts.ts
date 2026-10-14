import type { Direction, PreviewGoal } from "@/lib/preview/build";

// The shapes of the free AI ad plan's written parts, and MAIRO's own
// template concepts — light enough for the browser. The checks the AI's
// writing has to pass live in plan-writing.ts, on the server.

export const FORMATS = ["Single image", "Short video", "Carousel", "Reels video"] as const;
export type Format = (typeof FORMATS)[number];

export type PlanConcept = {
  label: string;
  headline: string;
  primaryText: string;
  format: Format;
  visual: string;
  cta: string;
  targetCustomer: string;
  why: string;
};

export type WrittenPlan = {
  /** What makes the offering appealing — each point drawn from the facts given. */
  appeal: string[];
  /** Who is likely to buy: the AI's suggestion, labelled as one, or null. */
  customers: string | null;
  /** What the ads should say, in two to four points. */
  messaging: string[];
  concepts: PlanConcept[];
  /** Which concept to test first, and why. */
  first: number;
  firstWhy: string;
};

/** Who wrote the words: MAIRO's AI, a local test fixture (never in production), or MAIRO's templates — and why, for templates. */
export type PlanSource = { by: "ai" } | { by: "fixture"; note: string } | { by: "templates"; why: string };

export const DEFAULT_CTA: Record<PreviewGoal, string> = { sales: "Shop now", leads: "Get a quote", bookings: "Book now", traffic: "Learn more", awareness: "Learn more" };

/** A template direction as a plan concept, for when the AI's can't be used. */
export function conceptFromDirection(d: Direction, goal: PreviewGoal, targetCustomer: string): PlanConcept {
  const cta = d.cta === "Get quote" ? "Get a quote" : d.cta || DEFAULT_CTA[goal];
  const format: Format = /video/i.test(d.format) ? "Short video" : /carousel/i.test(d.format) ? "Carousel" : "Single image";
  return { label: d.label, headline: d.headline, primaryText: d.primaryText, format, visual: d.visual, cta, targetCustomer, why: d.why };
}
