import { GOAL_LABEL, RETARGET_FROM, SLOW_BELOW, TEST_FROM, campaignTypeInfo, usd, type StrategyContent } from "./plan-logic";

// The parts of the free plan that follow from facts rather than from writing:
// which channel and objective, what tracking the campaign needs, how to test,
// the three creative directions, what's wrong with the landing page, and which
// of the plan's inputs are facts and which are MAIRO's assumptions.
//
// Pure, and built from the plan plus what MAIRO knows about the business's
// tracking — so it can't drift from the plan, and scripts/check-plan-guide.ts
// pins every rule. Nothing here promises a number of leads, sales or returns.

export type ChannelAdvice = {
  channel: string;
  objective: string;
  objectiveWhy: string;
  /** Why one campaign rather than a split, sized to the budget. */
  focusWhy: string;
  notOffered: string;
};

/** Which channel and objective, and why the budget belongs in one place. */
export function channelAdvice(p: StrategyContent): ChannelAdvice {
  const type = campaignTypeInfo(p.campaignType);
  const daily = p.dailyBudget;
  const focusWhy =
    daily < TEST_FROM
      ? `At ${usd(daily)} a day, one campaign with one audience learns fastest. Split across more, each part would get too little to tell what's working — so MAIRO keeps it in one place and lets Meta choose between Facebook and Instagram.`
      : `At ${usd(daily)} a day there's room to compare two audiences inside one campaign, still on one channel, so every result counts toward the same test.`;
  return {
    channel: "Meta — Facebook and Instagram, in one campaign",
    objective: `${GOAL_LABEL[p.goal]} — ${type.label}`,
    objectiveWhy: p.campaignTypeWhy || p.goalWhy || "It matches the goal you chose.",
    focusWhy,
    notOffered: "MAIRO doesn't run Google, TikTok or other ad networks, so it doesn't recommend them.",
  };
}

export type TrackingStatus = "in place" | "needed" | "not needed";
export type TrackingNeed = { what: string; why: string; status: TrackingStatus; href: string | null };

export type TrackingContext = {
  /** The Meta pixel is active on the business's website. */
  pixelActive: boolean;
  /** A store is sending orders to MAIRO. */
  storeConnected: boolean;
};

/** What has to be counted for the campaign to be judged, and whether it is yet. */
export function trackingNeeds(p: StrategyContent, ctx: TrackingContext): TrackingNeed[] {
  const destination = campaignTypeInfo(p.campaignType).destination;
  const needs: TrackingNeed[] = [];
  const pixel = (why: string): TrackingNeed => ({ what: "Meta pixel on your website", why, status: ctx.pixelActive ? "in place" : "needed", href: "/dashboard/tracking" });

  if (destination === "LEAD_FORM") {
    needs.push({ what: "Your lead form", why: "Enquiries land straight in MAIRO's Leads list. Nothing to install on your website.", status: "not needed", href: null });
  } else if (destination === "PHONE_CALL") {
    needs.push({ what: "Call taps", why: "Meta counts people tapping to call. It can't hear the call, so you mark which callers booked.", status: "not needed", href: null });
  } else if (destination === "DIRECT_MESSAGE") {
    needs.push({ what: "Conversations started", why: "Meta counts new conversations. You mark which became bookings or customers.", status: "not needed", href: null });
  } else if (p.goal === "SALES") {
    needs.push(pixel("So Meta can see purchases and show your ads to people likely to buy."));
    needs.push({
      what: "Orders from your store",
      why: "Real orders, counted server-side, so ad blockers and phone privacy settings don't hide sales.",
      status: ctx.storeConnected ? "in place" : "needed",
      href: "/dashboard/tracking",
    });
  } else if (destination === "WEBSITE") {
    needs.push(pixel("So Meta can see enquiries or bookings on your website and learn who to show your ads to."));
    needs.push({ what: "A thank-you or confirmation page", why: "The page people see after enquiring is how the pixel knows an enquiry happened.", status: ctx.pixelActive ? "in place" : "needed", href: "/dashboard/tracking" });
  }

  if (p.goal === "LEADS" || p.goal === "ENGAGEMENT") {
    needs.push({ what: "Marking what became of each lead", why: "Only you know which leads were good, booked or became customers. That's what tells a good campaign from a busy one.", status: "needed", href: "/dashboard/leads" });
  }
  return needs;
}

export type TestPhase = { when: string; what: string; why: string };

/**
 * When to look, what to change, and what not to touch. Slower at small
 * budgets, because fewer results take longer to mean anything.
 */
export function testingSchedule(p: StrategyContent): TestPhase[] {
  const slow = p.dailyBudget < SLOW_BELOW;
  const room = p.dailyBudget >= TEST_FROM;
  const learn = slow ? "Weeks 1–2" : "Week 1";
  const test = slow ? "Weeks 3–5" : "Weeks 2–3";
  const decide = slow ? "Week 6" : "Week 4";
  return [
    {
      when: learn,
      what: "Run the plan as approved and change nothing.",
      why: "Meta spends the first days learning who responds. Changing things restarts that, and early numbers swing a lot.",
    },
    {
      when: test,
      what: room ? "Test one thing: your second creative direction against the first, or a second audience." : "Test one thing: your second creative direction against the first.",
      why: "One change at a time, so the result says what caused it.",
    },
    {
      when: decide,
      what: "Compare cost per qualified lead or per sale — not clicks — and keep what's better.",
      why: slow
        ? "At this budget, results come slowly. If there still aren't enough to compare, the right step is to keep collecting data, not to change things."
        : "If one isn't clearly better yet, keep both running rather than guess.",
    },
    ...(p.dailyBudget >= RETARGET_FROM
      ? [{ when: "After that", what: "Add the retargeting step from this plan: people who visited but didn't enquire or buy.", why: "Once there's traffic worth reaching again." }]
      : []),
  ];
}

export type CreativeDirection = { title: string; angle: string; format: string; hook: string | null };

/** Exactly three directions — the plan's concepts, filled out from its hooks when it has fewer. */
export function creativeDirections(p: StrategyContent): CreativeDirection[] {
  const out: CreativeDirection[] = p.concepts.slice(0, 3).map((c, i) => ({
    title: c.title,
    angle: c.description,
    format: c.format === "carousel" ? "Carousel" : c.format === "video" ? "Video" : "Picture",
    hook: p.hooks[i] ?? null,
  }));
  const fillers: CreativeDirection[] = [
    { title: "The problem you solve", angle: "Open with the problem your customer has right now, then show you fix it.", format: "Picture", hook: null },
    { title: "Proof you're the right choice", angle: "Lead with what makes you different — experience, a guarantee you really offer, your reviews on Google or Facebook.", format: "Picture", hook: null },
    { title: "The offer", angle: p.offer ? `Lead with "${p.offer}" and a clear next step.` : "Lead with one simple next step: a free quote, a call, a booking.", format: "Picture", hook: null },
  ];
  for (const f of fillers) {
    if (out.length >= 3) break;
    if (!out.some((d) => d.title === f.title)) out.push({ ...f, hook: p.hooks[out.length] ?? null });
  }
  return out;
}

export type PlanFact = { label: string; value: string; source: string };
export type PlanAssumption = { label: string; assumed: string; fix: string; href: string };

export type FactInput = {
  website: string | null;
  pagesRead: string[];
  offering: string | null;
  location: string | null;
  offer: string | null;
  targetAudience: string | null;
  /** The budget the owner chose, or null when they said they didn't know. */
  monthlyBudgetCents: number | null;
};

/** What the plan is built on: what the business said or the website showed, and what MAIRO had to assume. */
export function factsAndAssumptions(p: StrategyContent, i: FactInput): { facts: PlanFact[]; assumptions: PlanAssumption[] } {
  const facts: PlanFact[] = [];
  const assumptions: PlanAssumption[] = [];
  const said = "You told MAIRO";
  if (i.offering) facts.push({ label: "What you do", value: i.offering, source: said });
  if (i.website) facts.push({ label: "Website", value: i.website, source: i.pagesRead.length ? `Read: ${i.pagesRead.slice(0, 3).join(", ")}` : "Not read yet" });

  if (i.location) facts.push({ label: "Where your customers are", value: i.location, source: said });
  else assumptions.push({ label: "Where your customers are", assumed: p.audience.location ? `MAIRO used "${p.audience.location}".` : "MAIRO assumed people near you.", fix: "Tell MAIRO your service area", href: "#plan-audience" });

  if (i.monthlyBudgetCents !== null) facts.push({ label: "Monthly budget", value: usd(i.monthlyBudgetCents / 100), source: said });
  else assumptions.push({ label: "Budget", assumed: `You weren't sure, so MAIRO used a starting budget of ${usd(p.dailyBudget)} a day.`, fix: "Change the budget", href: "#plan-budget" });

  if (i.offer) facts.push({ label: "Current offer", value: i.offer, source: said });
  else assumptions.push({ label: "Offer", assumed: "No offer — your ads won't promise a discount or deal you don't run.", fix: "Add an offer you really run", href: "#plan-offer" });

  if (i.targetAudience) facts.push({ label: "Who you want to reach", value: i.targetAudience, source: said });
  else assumptions.push({ label: "Who to reach", assumed: `MAIRO worked it out from your goal: ${p.audience.summary || `${p.audience.ageMin}–${p.audience.ageMax}, ${p.audience.location || "near you"}`}.`, fix: "Describe your best customers", href: "#plan-audience" });

  return { facts, assumptions };
}

export type LandingIssue = { issue: string; fix: string; severity: "high" | "medium" | "low" | null };

/** Problems with the page the ads will send people to — from the website reading, then the plan's own advice. */
export function landingIssues(p: StrategyContent, siteIssues: { issue: string; fix: string; severity?: "high" | "medium" | "low" }[]): LandingIssue[] {
  const fromSite = siteIssues.map((s) => ({ issue: s.issue, fix: s.fix, severity: s.severity ?? null }));
  const fromPlan = p.website.filter((w) => !fromSite.some((s) => s.issue === w)).map((w) => ({ issue: w, fix: "", severity: null }));
  return [...fromSite, ...fromPlan].slice(0, 6);
}
