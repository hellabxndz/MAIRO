import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

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
    }
  | { ok: false; reason: "unreachable" | "blocked" | "error_status"; status?: number; message: string };

const MAX_BYTES = 400_000;
const TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 4;

function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 6) {
    const a = address.toLowerCase();
    if (a === "::1" || a === "::") return true;
    if (a.startsWith("fc") || a.startsWith("fd") || a.startsWith("fe80")) return true;
    const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? isPrivateAddress(mapped[1]) : false;
  }
  const [a, b] = address.split(".").map(Number);
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

async function publicHost(url: URL): Promise<boolean> {
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  if (url.hostname === "localhost" || url.hostname.endsWith(".local") || url.hostname.endsWith(".internal")) {
    return false;
  }
  try {
    const addresses = await lookup(url.hostname, { all: true });
    return addresses.length > 0 && addresses.every((a) => !isPrivateAddress(a.address));
  } catch {
    return false;
  }
}

/** Reads the page, following redirects one at a time so each hop is checked. */
export async function probeLandingPage(rawUrl: string): Promise<LandingProbe> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "unreachable", message: "That address isn't a web page MAIRO can open." };
  }

  const signal = AbortSignal.timeout(TIMEOUT_MS);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!(await publicHost(url))) {
      return { ok: false, reason: "blocked", message: "MAIRO can only check public web pages." };
    }
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "manual",
        signal,
        headers: {
          // A phone, because that's how most people will open the ad.
          "user-agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MAIRO-check",
          accept: "text/html",
        },
      });
    } catch {
      return {
        ok: false,
        reason: "unreachable",
        message: "The page didn't answer. It may be down, or blocking automated checks.",
      };
    }

    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url);
      continue;
    }
    if (res.status >= 400) {
      return {
        ok: false,
        reason: "error_status",
        status: res.status,
        message: `The page answered with an error (${res.status}). People clicking the ad would land on it.`,
      };
    }

    const html = await readCapped(res);
    return {
      ok: true,
      status: res.status,
      finalUrl: url.toString(),
      mobileReady: /<meta[^>]+name=["']?viewport["']?[^>]*>/i.test(html),
      hasMetaPixel: /connect\.facebook\.net\/[^"']*fbevents\.js|fbq\(\s*['"]init['"]/i.test(html),
      title: html.match(/<title[^>]*>([^<]{1,200})<\/title>/i)?.[1]?.trim() ?? null,
    };
  }
  return { ok: false, reason: "unreachable", message: "The page redirected too many times." };
}

async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    total += value.byteLength;
  }
  await reader.cancel().catch(() => {});
  return new TextDecoder().decode(Buffer.concat(chunks));
}
