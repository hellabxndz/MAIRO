// A local stand-in for Meta's Graph API, for browser tests of the Results
// loop (scripts/e2e/loop-fixtures.ts). The app talks to it only when started
// with META_FAKE_GRAPH=http://localhost:<port> — honoured off Vercel and for
// loopback addresses only (src/lib/meta/client.ts). Nothing here reaches Meta.
//
//   node scripts/e2e/fake-meta.mjs 12112
//
// Insights: the fixture campaign "loop-camp" with two ads — "loop-ad-0" a
// clear winner (12 purchases on $120), "loop-ad-1" behind (4 on $120). Any
// other read answers with an empty list; any write is refused, so a test can
// see MAIRO's honest failure message rather than a pretend success.

import { createServer } from "node:http";

const port = Number(process.argv[2] ?? 12112);
const row = (id, key, spend, purchases, clicks) => ({
  [key]: id,
  spend: spend.toFixed(2),
  impressions: String(clicks * 45),
  reach: String(clicks * 20),
  clicks: String(clicks),
  ctr: "2.2",
  actions: [{ action_type: "purchase", value: String(purchases) }],
  action_values: [{ action_type: "purchase", value: (purchases * 32).toFixed(2) }],
});

createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${port}`);
  const send = (status, body) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (req.method !== "GET") return send(400, { error: { message: "The fake Meta refuses writes.", type: "OAuthException", code: 100 } });
  if (url.pathname.endsWith("/insights")) {
    const level = url.searchParams.get("level");
    if (level === "ad" && url.pathname.includes("loop-camp")) return send(200, { data: [row("loop-ad-0", "ad_id", 120, 12, 220), row("loop-ad-1", "ad_id", 120, 4, 160)] });
    if (level === "campaign") return send(200, { data: [row("loop-camp", "campaign_id", 240, 16, 380)] });
    return send(200, { data: [] });
  }
  return send(200, { data: [] });
}).listen(port, () => console.log(`fake Meta on ${port}`));
