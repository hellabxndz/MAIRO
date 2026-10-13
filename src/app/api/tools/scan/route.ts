import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { activeOrganizationId } from "@/lib/active-org";
import { normalizeUrl } from "@/lib/campaigns/destination";
import { scanWebsite, type ScanProgress, type ScanResult } from "@/lib/website/scan";
import { anonKeyFor, cachedPublicScan, saveScan, takeScanQuota } from "@/lib/website/store";
import { pagespeedConfigured } from "@/lib/website/pagespeed";

// Reads a public website for the free tools and the "Before you spend on ads"
// report, streaming real progress as newline-delimited JSON:
//   {"type":"progress","step":"pages","label":"…","done":1,"total":3}
//   {"type":"result","result":{…},"cached":false}
//   {"type":"error","message":"…"}
//
// Anonymous: limited per visitor and per day, served from a short cache when
// the same address was read recently, saved without any account. Signed in
// with `account: true`: saved to the business's own records (and never to the
// public cache), limited per account.

export const maxDuration = 60;

const body = z.object({
  url: z.string().trim().min(3).max(300),
  adMessage: z.string().trim().max(500).optional(),
  account: z.boolean().optional(),
  recheck: z.boolean().optional(),
});

export async function POST(request: Request) {
  let input: z.infer<typeof body>;
  try {
    const parsed = body.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ type: "error", message: "Enter a web address." }, { status: 400 });
    input = parsed.data;
  } catch {
    return NextResponse.json({ type: "error", message: "Bad request." }, { status: 400 });
  }

  let organizationId: string | null = null;
  if (input.account) {
    const session = await auth();
    if (!session?.user?.organizationId) return NextResponse.json({ type: "error", message: "Sign in to save a report." }, { status: 401 });
    organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  }
  const anonKey = organizationId ? null : anonKeyFor(request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null, request.headers.get("user-agent"));
  const normalized = normalizeUrl(input.url) ?? input.url;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (x: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(x)}\n`));
      try {
        // Public reads of the same address within a few hours are reused (no ad text involved).
        if (!organizationId && !input.adMessage && !input.recheck) {
          const cached = await cachedPublicScan(normalized);
          if (cached) {
            send({ type: "result", result: cached, cached: true });
            controller.close();
            return;
          }
        }
        const quota = await takeScanQuota(organizationId ? { organizationId } : { anonKey: anonKey! });
        if (!quota.ok) {
          send({ type: "error", message: quota.message, limit: quota.reason });
          controller.close();
          return;
        }
        const { result } = await scanWebsite(input.url, {
          onProgress: (p: ScanProgress) => send({ type: "progress", ...p }),
          context: { adMessage: input.adMessage ?? null },
          measureSpeed: pagespeedConfigured(),
        });
        const id = await saveScan({ result, source: organizationId ? (input.recheck ? "recheck" : "report") : input.adMessage ? "tool-ad" : "tool", organizationId, anonKey });
        send({ type: "result", result: result satisfies ScanResult, cached: false, scanId: organizationId ? id : undefined });
      } catch (error) {
        console.error("Website scan failed:", error instanceof Error ? error.message : "unknown");
        send({ type: "error", message: "Something went wrong reading that site. Nothing was saved — try again in a minute." });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
