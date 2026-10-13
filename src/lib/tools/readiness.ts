// Is this product or service ready to advertise? A checklist of things an
// owner can check for themselves. The score is "how many of these are true",
// which is all it is: it says nothing about whether the product will sell,
// and the page says so.

export type ReadinessAnswer = "yes" | "no" | "unsure";
export type ReadinessItem = {
  id: string;
  group: "Money" | "Proof" | "Delivery" | "Page" | "Customer";
  question: string;
  /** A "no" here means ads are likely to lose money or waste clicks — fix first. */
  blocker: boolean;
  why: string;
  /** What to do about a "no" or "unsure". */
  next: string;
  /** A free tool that helps answer it. */
  tool?: string;
};

export const READINESS_ITEMS: ReadinessItem[] = [
  { id: "margin", group: "Money", question: "Does each sale or job leave money after its own costs?", blocker: true, why: "If a sale loses money before advertising, ads only lose it faster.", next: "Work out your contribution per sale and break-even ROAS.", tool: "break-even-roas" },
  { id: "afford", group: "Money", question: "Do you know the most you can pay to win one customer?", blocker: true, why: "Without it there's no way to tell a working campaign from an expensive one.", next: "Use the cost-per-lead calculator or the lifetime calculator.", tool: "service-lead-economics" },
  { id: "budget", group: "Money", question: "Can you spend at least $5 a day for two to four weeks without needing it back straight away?", blocker: true, why: "Meta needs time and enough results to learn who responds; early results swing a lot.", next: "Plan a budget you can sustain for a month.", tool: "budget-planner" },
  { id: "capacity", group: "Delivery", question: "Could you handle more orders or jobs next month?", blocker: true, why: "Ads that bring work you can't deliver hurt reviews and waste spend.", next: "Decide how many extra customers you can take before starting." },
  { id: "fulfil", group: "Delivery", question: "Are delivery, booking or service terms clear and written down?", blocker: false, why: "Customers who know what happens next buy and book with less hesitation.", next: "Write the delivery, returns or booking terms on your page." },
  { id: "photos", group: "Proof", question: "Do you have clear photos or video of the product or your work?", blocker: false, why: "Real pictures of what people get are usually the strongest ad material you have.", next: "Take a few phone photos or a short clip of the product or a job." },
  { id: "reviews", group: "Proof", question: "Do you have real reviews or proof you're allowed to show?", blocker: false, why: "Proof answers \"can I trust them?\" — but only real, permitted proof.", next: "Collect reviews on Google or Facebook; never write your own." },
  { id: "page", group: "Page", question: "Does the page the ad sends people to load on a phone and say what you sell in one line?", blocker: true, why: "Most ad clicks are on phones; a confusing page wastes every click.", next: "Check it with the offer clarity checker.", tool: "offer-clarity" },
  { id: "cta", group: "Page", question: "Is there one obvious next step (buy, book, call, enquire)?", blocker: true, why: "People who can't see what to do next leave.", next: "Make one button the main action and repeat it." },
  { id: "tracking", group: "Page", question: "Will you know when an ad brings a lead or a sale?", blocker: false, why: "Without counting results, you can't tell which ads work.", next: "Set up your Meta pixel or a lead form; tag your links.", tool: "utm-builder" },
  { id: "customer", group: "Customer", question: "Can you describe your best customers in a sentence?", blocker: false, why: "Ads, audience and offer all start from who you're for.", next: "Write down who buys most, and why." },
  { id: "why-you", group: "Customer", question: "Can you say in one line why someone should choose you?", blocker: false, why: "It becomes your opening line and the reason the right people stop.", next: "Try the hook generator with what makes you different.", tool: "hook-generator" },
];

export type ReadinessResult = {
  yes: number;
  total: number;
  answered: number;
  blockersOpen: ReadinessItem[];
  recommendedOpen: ReadinessItem[];
  verdict: "ready" | "fix-blockers" | "incomplete";
};

export function scoreReadiness(answers: Record<string, ReadinessAnswer | undefined>): ReadinessResult {
  const open = READINESS_ITEMS.filter((i) => answers[i.id] !== "yes");
  const answered = READINESS_ITEMS.filter((i) => answers[i.id]).length;
  const blockersOpen = open.filter((i) => i.blocker);
  return {
    yes: READINESS_ITEMS.length - open.length,
    total: READINESS_ITEMS.length,
    answered,
    blockersOpen,
    recommendedOpen: open.filter((i) => !i.blocker),
    verdict: answered < READINESS_ITEMS.length ? "incomplete" : blockersOpen.length ? "fix-blockers" : "ready",
  };
}
