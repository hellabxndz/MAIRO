// What a website's public HTML shows about how it's built and what runs on it.
//
// Pure, so every detector is pinned in scripts/check-website.ts. Each finding
// carries its evidence — the URL or snippet that matched — and the limits are
// part of the answer: a public page can't show admin-only apps, tracking that
// loads after a consent choice or inside Shopify's sandboxed web pixels, or
// whether any event actually reaches an ad platform. "Not detected" never
// means "not there".
//
// The HTML is untrusted input. Nothing here follows instructions in it; it's
// matched against fixed patterns and quoted back, length-capped.

export type Evidence = { what: string; where: string };

const cap = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function firstMatch(html: string, re: RegExp): string | null {
  const m = html.match(re);
  return m ? cap(m[0]) : null;
}

// --- Platform ------------------------------------------------------------------------

export type Platform = { name: string; confidence: "certain" | "likely"; evidence: Evidence[] };

const PLATFORMS: { name: string; certain: RegExp[]; likely: RegExp[] }[] = [
  { name: "Shopify", certain: [/cdn\.shopify\.com\/s\/files/i, /Shopify\.theme\s*=/i, /window\.Shopify\s*=/i], likely: [/myshopify\.com/i, /shopify-section/i] },
  { name: "WooCommerce", certain: [/wp-content\/plugins\/woocommerce/i, /class=["'][^"']*woocommerce/i], likely: [] },
  { name: "WordPress", certain: [/<meta[^>]+name=["']generator["'][^>]+content=["']WordPress/i, /\/wp-content\/(themes|plugins|uploads)\//i], likely: [/\/wp-includes\//i, /wp-json/i] },
  { name: "Squarespace", certain: [/static1\.squarespace\.com/i, /<!--\s*This is Squarespace/i], likely: [/squarespace/i] },
  { name: "Wix", certain: [/static\.wixstatic\.com/i, /<meta[^>]+name=["']generator["'][^>]+content=["']Wix/i], likely: [/wix\.com/i] },
  { name: "Webflow", certain: [/data-wf-site=/i, /<meta[^>]+content=["']Webflow["'][^>]+name=["']generator["']|<meta[^>]+name=["']generator["'][^>]+content=["']Webflow/i], likely: [/webflow\.(js|com)/i] },
  { name: "GoDaddy Website Builder", certain: [/img1\.wsimg\.com/i], likely: [/godaddy/i] },
  { name: "Square Online", certain: [/editmysite\.com/i, /square-online/i], likely: [] },
  { name: "BigCommerce", certain: [/cdn11\.bigcommerce\.com/i], likely: [/bigcommerce/i] },
  { name: "Framer", certain: [/framerusercontent\.com/i], likely: [/framer\.com/i] },
  { name: "Duda", certain: [/dudamobile\.com|irp\.cdn-website\.com/i], likely: [] },
];

export function detectPlatform(html: string): Platform | null {
  for (const p of PLATFORMS) {
    const certain = p.certain.map((re) => firstMatch(html, re)).filter((x): x is string => Boolean(x));
    if (certain.length) return { name: p.name, confidence: "certain", evidence: certain.slice(0, 2).map((w) => ({ what: `${p.name} file or marker`, where: w })) };
  }
  for (const p of PLATFORMS) {
    const likely = p.likely.map((re) => firstMatch(html, re)).filter((x): x is string => Boolean(x));
    if (likely.length) return { name: p.name, confidence: "likely", evidence: likely.slice(0, 2).map((w) => ({ what: `Mentions ${p.name}`, where: w })) };
  }
  return null;
}

// --- Shopify theme ----------------------------------------------------------------------

export type ShopifyTheme = {
  /** The theme name the store's page declares. A store can rename its theme. */
  name: string | null;
  /** Present when the theme came from Shopify's Theme Store. */
  themeStoreId: number | null;
  /** Some themes also declare their original name. */
  schemaName: string | null;
  evidence: Evidence[];
};

export function detectShopifyTheme(html: string): ShopifyTheme | null {
  const block = html.match(/Shopify\.theme\s*=\s*(\{[^;<]{0,600}\})/i);
  if (!block) return null;
  const raw = block[1];
  const name = raw.match(/"name"\s*:\s*"([^"]{1,80})"/)?.[1] ?? null;
  const storeId = raw.match(/"theme_store_id"\s*:\s*(\d{1,7})/)?.[1];
  const schema = html.match(/"schema_name"\s*:\s*"([^"]{1,80})"/)?.[1] ?? null;
  return {
    name,
    themeStoreId: storeId ? Number(storeId) : null,
    schemaName: schema,
    evidence: [{ what: "Shopify.theme on the page", where: cap(`Shopify.theme = ${raw}`, 200) }],
  };
}

// --- Apps and scripts -----------------------------------------------------------------------

export type AppCategory = "Email and SMS" | "Reviews" | "Subscriptions" | "Support chat" | "Loyalty" | "Page builder" | "Upsell" | "Payments" | "Search" | "Translation" | "Analytics" | "Advertising tag" | "Consent";
export type DetectedApp = { name: string; category: AppCategory; evidence: Evidence };

const APP_SIGNATURES: { name: string; category: AppCategory; re: RegExp }[] = [
  { name: "Klaviyo", category: "Email and SMS", re: /static\.klaviyo\.com|klaviyo\.com\/onsite/i },
  { name: "Omnisend", category: "Email and SMS", re: /omnisnippet|omnisend\.com/i },
  { name: "Mailchimp", category: "Email and SMS", re: /chimpstatic\.com|list-manage\.com/i },
  { name: "Attentive", category: "Email and SMS", re: /cdn\.attn\.tv|attentivemobile/i },
  { name: "Postscript", category: "Email and SMS", re: /sdk\.postscript\.io/i },
  { name: "Privy", category: "Email and SMS", re: /widget\.privy\.com/i },
  { name: "Judge.me", category: "Reviews", re: /judge\.me/i },
  { name: "Yotpo", category: "Reviews", re: /yotpo\.com/i },
  { name: "Loox", category: "Reviews", re: /loox\.io/i },
  { name: "Okendo", category: "Reviews", re: /okendo\.io/i },
  { name: "Stamped", category: "Reviews", re: /stamped\.io/i },
  { name: "Trustpilot widget", category: "Reviews", re: /widget\.trustpilot\.com/i },
  { name: "Recharge", category: "Subscriptions", re: /rechargecdn\.com|rechargepayments\.com/i },
  { name: "Gorgias", category: "Support chat", re: /gorgias\.chat|config\.gorgias\.io/i },
  { name: "Tidio", category: "Support chat", re: /code\.tidio\.co/i },
  { name: "Intercom", category: "Support chat", re: /widget\.intercom\.io/i },
  { name: "Zendesk", category: "Support chat", re: /static\.zdassets\.com/i },
  { name: "Shopify Inbox", category: "Support chat", re: /shopify-chat|cdn\.shopify\.com\/shopifycloud\/shopify_chat/i },
  { name: "Smile.io", category: "Loyalty", re: /smile\.io|sweettooth\.io/i },
  { name: "PageFly", category: "Page builder", re: /pagefly/i },
  { name: "GemPages", category: "Page builder", re: /gempages/i },
  { name: "Shogun", category: "Page builder", re: /getshogun|shogun-cdn/i },
  { name: "Rebuy", category: "Upsell", re: /rebuyengine\.com/i },
  { name: "Bold", category: "Upsell", re: /boldapps\.net|boldcommerce\.com/i },
  { name: "Afterpay / Clearpay", category: "Payments", re: /afterpay\.com|clearpay\.co\.uk/i },
  { name: "Klarna", category: "Payments", re: /klarnaservices\.com|js\.klarna\.com/i },
  { name: "Affirm", category: "Payments", re: /cdn1\.affirm\.com|affirm\.js/i },
  { name: "Shop Pay", category: "Payments", re: /shop-pay|shopify-payment-button/i },
  { name: "Searchanise", category: "Search", re: /searchanise/i },
  { name: "Boost Commerce", category: "Search", re: /boostcommerce/i },
  { name: "Weglot", category: "Translation", re: /cdn\.weglot\.com/i },
  { name: "Google Analytics", category: "Analytics", re: /googletagmanager\.com\/gtag\/js\?id=G-|google-analytics\.com\/analytics\.js/i },
  { name: "Hotjar", category: "Analytics", re: /static\.hotjar\.com/i },
  { name: "Microsoft Clarity", category: "Analytics", re: /clarity\.ms\/tag/i },
  { name: "Lucky Orange", category: "Analytics", re: /luckyorange\.(com|net)/i },
];

export function detectApps(html: string): DetectedApp[] {
  const out: DetectedApp[] = [];
  for (const a of APP_SIGNATURES) {
    const m = firstMatch(html, a.re);
    if (m) out.push({ name: a.name, category: a.category, evidence: { what: "Script or link on the page", where: m } });
  }
  return out;
}

/** Shopify theme app extensions load from a path that identifies the extension, not the app. */
export function countAppExtensions(html: string): number {
  return new Set([...html.matchAll(/cdn\.shopify\.com\/extensions\/([0-9a-f-]{8,40})\//gi)].map((m) => m[1])).size;
}

// --- Advertising and analytics tags ---------------------------------------------------------

export type TrackingTags = {
  /** Pixel ids from fbq('init', '…') calls on the page. */
  metaPixelIds: string[];
  /** Meta's pixel library is loaded on the page. */
  metaPixelScript: boolean;
  gtmContainers: string[];
  ga4Ids: string[];
  googleAdsIds: string[];
  tiktok: boolean;
  pinterest: boolean;
  snapchat: boolean;
  microsoftAds: boolean;
  /** Shopify's web pixels manager: pixels set up in Shopify run in a sandbox a public scan can't see into. */
  shopifyWebPixels: boolean;
  evidence: Evidence[];
};

export function detectTracking(html: string): TrackingTags {
  const ev: Evidence[] = [];
  const pixelIds = [...new Set([...html.matchAll(/fbq\(\s*['"]init['"]\s*,\s*['"](\d{8,20})['"]/gi)].map((m) => m[1]))];
  const fbScript = /connect\.facebook\.net\/[^"']*\/fbevents\.js/i.test(html);
  if (pixelIds.length) ev.push({ what: "Meta pixel initialised", where: cap(`fbq('init', '${pixelIds[0]}')`) });
  else if (fbScript) ev.push({ what: "Meta pixel library loaded", where: firstMatch(html, /connect\.facebook\.net\/[^"']*\/fbevents\.js/i) ?? "fbevents.js" });
  const gtm = [...new Set([...html.matchAll(/\bGTM-[A-Z0-9]{4,9}\b/g)].map((m) => m[0]))];
  if (gtm.length) ev.push({ what: "Google Tag Manager", where: gtm.join(", ") });
  const ga4 = [...new Set([...html.matchAll(/\bG-[A-Z0-9]{6,12}\b/g)].map((m) => m[0]))].filter((x) => !/^G-(TM|ROUP)/.test(x));
  const ads = [...new Set([...html.matchAll(/\bAW-\d{6,12}\b/g)].map((m) => m[0]))];
  const tiktok = /analytics\.tiktok\.com\/i18n\/pixel/i.test(html) || /ttq\.load\(/i.test(html);
  const pinterest = /s\.pinimg\.com\/ct\/core\.js|pintrk\(/i.test(html);
  const snapchat = /sc-static\.net\/scevent/i.test(html);
  const microsoftAds = /bat\.bing\.com\/bat\.js/i.test(html);
  const shopifyWebPixels = /web-pixels-manager|webPixelsManager|\/wpm@/i.test(html);
  if (shopifyWebPixels) ev.push({ what: "Shopify web pixels", where: firstMatch(html, /web-pixels-manager|webPixelsManager|\/wpm@[^"']{0,40}/i) ?? "web pixels manager" });
  return { metaPixelIds: pixelIds, metaPixelScript: fbScript || pixelIds.length > 0, gtmContainers: gtm.slice(0, 4), ga4Ids: ga4.slice(0, 4), googleAdsIds: ads.slice(0, 4), tiktok, pinterest, snapchat, microsoftAds, shopifyWebPixels, evidence: ev };
}

// --- Consent --------------------------------------------------------------------------------

export type ConsentTool = { name: string; evidence: Evidence };
const CONSENT: { name: string; re: RegExp }[] = [
  { name: "Cookiebot", re: /consent\.cookiebot\.com/i },
  { name: "OneTrust", re: /cdn\.cookielaw\.org|otSDKStub/i },
  { name: "Termly", re: /app\.termly\.io/i },
  { name: "Osano", re: /cmp\.osano\.com/i },
  { name: "iubenda", re: /cdn\.iubenda\.com/i },
  { name: "CookieYes", re: /cdn-cookieyes\.com/i },
  { name: "Usercentrics", re: /usercentrics\.eu/i },
  { name: "Complianz", re: /complianz/i },
  { name: "Shopify customer privacy", re: /customerPrivacy|consent-tracking-api/i },
  { name: "Google consent mode", re: /gtag\(\s*['"]consent['"]/i },
];

export function detectConsent(html: string): ConsentTool[] {
  return CONSENT.flatMap((c) => {
    const m = firstMatch(html, c.re);
    return m ? [{ name: c.name, evidence: { what: "Consent script or setting", where: m } }] : [];
  });
}

// --- Ways to get in touch, book or buy -------------------------------------------------------

export type Destinations = {
  phoneLinks: string[];
  emailLink: boolean;
  booking: { provider: string; url: string }[];
  forms: { action: string | null; hasEmailField: boolean; hasPhoneField: boolean; hasSubmit: boolean; fields: number }[];
  cart: boolean;
  checkout: boolean;
};

const BOOKING: { provider: string; re: RegExp }[] = [
  { provider: "Calendly", re: /https?:\/\/(?:www\.)?calendly\.com\/[^"'\s<>]{1,120}/i },
  { provider: "Acuity Scheduling", re: /https?:\/\/[a-z0-9-]+\.as\.me[^"'\s<>]{0,120}|https?:\/\/app\.acuityscheduling\.com\/[^"'\s<>]{1,120}/i },
  { provider: "Square Appointments", re: /https?:\/\/(?:book\.)?squareup\.com\/appointments\/[^"'\s<>]{1,120}|https?:\/\/[a-z0-9-]+\.square\.site\/[^"'\s<>]{0,120}/i },
  { provider: "Setmore", re: /https?:\/\/[a-z0-9-]+\.setmore\.com[^"'\s<>]{0,120}/i },
  { provider: "Fresha", re: /https?:\/\/(?:www\.)?fresha\.com\/[^"'\s<>]{1,120}/i },
  { provider: "Booksy", re: /https?:\/\/booksy\.com\/[^"'\s<>]{1,120}/i },
  { provider: "Vagaro", re: /https?:\/\/(?:www\.)?vagaro\.com\/[^"'\s<>]{1,120}/i },
  { provider: "SimplyBook.me", re: /https?:\/\/[a-z0-9-]+\.simplybook\.(me|it)[^"'\s<>]{0,120}/i },
  { provider: "Mindbody", re: /https?:\/\/(?:clients\.)?mindbodyonline\.com\/[^"'\s<>]{1,120}/i },
  { provider: "OpenTable", re: /https?:\/\/(?:www\.)?opentable\.(com|co\.uk)\/[^"'\s<>]{1,120}/i },
  { provider: "Resy", re: /https?:\/\/resy\.com\/[^"'\s<>]{1,120}/i },
  { provider: "Housecall Pro", re: /https?:\/\/book\.housecallpro\.com\/[^"'\s<>]{1,120}/i },
  { provider: "Jobber", re: /https?:\/\/clienthub\.getjobber\.com\/[^"'\s<>]{1,120}/i },
];

export function detectDestinations(html: string): Destinations {
  const phones = [...new Set([...html.matchAll(/href=["']tel:([+\d\s().-]{6,24})["']/gi)].map((m) => m[1].trim()))].slice(0, 3);
  const booking = BOOKING.flatMap((b) => {
    const m = html.match(b.re);
    return m ? [{ provider: b.provider, url: cap(m[0], 160) }] : [];
  });
  const forms = [...html.matchAll(/<form\b([^>]*)>([\s\S]{0,8000}?)<\/form>/gi)].slice(0, 6).map((m) => {
    const attrs = m[1];
    const inner = m[2];
    const action = attrs.match(/action=["']([^"']{0,200})["']/i)?.[1] ?? null;
    return {
      action,
      hasEmailField: /type=["']email["']|name=["'][^"']*email/i.test(inner),
      hasPhoneField: /type=["']tel["']|name=["'][^"']*phone/i.test(inner),
      hasSubmit: /type=["']submit["']|<button(?![^>]*type=["'](button|reset)["'])[^>]*>/i.test(inner),
      fields: (inner.match(/<(input|select|textarea)\b(?![^>]*type=["'](hidden|submit|button)["'])/gi) ?? []).length,
    };
  }).filter((f) => !/search/i.test(f.action ?? "") || f.fields > 1);
  return {
    phoneLinks: phones,
    emailLink: /href=["']mailto:/i.test(html),
    booking,
    forms,
    cart: /href=["'][^"']*\/cart\b|add[-_ ]to[-_ ]cart/i.test(html),
    checkout: /href=["'][^"']*\/checkout\b/i.test(html),
  };
}

// --- Social profiles: recognised, never fetched -------------------------------------------------

export type SocialLink = { network: "Facebook" | "Instagram" | "TikTok" | "LinkedIn" | "YouTube" | "X" | "Pinterest"; url: string };

const SOCIAL: { network: SocialLink["network"]; re: RegExp }[] = [
  { network: "Facebook", re: /https?:\/\/(?:www\.|m\.)?facebook\.com\/(?!sharer|share|tr\b|plugins|dialog|ads\/library)[A-Za-z0-9._-]{2,80}\/?/gi },
  { network: "Instagram", re: /https?:\/\/(?:www\.)?instagram\.com\/(?!p\/|reel\/|explore)[A-Za-z0-9._]{2,40}\/?/gi },
  { network: "TikTok", re: /https?:\/\/(?:www\.)?tiktok\.com\/@[A-Za-z0-9._]{2,40}/gi },
  { network: "LinkedIn", re: /https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in)\/[A-Za-z0-9-_%]{2,80}\/?/gi },
  { network: "YouTube", re: /https?:\/\/(?:www\.)?youtube\.com\/(?:@|channel\/|c\/|user\/)[A-Za-z0-9._-]{2,80}/gi },
  { network: "X", re: /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/(?!intent|share)[A-Za-z0-9_]{2,30}/gi },
  { network: "Pinterest", re: /https?:\/\/(?:www\.)?pinterest\.[a-z.]+\/[A-Za-z0-9_]{2,40}\/?/gi },
];

export function detectSocial(html: string): SocialLink[] {
  const out: SocialLink[] = [];
  for (const s of SOCIAL) {
    const m = [...new Set([...html.matchAll(s.re)].map((x) => x[0].replace(/\/$/, "")))][0];
    if (m) out.push({ network: s.network, url: m });
  }
  return out;
}

/** A social profile link typed in place of a website. */
export function socialProfileFrom(url: string): SocialLink | null {
  for (const s of SOCIAL) {
    s.re.lastIndex = 0;
    const m = url.match(new RegExp(s.re.source, "i"));
    if (m && m.index === 0) return { network: s.network, url: m[0] };
  }
  return null;
}

// --- The business, from what the page itself declares ---------------------------------------------

export type DeclaredBusiness = {
  name: string | null;
  types: string[];
  telephone: string | null;
  locality: string | null;
  region: string | null;
  country: string | null;
  areaServed: string[];
  priceRange: string | null;
  logo: string | null;
  rating: { value: number; count: number } | null;
  sameAs: string[];
};

/** schema.org Organization / LocalBusiness data, which sites publish for search engines. */
export function detectDeclaredBusiness(html: string): DeclaredBusiness {
  const out: DeclaredBusiness = { name: null, types: [], telephone: null, locality: null, region: null, country: null, areaServed: [], priceRange: null, logo: null, rating: null, sameAs: [] };
  const BUSINESSY = /Organization|LocalBusiness|Store|Service|Plumber|Electrician|Dentist|Physician|Clinic|Salon|Restaurant|HomeAndConstructionBusiness|ProfessionalService|AutomotiveBusiness|HealthAndBeautyBusiness|SportsActivityLocation|LegalService|FinancialService|RealEstateAgent|Contractor|Roofing|HVAC|Locksmith|MovingCompany|Painter|CleaningService|LodgingBusiness|FoodEstablishment/;
  const str = (v: unknown) => (typeof v === "string" ? v.slice(0, 120) : null);
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(visit);
    const o = node as Record<string, unknown>;
    const types = (Array.isArray(o["@type"]) ? o["@type"] : [o["@type"]]).filter((t): t is string => typeof t === "string");
    if (types.some((t) => BUSINESSY.test(t))) {
      out.types.push(...types.filter((t) => !out.types.includes(t)));
      out.name ??= str(o.name);
      out.telephone ??= str(o.telephone);
      out.priceRange ??= str(o.priceRange);
      const logo = typeof o.logo === "string" ? o.logo : (o.logo as Record<string, unknown> | undefined)?.url;
      out.logo ??= typeof logo === "string" ? logo.slice(0, 300) : null;
      const addr = (Array.isArray(o.address) ? o.address[0] : o.address) as Record<string, unknown> | undefined;
      if (addr && typeof addr === "object") {
        out.locality ??= str(addr.addressLocality);
        out.region ??= str(addr.addressRegion);
        out.country ??= str(typeof addr.addressCountry === "object" ? (addr.addressCountry as Record<string, unknown>)?.name : addr.addressCountry);
      }
      const area = o.areaServed;
      for (const a of Array.isArray(area) ? area : area ? [area] : []) {
        const name = typeof a === "string" ? a : str((a as Record<string, unknown>)?.name);
        if (name && !out.areaServed.includes(name)) out.areaServed.push(name);
      }
      const agg = o.aggregateRating as Record<string, unknown> | undefined;
      if (agg && !out.rating) {
        const value = Number(agg.ratingValue);
        const count = Number(agg.reviewCount ?? agg.ratingCount);
        if (Number.isFinite(value) && Number.isFinite(count) && count > 0) out.rating = { value, count };
      }
      if (Array.isArray(o.sameAs)) out.sameAs.push(...o.sameAs.filter((x): x is string => typeof x === "string").slice(0, 8));
    }
    for (const v of Object.values(o)) if (v && typeof v === "object") visit(v);
  };
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      visit(JSON.parse(m[1]));
    } catch {
      // Malformed structured data is common and says nothing either way.
    }
  }
  if (!out.logo) {
    const img = html.match(/<img[^>]+(?:alt|class|id)=["'][^"']*logo[^"']*["'][^>]*src=["']([^"']{1,300})["']|<img[^>]+src=["']([^"']{1,300})["'][^>]*(?:alt|class|id)=["'][^"']*logo/i);
    out.logo = img ? (img[1] ?? img[2]) : null;
  }
  out.areaServed = out.areaServed.slice(0, 10);
  return out;
}

// --- Sentences worth quoting ------------------------------------------------------------------------

/**
 * Visible text with block boundaries kept — headings, paragraphs, list items,
 * links and buttons each end a line — so a quoted sentence doesn't run into
 * the navigation around it.
 */
export function blockText(html: string, max = 20_000): string {
  return html
    .replace(/<(script|style|noscript|svg|nav|header|footer)[\s\S]*?<\/\1>/gi, "\n")
    .replace(/<\/(p|h[1-6]|li|a|button|div|section|article|td|th|dt|dd|label|span)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, max);
}

/** Sentences from the visible text that match, quoted as written, for evidence. */
export function quoteSentences(text: string, re: RegExp, max = 3): string[] {
  const sentences = text.split(/\n|(?<=[.!?])\s+|\s[·|•]\s/).map((s) => s.trim()).filter((s) => s.length >= 8 && s.length <= 220);
  const out: string[] = [];
  for (const s of sentences) {
    if (re.test(s) && !out.includes(s)) out.push(cap(s, 160));
    if (out.length >= max) break;
  }
  return out;
}

export const OFFER_RE = /\b(\d{1,2}% off|free (shipping|delivery|quote|estimate|consultation|trial|inspection|returns?)|save \$\d+|first (visit|order|month|lesson|class) (free|\$\d+)|buy one,? get one|no call-?out fee)\b/i;
export const SERVICE_AREA_RE = /\b(serving|we serve|areas? we (serve|cover)|service areas?|we cover|based in|located in|proudly serving)\b/i;
export const TRUST_RE = /\b(licensed|insured|certified|accredited|years? (of experience|in business)|since (19|20)\d{2}|family[- ]owned|warranty|money[- ]back|satisfaction)\b/i;
export const POLICY_RE = /\b(refund|returns?|cancellation|shipping) polic(y|ies)\b/i;
