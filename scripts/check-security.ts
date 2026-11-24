// Security regressions this repository has been audited for:
//
//   - Every API route is accounted for: signed in, signed by its sender, a
//     cron secret, rate-limited, or listed below as public with the reason.
//   - Cron routes compare their secret in constant time and refuse when none
//     is configured.
//   - The public funnel endpoint refuses a flood from one address.
//   - Dependencies stay at or above the versions that fixed known
//     vulnerabilities (Next.js image-optimizer / use-cache RCE, undici,
//     zod, effect).
//   - Nothing secret is exposed to the browser through NEXT_PUBLIC_.
//
//   npm run check:security   (pure; no database, no network)

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { bearerMatches } from "@/lib/security/bearer";
import { EVENT_LIMIT, tooManyEvents } from "@/lib/security/rate";

let bad = 0;
const ok = (n: string, c: boolean, x = "") => {
  if (!c) {
    bad++;
    console.log(`  FAIL ${n} ${x}`);
  } else console.log(`  ok   ${n}`);
};
const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");
const walk = (dir: string, out: string[] = []) => {
  for (const f of readdirSync(join(root, dir))) {
    const p = join(dir, f);
    if (statSync(join(root, p)).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
};

console.log("— every API route is accounted for —");
// Public on purpose, and why. Anything not here must show a guard in its own file.
const PUBLIC: Record<string, string> = {
  "auth/[...nextauth]": "NextAuth's own sign-in endpoints",
  "health": "uptime check; answers ok/up only",
  "site-pixel": "MAIRO's own page-view beacon",
  "events": "anonymous funnel events; fixed list, rate-limited in lib/security/rate.ts",
  "monitoring/client-error": "browser error reports; scrubbed and rate-limited in the route",
  "tools/ad-plan": "free plan writer; database quota per visitor and per day (lib/tools)",
  "tools/instagram": "public profile preview; same quota as the website check",
  "free-plan/refine": "free plan edits; hourly quota, then rules only",
  "preview/refine": "first-ad edits; quota per visitor",
  "creatives/[imageId]/raw": "final ad pictures Instagram must fetch; capability URL by unguessable id",
  "social/media/[postId]/[index]": "post pictures Instagram must fetch; capability URL by unguessable id",
};
const routes = walk("src/app/api").filter((p) => p.endsWith("route.ts"));
for (const p of routes) {
  const name = p.replace("src/app/api/", "").replace("/route.ts", "");
  const s = read(p);
  const guarded = /\bauth\(\)/.test(s) || /bearerMatches\(|constructEvent\(|signature/i.test(s) || /quota|tooMany|rateLimit/i.test(s);
  ok(`${name}: ${guarded ? "guarded" : PUBLIC[name] ? `public — ${PUBLIC[name]}` : "UNACCOUNTED"}`, guarded || Boolean(PUBLIC[name]));
}

console.log("\n— cron secret —");
ok("the right secret passes", bearerMatches("Bearer s3cret-value", "s3cret-value"));
ok("a wrong secret fails", !bearerMatches("Bearer s3cret-valuX", "s3cret-value"));
ok("a prefix of the secret fails", !bearerMatches("Bearer s3cret", "s3cret-value"));
ok("no header fails", !bearerMatches(null, "s3cret-value"));
ok("no secret configured: closed, even for an empty bearer", !bearerMatches("Bearer ", undefined) && !bearerMatches("Bearer undefined", undefined));
for (const p of ["src/app/api/cron/launch/route.ts", "src/app/api/cron/review/route.ts"]) {
  const s = read(p);
  ok(`${p}: uses the constant-time check, not ===`, /bearerMatches\(req\.headers\.get\("authorization"\), process\.env\.CRON_SECRET\)/.test(s) && !/header === `Bearer/.test(s));
}

console.log("\n— public funnel endpoint —");
{
  const store = new Map<string, number[]>();
  const t = 1_800_000_000_000;
  let refused = 0;
  for (let i = 0; i < EVENT_LIMIT.max + 30; i++) if (tooManyEvents("203.0.113.9", t + i, store)) refused++;
  ok(`one address is cut off after ${EVENT_LIMIT.max} events in ten minutes`, refused === 30, String(refused));
  ok("another address is unaffected", !tooManyEvents("198.51.100.4", t, store));
  ok("the window moves on", !tooManyEvents("203.0.113.9", t + EVENT_LIMIT.windowMs + 1, store));
  ok("the route applies it before parsing", /if \(tooManyEvents\(requestAddress\(request\), Date\.now\(\)\)\) return new NextResponse\(null, \{ status: 429 \}\)/.test(read("src/app/api/events/route.ts")));
}

console.log("\n— patched dependencies —");
const version = (pkg: string) => JSON.parse(read(`node_modules/${pkg}/package.json`)).version as string;
const atLeast = (v: string, min: string) => {
  const a = v.split(/[.-]/).map(Number);
  const b = min.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== b[i]) return (a[i] ?? 0) > b[i];
  return true;
};
for (const [pkg, min, why] of [
  ["next", "16.4.6", "image optimizer and use-cache RCE (GHSA-2464-fhr4-w9xw, GHSA-673q-mjm6-r5xr)"],
  ["undici", "6.29.1", "TLS validation bypass, request smuggling, DoS"],
  ["zod", "4.6.6", "memory exhaustion on oversized collections"],
  ["effect", "3.22.1", "ReDoS"],
] as const) {
  const v = version(pkg);
  ok(`${pkg} ${v} ≥ ${min} — ${why}`, atLeast(v, min));
}
const pkg = JSON.parse(read("package.json")) as { overrides?: Record<string, string> };
ok("the overrides that keep transitive copies patched are in package.json", ["undici", "zod", "effect"].every((k) => Boolean(pkg.overrides?.[k])));

console.log("\n— nothing secret reaches the browser —");
{
  const names = new Set<string>();
  for (const p of walk("src").filter((x) => /\.(ts|tsx)$/.test(x) && !x.includes("/generated/"))) for (const m of read(p).matchAll(/process\.env\.(NEXT_PUBLIC_[A-Z0-9_]+)/g)) names.add(m[1]);
  const risky = [...names].filter((n) => /SECRET|TOKEN|KEY|PASSWORD|DATABASE|PRIVATE/.test(n));
  ok(`public variables are non-secret (${[...names].sort().join(", ")})`, risky.length === 0, risky.join(", "));
  const inner = walk("src").filter((x) => /\.tsx$/.test(x)).filter((p) => /dangerouslySetInnerHTML/.test(read(p)));
  ok("raw HTML only in the two audited places (JSON-LD, theme script)", inner.every((p) => /film-schema\.tsx$|app\/layout\.tsx$/.test(p)), inner.join(", "));
}

if (bad) {
  console.log(`\n${bad} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll security checks passed.");
