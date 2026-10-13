// What each tool page says beside the tool: how it works, every formula with
// its denominator, its limits, and where to go next. Rendered on the server,
// so the explanation is part of the page, not hidden behind the calculator.

export type ToolContent = {
  /** The page heading's supporting paragraph. */
  intro: string;
  method: { label: string; text: string }[];
  limits: string[];
  related: string[];
};

export const TOOL_CONTENT: Record<string, ToolContent> = {
  "break-even-roas": {
    intro: "Break-even ROAS is the return on ad spend at which an ad pays for the sale's own costs and nothing more. Below it, every sale from that ad loses money; above it, the sale helps pay for rent, wages and profit.",
    method: [
      { label: "Net revenue per sale", text: "Price × (1 − discount) × (1 − refund rate)." },
      { label: "Contribution per sale", text: "Net revenue − variable costs (product, delivery, payment fees, other per-sale costs)." },
      { label: "Break-even ROAS", text: "Net revenue ÷ contribution, when contribution is positive." },
      { label: "Break-even cost per sale", text: "The contribution itself: what one sale can cost in ads before it loses money." },
      { label: "Target ROAS", text: "Net revenue ÷ (contribution − the profit you want to keep per sale)." },
    ],
    limits: [
      "Before fixed costs: rent, wages and software still have to be paid from what's left.",
      "Refunds are treated as lost revenue with the item's costs still paid — the cautious case.",
      "ROAS here is revenue ÷ ad spend, the way Meta reports it. Meta's reported purchases may not match your store's.",
    ],
    related: ["margin-markup", "ad-roi", "customer-lifetime-value"],
  },
  "margin-markup": {
    intro: "Margin and markup both describe profit on a sale, but against different numbers. Margin is profit as a share of the price; markup is profit as a share of the cost. A 50% markup is only a 33% margin.",
    method: [
      { label: "Profit", text: "Price − cost." },
      { label: "Margin", text: "Profit ÷ price." },
      { label: "Markup", text: "Profit ÷ cost." },
      { label: "Price for a target margin", text: "Cost ÷ (1 − margin). No price gives a margin of 100% or more." },
      { label: "Price for a target markup", text: "Cost × (1 + markup)." },
    ],
    limits: ["Uses one cost. Shipping, payment fees and refunds belong in the break-even calculator."],
    related: ["break-even-roas", "shopify-fees", "monthly-profit"],
  },
  "ad-roi": {
    intro: "A scenario model: from your own guesses at cost per click and the share of clicks that buy, it shows clicks, sales, revenue and what's left after product costs and ad spend — for a conservative, base and optimistic case.",
    method: [
      { label: "Modeled clicks", text: "Ad budget ÷ cost per click." },
      { label: "Modeled sales", text: "Modeled clicks × conversion rate." },
      { label: "Revenue", text: "Modeled sales × price." },
      { label: "Left after product costs and ads", text: "Modeled sales × (price − variable cost) − ad budget." },
      { label: "ROAS", text: "Revenue ÷ ad budget." },
    ],
    limits: [
      "Every input is your assumption; none is a fact about your market. Results are scenarios, not forecasts.",
      "Leaves out fixed costs, so the bottom line isn't profit.",
      "Real cost per click and conversion change with your ad, offer, page, season and Meta's auction.",
    ],
    related: ["break-even-roas", "budget-planner", "service-lead-economics"],
  },
  "customer-lifetime-value": {
    intro: "What a customer contributes over a period you choose — counted in contribution, not revenue — and so the most it can make sense to pay to win one.",
    method: [
      { label: "Orders in year n", text: "Orders per year × (share still buying)^(n − 1). Year 1 counts every customer." },
      { label: "Lifetime contribution", text: "Contribution per order × total expected orders over the years you choose." },
      { label: "Most to pay to win a customer", text: "Lifetime contribution − the profit you want to keep per customer." },
    ],
    limits: [
      "Nothing after the last year counted is included — choose a period you'd actually wait to be paid back over.",
      "Paying more than one order's contribution to win a customer only works if they really come back; check with your own repeat-purchase data.",
    ],
    related: ["break-even-roas", "monthly-profit", "ad-roi"],
  },
  "monthly-profit": {
    intro: "One month in one view: sales, the costs that rise with sales, ad spend, fixed costs and software — including a MAIRO plan if you want to see it — and what's left.",
    method: [
      { label: "Contribution", text: "Sales − costs that rise with sales." },
      { label: "Operating profit", text: "Contribution − ad spend − fixed costs − software fees." },
      { label: "Ad spend at break-even", text: "Contribution − fixed costs − software fees: the most this month's ads could cost before the month loses money." },
    ],
    limits: ["Before tax, loan payments, owner's pay (unless you included it) and anything you didn't enter — so it isn't net profit.", "ROAS here divides all sales by ad spend, including sales that didn't come from ads."],
    related: ["break-even-roas", "budget-planner", "customer-lifetime-value"],
  },
  "service-lead-economics": {
    intro: "For businesses that sell jobs, appointments or projects: how much a lead can cost before it stops paying, from what a job is worth and how many leads book and become paid work.",
    method: [
      { label: "Contribution per job", text: "Job value − cost of doing the job." },
      { label: "Lead-to-paid-job rate", text: "Share of leads that book × share of bookings that become paid jobs — or your overall rate, if that's what you know. Never a mix of the two." },
      { label: "Break-even cost per lead", text: "Lead-to-paid-job rate × contribution per job." },
      { label: "Target cost per lead", text: "Lead-to-paid-job rate × (contribution per job − the profit you want to keep)." },
      { label: "Break-even cost per booking", text: "Share of bookings that pay × contribution per job." },
    ],
    limits: [
      "Before fixed costs.",
      "A booking-link click isn't a booking, and a booking isn't a paid job — use what actually happened.",
      "Rates from a handful of leads swing a lot; recheck after a month of real leads.",
    ],
    related: ["budget-planner", "ad-roi", "creative-brief"],
  },
  "budget-planner": {
    intro: "What a daily ad budget can realistically test, using the same rules as MAIRO's free plan, and whether it can reach the number of results Meta says an ad set usually needs to leave its learning phase.",
    method: [
      { label: "Monthly budget", text: "Daily budget × 30.4." },
      { label: "What it can test", text: "Below $10 a day: one ad set that learns slowly. From $30: room for a small retargeting step. From $60: two audiences inside one campaign. Ad versions: one under $10 a day, two from $10, three from $30." },
      { label: "Results a week", text: "Daily budget × 7 ÷ your estimated cost per result." },
      { label: "Meta's learning guideline", text: "About 50 results in 7 days for an ad set to usually leave its learning phase." },
    ],
    limits: ["Your cost-per-result estimate drives the learning figure; real costs vary.", "A bigger budget only helps if each result still pays for itself."],
    related: ["service-lead-economics", "break-even-roas", "creative-brief"],
  },
  "shopify-fees": {
    intro: "Compare Shopify's Basic, Grow and Advanced plans on what they'd cost for your sales: subscription, card fees, and Shopify's extra fee when you use a different payment provider.",
    method: [
      { label: "Subscription", text: "The plan's monthly price, billed monthly or yearly." },
      { label: "Card fees (Shopify Payments)", text: "Sales × online card rate + orders × fee per order." },
      { label: "With another provider", text: "Your provider's own fees, plus Shopify's transaction fee × sales." },
      { label: "Total", text: "Subscription + card fees + Shopify transaction fees." },
    ],
    limits: [
      "Starting rates are United States figures from public summaries, not confirmed against Shopify's own page; edit them to match your plan and country.",
      "Online card rates only: in-person rates, currency conversion, international cards, apps and themes aren't included.",
    ],
    related: ["margin-markup", "break-even-roas", "monthly-profit"],
  },
  "hook-generator": {
    intro: "Opening lines for ads, each from a different angle — the problem, the result, an objection, the offer, the place, proof, who it's for, the moment of need. Testing two angles teaches you more than testing two wordings of one.",
    method: [
      { label: "Built from your answers", text: "Each angle is a template filled only with what you entered. An angle whose ingredient is missing — no offer, no proof — is skipped, never invented." },
      { label: "Checked like a real ad", text: "Every hook runs through the same copy check MAIRO uses before a campaign: lines that imply something personal about the reader, or make unprovable claims, are flagged." },
      { label: "Suggested first test", text: "Two clean hooks from different angles, so the result tells you which reason to stop works better." },
    ],
    limits: ["Runs in your browser; no AI writes these, so they're plain by design. Edit them into your own voice.", "Which hook wins depends on your audience — that's what the test is for."],
    related: ["creative-brief", "ad-examples", "offer-clarity"],
  },
  "creative-brief": {
    intro: "A one-page brief for your first ad — objective, audience, message, must-haves, sizes and safe areas — and a first test that changes one thing, with the decision rule written down before the results come in.",
    method: [
      { label: "One variable", text: "Version A and B differ in one thing; everything else is held the same, so the result says what caused it." },
      { label: "Budget per version", text: "Daily budget ÷ 2. Under about $10 a day, two versions each get too little — run one now and the other next." },
      { label: "Expected length", text: "Results needed per version × your cost-per-result estimate ÷ budget per version." },
      { label: "Decision rule", text: "Wait for at least the results you set per version; keep the cheaper only if its cost per result is at least 20% lower; otherwise it's a tie." },
    ],
    limits: ["The decision rule is a rule of thumb against calling winners too early, not a test of statistical significance.", "Safe areas are approximate; check Meta's preview before publishing."],
    related: ["hook-generator", "budget-planner", "ad-examples"],
  },
  "offer-clarity": {
    intro: "Paste your page's headline, the line under it and the main button. The checker reports what a stranger arriving from an ad would still have to guess — and suggests clearer wording built only from what you tell it.",
    method: [
      { label: "What's checked", text: "Length, whether it names what you sell, who it's for and where, whether a price or first step is visible, whether the button says what happens next, vague words, claims that need proof, and undated urgency." },
      { label: "Evidence", text: "Every finding quotes the words it's about." },
      { label: "Not checked", text: "Anything that can't be judged from the words alone — like trust signals elsewhere on the page — is marked \"Not checked\" rather than guessed." },
    ],
    limits: ["A rubric about the words, not a forecast of conversion.", "Suggestions are ideas to test, built from your answers; they don't invent prices, offers or reviews."],
    related: ["hook-generator", "offer-readiness", "creative-brief"],
  },
  "ad-examples": {
    intro: "Example ads written by MAIRO for invented businesses — leads, bookings, sales and messages, in pictures, video, carousels and existing posts — each with why it works and what to test it against.",
    method: [
      { label: "Original", text: "Every example is MAIRO's own writing for a business that doesn't exist; none is a real ad or a copy of one." },
      { label: "Structure, not words", text: "Copy the structure — the angle, the order, the button — and fill it with your own true details." },
    ],
    limits: ["Prices, offers and proof in the examples belong to the invented business. In your ads, use only what's true for you."],
    related: ["hook-generator", "creative-brief", "competitor-ads"],
  },
  "offer-readiness": {
    intro: "Before spending on ads: a checklist of what an owner can check for themselves — money, delivery, proof, the page and the customer — with the must-haves separated from the nice-to-haves.",
    method: [
      { label: "Count", text: "How many items you answered \"Yes\" to, out of twelve." },
      { label: "Must-haves", text: "Items where a \"No\" usually means ads will lose money or waste clicks: margin, what you can pay, a sustainable budget, capacity, a clear page and one next step." },
    ],
    limits: ["A checklist, not a prediction: it can't tell you whether a product will sell. No tool honestly can."],
    related: ["break-even-roas", "offer-clarity", "budget-planner"],
  },
  "competitor-ads": {
    intro: "A guided way to see what competitors are advertising: MAIRO opens Meta's public Ad Library with the right search, gives you a template for notes, and turns the notes into original test ideas for your business.",
    method: [
      { label: "The search", text: "A link to Meta's public Ad Library, filtered to active ads in your country, with your search term." },
      { label: "Your notes", text: "How each ad opens, its offer, its format and when it started — in your words, saved on this device." },
      { label: "Test ideas", text: "Patterns in your notes turned into tests for your own business, never copies of someone else's ad." },
    ],
    limits: [
      "Guided, not automated: MAIRO doesn't collect ads for you and can't claim a complete list.",
      "The Library shows no spend or results. Long-running ads may be profitable, forgotten or brand ads; format mix isn't spend mix.",
    ],
    related: ["hook-generator", "ad-examples", "creative-brief"],
  },
  "utm-builder": {
    intro: "Tagged links for your ads, so your analytics can tell which campaign and ad sent each visitor — including Meta's dynamic values, which Meta fills in when the ad runs.",
    method: [
      { label: "Tags", text: "utm_source, utm_medium and utm_campaign are required; utm_content and utm_term are optional." },
      { label: "Your address", text: "Existing query parameters and #anchors are kept; an old utm value is replaced, not duplicated." },
      { label: "Meta's values", text: "{{campaign.name}}, {{ad.name}} and the rest stay unencoded so Meta can fill them; everything else is encoded." },
    ],
    limits: ["Tags label visits; they don't count leads or purchases on their own — that needs your Meta pixel or a lead form.", "Never put personal details (names, emails, phone numbers) in a link."],
    related: ["budget-planner", "creative-brief", "offer-clarity"],
  },
  "landing-page-audit": {
    intro: "What a visitor from an ad would find on your page — the three changes that matter most first, each with the evidence MAIRO saw, why it matters, a concrete change and wording you can use. Then everything else, including what a public check can't tell.",
    method: [
      { label: "What's read", text: "Your page plus up to three of your own pages (contact, booking, services, shop), and up to eight links, through MAIRO's server — public addresses only, every redirect checked, with time and size limits." },
      { label: "Three kinds of statement", text: "Seen on the page (a missing button, a broken link); MAIRO's judgement (a headline that doesn't say what you offer); and Not checked (does the form send? is it fast for real visitors?)." },
      { label: "Speed", text: "Measured only with Google's PageSpeed Insights, keeping the lab test and real-visitor data apart. Without it, speed is \"Not checked\" — never guessed from page size." },
      { label: "Suggested wording", text: "Built from what's on your site and what you type — no invented offers, reviews or prices, and no guarantees." },
    ],
    limits: [
      "A rubric, not a conversion forecast. Each change is a hypothesis until your results say otherwise.",
      "Pages behind a login and content that appears only after scripts run aren't seen.",
      "MAIRO can't edit your website — a web address doesn't give access to change it.",
    ],
    related: ["offer-clarity", "tracking-readiness", "competitor-website"],
  },
  "tracking-readiness": {
    intro: "Checks a page for Meta's pixel, Google Tag Manager, analytics tags and a consent banner — and says plainly what that does and doesn't prove, with the events a business like yours should send.",
    method: [
      { label: "Detected", text: "The pixel ID from the page's own fbq('init') call, Tag Manager and Google tag IDs, other ad tags, and known consent tools." },
      { label: "Can't tell from outside", text: "Shopify's web pixels run in a sandbox, Tag Manager tags load later, and consent tools hold tracking back until a visitor accepts — so \"not detected\" isn't proof of absence." },
      { label: "Events", text: "Purchase for shops; Lead (after the form is accepted), Schedule (when a booking is confirmed) and Contact for services — fired on the outcome, never on a click." },
    ],
    limits: ["A detected pixel doesn't prove events reach Meta. Only Meta's own records — checked after you connect — can.", "A tag doesn't mean a business is advertising on that platform now."],
    related: ["utm-builder", "landing-page-audit", "shopify-app-detector"],
  },
  "shopify-app-detector": {
    intro: "Which apps and scripts a Shopify store shows on its public pages — reviews, email, subscriptions, chat, page builders, payments — each with the evidence MAIRO matched.",
    method: [
      { label: "Signatures", text: "Each app is recognised by a file or address only that app loads, and the matched address is shown." },
      { label: "App extensions", text: "Shopify app extensions are counted, but Shopify's public files don't say which app each belongs to." },
    ],
    limits: ["\"Not detected\" doesn't mean \"not installed\": admin-only and checkout apps don't appear on public pages.", "Only apps MAIRO has a signature for are named."],
    related: ["shopify-theme-detector", "tracking-readiness", "landing-page-audit"],
  },
  "shopify-theme-detector": {
    intro: "The theme a Shopify store declares on its public pages — the name it uses, the original theme where shown, and whether it came from Shopify's Theme Store.",
    method: [
      { label: "Where it comes from", text: "Shopify stores publish a small Shopify.theme object in the page; MAIRO reads the name and Theme Store ID from it and shows the snippet." },
      { label: "Unknown", text: "When the page doesn't declare it, the answer is unknown — not a guess." },
    ],
    limits: ["Stores can rename their theme, so the name may not be the original.", "Custom themes have no Theme Store ID."],
    related: ["shopify-app-detector", "shopify-fees", "landing-page-audit"],
  },
  "competitor-website": {
    intro: "Your website and up to two competitors', side by side: headline, main button, offers, prices shown, where they work, proof, how to buy or book, and brand presentation — only what's on the public pages.",
    method: [
      { label: "Same reading for each", text: "Each site is read the same way as the landing page audit, through MAIRO's server, with the same limits." },
      { label: "Only what's shown", text: "Every cell is something on the page or in its structured data; \"None found\" when it isn't." },
    ],
    limits: ["No traffic, revenue, bestsellers or ad spend — none of that is visible on a website, and MAIRO doesn't estimate it.", "Use it to find what's true about you that they don't say — not to copy their words or pictures."],
    related: ["landing-page-audit", "competitor-ads", "offer-clarity"],
  },
};
