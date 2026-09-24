import { NextResponse, type NextRequest } from "next/server";
import { recordAudit } from "@/lib/audit";
import { loadAnalytics } from "@/lib/analytics/load";
import { resolveRange, toCsv } from "@/lib/analytics/summary";
import { authorize, PermissionError } from "@/lib/tenancy/context";

/** CSV export of the aggregated metrics (no customer personal data). */
export async function GET(request: NextRequest) {
  let ctx;
  try {
    ctx = await authorize("analytics.export");
  } catch (e) {
    if (e instanceof PermissionError) return new NextResponse("Forbidden", { status: 403 });
    throw e;
  }
  const sp = request.nextUrl.searchParams;
  const range = resolveRange({ range: sp.get("range"), from: sp.get("from"), to: sp.get("to") });
  const summary = await loadAnalytics(ctx.business.id, range);
  await recordAudit({ businessId: ctx.business.id, actorUserId: ctx.user.id, action: "analytics.exported", metadata: { range: range.key } });
  return new NextResponse(toCsv(summary, range), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="mairo-assist-analytics-${range.key}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
