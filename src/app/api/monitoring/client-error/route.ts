import { NextResponse } from "next/server";
import { z } from "zod";
import { monitoringConfigured, reportError } from "@/lib/monitoring/report";

// Crashes in the browser that the server never saw — a page that rendered and
// then broke — reported by app/error.tsx and app/global-error.tsx. Only from
// this site's own pages, small, and a few a minute per visitor; what it sends
// on is scrubbed like every other report (lib/monitoring/report.ts). Errors
// with a digest came from the server and were reported there already.

const body = z.object({
  name: z.string().max(100),
  message: z.string().max(2_000),
  stack: z.string().max(8_000).optional(),
  path: z.string().max(500),
});

const recent = new Map<string, number[]>();
function tooMany(visitor: string, now: number): boolean {
  const times = (recent.get(visitor) ?? []).filter((t) => now - t < 60_000);
  if (times.length >= 5) return true;
  if (recent.size > 1_000) recent.clear();
  recent.set(visitor, [...times, now]);
  return false;
}

export async function POST(request: Request) {
  if (!monitoringConfigured()) return new NextResponse(null, { status: 204 });
  // Same site only: a report from anywhere else is somebody else's noise.
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) return new NextResponse(null, { status: 403 });

  const raw = await request.text().catch(() => "");
  if (raw.length > 12_000) return new NextResponse(null, { status: 413 });
  let parsed: z.infer<typeof body>;
  try {
    const r = body.safeParse(JSON.parse(raw));
    if (!r.success) return new NextResponse(null, { status: 400 });
    parsed = r.data;
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const visitor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "?";
  if (tooMany(visitor, Date.now())) return new NextResponse(null, { status: 429 });

  const error = Object.assign(new Error(parsed.message), { name: parsed.name, stack: parsed.stack ?? `${parsed.name}: ${parsed.message}` });
  await reportError(error, { where: "browser", path: parsed.path });
  return new NextResponse(null, { status: 204 });
}
