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
      "Tell MAIRO what you want to advertise. It builds the campaign and the ads, shows you everything before it spends, and reports back on what worked.",
  },
  {
    target: "nav:/dashboard",
    title: "Overview",
    body:
      "How your ads are doing, anything waiting for your yes, and one box to tell MAIRO what you want. If you only open one screen, this is it.",
  },
  {
    target: "create",
    title: "New campaign",
    body:
      "Start a campaign from here: a fresh one, something new to promote, or the same as one you ran before with a change or two.",
  },
  {
    target: "nav:/dashboard/campaigns",
    title: "Campaigns",
    body:
      "Every campaign with its status, daily budget and results. Open one to pause it, change it or see its history.",
  },
  {
    target: "nav:/dashboard/creatives",
    title: "Creatives",
    body:
      "Your ad pictures, videos and headlines. Approve them, ask for changes, or make new ones — approved ones can go into any campaign.",
  },
  {
    target: "nav:/dashboard/results",
    title: "Results",
    body:
      "What you spent and what came back, in plain numbers, with what's working and what MAIRO recommends. Every figure comes from Meta or from leads you confirmed.",
  },
  {
    target: "nav:/dashboard/account",
    title: "Account",
    body:
      "Your business profile, Meta connection, tracking, billing, notifications and help. Things you set once and rarely touch.",
  },
  {
    title: "That's it",
    body:
      "Tell MAIRO what to advertise, approve what it shows you, and get back to running your business.",
  },
];
