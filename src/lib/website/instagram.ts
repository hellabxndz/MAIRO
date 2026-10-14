import { readFileSync } from "node:fs";
import { join } from "node:path";
import { safeFetch, type SafeFetchResult } from "@/lib/net/safe-fetch";

// "Analyze my Instagram", for a visitor without a website (or who'd rather
// start there): what Instagram itself shows anyone who opens the profile
// without signing in — the profile's name, its bio and the link in the bio —
// read with one request through safeFetch. Nothing more: no posts, no
// follower lists, no insights, nothing behind a login, and no claim to any of
// them. Instagram often shows signed-out visitors no profile at all; that is
// said plainly and the visitor describes the business instead.
//
// Pure parsing (readProfileHtml) is separate from the request so it's pinned
// by scripts/check-instagram.ts without touching Instagram.

export type InstagramProfile = {
  handle: string;
  name: string | null;
  bio: string | null;
  /** The link in the bio, when Instagram shows it — the visitor's website, often. */
  website: string | null;
};

export type InstagramRead =
  | { status: "read"; profile: InstagramProfile }
  /** Instagram didn't show a profile to a signed-out visitor (a login page, a private profile, a block). */
  | { status: "unavailable"; handle: string; message: string }
  | { status: "not_found"; handle: string; message: string }
  | { status: "invalid"; message: string };

const HANDLE = /^(?!.*\.\.)(?!\.)[a-z0-9._]{1,30}(?<!\.)$/;

/** "@nova.clothing", "nova.clothing", "instagram.com/nova.clothing/" → "nova.clothing"; null when it can't be a username. */
export function normalizeHandle(raw: string): string | null {
  let s = raw.trim().toLowerCase();
  const fromUrl = s.match(/^(?:https?:\/\/)?(?:www\.|m\.)?instagram\.com\/([^/?#]+)/);
  if (fromUrl) s = fromUrl[1];
  s = s.replace(/^@+/, "").replace(/\/+$/, "");
  if (["p", "reel", "reels", "explore", "accounts", "stories", "direct"].includes(s)) return null;
  return HANDLE.test(s) ? s : null;
}

const decode = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));

function meta(html: string, key: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0];
  const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
  return content ? decode(content).trim() : null;
}

/**
 * What a signed-out profile page says, or null when it isn't a profile page.
 * Instagram's preview tags read like: og:title "Nova Clothing (@novaclothing) •
 * Instagram photos and videos", and a description that can carry the bio as
 * `on Instagram: "…"`. Follower and post counts in that description are left
 * out on purpose — they're not what an advertising plan is built on.
 */
export function readProfileHtml(handle: string, html: string): InstagramProfile | null {
  const title = meta(html, "og:title") ?? html.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim() ?? null;
  if (!title || !title.toLowerCase().includes(`@${handle}`)) return null;
  const name = title.match(/^(.*?)\s*\(@[^)]+\)/)?.[1]?.trim() || null;
  const description = meta(html, "og:description") ?? meta(html, "description");
  const bio = description?.match(/on Instagram:\s*["“]([\s\S]+)["”]\s*$/)?.[1]?.replace(/\s+/g, " ").trim().slice(0, 300) || null;
  const raw = html.match(/"external_url"\s*:\s*"((?:[^"\\]|\\.)+)"/)?.[1]?.replace(/\\\//g, "/") ?? null;
  const link = raw && /^https?:\/\/[^\s"<>]+$/.test(raw) ? raw : null;
  return { handle, name, bio, website: link };
}

type Fetch = (url: string) => Promise<SafeFetchResult>;

/**
 * Local test profiles, for the browser checks: only when MAIRO_SCAN_FIXTURES
 * names a folder and this isn't running on Vercel, and only for handles
 * starting "fixture." — a test can never reach Instagram.
 */
function fixtureFetch(handle: string): Fetch | null {
  const dir = process.env.MAIRO_SCAN_FIXTURES?.trim();
  if (!dir || process.env.VERCEL || !handle.startsWith("fixture.")) return null;
  return async (url) => {
    try {
      const body = readFileSync(join(dir, "instagram", `${handle.replace(/[^a-z0-9._]/g, "")}.html`), "utf8");
      return { ok: true, status: 200, finalUrl: url, body, contentType: "text/html", bytes: body.length, redirects: [] };
    } catch {
      return { ok: false, reason: "error_status", status: 404, message: "Not found (404)." };
    }
  };
}

const UNAVAILABLE = "Instagram didn't show this profile to MAIRO without signing in — that's common, and private profiles are never shown. Tell MAIRO about your business instead; it takes a minute.";

export async function readInstagram(raw: string, fetcher?: Fetch): Promise<InstagramRead> {
  const handle = normalizeHandle(raw);
  if (!handle) return { status: "invalid", message: "That doesn't look like an Instagram username. Enter it like @yourbusiness." };
  const get = fetcher ?? fixtureFetch(handle) ?? ((url: string) => safeFetch(url, { timeoutMs: 8_000, maxBytes: 600_000 }));
  const res = await get(`https://www.instagram.com/${handle}/`);
  if (!res.ok) {
    if (res.reason === "error_status" && res.status === 404) return { status: "not_found", handle, message: `Instagram says there's no profile called @${handle}. Check the spelling, or tell MAIRO about your business instead.` };
    return { status: "unavailable", handle, message: UNAVAILABLE };
  }
  // A redirect to the login page, or a page that isn't this profile, means Instagram showed nothing.
  if (/\/accounts\/login/.test(res.finalUrl)) return { status: "unavailable", handle, message: UNAVAILABLE };
  const profile = readProfileHtml(handle, res.body);
  if (!profile) return { status: "unavailable", handle, message: UNAVAILABLE };
  return { status: "read", profile };
}
