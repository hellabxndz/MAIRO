// Checks the short-lived cache in front of Meta's Graph API.
//
//   npm run check:graph-cache
//
// Pages ask Meta the same question several times per click (results for the
// goal card, the recommendations, the intelligence); the cache answers the
// repeats. What it must never do: cache a read that didn't ask to be cached,
// keep a failure, keep an answer after MAIRO changed something with that
// token, or let one token's answer stand in for another's.

import assert from "node:assert/strict";
import { metaGraphRequest, withGraphTransport } from "../src/lib/meta/client";

let calls = 0;
let fail = false;
globalThis.fetch = (async () => {
  calls++;
  if (fail) return new Response(JSON.stringify({ error: { message: "boom" } }), { status: 500 });
  return new Response(JSON.stringify({ n: calls }), { status: 200 });
}) as typeof fetch;

let passed = 0;
async function check(name: string, fn: () => Promise<void>) {
  calls = 0;
  fail = false;
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const read = (token: string, extra: Record<string, string> = {}) =>
  metaGraphRequest<{ n: number }>("/act_1/insights", { accessToken: token, cacheFor: 60_000, params: { level: "campaign", ...extra } });

async function main() {
  await check("a repeated read is answered once, including one still in flight", async () => {
    const [a, b] = await Promise.all([read("t1"), read("t1")]);
    const c = await read("t1");
    assert.equal(calls, 1);
    assert.deepEqual([a.n, b.n, c.n], [1, 1, 1]);
  });

  await check("different parameters or a different token ask again", async () => {
    await read("t2");
    await read("t2", { level: "ad" });
    await read("t3");
    assert.equal(calls, 3);
  });

  await check("reads that don't ask for the cache always go to Meta", async () => {
    await metaGraphRequest("/me/permissions", { accessToken: "t4" });
    await metaGraphRequest("/me/permissions", { accessToken: "t4" });
    assert.equal(calls, 2);
  });

  await check("a change made with a token forgets what was read with it", async () => {
    await read("t5");
    await read("t6");
    await metaGraphRequest("/123", { method: "POST", accessToken: "t5", body: { status: "PAUSED" } });
    await read("t5");
    await read("t6");
    assert.equal(calls, 4, "two reads, the change, t5 asked again; t6 still cached");
  });

  await check("a failure is never kept", async () => {
    fail = true;
    await assert.rejects(read("t7"));
    fail = false;
    const ok = await read("t7");
    assert.equal(calls, 2);
    assert.equal(ok.n, 2);
  });

  await check("a test harness's stubbed Meta never touches the cache", async () => {
    await read("t8");
    let stubbed = 0;
    const stub = (async () => {
      stubbed++;
      return new Response(JSON.stringify({ n: -1 }), { status: 200 });
    }) as typeof fetch;
    const r = await withGraphTransport({ fetch: stub, record: false }, () => read("t8"));
    assert.equal(r.n, -1);
    assert.equal(stubbed, 1);
    assert.equal(calls, 1);
  });

  console.log(`\n${passed} checks passed.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
