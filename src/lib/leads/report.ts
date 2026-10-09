import { db } from "@/lib/db";
import { loadCredentials } from "@/lib/ad-platforms/connections";
import { sendMetaConversions } from "@/lib/tracking/meta-pixel";
import { siteUrl } from "@/lib/site";
import { leadFormUrl } from "./forms";

// Telling Meta about a lead that arrived on MAIRO's own form.
//
// A lead campaign that sends people to the form MAIRO hosts used to be
// invisible to Meta: the form lives on MAIRO's address, not the business's
// website, so the business's pixel never saw the submission. Meta counted no
// leads, couldn't learn who converts, and MAIRO's own checks — reading Meta's
// figures — saw a campaign "spending without results" while real people were
// filling the form in.
//
// So each one is sent to the business's Meta pixel as a "Lead" through the
// Conversions API — the same channel store orders already use — with the
// hashed contact details and the click id the form captured, which is what
// lets Meta match it to the ad. Its event id is the lead's own, so a retry is
// counted once. Never throws: the lead is saved whatever Meta says, and the
// outcome is written on the lead.

/** How far back Meta still accepts a website event. */
const MAX_AGE_MS = 7 * 86_400_000;

export type LeadReport = "sent" | "skipped" | "failed";

export async function reportLeadToMeta(leadId: string, now = new Date()): Promise<LeadReport> {
  try {
    const lead = await db.lead.findUnique({
      where: { id: leadId },
      select: {
        id: true,
        organizationId: true,
        source: true,
        hashedEmail: true,
        hashedPhone: true,
        clickId: true,
        createdAt: true,
        metaReportedAt: true,
        leadForm: { select: { slug: true } },
      },
    });
    if (!lead || lead.source !== "MAIRO_FORM" || lead.metaReportedAt) return "skipped";
    if (now.getTime() - lead.createdAt.getTime() > MAX_AGE_MS) return "skipped";

    const skip = async (why: string) => {
      await db.lead.update({ where: { id: lead.id }, data: { metaReportError: why } });
      return "skipped" as const;
    };
    const pixel = await db.trackingPixel.findUnique({
      where: { organizationId_platform: { organizationId: lead.organizationId, platform: "META" } },
      select: { externalPixelId: true },
    });
    if (!pixel) return skip("No Meta pixel yet, so Meta can't be told about this lead.");
    const creds = await loadCredentials(lead.organizationId, "META");
    if (!creds || creds.status !== "CONNECTED") return skip("Meta isn't connected.");

    try {
      const result = await sendMetaConversions(pixel.externalPixelId, creds.accessToken, [
        {
          eventName: "Lead",
          eventTime: lead.createdAt,
          eventId: `lead_${lead.id}`,
          valueCents: 0,
          currency: "USD",
          hashedEmail: lead.hashedEmail,
          hashedPhone: lead.hashedPhone,
          // Meta wants its click id wrapped, versioned and timestamped.
          fbc: lead.clickId ? `fb.1.${lead.createdAt.getTime()}.${lead.clickId}` : null,
          sourceUrl: leadFormUrl(lead.leadForm.slug, siteUrl()),
        },
      ]);
      await db.lead.update({
        where: { id: lead.id },
        data: {
          metaReportedAt: new Date(),
          metaReportError: result.matchFields === 0 ? "Sent, but with nothing to match it to a person — no email, phone or click id." : result.messages.join(" ") || null,
        },
      });
      return "sent";
    } catch (error) {
      await db.lead.update({ where: { id: lead.id }, data: { metaReportError: error instanceof Error ? error.message : "Meta refused it." } });
      return "failed";
    }
  } catch (error) {
    console.error("Reporting a lead to Meta failed:", error);
    return "failed";
  }
}

/**
 * The backstop: leads from the last week that haven't reached Meta yet — a
 * failed send, or a pixel or connection that arrived after the lead did.
 */
export async function reportUnsentLeads(opts: { limit?: number; budgetMs?: number; now?: Date } = {}): Promise<{ sent: number; skipped: number; failed: number }> {
  const now = opts.now ?? new Date();
  const startedAt = Date.now();
  const leads = await db.lead.findMany({
    where: { source: "MAIRO_FORM", metaReportedAt: null, createdAt: { gte: new Date(now.getTime() - MAX_AGE_MS) } },
    orderBy: { createdAt: "asc" },
    take: opts.limit ?? 50,
    select: { id: true },
  });
  const out = { sent: 0, skipped: 0, failed: 0 };
  for (const l of leads) {
    if (Date.now() - startedAt > (opts.budgetMs ?? Number.POSITIVE_INFINITY)) break;
    out[await reportLeadToMeta(l.id, now)]++;
  }
  return out;
}
