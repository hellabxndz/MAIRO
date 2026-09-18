import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { monthlyReport, reportAsText } from "@/lib/reports/monthly";

// Downloading the month.
//
// Plain text rather than a PDF. A PDF needs a rendering dependency, a font
// bundle and a layout that has to be maintained alongside the page it
// duplicates; text opens everywhere, can be pasted into an email, and cannot
// silently render a figure differently from the screen it came from. If a
// branded PDF is wanted later it belongs on top of this function, not instead
// of it.

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ month: string }> },
) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return new Response("Unauthorized", { status: 401 });
  }
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  const { month } = await params;
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return new Response("Not found", { status: 404 });
  const key = { year: Number(match[1]), month: Number(match[2]) - 1 };
  if (key.month < 0 || key.month > 11) return new Response("Not found", { status: 404 });

  const [org, report] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
    monthlyReport(organizationId, key),
  ]);

  const body = reportAsText(report, org?.name ?? "Your business");

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="mairo-${month}.txt"`,
      // A month's figures can still move for a day or two as the platforms
      // settle, so this is never cached.
      "Cache-Control": "no-store",
    },
  });
}
