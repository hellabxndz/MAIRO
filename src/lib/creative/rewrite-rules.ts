import { unsupportedNumbers } from "@/lib/campaigns/ad-copy";
import { usesAvoided } from "@/lib/suggested-ads/directions";

// The rules a MAIRO rewrite of an ad's words has to pass before the owner
// sees it — kept apart from the AI call so the page can use the chips and
// buttons, and scripts/check-creative-readiness.ts can pin every rule.
//
// A sentence carrying a number the business never gave is dropped, words the
// owner said to avoid stop it, an over-long opening line is refused, and the
// button stays one of the buttons MAIRO can run.

export type Words = { hook: string; body: string; cta: string };

export const REWRITE_CHIPS = ["Make the hook stronger", "Make this more luxurious", "Make it shorter", "Focus more on our offer"] as const;

export const BUTTONS = ["Shop now", "Get a quote", "Book now", "Learn more", "Contact us", "Order now", "Sign up"] as const;

export const HOOK_MAX = 160;
const BODY_MAX = 600;

export type RewriteOutcome =
  | { ok: true; words: Words; note: string; dropped: string[] }
  | { ok: false; error: string };

/** Checks the model's proposal against the facts and the owner's rules. Pure. */
export function settleRewrite(proposal: Words & { note?: string; couldNot?: boolean }, current: Words, factText: string, avoid: string[]): RewriteOutcome {
  const clean = (s: string) => s.replace(/\s+/g, " ").trim();
  const known = `${factText}\n${current.hook}\n${current.body}`;
  const dropped: string[] = [];
  let hook = clean(proposal.hook);
  const invented = unsupportedNumbers(hook, known);
  if (invented.length) {
    dropped.push(...invented);
    hook = current.hook;
  }
  const sentences = clean(proposal.body).split(/(?<=[.!?])\s+/).filter(Boolean);
  const body = sentences
    .filter((s) => {
      const n = unsupportedNumbers(s, known);
      dropped.push(...n);
      return n.length === 0;
    })
    .join(" ")
    .slice(0, BODY_MAX)
    .trim();
  const cta = BUTTONS.find((b) => b.toLowerCase() === clean(proposal.cta).toLowerCase()) ?? current.cta;
  const note = clean(proposal.note ?? "").slice(0, 240);

  if (proposal.couldNot && hook === current.hook && body === current.body && cta === current.cta) {
    return { ok: false, error: note || "MAIRO couldn't make that change from what it knows about your business." };
  }
  if (hook.length < 4) return { ok: false, error: "MAIRO's rewrite had no opening line, so it wasn't kept. Try saying it another way." };
  if (hook.length > HOOK_MAX) return { ok: false, error: "MAIRO's rewrite made the opening line too long, so it wasn't kept. Try again." };
  const avoided = usesAvoided(`${hook} ${body}`, avoid);
  if (avoided) return { ok: false, error: `MAIRO's rewrite used “${avoided}”, which is on your list of words to avoid, so it wasn't kept.` };
  if (hook === current.hook && body === current.body && cta === current.cta) {
    return { ok: false, error: note || "MAIRO couldn't find a better way to say it. The words are unchanged." };
  }
  return { ok: true, words: { hook, body, cta }, note, dropped: [...new Set(dropped)] };
}
