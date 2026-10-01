import { fetchable } from "./catalog";

// Fetching a source, safely. Documentation is untrusted input: it is read as
// text, capped, and never executed, followed or obeyed.
//
// - https only, allowlisted hosts only (sources/catalog.ts);
// - redirects are followed by hand, at most three, and each hop must stay on
//   the allowlist;
// - 15 seconds and 3 MB at most;
// - no cookies or credentials are ever sent.

const MAX_BYTES = 3 * 1024 * 1024;
const TIMEOUT_MS = 15_000;

export type Fetched = { ok: true; url: string; html: string } | { ok: false; url: string; error: string };

export async function fetchSource(url: string, fetcher: typeof fetch = fetch): Promise<Fetched> {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    if (!fetchable(current)) return { ok: false, url: current, error: "Not an allowlisted https source." };
    let res: Response;
    try {
      res = await fetcher(current, {
        redirect: "manual",
        cache: "no-store",
        credentials: "omit",
        headers: { "User-Agent": "MAIRO-MetaIntelligence/1.0 (+documentation monitor)", Accept: "text/html,text/plain" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      return { ok: false, url: current, error: `Couldn't reach it: ${error instanceof Error ? error.message : String(error)}`.slice(0, 300) };
    }
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      if (!next) return { ok: false, url: current, error: `Redirect (${res.status}) without a location.` };
      current = new URL(next, current).toString();
      continue;
    }
    if (!res.ok) return { ok: false, url: current, error: `HTTP ${res.status}` };
    const type = res.headers.get("content-type") ?? "";
    if (type && !/text\/html|text\/plain|application\/xhtml/.test(type)) return { ok: false, url: current, error: `Unexpected content type ${type}` };
    const reader = res.body?.getReader();
    if (!reader) return { ok: true, url: current, html: (await res.text()).slice(0, MAX_BYTES) };
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel().catch(() => undefined);
        break;
      }
      chunks.push(value);
    }
    const html = new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks.map((c) => Buffer.from(c))));
    return { ok: true, url: current, html };
  }
  return { ok: false, url: current, error: "Too many redirects." };
}
