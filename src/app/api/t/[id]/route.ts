import { after } from "next/server";
import { judgeHit, parseTagHit, relayHit, tagTarget, underRateLimit } from "@/lib/tracking/tag-relay";

// Where a business's MAIRO tag reports an outcome (a form sent, a call
// tapped), to be relayed to Meta's Conversions API (lib/tracking/tag-relay.ts).
// Called by sendBeacon from any website, so it answers 204 to everything —
// a visitor's page learns nothing from it — and does the work after replying.

const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type" };

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const done = new Response(null, { status: 204, headers: CORS });
  const hit = parseTagHit(await request.text().catch(() => ""));
  if (!hit || !underRateLimit(id)) return done;
  const target = await tagTarget(id);
  if (!target || !judgeHit(hit, target).send) return done;
  const visitor = {
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
    userAgent: request.headers.get("user-agent")?.slice(0, 500) || null,
  };
  after(() => relayHit(target, hit, visitor));
  return done;
}
