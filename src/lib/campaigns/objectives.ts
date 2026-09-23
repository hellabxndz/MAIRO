import type { AdDestination, AdGoal } from "@/generated/prisma/enums";

// The six things a campaign can be for, in the customer's words, each tied to
// the Meta objective it actually launches with and to the destinations MAIRO
// can really build for it. The Create flow and createCampaignAction both read
// this, so the screen can never offer a combination the launch would refuse.

export type GoalOption = {
  goal: AdGoal;
  label: string;
  description: string;
  /** The Meta campaign objective this becomes (see metaObjectiveFor). */
  metaObjective: string;
  /** No TikTok equivalent is built for this goal. */
  metaOnly: boolean;
};

export const GOAL_OPTIONS: GoalOption[] = [
  {
    goal: "SALES",
    label: "Get More Sales",
    description: "Find people who are more likely to purchase your products or services.",
    metaObjective: "OUTCOME_SALES",
    metaOnly: false,
  },
  {
    goal: "TRAFFIC",
    label: "Get More Website Visitors",
    description: "Bring more people to your website, store, or online destination.",
    metaObjective: "OUTCOME_TRAFFIC",
    metaOnly: false,
  },
  {
    goal: "ENGAGEMENT",
    label: "Get More Messages & Engagement",
    description:
      "Encourage people to message your business, or like, comment on and share your ad.",
    metaObjective: "OUTCOME_ENGAGEMENT",
    metaOnly: true,
  },
  {
    goal: "LEADS",
    label: "Find Potential Customers",
    description: "Collect contact information from people interested in your business.",
    metaObjective: "OUTCOME_LEADS",
    metaOnly: false,
  },
  {
    goal: "AWARENESS",
    label: "Get Your Business Noticed",
    description: "Introduce your business to more people and increase awareness.",
    metaObjective: "OUTCOME_AWARENESS",
    metaOnly: false,
  },
  {
    goal: "APP_PROMOTION",
    label: "Get More App Users",
    description: "Encourage people to download or use your mobile application.",
    metaObjective: "OUTCOME_APP_PROMOTION",
    metaOnly: true,
  },
];

export function goalOption(goal: AdGoal): GoalOption {
  return GOAL_OPTIONS.find((g) => g.goal === goal) ?? GOAL_OPTIONS[0];
}

export type DestinationOption = { type: AdDestination; label: string; sub: string };

const DESTINATION_OPTIONS: Record<AdDestination, DestinationOption> = {
  WEBSITE: { type: "WEBSITE", label: "Your website", sub: "A page on your site — your homepage or a specific product" },
  PHONE_CALL: { type: "PHONE_CALL", label: "A phone call", sub: "A button that rings your business" },
  LEAD_FORM: { type: "LEAD_FORM", label: "A quick form", sub: "People leave their details without leaving the ad" },
  DIRECT_MESSAGE: { type: "DIRECT_MESSAGE", label: "A message", sub: "Messenger, Instagram Direct or WhatsApp" },
  POST_ENGAGEMENT: { type: "POST_ENGAGEMENT", label: "Likes, comments and shares", sub: "People react to the ad itself" },
  APP: { type: "APP", label: "Your app", sub: "Its App Store or Google Play listing" },
};

/**
 * Where a click can go for each goal — only what MAIRO can actually build.
 *
 * Sales needs a website: that is where purchases are tracked. Messages and
 * engagement never leave Facebook and Instagram. An app campaign only goes to
 * its store listing.
 */
const DESTINATIONS_FOR: Record<AdGoal, AdDestination[]> = {
  SALES: ["WEBSITE"],
  TRAFFIC: ["WEBSITE", "PHONE_CALL", "DIRECT_MESSAGE"],
  ENGAGEMENT: ["DIRECT_MESSAGE", "POST_ENGAGEMENT"],
  LEADS: ["LEAD_FORM", "WEBSITE", "PHONE_CALL", "DIRECT_MESSAGE"],
  AWARENESS: ["WEBSITE", "PHONE_CALL"],
  APP_PROMOTION: ["APP"],
};

export function destinationsFor(goal: AdGoal): DestinationOption[] {
  return DESTINATIONS_FOR[goal].map((d) => DESTINATION_OPTIONS[d]);
}

export function supportsDestination(goal: AdGoal, destination: AdDestination): boolean {
  return DESTINATIONS_FOR[goal].includes(destination);
}

/** What the customer said they're advertising, on the first screen. */
export const PROMOTES_OPTIONS = [
  { value: "BUSINESS", label: "My entire business" },
  { value: "PRODUCT", label: "A specific product" },
  { value: "SERVICE", label: "A service" },
  { value: "POST", label: "An existing social media post" },
  { value: "OFFER", label: "A special offer or promotion" },
  { value: "APP", label: "My mobile application" },
  { value: "OTHER", label: "Something else" },
] as const;

export type Promotes = (typeof PROMOTES_OPTIONS)[number]["value"];

/**
 * The goal MAIRO suggests, from what they're advertising and how they reach
 * customers. A suggestion only — it is marked "AI Recommended" and never chosen
 * for them. Sales is only suggested when purchases can actually be measured.
 */
export function recommendedGoal(input: {
  promotes: Promotes | null;
  defaultDestination: AdDestination;
  hasActivePixel: boolean;
}): AdGoal {
  if (input.promotes === "APP") return "APP_PROMOTION";
  if (input.promotes === "POST") return "ENGAGEMENT";
  if (input.defaultDestination === "PHONE_CALL" || input.defaultDestination === "LEAD_FORM") {
    return "LEADS";
  }
  if (input.defaultDestination === "DIRECT_MESSAGE") return "ENGAGEMENT";
  if (input.promotes === "PRODUCT" || input.promotes === "OFFER") {
    return input.hasActivePixel ? "SALES" : "TRAFFIC";
  }
  if (input.promotes === "SERVICE") return "LEADS";
  return input.hasActivePixel ? "SALES" : "TRAFFIC";
}

/**
 * The destinations a goal offers for a service. TikTok ads link to a website
 * only, so a campaign that includes TikTok offers only that.
 */
export function destinationsForService(goal: AdGoal, service: "meta" | "tiktok" | "multi"): DestinationOption[] {
  const all = destinationsFor(goal);
  return service === "meta" ? all : all.filter((d) => d.type === "WEBSITE");
}
