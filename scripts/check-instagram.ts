// Checks "Analyze my Instagram" reads only what Instagram shows a signed-out
// visitor, and says so when that's nothing:
//
//   - usernames and profile links normalize; anything else is refused;
//   - a profile page's name, bio and bio link are read — never follower or
//     post counts, posts or anything behind a login;
//   - a login wall, a page for someone else, a 404 or a network failure each
//     give an honest answer, never invented facts;
//   - facts from the profile are marked as from Instagram.
//
//   npm run check:instagram   (pure; fixtures and a pretend fetch, no network)

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeHandle, readInstagram, readProfileHtml } from "../src/lib/website/instagram";
import { factsFromInstagram } from "../src/lib/preview/build";

const root = join(import.meta.dirname, "..");
const fixture = (n: string) => readFileSync(join(root, "scripts/fixtures/sites/instagram", n), "utf8");
let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}
const page = (body: string, finalUrl = "https://www.instagram.com/x/") => async () => ({ ok: true as const, status: 200, finalUrl, body, contentType: "text/html", bytes: body.length, redirects: [] });

async function main() {
  console.log("— usernames —");
  await check("usernames and profile links normalize; anything else is refused", () => {
    assert.equal(normalizeHandle("@NovaClothing"), "novaclothing");
    assert.equal(normalizeHandle("nova.clothing"), "nova.clothing");
    assert.equal(normalizeHandle("https://www.instagram.com/nova_clothing/?hl=en"), "nova_clothing");
    assert.equal(normalizeHandle("instagram.com/nova"), "nova");
    for (const bad of ["", "@", "nova clothing", "a".repeat(31), ".nova", "nova.", "no..va", "https://instagram.com/p/abc", "https://instagram.com/explore"]) assert.equal(normalizeHandle(bad), null, bad);
  });

  console.log("\n— reading a public profile —");
  await check("the name, bio and bio link are read; follower and post counts are not", () => {
    const p = readProfileHtml("fixture.novaclothing", fixture("fixture.novaclothing.html"));
    assert.deepEqual(p, { handle: "fixture.novaclothing", name: "Nova Clothing", bio: "Premium streetwear for young adults. Designed in Austin. New drops every Friday.", website: "https://shop.fixture.test/" });
    assert.doesNotMatch(JSON.stringify(p), /1,204|Followers|Posts/);
  });
  await check("a login page, or a page for someone else, is not a profile", () => {
    assert.equal(readProfileHtml("fixture.loginwall", fixture("fixture.loginwall.html")), null);
    assert.equal(readProfileHtml("someoneelse", fixture("fixture.novaclothing.html")), null);
  });
  await check("readInstagram answers honestly for each outcome", async () => {
    const ok = await readInstagram("@fixture.novaclothing", page(fixture("fixture.novaclothing.html")));
    assert.equal(ok.status, "read");
    const wall = await readInstagram("nova", page(fixture("fixture.loginwall.html")));
    assert.equal(wall.status, "unavailable");
    assert.match(wall.status === "unavailable" ? wall.message : "", /didn't show this profile.*without signing in/);
    const redirected = await readInstagram("nova", page(fixture("fixture.novaclothing.html"), "https://www.instagram.com/accounts/login/?next=/nova/"));
    assert.equal(redirected.status, "unavailable");
    const missing = await readInstagram("nova", async () => ({ ok: false as const, reason: "error_status" as const, status: 404, message: "404" }));
    assert.equal(missing.status, "not_found");
    const down = await readInstagram("nova", async () => ({ ok: false as const, reason: "unreachable" as const, message: "timeout" }));
    assert.equal(down.status, "unavailable");
    assert.equal((await readInstagram("not a username")).status, "invalid");
  });
  await check("without a test folder, a fixture username still goes nowhere but the real request path", async () => {
    // The fixture shortcut needs MAIRO_SCAN_FIXTURES and is off on Vercel; here a pretend fetch stands in.
    const r = await readInstagram("fixture.novaclothing", page(fixture("fixture.loginwall.html")));
    assert.equal(r.status, "unavailable");
  });

  console.log("\n— into the free plan —");
  await check("facts from the profile are marked as from Instagram, and nothing else is filled in", () => {
    const f = factsFromInstagram({ handle: "novaclothing", name: "Nova Clothing", bio: "Premium streetwear for young adults. Designed in Austin.", website: "https://nova.example/" });
    assert.equal(f.name, "Nova Clothing");
    assert.equal(f.offering, "Premium streetwear for young adults");
    assert.deepEqual(f.sources.name, { from: "instagram", handle: "novaclothing", quote: null });
    assert.equal(f.sources.offering?.from, "instagram");
    assert.equal(f.location, "");
    assert.equal(f.customer, "");
    assert.equal(f.website, null, "the bio link isn't read until the visitor asks");
    const empty = factsFromInstagram({ handle: "x", name: null, bio: null, website: null });
    assert.deepEqual(empty.sources, {});
  });
  await check("the API counts a reading against the free limits and stores nothing", () => {
    const route = readFileSync(join(root, "src/app/api/tools/instagram/route.ts"), "utf8");
    assert.match(route, /takeScanQuota\(\{ anonKey \}\)/);
    assert.doesNotMatch(route, /db\.|saveScan|console\.log/);
  });

  console.log(`\nInstagram: ${passed} checks passed`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
