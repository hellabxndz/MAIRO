// Checks the top of the Overview answers its three questions from the
// account's real state, with exactly one primary button:
//
//   - Meta not connected → "Connect Meta", before anything else.
//   - A first campaign built and waiting → "Review and approve"; a shop
//     whose purchases aren't verified is sent to verify tracking first.
//   - Approved and waiting on Meta → nothing asked of the owner.
//   - Approvals waiting → the Approval Center.
//   - Results: the figures Meta reported, or pending / unavailable — never
//     a zero that wasn't reported.
//   - Leads businesses see leads and cost per lead; ROAS only for sales.
//
//   npm run check:right-now   (pure; no database, no network)

import { rightNow, type RightNowInput } from "../src/lib/dashboard/right-now";

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  if (!cond) {
    failures++;
    console.log(`  FAIL  ${name} ${extra}`);
  } else console.log(`  ok    ${name}`);
}

const none = { spend: null, results: null, resultsLabel: "Leads", cost: null, costLabel: "Cost per lead", roas: null };
const base: RightNowInput = {
  journey: null,
  meta: "connected",
  blocker: null,
  approvals: 0,
  campaigns: { live: 0, review: 0, paused: 0, total: 0 },
  purchaseTracking: null,
  figures: none,
  unreadable: false,
  mode: null,
};
const run = (over: Partial<RightNowInput>) => rightNow({ ...base, ...over });

console.log("Paid, Meta not connected");
{
  const r = run({ journey: "connect", meta: "none" });
  check("asks to connect Meta", r.needs?.cta === "Connect Meta");
  check("the button goes to the checklist that holds the connect flow", r.primary.href === "/dashboard/launch");
  check("says MAIRO is waiting for Meta", /waiting for your Meta ad account/.test(r.doing));
  check("results are pending, not zero", r.results.state === "pending" && !/\$0|0 leads/.test(r.results.text));
}
{
  const r = run({ journey: "connect", meta: "none", approvals: 2, blocker: { title: "x", why: "y", href: "/z", cta: "Fix" } });
  check("Meta comes before everything else", r.needs?.cta === "Connect Meta");
}

console.log("Connected, building, reviewing");
{
  const r = run({ journey: "build" });
  check("build: one button to build", r.primary.cta === "Build my campaign" && r.primary.href === "/dashboard/launch");
}
{
  const r = run({ journey: "review" });
  check("review: approve the first campaign", r.primary.cta === "Review and approve");
  check("review: says nothing is spent before approval", /nothing is spent until you approve/i.test(r.needs?.text ?? ""));
}
{
  const r = run({ journey: "review", purchaseTracking: { verified: false, declined: false, title: "Meta hasn't seen a purchase from your website yet", href: "/dashboard/pixel" } });
  check("shop, purchases unverified: verify tracking before launch", r.primary.href === "/dashboard/pixel" && r.primary.cta === "Verify purchase tracking");
  check("shop: tracking shown as not verified", r.tracking?.verified === false && /not verified/i.test(r.tracking.text));
}
{
  const r = run({ journey: "review", purchaseTracking: { verified: true, declined: false, title: null, href: "/dashboard/pixel" } });
  check("shop, verified: approve, and tracking shown verified", r.primary.cta === "Review and approve" && r.tracking?.verified === true);
}
{
  const r = run({ journey: "build", blocker: { title: "Add a payment method in Meta", why: "Meta can't charge for your ads.", href: "https://business.facebook.com/billing", cta: "Fix in Meta" } });
  check("a blocker comes before building", r.primary.cta === "Fix in Meta");
}

console.log("Approved, waiting for Meta");
{
  const r = run({ journey: "waiting", campaigns: { live: 0, review: 1, paused: 0, total: 1 } });
  check("nothing asked of the owner", r.needs === null);
  check("says MAIRO switches it on itself", /switches it on/.test(r.doing));
  check("results pending with when to expect them", r.results.state === "pending" && /few hours/.test(r.results.text));
  check("primary goes to Results", r.primary.href === "/dashboard/results");
}

console.log("Running");
{
  const r = run({ campaigns: { live: 2, review: 0, paused: 0, total: 2 }, mode: "Autopilot", figures: { ...none, spend: "$84.10", results: "6", cost: "$14.02" } });
  check("plain-English status", r.doing.startsWith("Running 2 campaigns"));
  check("leads: leads and cost per lead, no ROAS", r.results.text === "$84.10 spent · 6 leads · $14.02 cost per lead");
  check("nothing needed → View results", r.needs === null && r.primary.cta === "View results");
}
{
  const r = run({ campaigns: { live: 1, review: 0, paused: 0, total: 1 }, figures: { spend: "$50.00", results: "3", resultsLabel: "Purchases", cost: "$16.67", costLabel: "Cost per purchase", roas: "2.40×" }, purchaseTracking: { verified: true, declined: false, title: null, href: "/dashboard/pixel" } });
  check("sales: spend, purchases, cost per purchase, ROAS", r.results.text === "$50.00 spent · 3 purchases · $16.67 cost per purchase · 2.40× ROAS");
}
{
  const r = run({ campaigns: { live: 1, review: 0, paused: 0, total: 1 }, approvals: 1 });
  check("one approval waiting → Approval Center", r.primary.href === "/dashboard/decisions" && /1 change is waiting/.test(r.needs?.text ?? ""));
}
{
  const r = run({ campaigns: { live: 1, review: 0, paused: 0, total: 1 }, unreadable: true });
  check("Meta unreadable → unavailable, not zero", r.results.state === "unavailable" && /unknown, not zero/.test(r.results.text));
}
{
  const r = run({ campaigns: { live: 0, review: 0, paused: 2, total: 2 } });
  check("paused: says nothing is being spent", /paused, so nothing is being spent/.test(r.doing));
}
{
  const r = run({ campaigns: { live: 1, review: 0, paused: 0, total: 1 }, purchaseTracking: { verified: false, declined: true, title: null, href: "/dashboard/pixel" } });
  check("declined tracking isn't nagged as a to-do", r.needs === null && r.tracking?.verified === false && /your choice/.test(r.tracking.text));
}

{
  const r = run({ meta: "attention", campaigns: { live: 1, review: 0, paused: 0, total: 1 }, blocker: { title: "Connect your Meta ad account", why: "Sign in with the Facebook account that manages your ads.", href: "/dashboard/meta", cta: "Fix this" } });
  check("broken Meta connection: never claims MAIRO is checking the campaigns", /lost its connection/.test(r.doing) && !/checking it every day/.test(r.doing));
  check("broken Meta connection: the button says Reconnect Meta", r.primary.cta === "Reconnect Meta" && r.primary.href === "/dashboard/meta");
}

console.log("Exactly one primary action, always");
const states: Partial<RightNowInput>[] = [
  { journey: "connect", meta: "none" }, { journey: "build" }, { journey: "review" }, { journey: "waiting" },
  { campaigns: { live: 1, review: 0, paused: 0, total: 1 } }, {}, { approvals: 3 },
];
check("every state has a primary button with a destination", states.every((s) => { const r = run(s); return Boolean(r.primary.href && r.primary.cta); }));
check("when something needs the owner, the button is that thing", states.every((s) => { const r = run(s); return !r.needs || r.needs.href === r.primary.href; }));

if (failures) {
  console.log(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll right-now checks passed.");
