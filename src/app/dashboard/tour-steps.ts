import type { Step } from "@/components/tour";

// The business owner's walkthrough.
//
// Anchored to the sidebar rather than to content, because the sidebar is the
// one thing present on every dashboard screen — so the tour works wherever
// somebody happens to start it, and each step doubles as "here is where that
// lives".
//
// Written for someone who has never run an ad. It says what each screen is FOR
// in their terms, not in advertising terms: "what to spend and where", not
// "budget allocation across placements".


export const OWNER_TOUR: Step[] = [
  {
    title: "Thirty seconds and you'll know your way around",
    body:
      "Tell MAIRO what you want your business to achieve. It runs the marketing, shows you the results, and asks you only when it needs you.",
  },
  {
    target: "nav:/dashboard",
    title: "Overview",
    body:
      "Your goal, how it's going this month, what MAIRO is working on, and anything that needs you. If you only open one screen a week, this is it.",
  },
  {
    target: "create",
    title: "Create",
    body:
      "One button for everything you can start: a campaign, a creative, a promotion — or just tell MAIRO something new.",
  },
  {
    target: "nav:/dashboard/campaigns",
    title: "Campaigns",
    body:
      "Your ads, grouped as active, drafts, paused and completed. Open one for its results, creatives, audience, budget and history.",
  },
  {
    target: "nav:/dashboard/creatives",
    title: "Creatives",
    body:
      "Every ad image and video in one place: what's running, what's new and waiting for you, what ran before, and what's working best for your goal.",
  },
  {
    target: "nav:/dashboard/analytics",
    title: "Analytics",
    body:
      "Your results in plain numbers — and an Advanced view with every advertising metric, for when you want to dig in.",
  },
  {
    target: "nav:/dashboard/team",
    title: "Your AI Team",
    body:
      "Eight AI specialties — strategy, audience, creative, campaigns, optimization, budget, analytics and growth — and what each has really done. Ask them anything in plain English.",
  },
  {
    target: "nav:/dashboard/decisions",
    title: "Approvals",
    body:
      "Everything waiting for your say-so: launches, plans and the changes your AI team suggests, with the numbers behind them. Nothing changes until you approve.",
  },
  {
    target: "nav:/dashboard/settings",
    title: "Settings",
    body:
      "Your business profile, connected accounts, billing and everything else you set once and rarely touch.",
  },
  {
    title: "That's it",
    body:
      "Set your goal, approve what MAIRO asks you to, and get back to running your business.",
  },
];
