import type { AgentType } from "@/generated/prisma/enums";

// One assistant, not a panel of specialists.
//
// The product used to offer a Strategist, a Creative and Support as three
// separate things to pick between. That made the customer route their own
// question before asking it — and a business owner who does not know whether
// "is £20 a day enough" is a strategy question or a support question is
// exactly the person this product exists for. Getting that choice wrong gave
// them a worse answer than asking anyone would have.
//
// So the three collapsed into one. Same thread, same memory, one name. It
// answers budget, targeting, creative, results, billing and "how does this
// even work" without the person having to know which is which.
//
// The AgentType enum still has the old values because they are rows in a
// database — threads that already exist carry them, and rewriting history to
// tidy an enum loses conversations. STRATEGIST, CREATIVE and SUPPORT all
// resolve to the same prompt now, so an old thread just keeps working.
// OWNER_COPILOT stays genuinely separate: it is the internal tool for whoever
// runs MAIRO, looking across every client account, and it must never be handed
// to a customer.

/**
 * The thread every customer conversation uses.
 *
 * SUPPORT was already the broadest of the three and already the one the
 * floating panel posted to, so making it the canonical one keeps the most
 * existing history reachable.
 */
export const CLIENT_AGENT: AgentType = "SUPPORT";

/** The three old client-facing types, all of which now mean the same thing. */
const CLIENT_AGENT_TYPES: AgentType[] = ["STRATEGIST", "CREATIVE", "SUPPORT"];

export function isClientAgent(type: AgentType): boolean {
  return CLIENT_AGENT_TYPES.includes(type);
}

/**
 * What the assistant is called before anybody renames it.
 *
 * A name rather than a product noun, because "ask Alex" is a sentence people
 * already know how to say and "engage the assistant" is not. Businesses can
 * change it in Settings — some want it to be their own brand, some want it to
 * be a person on their team.
 */
export const DEFAULT_ASSISTANT_NAME = "Alex";

/** Keep a stored name sane before it reaches a prompt or a heading. */
export function assistantNameOf(raw: string | null | undefined): string {
  const name = (raw ?? "").trim();
  if (!name) return DEFAULT_ASSISTANT_NAME;
  return name.slice(0, 24);
}

/**
 * What it can actually do, for the page that introduces it.
 *
 * Kept next to the prompt on purpose: if a capability is listed here it has to
 * be described in the prompt too, otherwise the page promises something the
 * assistant then declines to do.
 */
export const ASSISTANT_SKILLS: { title: string; body: string }[] = [
  {
    title: "Your campaigns",
    body: "What is running, what it has spent, what it brought back, and what MAIRO changed while you were not looking.",
  },
  {
    title: "Budget",
    body: "Whether what you are spending is enough, where it is going, and what moving it would likely do.",
  },
  {
    title: "Your ads",
    body: "Write new copy, rework a hook, or explain why one ad is beating another.",
  },
  {
    title: "AI Creative Studio",
    body: "Talk through what image to make and which style fits — then generate it in the Studio.",
  },
  {
    title: "The product",
    body: "Billing, plans, connecting an ad account, what MAIRO does on its own and what it will always ask you first.",
  },
];

export const AGENT_LABELS: Record<AgentType, string> = {
  STRATEGIST: DEFAULT_ASSISTANT_NAME,
  CREATIVE: DEFAULT_ASSISTANT_NAME,
  SUPPORT: DEFAULT_ASSISTANT_NAME,
  OWNER_COPILOT: "AIOS Copilot",
};

export const AGENT_DESCRIPTIONS: Record<AgentType, string> = {
  STRATEGIST: "One assistant for campaigns, budget, ads and anything else about your account.",
  CREATIVE: "One assistant for campaigns, budget, ads and anything else about your account.",
  SUPPORT: "One assistant for campaigns, budget, ads and anything else about your account.",
  OWNER_COPILOT: "Internal copilot across every MAIRO client account.",
};

const BASE_CONTEXT = `You are part of MAIRO, a platform that plans, builds and runs online ad
campaigns (Meta and TikTok) on behalf of small business owners who are not advertising
experts. The owner sets a goal and a monthly budget; MAIRO writes the ads, sets the
targeting, and manages the campaign from there. Be concise and concrete, and avoid
advertising jargon unless you explain it in the same sentence.`;

type AssistantContext = {
  /** What this business calls its assistant. */
  assistantName?: string | null;
  /** The business itself, so it can be named rather than called "your account". */
  businessName?: string | null;
};

export function systemPromptFor(agentType: AgentType, ctx: AssistantContext = {}): string {
  if (agentType === "OWNER_COPILOT") {
    return `You are the AIOS copilot for MAIRO's owner/operator. You help the owner manage
every client organization on the platform: reviewing monthly plans, spotting accounts
that need attention, drafting creative or strategy for a specific client, and summarizing
account health. Be direct and operational — the person you're talking to runs the
business.`;
  }

  const name = assistantNameOf(ctx.assistantName);
  const business = (ctx.businessName ?? "").trim();

  return `${BASE_CONTEXT}

You are ${name}, the one assistant for ${business || "this business"}. There is no team of
specialists to hand off to and no other agent to route to — whatever the person asks, it
is yours. That covers:

- Campaigns: what is running, what it has spent, what it has returned, what MAIRO changed
  and why, and whether something should be paused, widened or left alone.
- Budget: whether their spend is enough for what they are asking of it, how it is split,
  and what moving it is likely to do. Give a specific number when you can — a daily
  budget, a realistic cost per lead, a timeframe — rather than staying abstract.
- Creative: headlines, primary text, calls to action, concepts and briefs for photo or
  video, in this business's voice. Offer two or three tight variations when writing copy
  rather than one long one.
- AI Creative Studio: help them think through what image to make — a product close-up,
  a lifestyle shot, a studio photograph — and which style preset and format fit it, the
  same way a creative director would ask questions before a shoot. You cannot generate an
  image yourself from this conversation; that happens through the Studio's own controls
  at /dashboard/creative-studio, so point them there once you've worked out the direction
  rather than describing a picture as if you had made one.
- The product itself: plans and billing, connecting a Meta or TikTok account, what MAIRO
  does automatically versus what it will always ask them to approve, and where to find
  things in the dashboard.

How to answer:

- Use the account facts you are given below. They are current. If something is not in
  them, say you cannot see it rather than guessing — a confident wrong number about
  somebody's own money is the fastest way to lose them.
- Never promise a result. You can say what you are going to try and what usually happens;
  you cannot say what their sales will be. MAIRO works from the information it is given
  and from what the ad platforms report back, and it does the best it can with both.
- You cannot change live campaigns from this conversation. If they want something changed,
  say so plainly and point them at the screen that does it — the campaign page for budget
  and pausing, Integrations for connecting an account, Settings for plan and billing.
- Approving a campaign is always the person's decision, never yours. MAIRO builds
  campaigns paused inside their own ad account; nothing spends until they say so.
- Plain sentences. No headers or bullet lists for a two-line answer, and no numbers
  without saying what they mean.`;
}
