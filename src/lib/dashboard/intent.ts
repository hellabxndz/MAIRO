// Where the Overview's question box sends what somebody typed.
//
// The box is the front door ("What would you like to advertise today?"), but
// it is not a second chatbot. Things MAIRO has a real screen for go to that
// screen, carrying what was typed: wanting to advertise something opens
// campaign creation with it filled in; asking how the ads are doing opens
// Results; asking what's waiting opens the approvals. Anything else is a
// question, and goes to the MAIRO assistant, which answers from the account's
// own records with its tools.
//
// Deterministic on purpose: the same words always go to the same place, it
// costs nothing, and nothing is launched or spent from here — every place it
// sends somebody still asks before it does anything.

export type IntentKind = "campaign" | "repeat" | "creative" | "results" | "approvals" | "tracking" | "billing" | "ask";

export type Intent = { kind: IntentKind; href: string; label: string };

const has = (text: string, re: RegExp) => re.test(text);

/** What they want advertised, from "Create an ad for our summer sale" → "our summer sale". */
export function subjectOf(text: string): string {
  return text
    .trim()
    .replace(/^(please\s+)?(can you\s+|could you\s+|i want to\s+|i'd like to\s+|let's\s+|help me\s+)?/i, "")
    .replace(/^(create|make|start|run|launch|set up|build|do)\s+(a|an|some|my|me a|me an)?\s*(new\s+)?(facebook\s+|instagram\s+|meta\s+)?(ad|ads|advert|campaign|promotion)s?\s*/i, "")
    .replace(/^(advertise|promote|sell|push)\s+/i, "")
    .replace(/^(for|about|to promote|promoting|on)\s+/i, "")
    .replace(/[.!?]+$/, "")
    .trim()
    .slice(0, 200);
}

export function intentOf(raw: string): Intent {
  const text = raw.trim().toLowerCase();
  const ask = { kind: "ask" as const, href: `/dashboard/agents?ask=${encodeURIComponent(raw.trim().slice(0, 500))}`, label: "Ask MAIRO" };
  if (!text) return ask;

  // A question about the ads ("how", "why", "what", "should") is a question,
  // unless it is plainly asking for the numbers.
  const question = has(text, /^(how|why|what|which|when|should|is|are|do|does|can|could|will|would)\b/) || text.endsWith("?");

  if (has(text, /\b(again|same as|like (my )?last|previous|repeat|re-?run|one more like)\b/) && has(text, /\b(campaign|ad|ads|promotion)\b/)) {
    return { kind: "repeat", href: "/dashboard/create?start=similar", label: "Start from a previous campaign" };
  }
  if (has(text, /\b(approv|pending|waiting (for|on) me|needs? my|to review|review (my |the )?(ads|changes|recommendations))/)) {
    return { kind: "approvals", href: "/dashboard/decisions", label: "See what's waiting for you" };
  }
  if (!question && has(text, /\b(make|create|generate|design|draw|write|new)\b.*\b(image|picture|photo|video|creative|headline|headlines|banner|visual|graphic)s?\b/)) {
    return { kind: "creative", href: "/dashboard/creative-studio", label: "Make it in Creative Studio" };
  }
  if (has(text, /\b(pixel|tracking|conversions? api|capi)\b/)) {
    return { kind: "tracking", href: "/dashboard/pixel", label: "Open Pixel & tracking" };
  }
  if (has(text, /\b(billing|invoice|subscription|my plan|change (my )?plan|upgrade|downgrade|cancel (my )?(plan|subscription))\b/)) {
    return { kind: "billing", href: "/dashboard/billing", label: "Open billing" };
  }
  if (has(text, /^(show|see|open)?\s*(me\s+)?(my\s+)?(results|performance|numbers|stats|roas)\b/) || has(text, /\bhow (are|is) (my|the) (ads?|campaigns?)\b.*\b(doing|performing|going)\b/) || has(text, /\bhow much (have i|did i|i've) (spent|spend)\b/)) {
    return { kind: "results", href: "/dashboard/results", label: "See your results" };
  }
  if (!question && (has(text, /^(create|make|start|run|launch|set up|build|do)\b.*\b(ad|ads|advert|campaign|promotion)s?\b/) || has(text, /^(advertise|promote|sell|push)\b/) || has(text, /\b(get|find) (more|new) (customers|leads|sales|bookings|clients)\b/))) {
    // "Get more leads" is a goal, not something to advertise: the goal step asks it.
    const about = /^(get|find)\b/i.test(raw.trim()) ? "" : subjectOf(raw);
    return {
      kind: "campaign",
      href: `/dashboard/create?start=new${about ? `&about=${encodeURIComponent(about)}` : ""}`,
      label: about ? `Create a campaign for “${about}”` : "Create a campaign",
    };
  }
  return ask;
}
