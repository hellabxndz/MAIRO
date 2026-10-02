// The MAIRO Business Brain: what it keeps, and why.
//
// One shared understanding of each business that every part of MAIRO reads —
// campaigns, creatives, the strategy engine, the Campaign Review, Social
// Manager, the assistant and reports. Not a memory per feature.
//
// Every fact here earns its place: each has a `purpose` saying how it can
// improve a future marketing decision. Anything that can't answer that isn't
// stored. Client-safe (no database), so the Business Brain page can use it.

export type FactSource =
  | "customer"
  | "website"
  | "meta"
  | "performance"
  | "social"
  | "assistant"
  | "import"
  | "admin";

export const SOURCE_LABEL: Record<FactSource, string> = {
  customer: "You told MAIRO",
  website: "From your website",
  meta: "From your Meta account",
  performance: "Learned from your results",
  social: "From Social Manager",
  assistant: "From a chat with MAIRO",
  import: "Imported",
  admin: "Updated by MAIRO support",
};

/**
 * Confirmed: the business said it (or confirmed it). Inferred: MAIRO read or
 * worked it out, and the business hasn't confirmed it yet. A confirmed fact
 * is never overwritten by an inference.
 */
export type FactStatus = "confirmed" | "inferred";

/** Sources that are the business speaking. Anything else is MAIRO's inference until confirmed. */
export const CONFIRMING_SOURCES: FactSource[] = ["customer", "assistant", "admin"];

export type FactMeta = { source: FactSource; status: FactStatus; updatedAt: string; verifiedAt: string };

export type BrainSection = "business" | "products" | "customers" | "different" | "brand";

export const SECTION_LABEL: Record<BrainSection, string> = {
  business: "Your Business",
  products: "Products & Services",
  customers: "Your Customers",
  different: "What Makes You Different",
  brand: "Brand",
};

export type FieldDef = {
  key: string;
  label: string;
  section: BrainSection;
  list: boolean;
  /** How this can improve a future marketing decision. No purpose, no field. */
  purpose: string;
  /** Worth re-checking when it hasn't been confirmed for a long time. */
  important?: boolean;
};

const f = (key: string, label: string, section: BrainSection, list: boolean, purpose: string, important = false): FieldDef => ({ key, label, section, list, purpose, important });

export const BRAIN_FIELDS: FieldDef[] = [
  // Your business
  f("businessName", "Business name", "business", false, "Named correctly in every ad."),
  f("industry", "Industry", "business", false, "Picks the playbook, offers and questions that suit this kind of business."),
  f("overview", "What you do", "business", false, "The starting point for every ad and plan."),
  f("website", "Website", "business", false, "Where ads can send people, and what MAIRO checks before launch."),
  f("location", "Location", "business", false, "Keeps local ads near people who can actually come."),
  f("serviceArea", "Service area", "business", false, "Sets how far ads should reach.", true),
  f("presence", "Local, online or both", "business", false, "Decides whether ads target an area or a whole country."),
  f("yearsInBusiness", "Years in business", "business", false, "A trust point ads can mention, only if you said it."),
  // Products & services
  f("focusItem", "What you want to sell more of", "products", false, "Decides what campaigns lead with.", true),
  f("bestProducts", "Best sellers", "products", true, "Shows what customers already want — usually the strongest ad.", true),
  f("mostProfitable", "Most profitable", "products", false, "Helps MAIRO put budget behind what pays best.", true),
  f("averageOrderValue", "Typical order value", "products", false, "Sets a sensible cost per sale to aim for."),
  // Customers
  f("targetCustomer", "Ideal customer", "customers", false, "Who ads are written for.", true),
  f("customerTypes", "Common customer types", "customers", true, "Lets MAIRO write different ads for different buyers."),
  f("customerAges", "Ages that buy most", "customers", false, "A guide for words and pictures — never used to narrow targeting just to raise a score."),
  f("customerInterests", "Customer interests", "customers", true, "Helps choose pictures and angles that feel familiar to them."),
  f("painPoints", "Problems customers have", "customers", true, "The strongest opening lines start from the customer's problem."),
  f("desires", "What customers want", "customers", true, "What the ad should promise."),
  f("objections", "Why customers hesitate", "customers", true, "Lets ads answer doubts before they stop a sale."),
  f("purchaseConsiderations", "What they weigh up before buying", "customers", true, "What the ad and page need to make clear."),
  f("repeatBehavior", "Repeat customers", "customers", false, "Whether reminders and loyalty offers are worth running."),
  f("bestCustomers", "Most valuable customers", "customers", false, "Aims the message at the customers worth the most."),
  f("excludedCustomers", "Customers you don't want", "customers", false, "Keeps ads from attracting the wrong people."),
  // What makes you different
  f("usps", "What makes you different", "different", true, "Shapes hooks and messaging in every ad.", true),
  f("offers", "Standing offers", "different", true, "Real reasons to act — free estimates, guarantees, trials. Only ones you confirm.", true),
  f("customerResults", "Results customers get", "different", true, "Believable proof for ads."),
  f("customerPraise", "What customers praise", "different", true, "Real praise makes the most believable ad."),
  f("successfulOffers", "Offers that worked", "different", true, "Lets MAIRO reuse what already worked."),
  f("unsuccessfulOffers", "Offers that didn't work", "different", true, "Keeps MAIRO from repeating what didn't."),
  // Brand
  f("brandVoice", "Brand voice", "brand", false, "How every ad and post should sound."),
  f("brandStyle", "Visual direction", "brand", false, "How creatives should look."),
  f("creativeStyle", "Preferred creative style", "brand", false, "Steers every new creative MAIRO makes."),
  f("brandColors", "Brand colours", "brand", true, "Keeps creatives on-brand."),
  f("fonts", "Fonts", "brand", true, "Keeps creatives on-brand."),
  f("logoUrl", "Logo", "brand", false, "Used in creatives where it fits."),
  f("preferredWording", "Words you like", "brand", true, "Phrases MAIRO should reach for."),
  f("avoidClaims", "Words and claims to avoid", "brand", true, "MAIRO never writes these."),
  f("brandGuidelines", "Brand guidelines", "brand", false, "Rules every creative follows."),
  f("creativeAssets", "Material you have for ads", "brand", true, "Lets MAIRO recommend real photos and videos over generated ones."),
];

export const FIELD_BY_KEY: Record<string, FieldDef> = Object.fromEntries(BRAIN_FIELDS.map((d) => [d.key, d]));

/** The anti-bloat rule: only catalogued fields — each with a marketing purpose — are stored. */
export function isMarketingField(key: string): boolean {
  return key in FIELD_BY_KEY || key === "products";
}
