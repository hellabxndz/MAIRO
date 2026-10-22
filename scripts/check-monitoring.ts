// Error monitoring, checked with a pretend Sentry — nothing is sent anywhere:
//
//   - with no SENTRY_DSN nothing is sent at all;
//   - a report is a well-formed Sentry envelope for the DSN's project;
//   - what's sent is scrubbed: no emails, phone numbers, tokens, keys or query
//     strings, the route pattern rather than the real path, no headers;
//   - redirects and not-found aren't errors; one error in a loop is sent once;
//   - scheduled jobs check in (start, then ok or error) against their schedule;
//   - browser crashes come in only from this site, small and rate-limited;
//   - the error pages, both crons and the Stripe webhook are wired to it.
//
//   npm run check:monitoring   (no database, no network)

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isControlFlow, reportError, scrub, startCronCheckIn, withMonitoringTransport } from "../src/lib/monitoring/report";
import { onRequestError } from "../src/instrumentation";
import { POST as clientError } from "../src/app/api/monitoring/client-error/route";

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

type Sent = { endpoint: string; headers: Record<string, string>; lines: Record<string, unknown>[] };
async function capture(fn: () => Promise<unknown>): Promise<Sent[]> {
  const sent: Sent[] = [];
  await withMonitoringTransport(async (endpoint, headers, body) => {
    sent.push({ endpoint, headers, lines: body.trim().split("\n").map((l) => JSON.parse(l)) });
  }, async () => {
    await fn();
  });
  return sent;
}
const event = (s: Sent) => s.lines[2] as {
  level: string; environment: string; release?: string; transaction: string;
  tags: Record<string, string>; request?: { url: string; method?: string };
  exception: { values: { type: string; value: string; stacktrace?: { frames: { filename?: string; in_app?: boolean }[] } }[] };
};

const DSN = "https://abc123publickey@o42.ingest.sentry.io/4507";

async function main() {
  console.log("Off by default:");
  delete process.env.SENTRY_DSN;
  await check("no SENTRY_DSN: nothing is sent, and check-ins do nothing", async () => {
    const sent = await capture(async () => {
      await reportError(new Error("boom"), { where: "test" });
      await startCronCheckIn("cron-x", "0 9 * * *")("ok");
    });
    assert.equal(sent.length, 0);
  });
  await check("no SENTRY_DSN: browser reports are accepted and dropped", async () => {
    const r = await clientError(new Request("http://mairo.test/api/monitoring/client-error", { method: "POST", headers: { origin: "http://mairo.test", host: "mairo.test" }, body: "{}" }));
    assert.equal(r.status, 204);
  });

  console.log("Reports:");
  process.env.SENTRY_DSN = DSN;
  process.env.VERCEL_ENV = "production";
  process.env.VERCEL_GIT_COMMIT_SHA = "0123456789abcdef0123";

  await check("a Sentry envelope for the DSN's project, with its key", async () => {
    const [s] = await capture(() => reportError(new TypeError("Cannot read properties of undefined"), { where: "test" }));
    assert.equal(s.endpoint, "https://o42.ingest.sentry.io/api/4507/envelope/");
    assert.match(s.headers["X-Sentry-Auth"], /sentry_key=abc123publickey/);
    assert.equal((s.lines[1] as { type: string }).type, "event");
    assert.equal((s.lines[0] as { event_id: string }).event_id, (s.lines[2] as { event_id: string }).event_id);
    const e = event(s);
    assert.equal(e.exception.values[0].type, "TypeError");
    assert.equal(e.environment, "production");
    assert.equal(e.release, "0123456789ab");
    assert.equal(e.level, "error");
    const frames = e.exception.values[0].stacktrace?.frames ?? [];
    assert.ok(frames.length > 0, "a stack");
    assert.ok(frames[frames.length - 1].in_app, "the newest frame is MAIRO's code");
  });

  await check("scrubbed: emails, phone numbers, tokens, keys and query strings never leave", () => {
    const dirty = "Failed for jane.doe@shop.com (+1 305 555 0142) token EAABwzLixnjYBO1234567890abcdefghij key sk_live_51Habcdefghijklmn Bearer abc.def.ghi at https://graph.facebook.com/v21.0/me?access_token=secret&x=1 reset 8fJ3kLm0pQrStUvWxYz0123456789abcdefGHIJKL";
    const clean = scrub(dirty);
    for (const leak of ["jane.doe@shop.com", "305 555 0142", "EAABwz", "sk_live_51", "abc.def.ghi", "access_token", "secret", "8fJ3kLm0"]) {
      assert.ok(!clean.includes(leak), `${leak} leaked: ${clean}`);
    }
    assert.match(clean, /graph\.facebook\.com\/v21\.0\/me\?\[query\]/);
    assert.equal(scrub("Campaign 42 failed on 2026-10-22 at 09:30"), "Campaign 42 failed on 2026-10-22 at 09:30", "ordinary detail kept");
  });

  await check("the route pattern is sent, never the real path, headers or query", async () => {
    const sent = await capture(async () => {
      await onRequestError(
        new Error("render failed for owner@biz.com"),
        { path: "/s/8fJ3kLm0pQrStUvWxYz0123456789abcdefGHIJKL?ref=email", method: "GET", headers: { cookie: "session=topsecret", authorization: "Bearer x" } },
        { routerKind: "App Router", routePath: "/s/[token]", routeType: "render", renderSource: "server-rendering", revalidateReason: undefined },
      );
    });
    assert.equal(sent.length, 1);
    const body = JSON.stringify(sent[0].lines);
    for (const leak of ["8fJ3kLm0", "ref=email", "topsecret", "owner@biz.com", "cookie", "authorization"]) assert.ok(!body.includes(leak), `${leak} leaked`);
    const e = event(sent[0]);
    assert.equal(e.transaction, "/s/[token]");
    assert.equal(e.request?.url, "/s/[token]");
    assert.equal(e.tags.routeType, "render");
  });

  await check("redirects and not-found aren't errors", async () => {
    assert.ok(isControlFlow(Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/sign-in;307;" })));
    assert.ok(isControlFlow(Object.assign(new Error("x"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" })));
    const sent = await capture(() => reportError(Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;push;/x;307;" }), { where: "test" }));
    assert.equal(sent.length, 0);
  });

  await check("one error in a loop is sent once a minute, a different one still goes", async () => {
    const sent = await capture(async () => {
      for (let i = 0; i < 20; i++) await reportError(new Error("same thing"), { where: "loop" });
      await reportError(new Error("something else"), { where: "loop" });
    });
    assert.equal(sent.length, 2);
  });

  await check("no more than 60 reports in ten minutes from one server", async () => {
    const sent = await capture(async () => {
      for (let i = 0; i < 80; i++) await reportError(new Error(`distinct ${i}`), { where: "flood" });
    });
    assert.equal(sent.length, 60);
  });

  console.log("Scheduled jobs:");
  await check("a run checks in as started, then ok or error, under one id and its schedule", async () => {
    const sent = await capture(async () => {
      await startCronCheckIn("cron-review", "30 9 * * *", 2)("error");
    });
    assert.equal(sent.length, 2);
    const [a, b] = sent.map((s) => s.lines[2] as { check_in_id: string; monitor_slug: string; status: string; duration?: number; monitor_config: { schedule: { value: string } } });
    assert.equal((sent[0].lines[1] as { type: string }).type, "check_in");
    assert.equal(a.status, "in_progress");
    assert.equal(b.status, "error");
    assert.equal(a.check_in_id, b.check_in_id);
    assert.equal(a.monitor_slug, "cron-review");
    assert.equal(b.monitor_config.schedule.value, "30 9 * * *");
    assert.equal(typeof b.duration, "number");
  });

  await check("both crons check in on the schedule vercel.json gives them", () => {
    const crons = (JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: { path: string; schedule: string }[] }).crons;
    for (const c of crons) {
      const name = c.path.split("/").pop()!;
      const src = readFileSync(`src/app/api/cron/${name}/route.ts`, "utf8");
      assert.ok(src.includes(`startCronCheckIn("cron-${name}", "${c.schedule}"`), `cron ${name}`);
      assert.match(src, /await checkIn\(/);
      assert.match(src, /catch \(error\) \{\s*await checkIn\("error"\);\s*throw error;/, `cron ${name} closes its check-in when the run dies`);
    }
    const review = readFileSync("src/app/api/cron/review/route.ts", "utf8");
    assert.ok(!/console\.error\("[^"]+ failed:"/.test(review), "every review step reports through stepFailed");
    assert.match(readFileSync("src/app/api/stripe/webhook/route.ts", "utf8"), /reportError\(error, \{ where: "stripe webhook"/);
  });

  console.log("Browser crashes:");
  const post = (body: unknown, origin = "http://mairo.test", ip = "198.51.100.1") =>
    clientError(new Request("http://mairo.test/api/monitoring/client-error", { method: "POST", headers: { origin, host: "mairo.test", "x-forwarded-for": ip }, body: typeof body === "string" ? body : JSON.stringify(body) }));
  const crash = { name: "TypeError", message: "x is undefined for me@me.com", stack: "TypeError: x\n    at Panel (http://mairo.test/_next/static/chunks/app.js:1:200)", path: "/dashboard/campaigns/cm123?tab=ads" };

  await check("only from this site's own pages", async () => {
    assert.equal((await post(crash, "https://evil.example")).status, 403);
  });
  await check("too big or malformed is refused", async () => {
    assert.equal((await post("x".repeat(13_000))).status, 413);
    assert.equal((await post({ name: 1 })).status, 400);
    assert.equal((await post("not json")).status, 400);
  });
  await check("a crash is reported as a browser error, scrubbed, without the query", async () => {
    let status = 0;
    const sent = await capture(async () => {
      status = (await post(crash, "http://mairo.test", "198.51.100.2")).status;
    });
    assert.equal(status, 204);
    assert.equal(sent.length, 1);
    const e = event(sent[0]);
    assert.equal(e.tags.where, "browser");
    assert.equal(e.request?.url, "/dashboard/campaigns/cm123");
    assert.ok(!JSON.stringify(sent[0].lines).includes("me@me.com"));
  });
  await check("a few a minute per visitor", async () => {
    const statuses: number[] = [];
    await capture(async () => {
      for (let i = 0; i < 7; i++) statuses.push((await post({ ...crash, message: `m${i}` }, "http://mairo.test", "198.51.100.3")).status);
    });
    assert.deepEqual(statuses.slice(0, 5), [204, 204, 204, 204, 204]);
    assert.equal(statuses[6], 429);
  });
  await check("both error pages report, and only browser-side errors (no digest)", () => {
    for (const f of ["src/app/error.tsx", "src/app/global-error.tsx"]) assert.match(readFileSync(f, "utf8"), /useEffect\(\(\) => reportClientError\(error\), \[error\]\)/, f);
    assert.match(readFileSync("src/lib/monitoring/client.ts", "utf8"), /if \(error\.digest/);
  });

  console.log(`\n${passed} checks passed. Nothing was sent to Sentry.`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
