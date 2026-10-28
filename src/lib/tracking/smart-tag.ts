import type { ConversionAction, Niche } from "@/lib/tracking/niches";

// The MAIRO tag: one line a business pastes into its website, and nothing
// else to set up.
//
//   <script async src="https://www.mairo.io/t/<tag id>.js"></script>
//
// What it does on their site:
//   - loads their own Meta pixel (the one chosen on the Tracking page) and
//     records a page view;
//   - spots the outcomes their kind of business converts on — a form sent, a
//     phone number tapped, a booking-confirmation page — from the same
//     catalogue the Tag Manager export uses (lib/tracking/niches.ts), so the
//     owner never defines an event;
//   - sends each outcome to Meta twice with one event id: from the browser,
//     and through MAIRO (/api/t/<tag id>) to the Conversions API, so an ad
//     blocker doesn't lose it and Meta counts it once.
//
// The tag id is the business's TrackingPixel row id: public by nature (it's
// in their page source), and it names nothing else. The script is built from
// MAIRO's own catalogue and the pixel id only — nothing a visitor or the
// owner typed ends up in it.
//
// It does nothing for a browser that sends Global Privacy Control, and when
// the business requires consent (the Tracking page's consent setting) it
// waits for the site to call mairo('consent', true).

/** How a rule is spotted in the browser: the tag's short forms of DetectionKind. */
export type TagRule =
  | { k: "url"; m: string; e: string }
  | { k: "form"; e: string }
  | { k: "tel"; e: string }
  | { k: "mail"; e: string }
  | { k: "click"; m: string; e: string }
  | { k: "dl"; m: string; e: string };

export function tagRule(a: ConversionAction): TagRule | null {
  switch (a.detection) {
    case "url_contains":
      return a.match ? { k: "url", m: a.match.toLowerCase(), e: a.metaEvent } : null;
    case "form_submit":
      return { k: "form", e: a.metaEvent };
    case "phone_click":
      return { k: "tel", e: a.metaEvent };
    case "email_click":
      return { k: "mail", e: a.metaEvent };
    case "click_selector":
      return a.match ? { k: "click", m: a.match, e: a.metaEvent } : null;
    case "datalayer_event":
      return { k: "dl", m: a.id, e: a.metaEvent };
  }
}

/**
 * The rules the tag spots on its own. Never a Purchase: a page address or a
 * click can't say an order was confirmed or what it was worth, so a purchase
 * only ever comes from mairo('purchase', { value, currency, order_id }) on the
 * confirmation page, or from the store itself. When the owner chose what to
 * measure (lib/tracking/measurement.ts), only those events.
 */
export function tagRules(niche: Niche, only?: ReadonlySet<string> | null): TagRule[] {
  return niche.actions
    .map(tagRule)
    .filter((r): r is TagRule => r !== null && r.e !== "Purchase" && (!only || only.has(r.e)));
}

/** Outcomes a site may also report itself with mairo('track', …), whatever its business type. */
const ALWAYS_ACCEPTED = ["Lead", "Contact", "Schedule", "CompleteRegistration", "SubmitApplication"];

/** The events MAIRO relays for this business: the ones the owner chose; before they've chosen, its catalogue's plus the common lead events. */
export function acceptedEvents(niche: Niche, chosen?: ReadonlySet<string> | null): Set<string> {
  if (chosen) return new Set(chosen);
  return new Set([...niche.actions.map((a) => a.metaEvent), ...ALWAYS_ACCEPTED]);
}

/** The id a purchase carries, from the store's order id: the same string the store relay derives (lib/tracking/hash.ts deriveEventId), so the browser and server copies are one sale to Meta. */
export const PURCHASE_ID = /^mairo_[A-Za-z0-9_-]{1,64}$/;

/** A tag id is a TrackingPixel id (a cuid). Anything else is refused before the database. */
export function validTagId(id: string): boolean {
  return /^c[a-z0-9]{20,32}$/.test(id);
}

export function tagScriptUrl(appUrl: string, tagId: string): string {
  return `${appUrl.replace(/\/+$/, "")}/t/${tagId}.js`;
}

/** The one line the business pastes. */
export function tagSnippet(appUrl: string, tagId: string): string {
  return `<script async src="${tagScriptUrl(appUrl, tagId)}"></script>`;
}

// JSON inside a <script>-delivered file: escape what could end a script
// context or confuse a parser if the file is ever inlined.
function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

export type TagConfig = {
  /** Their Meta pixel id. Digits only. */
  pixel: string;
  /** Where outcomes are relayed for the Conversions API. */
  endpoint: string;
  rules: TagRule[];
  /** True when the business sends events only with the visitor's consent. */
  consentRequired: boolean;
  /** The events the site may report itself with mairo('track', …). Purchase is never one: it has its own call. */
  events: string[];
  /** Whether mairo('purchase', …) is accepted (the owner chose to measure purchases, or hasn't chosen yet). */
  purchase: boolean;
};

/** The tag's JavaScript. ES5, no dependencies, safe to load twice. */
export function tagScript(config: TagConfig): string {
  if (!/^\d{6,30}$/.test(config.pixel)) throw new Error("Not a Meta pixel id.");
  return `/* MAIRO tag — https://www.mairo.io/help/website-tracking */
(function (w, d) {
  var C = ${safeJson(config)};
  if (w.__mairoTag) return;
  w.__mairoTag = 1;
  try { if (navigator.globalPrivacyControl === true) return; } catch (e) {}
  var granted = !C.consentRequired, started = false, last = {};
  function cookie(n) { var m = d.cookie.match(new RegExp("(?:^|; )" + n + "=([^;]*)")); return m ? decodeURIComponent(m[1]) : null; }
  function rid() { return "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
  function pixel() {
    if (!w.fbq) {
      var n = w.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!w._fbq) w._fbq = n;
      n.push = n; n.loaded = true; n.version = "2.0"; n.queue = [];
      var s = d.createElement("script"); s.async = true; s.src = "https://connect.facebook.net/en_US/fbevents.js";
      (d.head || d.documentElement).appendChild(s);
    }
    w.fbq("init", C.pixel);
    w.fbq("trackSingle", C.pixel, "PageView");
  }
  function send(ev) {
    var now = Date.now();
    if (last[ev] && now - last[ev] < 3000) return;
    last[ev] = now;
    var id = rid();
    try { w.fbq("trackSingle", C.pixel, ev, {}, { eventID: id }); } catch (e) {}
    beacon({ e: ev, id: id, u: location.origin + location.pathname, fbp: cookie("_fbp"), fbc: cookie("_fbc"), c: granted ? 1 : 0 });
  }
  function beacon(o) {
    var body = JSON.stringify(o);
    try { if (navigator.sendBeacon && navigator.sendBeacon(C.endpoint, body)) return; } catch (e) {}
    try { fetch(C.endpoint, { method: "POST", body: body, keepalive: true, mode: "no-cors" }); } catch (e) {}
  }
  // A confirmed order only: a number above zero, a 3-letter currency and the
  // order's id. Anything less isn't sent — a purchase without its value can't
  // be reported on. Once per order, even if the page is reloaded.
  function purchase(p) {
    if (!C.purchase || !p) return;
    var v = Number(p.value), cur = String(p.currency || "").toUpperCase(), oid = String(p.order_id == null ? "" : p.order_id).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
    if (!(v > 0 && v < 1e7) || !/^[A-Z]{3}$/.test(cur) || !oid) return;
    var id = "mairo_" + oid, seen = [];
    try { seen = JSON.parse(w.localStorage.getItem("mairo_orders") || "[]"); } catch (e) {}
    if (seen.indexOf(id) > -1) return;
    try { w.localStorage.setItem("mairo_orders", JSON.stringify(seen.concat(id).slice(-20))); } catch (e) {}
    v = Math.round(v * 100) / 100;
    try { w.fbq("trackSingle", C.pixel, "Purchase", { value: v, currency: cur }, { eventID: id }); } catch (e) {}
    beacon({ e: "Purchase", id: id, u: location.origin + location.pathname, fbp: cookie("_fbp"), fbc: cookie("_fbc"), c: granted ? 1 : 0, v: v, cur: cur });
  }
  function each(kind, fn) { for (var i = 0; i < C.rules.length; i++) if (C.rules[i].k === kind) fn(C.rules[i]); }
  function start() {
    if (started) return;
    started = true;
    pixel();
    var href = location.href.toLowerCase();
    each("url", function (r) { if (href.indexOf(r.m) > -1) send(r.e); });
    d.addEventListener("submit", function () { each("form", function (r) { send(r.e); }); }, true);
    d.addEventListener("click", function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      each("tel", function (r) { if (t.closest('a[href^="tel:"]')) send(r.e); });
      each("mail", function (r) { if (t.closest('a[href^="mailto:"]')) send(r.e); });
      each("click", function (r) { try { if (t.closest(r.m)) send(r.e); } catch (e) {} });
    }, true);
    var dl = w.dataLayer = w.dataLayer || [], push = dl.push;
    dl.push = function () {
      for (var i = 0; i < arguments.length; i++) {
        var item = arguments[i];
        if (item && item.event) each("dl", function (r) { if (item.event === r.m) send(r.e); });
      }
      return push.apply(dl, arguments);
    };
  }
  w.mairo = function (cmd, arg) {
    if (cmd === "consent" && (arg === true || arg === "granted")) { granted = true; start(); }
    else if (cmd === "track" && typeof arg === "string" && granted && C.events.indexOf(arg) > -1) { start(); send(arg); }
    else if (cmd === "purchase" && granted) { start(); purchase(arg); }
  };
  if (granted) start();
})(window, document);
`;
}

/**
 * Where the one line goes, per website builder: the builder's own "code in
 * every page's head" setting. Menus move; the last step everywhere is the
 * same, and "other" covers sending it to whoever built the site.
 */
export const PASTE_STEPS: { id: string; label: string; match: RegExp | null; steps: string[] }[] = [
  { id: "wix", label: "Wix", match: /wix/i, steps: ["In Wix, open Settings → Custom code.", "Press + Add Custom Code and paste the line.", "Choose All pages and Head, then Apply."] },
  { id: "squarespace", label: "Squarespace", match: /squarespace/i, steps: ["In Squarespace, open Settings → Advanced → Code Injection (newer sites: Website → Pages → Custom code → Code injection).", "Paste the line into Header.", "Save."] },
  { id: "wordpress", label: "WordPress", match: /wordpress|woocommerce/i, steps: ["Install the free WPCode plugin (Plugins → Add New → “WPCode”).", "Open Code Snippets → Header & Footer and paste the line into Header.", "Save changes."] },
  { id: "shopify", label: "Shopify", match: /shopify/i, steps: ["In Shopify, open Online Store → Themes → ⋯ → Edit code.", "Open theme.liquid and paste the line just above </head>.", "Save. For sales with their amounts, also connect your store under Advanced."] },
  { id: "webflow", label: "Webflow", match: /webflow/i, steps: ["In Webflow, open Site settings → Custom code.", "Paste the line into Head code.", "Save, then Publish the site."] },
  { id: "godaddy", label: "GoDaddy", match: /godaddy/i, steps: ["In the GoDaddy website builder, open Settings → Site-wide code (Head HTML).", "Paste the line.", "Save, then Publish."] },
  { id: "other", label: "Something else", match: null, steps: ["Paste the line inside <head> on every page of your site.", "Not sure how? Send it to whoever built your website — it's a two-minute job for them."] },
];

/** The paste guide that fits the website MAIRO read, or "other". */
export function pasteGuideFor(platform: string | null | undefined): string {
  const p = platform ?? "";
  return PASTE_STEPS.find((g) => g.match && g.match.test(p))?.id ?? "other";
}
