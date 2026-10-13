import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { lookup as dnsLookupAsync } from "node:dns/promises";
import { isIP } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";

// Fetching a web address a customer typed, without letting it reach anything
// but the public internet.
//
// A business's website address is customer input. Fetched naively, it's a way
// to make MAIRO's server request its own network: a cloud metadata endpoint, a
// database on a private address, localhost. So every request here:
//
//   - accepts only http(s), on the standard ports, with no user:password@;
//   - refuses hostnames that are local by name (localhost, *.local, …);
//   - resolves the host and refuses it if ANY address is private, before
//     connecting — for a readable error;
//   - checks again at connection time, inside the socket's own DNS lookup, so
//     a name that resolves publicly first and privately a moment later (DNS
//     rebinding) still can't connect;
//   - follows redirects one at a time, checking each hop the same way;
//   - stops after a timeout and a size limit.
//
// What comes back is untrusted text. Callers treat it as data: they extract
// facts from it and never follow instructions in it.

/** True for every address that isn't on the public internet. */
export function isPrivateAddress(address: string): boolean {
  const v = isIP(address);
  if (v === 6) {
    const a = address.toLowerCase();
    if (a === "::1" || a === "::") return true;
    // An IPv4 address carried inside IPv6, dotted ("::ffff:127.0.0.1") or as
    // the URL parser rewrites it ("::ffff:7f00:1"), is judged as that IPv4.
    const mapped = a.match(/^(?:::ffff:|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    const hex = a.match(/^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hex) {
      const hi = parseInt(hex[1], 16);
      const lo = parseInt(hex[2], 16);
      return isPrivateAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    // Unique local, link-local, site-local (deprecated), multicast, documentation.
    return /^(f[cd]|fe[89ab]|fe[c-f]|ff)/.test(a) || a.startsWith("2001:db8") || a.startsWith("100::");
  }
  if (v !== 4) return true;
  const [a, b, c] = address.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, including cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224 // multicast and reserved
  );
}

const LOCAL_NAMES = /^(localhost|.*\.localhost|.*\.local|.*\.internal|.*\.lan|.*\.home\.arpa|metadata\.google\.internal)$/i;

export type UrlProblem = "not-a-url" | "scheme" | "credentials" | "port" | "local-name" | "private-address";

/** Why this URL may not be fetched, before any network is touched — or null. */
export function urlProblem(raw: string): UrlProblem | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "not-a-url";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "scheme";
  if (url.username || url.password) return "credentials";
  if (url.port && url.port !== "80" && url.port !== "443") return "port";
  // "localhost." is localhost: a trailing dot is the fully qualified form.
  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (LOCAL_NAMES.test(host)) return "local-name";
  if (isIP(host) && isPrivateAddress(host)) return "private-address";
  return null;
}

/**
 * Resolves the host: "public" when every address is public, "private" when
 * any isn't, "unresolved" when the name doesn't resolve at all — a domain
 * that doesn't exist is a different answer from one that's off-limits.
 */
export async function resolveHost(hostname: string): Promise<"public" | "private" | "unresolved"> {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return isPrivateAddress(host) ? "private" : "public";
  try {
    const addresses = await dnsLookupAsync(host, { all: true });
    if (!addresses.length) return "unresolved";
    return addresses.every((a) => !isPrivateAddress(a.address)) ? "public" : "private";
  } catch {
    return "unresolved";
  }
}

/** Resolves the host and says whether every address it has is public. */
export async function resolvesPublicly(hostname: string): Promise<boolean> {
  return (await resolveHost(hostname)) === "public";
}

/**
 * The socket's own DNS lookup, refusing private answers. Passed to the HTTP
 * agent, so the address actually connected to is the one checked.
 */
export function guardedLookup(
  hostname: string,
  options: { all?: boolean; family?: number } | number | undefined,
  callback: (err: NodeJS.ErrnoException | null, address?: string | LookupAddress[], family?: number) => void,
): void {
  const opts = typeof options === "number" ? { family: options } : options ?? {};
  dnsLookup(hostname, { ...opts, all: true }, (err, addresses) => {
    if (err) return callback(err);
    const list = addresses as LookupAddress[];
    if (!list.length || list.some((a) => isPrivateAddress(a.address))) {
      const blocked = new Error(`Refused to connect to ${hostname}: it resolves to a private address.`) as NodeJS.ErrnoException;
      blocked.code = "EPRIVATEADDRESS";
      return callback(blocked);
    }
    if (opts.all) return callback(null, list);
    return callback(null, list[0].address, list[0].family);
  });
}

let agent: Agent | null = null;
function guardedAgent(): Agent {
  agent ??= new Agent({
    connect: { lookup: guardedLookup as never, timeout: 6_000 },
    headersTimeout: 8_000,
    bodyTimeout: 8_000,
    maxRedirections: 0,
  });
  return agent;
}

export type SafeFetchOptions = {
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  accept?: string;
  userAgent?: string;
};

export type SafeFetchResult =
  | { ok: true; status: number; finalUrl: string; body: string; contentType: string | null; bytes: number; redirects: string[] }
  | { ok: false; reason: "invalid" | "blocked" | "unreachable" | "error_status" | "too_many_redirects"; status?: number; message: string };

const MESSAGE: Record<UrlProblem, string> = {
  "not-a-url": "That isn't a web address MAIRO can open.",
  scheme: "Only http and https web addresses can be opened.",
  credentials: "Web addresses with a username or password in them can't be opened.",
  port: "Only web addresses on the standard ports can be opened.",
  "local-name": "MAIRO can only open public web pages.",
  "private-address": "MAIRO can only open public web pages.",
};

export async function safeFetch(raw: string, opts: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const { maxBytes = 400_000, timeoutMs = 8_000, maxRedirects = 4, accept = "text/html", userAgent = "MAIRO/1.0 (+https://www.mairo.io)" } = opts;
  const redirects: string[] = [];
  let current = raw;
  const signal = AbortSignal.timeout(timeoutMs);

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const problem = urlProblem(current);
    if (problem) return { ok: false, reason: problem === "not-a-url" || problem === "scheme" ? "invalid" : "blocked", message: MESSAGE[problem] };
    const url = new URL(current);
    const resolved = await resolveHost(url.hostname);
    if (resolved === "private") return { ok: false, reason: "blocked", message: "MAIRO can only open public web pages." };
    if (resolved === "unresolved") return { ok: false, reason: "unreachable", message: "That address doesn't exist, or its domain isn't answering. Check the spelling." };

    let res: Awaited<ReturnType<typeof undiciFetch>>;
    try {
      res = await undiciFetch(url, { redirect: "manual", signal, dispatcher: guardedAgent(), headers: { "user-agent": userAgent, accept } });
    } catch (error) {
      const code = (error as { cause?: { code?: string } })?.cause?.code;
      if (code === "EPRIVATEADDRESS") return { ok: false, reason: "blocked", message: "MAIRO can only open public web pages." };
      return { ok: false, reason: "unreachable", message: "The site didn't answer. It may be down, or blocking automated visits." };
    }

    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel().catch(() => {});
      current = new URL(location, url).toString();
      redirects.push(current);
      continue;
    }
    if (res.status >= 400) {
      await res.body?.cancel().catch(() => {});
      return { ok: false, reason: "error_status", status: res.status, message: `The site answered with an error (${res.status}).` };
    }

    const body = await readCapped(res.body as ReadableStream<Uint8Array> | null, maxBytes);
    return { ok: true, status: res.status, finalUrl: url.toString(), body, contentType: res.headers.get("content-type"), bytes: Buffer.byteLength(body), redirects };
  }
  return { ok: false, reason: "too_many_redirects", message: "The site redirected too many times." };
}

async function readCapped(stream: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<string> {
  if (!stream) return "";
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value.byteLength + total > maxBytes ? value.subarray(0, maxBytes - total) : value);
    total += value.byteLength;
  }
  await reader.cancel().catch(() => {});
  return new TextDecoder().decode(Buffer.concat(chunks));
}
