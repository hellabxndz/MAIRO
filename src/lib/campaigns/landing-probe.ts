import { safeFetch } from "@/lib/net/safe-fetch";

// A quick look at the page an ad sends people to, before money is spent on
// sending them there: does it load, is it built for phones, and does it carry
// Meta's pixel. Server-side only.
//
// The URL comes from the customer, so it is fetched only after its host is
// shown to resolve to a public address. Otherwise this would be a way to make
// the server request its own internal network.

export type LandingProbe =
  | {
      ok: true;
      status: number;
      finalUrl: string;
      /** Has a mobile viewport tag — the basic sign a page is built for phones. */
      mobileReady: boolean;
      /** Loads Meta's pixel script. Says nothing about whether events fire. */
      hasMetaPixel: boolean;
      title: string | null;
      /**
       * The page's visible words, shortened. Lets the review say "the ad's
       * offer isn't on this page" only when it really isn't in the text.
       * Absent when the page builds its words with JavaScript.
       */
      text?: string;
    }
  | { ok: false; reason: "unreachable" | "blocked" | "error_status"; status?: number; message: string };

const MAX_BYTES = 400_000;
const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";

/** Reads the page, following redirects one at a time so each hop is checked. */
export async function probeLandingPage(rawUrl: string): Promise<LandingProbe> {
  // A phone, because that's how most people will open the ad. The fetch
  // itself refuses anything that isn't the public internet (net/safe-fetch).
  const r = await safeFetch(rawUrl, { maxBytes: MAX_BYTES, userAgent: `${PHONE_UA} MAIRO-check` });
  if (!r.ok) {
    if (r.reason === "blocked") return { ok: false, reason: "blocked", message: "MAIRO can only check public web pages." };
    if (r.reason === "error_status") return { ok: false, reason: "error_status", status: r.status, message: `The page answered with an error (${r.status}). People clicking the ad would land on it.` };
    if (r.reason === "invalid") return { ok: false, reason: "unreachable", message: "That address isn't a web page MAIRO can open." };
    if (r.reason === "too_many_redirects") return { ok: false, reason: "unreachable", message: "The page redirected too many times." };
    return { ok: false, reason: "unreachable", message: "The page didn't answer. It may be down, or blocking automated checks." };
  }
  const html = r.body;
  return {
    ok: true,
    status: r.status,
    finalUrl: r.finalUrl,
    mobileReady: /<meta[^>]+name=["']?viewport["']?[^>]*>/i.test(html),
    hasMetaPixel: /connect\.facebook\.net\/[^"']*fbevents\.js|fbq\(\s*['"]init['"]/i.test(html),
    title: html.match(/<title[^>]*>([^<]{1,200})<\/title>/i)?.[1]?.trim() ?? null,
    text: visibleText(html),
  };
}

/** The words a person would see, without scripts, styles or markup. */
export function visibleText(html: string, max = 12_000): string {
  return html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#37;|&percnt;/g, "%")
    .replace(/&[a-z0-9#]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export type PublicPage =
  | { ok: true; html: string; finalUrl: string; status: number; bytes: number }
  | { ok: false; message: string };

/**
 * Reads a public web page's HTML, with the same safety as the probe above:
 * each redirect hop is checked to resolve to a public address first.
 *
 * Used by the Business Analyzer, which reads a few pages of a business's own
 * site. The URL is still customer input, so it gets the same treatment.
 */
export async function fetchPublicPage(rawUrl: string, maxBytes = MAX_BYTES): Promise<PublicPage> {
  const r = await safeFetch(rawUrl, { maxBytes, userAgent: `${PHONE_UA} MAIRO-analyzer` });
  if (!r.ok) return { ok: false, message: r.message };
  return { ok: true, html: r.body, finalUrl: r.finalUrl, status: r.status, bytes: r.bytes };
}
