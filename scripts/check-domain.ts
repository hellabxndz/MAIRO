// Checks the site's own address and everything that follows from it:
//
//   - Production sends other addresses (.vercel.app, www) to the one in
//     NEXT_PUBLIC_APP_URL; previews and local runs are left alone; nothing
//     under /api is moved.
//   - The addresses Meta, Google and Stripe keep are built from that one
//     address, with the exact callback paths the code serves.
//
//   npm run check:domain   (pure; no network)

import assert from "node:assert/strict";
import { canonicalHostRedirects, configuredOrigin } from "../src/lib/canonical-host";
import { addressesToRegister } from "../src/lib/domain";
import { metaRedirectUri } from "../src/lib/meta/oauth";
import { gtmRedirectUri } from "../src/lib/tracking/gtm-api/oauth";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

check("only a plain https origin counts as the site's address", () => {
  assert.equal(configuredOrigin("https://mairo.io")?.host, "mairo.io");
  assert.equal(configuredOrigin(" https://mairo.io/ ")?.host, "mairo.io");
  assert.equal(configuredOrigin("http://mairo.io"), null);
  assert.equal(configuredOrigin("https://mairo.io/app"), null);
  assert.equal(configuredOrigin("mairo.io"), null);
  assert.equal(configuredOrigin(""), null);
  assert.equal(configuredOrigin(undefined), null);
});

check("production sends every other host to mairo.io, keeping the path", () => {
  const [r, ...rest] = canonicalHostRedirects({ VERCEL_ENV: "production", NEXT_PUBLIC_APP_URL: "https://mairo.io" });
  assert.equal(rest.length, 0);
  assert.deepEqual(r.missing, [{ type: "host", value: "mairo\\.io" }]);
  assert.equal(r.destination, "https://mairo.io/:path");
  assert.equal(r.permanent, false, "temporary, so a mistake isn't cached by browsers");
});

check("nothing under /api or /_next is moved (Stripe, logins, scheduled jobs)", () => {
  const [r] = canonicalHostRedirects({ VERCEL_ENV: "production", NEXT_PUBLIC_APP_URL: "https://mairo.io" });
  const pattern = new RegExp(`^/${r.source.slice("/:path(".length, -1)}$`);
  for (const p of ["/", "/pricing", "/dashboard/meta", "/f/abc?c=1", "/privacy", "/apis-are-pages"]) assert.ok(pattern.test(p.split("?")[0]), p);
  for (const p of ["/api/stripe/webhook", "/api/meta/callback", "/api/cron/review", "/_next/static/x.js"]) assert.ok(!pattern.test(p), p);
});

check("previews, local runs and a missing or malformed address redirect nothing", () => {
  assert.deepEqual(canonicalHostRedirects({ VERCEL_ENV: "preview", NEXT_PUBLIC_APP_URL: "https://mairo.io" }), []);
  assert.deepEqual(canonicalHostRedirects({ NEXT_PUBLIC_APP_URL: "https://mairo.io" }), []);
  assert.deepEqual(canonicalHostRedirects({ VERCEL_ENV: "production" }), []);
  assert.deepEqual(canonicalHostRedirects({ VERCEL_ENV: "production", NEXT_PUBLIC_APP_URL: "mairo.io" }), []);
});

check("the addresses to register are built from the one address, with the served callback paths", () => {
  const by = Object.fromEntries(addressesToRegister("https://mairo.io/").map((a) => [a.key, a.value]));
  assert.equal(by["meta-redirect"], "https://mairo.io/api/meta/callback");
  assert.equal(by["meta-domain"], "mairo.io");
  assert.equal(by["google-signin"], "https://mairo.io/api/auth/callback/google");
  assert.equal(by.gtm, "https://mairo.io/api/gtm/callback");
  assert.equal(by["google-origin"], "https://mairo.io");
  assert.equal(by["stripe-webhook"], "https://mairo.io/api/stripe/webhook");
  assert.equal(by.privacy, "https://mairo.io/privacy");
  assert.equal(by.terms, "https://mairo.io/terms");
  assert.equal(by["data-deletion"], "https://mairo.io/data-deletion");
});

check("the login return addresses follow the site's address, and an explicit setting still wins", () => {
  const keep = { a: process.env.NEXT_PUBLIC_APP_URL, m: process.env.META_REDIRECT_URI, g: process.env.GOOGLE_REDIRECT_URI, v: process.env.VERCEL_PROJECT_PRODUCTION_URL };
  try {
    delete process.env.META_REDIRECT_URI;
    delete process.env.GOOGLE_REDIRECT_URI;
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "mairo.io";
    process.env.NEXT_PUBLIC_APP_URL = "https://www.mairo.io";
    assert.equal(metaRedirectUri(), "https://www.mairo.io/api/meta/callback");
    assert.equal(gtmRedirectUri(), "https://www.mairo.io/api/gtm/callback");
    delete process.env.NEXT_PUBLIC_APP_URL;
    assert.equal(metaRedirectUri(), "https://mairo.io/api/meta/callback", "Vercel's production domain is the fallback");
    process.env.META_REDIRECT_URI = "https://mairo-three.vercel.app/api/meta/callback";
    assert.equal(metaRedirectUri(), "https://mairo-three.vercel.app/api/meta/callback", "a pinned address wins");
  } finally {
    for (const [k, v] of [["NEXT_PUBLIC_APP_URL", keep.a], ["META_REDIRECT_URI", keep.m], ["GOOGLE_REDIRECT_URI", keep.g], ["VERCEL_PROJECT_PRODUCTION_URL", keep.v]] as const) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
});

check("www as the main address: the apex and the .vercel.app domain are sent to it, /api stays", () => {
  const [r] = canonicalHostRedirects({ VERCEL_ENV: "production", NEXT_PUBLIC_APP_URL: "https://www.mairo.io" });
  assert.deepEqual(r.missing, [{ type: "host", value: "www\\.mairo\\.io" }]);
  assert.equal(r.destination, "https://www.mairo.io/:path");
});

console.log(`\nDomain: ${passed} checks passed`);
