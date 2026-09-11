import type { Step } from "@/components/tour";

// The freelancer walkthrough. Kept next to the screens it points at, so
// renaming a target and forgetting the step is hard to do.


export const FREELANCER_TOUR: Step[] = [
  {
    title: "Two minutes, and you'll know the whole thing",
    body:
      "This is your studio — the account you pay from. Every business you run ads for lives inside it. Let's walk through it.",
  },
  {
    target: "list",
    title: "Your clients",
    body:
      "One row per business you run ads for. Each has its own Meta ad account, its own campaigns and its own creatives — nothing is shared between them.",
  },
  {
    target: "open",
    title: "Open takes you inside",
    body:
      "This is the important one. Opening a client puts every screen — plan, campaigns, creatives, the AI — into that business's account. Their name stays at the top so you always know whose ads you're editing.",
  },
  {
    target: "add",
    title: "Adding a business",
    body:
      "A name is enough to start. You'll be dropped straight into their setup, where you describe the business — that description is what every plan and every ad gets written from.",
  },
  {
    target: "checklist",
    title: "Where you're up to",
    body:
      "This ticks itself off as you actually do things, so it doubles as a status board. If one client still has no ad account connected, you'll see it here.",
  },
  {
    target: "guide",
    title: "The long version",
    body:
      "Everything in more depth — briefs, connecting Meta, why campaigns arrive paused, which specialist to ask what. Worth ten minutes at some point.",
  },
  {
    target: "billing",
    title: "Your plan",
    body:
      "Your subscription and how many client slots it covers. Your clients are never billed and never log in — this is all you.",
  },
  {
    title: "That's the whole thing",
    body:
      "Add a client, describe their business, connect their ad account, and let MAIRO write the plan. You approve; it builds the campaigns paused, so nothing spends until you say so.",
  },
];
