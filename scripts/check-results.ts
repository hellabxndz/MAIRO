// Checks the Results figures can't claim more than the records hold.
//
//   - The figures follow the kind of business: a shop sees sales, a roofer
//     sees leads, bookings and jobs.
//   - Nothing unknown reads as zero; each gap says why and where to fix it.
//   - What Meta reports is never a confirmed customer.
//   - A return on ad spend appears only where attribution supports it.
//   - The budget suggestion waits while lead quality is being looked into.
//
//   npm run check:results   (pure; no database, no network)

import { resultsKind, resultsModel, type ResultsInput, type ResultsLead } from "../src/lib/results/model";
import { recommendNext, reportRange } from "../src/lib/reports/monthly";
import { coachExample } from "../src/lib/coach/example";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  if (!cond) {
    failures++;
    console.log(`  FAIL  ${name} ${extra}`);
  } else console.log(`  ok    ${name}`);
}

const LABELS = { QUALIFIED: "Good lead", BOOKED: "Inspection booked", WON: "Job won" };
const base: ResultsInput = {
  kind: "leads",
  labels: LABELS,
  meta: { spendCents: 60_000, clicks: 1_180, leads: 25, purchases: null, revenueCents: null },
  metaProblem: null,
  leads: [],
  store: { connected: false, orders: 0, valueCents: 0 },
  salesTracked: false,
};
const many = (k: number, l: ResultsLead) => Array.from({ length: k }, () => ({ ...l }));
const metric = (m: ReturnType<typeof resultsModel>, key: string) => m.metrics.find((x) => x.key === key)!;

console.log("\n— the figures follow the kind of business —");
check("an online shop is measured in sales", resultsKind({ nicheId: "ecommerce", nicheConfirmed: true, industry: null, goal: null, objectives: [], storedLeads: 0 }).kind === "sales");
check("a confirmed home-services business in leads and bookings", resultsKind({ nicheId: "home_services", nicheConfirmed: true, industry: null, goal: null, objectives: ["SALES"], storedLeads: 0 }).kind === "leads");
check("an unconfirmed guess gives way to what the campaigns aim for", resultsKind({ nicheId: "automotive", nicheConfirmed: false, industry: "Car detailing", goal: null, objectives: ["SALES"], storedLeads: 0 }).kind === "sales");
check("lead campaigns mean leads, whatever the guess", resultsKind({ nicheId: "ecommerce", industry: null, goal: null, objectives: ["LEADS"], storedLeads: 0 }).kind === "leads");
check("a roofer's own words are enough", resultsKind({ nicheId: null, industry: "Roofing contractor", goal: null, objectives: [], storedLeads: 0 }).kind === "leads");
check("unknown trade, sales campaigns only → sales", resultsKind({ nicheId: "general", industry: null, goal: null, objectives: ["SALES"], storedLeads: 0 }).kind === "sales");
check("unknown trade with enquiries coming in → leads", resultsKind({ nicheId: "general", industry: null, goal: null, objectives: ["SALES"], storedLeads: 3 }).kind === "leads");
check("and the page can say why", resultsKind({ nicheId: "ecommerce", industry: null, goal: null, objectives: [], storedLeads: 0 }).why.includes("online shop"));
const leadKeys = resultsModel(base).metrics.map((m) => m.key).join(",");
check("a leads business sees the nine figures, in order", leadKeys === "spend,leads,qualified,booked,customers,costPerQualified,cac,verifiedRevenue,roas", leadKeys);
const salesKeys = resultsModel({ ...base, kind: "sales" }).metrics.map((m) => m.key).join(",");
check("a shop sees sales figures instead", salesKeys === "spend,purchases,costPerPurchase,metaRevenue,roas,storeOrders,verifiedRevenue", salesKeys);
const journey = resultsModel(base).journey.map((j) => j.label).join(" → ");
check("the journey runs from advertising to revenue", journey === "Advertising → Leads → Qualified leads → Bookings → Customers → Revenue", journey);

console.log("\n— nothing unknown reads as zero —");
const unmarked = resultsModel({ ...base, leads: many(25, { status: "NEW", valueCents: null, attributed: true }) });
for (const k of ["qualified", "booked", "customers", "costPerQualified", "cac", "verifiedRevenue", "roas"]) {
  const m = metric(unmarked, k);
  check(`${k}: no figure until leads are marked`, m.value === null && m.missing !== null, String(m.value));
}
check("and it says where to mark them", metric(unmarked, "qualified").missing?.href === "/dashboard/leads");
check("the leads that came in are still counted", metric(unmarked, "leads").value === "25");
const noData = resultsModel({ ...base, meta: { spendCents: null, clicks: null, leads: null, purchases: null, revenueCents: null } });
check("no spend reads as missing, not $0", metric(noData, "spend").value === null);
check("no $0 anywhere when nothing is known", !JSON.stringify(noData.metrics.map((m) => m.value)).includes("$0"));
const metaDown = resultsModel({ ...base, meta: null, metaProblem: "token expired" });
check("Meta unreadable is said as such", /couldn't read Meta/.test(metric(metaDown, "spend").missing?.why ?? ""), metric(metaDown, "spend").missing?.why);

console.log("\n— a roofer with 25 leads, 4 qualified —");
const roofer = resultsModel({
  ...base,
  leads: [
    ...many(1, { status: "WON", valueCents: 940_000, attributed: true }),
    ...many(1, { status: "BOOKED", valueCents: null, attributed: true }),
    ...many(2, { status: "QUALIFIED", valueCents: null, attributed: true }),
    ...many(14, { status: "LOST", valueCents: null, attributed: true }),
    ...many(3, { status: "SPAM", valueCents: null, attributed: false }),
    ...many(4, { status: "NEW", valueCents: null, attributed: true }),
  ],
});
check("qualified counts every lead marked good or further", metric(roofer, "qualified").value === "4");
check("booked counts bookings and customers", metric(roofer, "booked").value === "2");
check("one confirmed customer", metric(roofer, "customers").value === "1");
check("cost per qualified lead = spend ÷ 4", metric(roofer, "costPerQualified").value === "$150.00", metric(roofer, "costPerQualified").value ?? "");
check("customer acquisition cost = spend ÷ 1", metric(roofer, "cac").value === "$600.00", metric(roofer, "cac").value ?? "");
check("verified revenue is what the business recorded", metric(roofer, "verifiedRevenue").value === "$9,400");
check("return from the ad-linked customer", metric(roofer, "roas").value === "15.7×" && roofer.verifiedRoas !== null, metric(roofer, "roas").value ?? "");
const quality = roofer.journey.find((j) => j.key === "qualified")!;
check("the qualified rate is of the leads judged, not of all leads", quality.rate === "19% of those you judged", quality.rate ?? "");
check("unmarked leads are called out", roofer.notes.some((n) => /4 leads aren't marked/.test(n)), roofer.notes.join(" | "));
check("every figure names its source", roofer.metrics.every((m) => Boolean(m.source)));

console.log("\n— Meta's count is never a customer —");
const metaOnly = resultsModel({ ...base, meta: { spendCents: 60_000, clicks: 900, leads: 40, purchases: 12, revenueCents: 300_000 } });
check("Meta's leads are shown as Meta's", metric(metaOnly, "leads").value === "40" && metric(metaOnly, "leads").source === "Meta");
check("but no customers follow from them", metric(metaOnly, "customers").value === null);
check("and no verified return", metric(metaOnly, "roas").value === null && metaOnly.verifiedRoas === null);

console.log("\n— a return only where attribution supports it —");
const unlinked = resultsModel({ ...base, leads: many(2, { status: "WON", valueCents: 500_000, attributed: false }) });
check("customers not linked to a campaign give no return", metric(unlinked, "roas").value === null, metric(unlinked, "roas").value ?? "");
check("and it says why", /aren't linked to a campaign/.test(metric(unlinked, "roas").missing?.why ?? ""));
check("their value still counts as confirmed revenue", metric(unlinked, "verifiedRevenue").value === "$10,000");
const shop = resultsModel({ ...base, kind: "sales", meta: { spendCents: 100_000, clicks: 5_000, leads: null, purchases: 40, revenueCents: 420_000 }, store: { connected: true, orders: 61, valueCents: 610_000 }, salesTracked: true });
check("a shop's return is Meta's estimate, and says so", metric(shop, "roas").value === "4.2×" && /Meta's estimate/.test(metric(shop, "roas").label));
check("store orders are shown from every source", metric(shop, "storeOrders").value === "61" && /every source/.test(metric(shop, "storeOrders").hint));
check("store sales are never divided by ad spend", shop.verifiedRoas === null && !shop.metrics.some((m) => m.value === "6.1×"));
check("Meta's and the store's counts are said not to match", shop.notes.some((n) => /won't match/.test(n)));
const shopNoStore = resultsModel({ ...base, kind: "sales", meta: { spendCents: 100_000, clicks: 5_000, leads: null, purchases: null, revenueCents: null } });
check("no store: asks to connect it", metric(shopNoStore, "storeOrders").missing?.action === "Connect your store");
check("no pixel: asks to set up tracking", metric(shopNoStore, "purchases").missing?.action === "Set up tracking");

console.log("\n— the budget suggestion —");
const hold = recommendNext(60_000, 4, { hold: "Your Performance Coach is looking into lead quality" });
check("waits while lead quality is looked into", hold.cents === 60_000 && /lead quality/.test(hold.why));
check("Meta's return is called Meta's", /Meta reports/.test(recommendNext(60_000, 3, { basis: "meta" }).why));
check("a verified return is not", !/Meta/.test(recommendNext(60_000, 3, { basis: "verified" }).why.split(" It is")[0]));
check("still never a leap", (recommendNext(60_000, 9, { basis: "verified" }).cents ?? 0) <= 60_000 * 1.5);

console.log("\n— this month so far —");
const now = new Date(2026, 9, 9, 14, 30);
const cur = reportRange({ year: 2026, month: 9 }, now);
check("the running month ends now", cur.partial && cur.until.getTime() === now.getTime());
const past = reportRange({ year: 2026, month: 8 }, now);
check("a finished month is whole", !past.partial && past.until.getDate() === 30);

console.log("\n— the landing page's example comes from the real engine —");
const unmarkedEx = coachExample("unmarked");
check("leads not marked: no verdict on quality", unmarkedEx.finding === null);
check("…and it asks for the leads to be marked", unmarkedEx.gaps.some((g) => g.key === "mark-leads"));
check("…with qualified, bookings and customers unknown, not zero", unmarkedEx.journey.filter((j) => ["qualified", "booked", "customers"].includes(j.key)).every((j) => j.value === null));
const markedEx = coachExample("marked");
const jx = Object.fromEntries(markedEx.journey.map((j) => [j.key, j.value]));
check("25 leads, 4 qualified", jx.leads === "25" && jx.qualified === "4", JSON.stringify(jx));
check("the engine flags lead quality", markedEx.finding?.title === "Most leads aren't turning out to be good ones", markedEx.finding?.title);
check("…before more budget", /before spending more/.test(markedEx.finding?.plain ?? "") && (markedEx.finding?.steps ?? []).some((s) => s.title === "Hold off on more budget"));
check("…with possible reasons only — no cause claimed", (markedEx.finding?.explanations ?? []).every((e) => e.basis === "possibility"));
check("…recommending investigation before any targeting change", /before changing any targeting/.test(markedEx.finding?.recommendation ?? ""));
check("…and saying it can't prove why", /can't prove why/.test(markedEx.finding?.limitations ?? ""));
check("…and what's missing", (markedEx.finding?.missing ?? []).length > 0);
const reasonsEx = coachExample("reasons");
check("with reasons recorded, the records are cited", (reasonsEx.finding?.explanations ?? []).some((e) => e.basis === "evidence"));
check("…and it still isn't called proof", /can't prove why/.test(reasonsEx.finding?.limitations ?? ""));
const exampleSrc = readFileSync("src/lib/coach/example.ts", "utf8");
check("the example never touches the database", !/@\/lib\/db|from "\.\/gather"|prisma/i.test(exampleSrc.replace(/@\/generated\/prisma\/enums/g, "")));
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const users = walk("src").filter((f) => /\.(ts|tsx)$/.test(f) && f !== join("src", "lib", "coach", "example.ts") && readFileSync(f, "utf8").includes("coach/example"));
check("and only the public landing page uses it", users.length > 0 && users.every((f) => f === join("src", "app", "page.tsx") || f.startsWith(join("src", "components", "landing"))), users.join(", "));

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
