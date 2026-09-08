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

export const OWNER_TOUR_KEY = "mairo.tour.business";

export const OWNER_TOUR: Step[] = [
  {
    title: "Ninety seconds and you'll know your way around",
    body:
      "You describe your business, MAIRO writes the plan and the ads, and the campaigns land in your own Meta account. Here's where each of those lives.",
  },
  {
    target: "nav:/dashboard",
    title: "Overview",
    body:
      "Where you land. What's running, what it's spending, and whether anything needs you. If you only open one screen a week, this is it.",
  },
  {
    target: "nav:/dashboard/plan",
    title: "Monthly plan",
    body:
      "MAIRO's actual thinking: what to spend, where to spend it, and what to expect this month. Read it once at the start of the month and you'll understand everything else.",
  },
  {
    target: "nav:/dashboard/creatives",
    title: "Creatives",
    body:
      "Send a photo of what you sell. You get back the picture, the headline and the words. Ask for changes as many times as you like — rewrites are free, only starting a new one counts.",
  },
  {
    target: "nav:/dashboard/campaigns",
    title: "Campaigns",
    body:
      "The ads themselves. Anything MAIRO builds arrives PAUSED in your ad account — nothing spends a penny until you switch it on yourself.",
  },
  {
    target: "nav:/dashboard/meta",
    title: "Meta connection",
    body:
      "Links MAIRO to your own Facebook and Instagram ad account. Until this is connected you can plan and design, but nothing can go live.",
  },
  {
    target: "nav:/dashboard/agents",
    title: "AI specialists",
    body:
      "Three of them, unlimited, and they know your business. \"Why did my cost per click go up?\" — ask in plain English and get a plain answer. Cheapest habit in the whole product.",
  },
  {
    target: "nav:/dashboard/settings",
    title: "Settings",
    body:
      "What MAIRO knows about your business, and your plan. If the ads ever sound wrong, it's usually because something here needs correcting — every ad is written from these answers.",
  },
  {
    title: "That's it",
    body:
      "Connect your ad account, read this month's plan, approve a creative. MAIRO builds the campaign paused and you turn it on when you're happy.",
  },
];
