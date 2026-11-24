import { auth } from "@/lib/auth";
import { activeOrganizationId } from "@/lib/active-org";
import { roleIn } from "@/lib/members/authorize";
import { runAnalyzer } from "@/lib/analyzer/load";
import { tooManyAnalyzerRuns } from "@/lib/security/rate";

// The Meta Ads Analyzer, streamed: one JSON line per step as it really
// finishes, then the analysis. Signed in, for the business the person is
// acting for and is a member of — read from the session and the database,
// never from the request. Read-only against Meta; free for every plan,
// because it uses no AI and Meta's figures are cached.

export const maxDuration = 60;

export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId || !session.user.id) return new Response("Unauthorized", { status: 401 });
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  if (!(await roleIn(session.user.id, organizationId)) && session.user.role !== "OWNER") return new Response("Not found", { status: 404 });
  if (tooManyAnalyzerRuns(organizationId, Date.now())) {
    return Response.json({ type: "error", message: "MAIRO has analyzed this account several times in the last few minutes. Try again shortly." }, { status: 429 });
  }
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(new TextEncoder().encode(`${JSON.stringify(o)}\n`));
      const result = await runAnalyzer(organizationId, (p) => send({ type: "progress", ...p }));
      send(result.ok ? { type: "result", analysis: result.analysis, adAccountId: result.adAccountId } : { type: "error", reason: result.reason, message: result.message });
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } });
}
