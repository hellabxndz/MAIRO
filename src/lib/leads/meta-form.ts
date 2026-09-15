import { db } from "@/lib/db";
import { metaGraphRequest } from "@/lib/meta/client";
import { loadMetaConnection } from "@/lib/meta/connection";
import { hashEmail, hashPhone } from "@/lib/tracking/hash";
import { normalizePhone } from "@/lib/campaigns/destination";
import { contactFrom, toMetaQuestion, type LeadField } from "@/lib/leads/fields";
import { parseFields } from "@/lib/leads/forms";
import { absoluteUrl } from "@/lib/site";

// Meta's own instant form: the same questions, living on the customer's Page.
//
// The page MAIRO hosts works everywhere and needs nobody's permission, and it
// costs a tap and a page load. Meta's form opens inside Facebook or Instagram
// with the person's name, email and phone already filled in — which is the
// entire reason it converts better, and the reason the field types in
// fields.ts were modelled on Meta's prefill list from the start. Pushing a
// form here is a mapping, not a redesign.
//
// Two permissions gate all of it. pages_manage_ads to create the form on the
// Page, leads_retrieval to read what people submitted. Neither is approved for
// this app yet, so every call here is written to fail with a sentence naming
// the missing permission rather than a Graph error naming an endpoint.

export type MetaFormResult =
  | { ok: true; metaFormId: string }
  | { ok: false; error: string; needsReview?: boolean };

/**
 * Whether a Graph failure is App Review rather than anything the customer did.
 *
 * Worth telling apart, because the remedy is completely different: one is
 * "wait for Meta to approve MAIRO", the other is "fix your Page". Meta signals
 * a missing permission with code 200 or 10, and with 190 when the token never
 * carried the scope at all.
 */
function isPermission(error: unknown): boolean {
  const body = (error as { body?: { error?: { code?: number } } })?.body;
  const code = body?.error?.code;
  return code === 10 || code === 200 || code === 190;
}

const REVIEW_PENDING =
  "Meta hasn't approved MAIRO for instant forms yet — that needs pages_manage_ads and leads_retrieval, which are still in App Review. Your hosted form works in the meantime and collects the same answers.";

/**
 * Creates the form on the business's Facebook Page.
 *
 * Idempotent by storage rather than by asking Meta: a form that already has a
 * metaFormId is returned rather than created again, because Meta would happily
 * make a second one and the ads would then collect into two places.
 */
export async function pushFormToMeta(leadFormId: string): Promise<MetaFormResult> {
  const form = await db.leadForm.findUnique({ where: { id: leadFormId } });
  if (!form) return { ok: false, error: "That form no longer exists." };
  if (form.metaFormId) return { ok: true, metaFormId: form.metaFormId };

  const connection = await loadMetaConnection(form.organizationId);
  if (!connection) {
    return { ok: false, error: "Connect your Meta account first — the form lives on your Page." };
  }
  if (!connection.pageId) {
    return {
      ok: false,
      error:
        "No Facebook Page is picked yet. An instant form belongs to a Page, so choose one on the Meta connection screen first.",
    };
  }

  const fields = parseFields(form.fieldsJson);
  if (fields.length === 0) return { ok: false, error: "This form has no questions yet." };

  try {
    const res = await metaGraphRequest<{ id: string }>(`/${connection.pageId}/leadgen_forms`, {
      method: "POST",
      accessToken: connection.accessToken,
      params: {
        name: form.name.slice(0, 200),
        // Meta refuses a form without one, and it is the right refusal — the
        // form collects personal details on the advertiser's behalf. MAIRO's
        // own policy covers what MAIRO does with them, which is what this form
        // is; a business wanting its own linked here can change it later.
        privacy_policy: JSON.stringify({
          url: absoluteUrl("/privacy"),
          link_text: "Privacy policy",
        }),
        questions: JSON.stringify(fields.map(toMetaQuestion)),
        context_card: JSON.stringify({
          title: form.headline.slice(0, 60),
          content: [form.description.slice(0, 200)],
          button_text: "Continue",
          style: "PARAGRAPH_STYLE",
        }),
        thank_you_page: JSON.stringify({
          title: "Thanks",
          body: form.thankYou.slice(0, 200),
          button_type: "NONE",
        }),
      },
    });

    await db.leadForm.update({
      where: { id: leadFormId },
      data: { metaFormId: res.id, metaError: null },
    });

    return { ok: true, metaFormId: res.id };
  } catch (error) {
    const permission = isPermission(error);
    const message = permission
      ? REVIEW_PENDING
      : error instanceof Error
        ? `Meta wouldn't create the form: ${error.message}`
        : "Meta wouldn't create the form.";

    await db.leadForm.update({ where: { id: leadFormId }, data: { metaError: message } });
    return { ok: false, error: message, needsReview: permission };
  }
}

type MetaLead = {
  id: string;
  created_time?: string;
  field_data?: { name: string; values: string[] }[];
};

/**
 * Pulls submissions off a native form into the same Lead table as the hosted one.
 *
 * Deliberately the same table. A business should read its enquiries in one
 * place regardless of which form a particular campaign happened to use, and a
 * second table would mean every screen, count and export learning about the
 * difference.
 *
 * Meta keys answers by the question key that was sent when the form was
 * created — which is exactly what toMetaQuestion writes for a custom question,
 * and the standard name (email, phone_number, full_name) for a prefilled one.
 * Both are mapped back onto MAIRO's own keys here.
 */
export async function syncMetaLeads(
  leadFormId: string
): Promise<{ ok: true; added: number } | { ok: false; error: string; needsReview?: boolean }> {
  const form = await db.leadForm.findUnique({ where: { id: leadFormId } });
  if (!form?.metaFormId) return { ok: false, error: "This form isn't on Meta yet." };

  const connection = await loadMetaConnection(form.organizationId);
  if (!connection) return { ok: false, error: "Connect your Meta account first." };

  const fields = parseFields(form.fieldsJson);

  try {
    const res = await metaGraphRequest<{ data?: MetaLead[] }>(`/${form.metaFormId}/leads`, {
      accessToken: connection.accessToken,
      params: {
        fields: "id,created_time,field_data",
        limit: 200,
        // Only what arrived since the last look. Without this a form with a
        // thousand submissions is re-read in full on every sync.
        ...(form.metaSyncedAt
          ? { filtering: JSON.stringify([
              {
                field: "time_created",
                operator: "GREATER_THAN",
                value: Math.floor(form.metaSyncedAt.getTime() / 1000),
              },
            ]) }
          : {}),
      },
    });

    const rows = res.data ?? [];
    let added = 0;

    for (const row of rows) {
      const answers = answersFrom(row, fields);
      if (Object.keys(answers).length === 0) continue;

      const contact = contactFrom(fields, answers);
      const phone = contact.phone ? normalizePhone(contact.phone) : null;

      // createMany with skipDuplicates would be one call, but the unique index
      // is what actually guarantees this and a per-row create makes a partial
      // failure partial rather than total.
      try {
        await db.lead.create({
          data: {
            organizationId: form.organizationId,
            leadFormId: form.id,
            source: "META_INSTANT",
            externalLeadId: row.id,
            answersJson: JSON.stringify(answers),
            hashedEmail: hashEmail(contact.email),
            hashedPhone: hashPhone(phone),
            createdAt: row.created_time ? new Date(row.created_time) : undefined,
          },
        });
        added++;
      } catch {
        // Already stored. The unique index on externalLeadId is doing its job,
        // which is what makes this safe to run on a schedule.
      }
    }

    await db.leadForm.update({
      where: { id: leadFormId },
      data: { metaSyncedAt: new Date(), metaError: null },
    });

    return { ok: true, added };
  } catch (error) {
    const permission = isPermission(error);
    const message = permission
      ? REVIEW_PENDING
      : error instanceof Error
        ? `Meta wouldn't hand over the leads: ${error.message}`
        : "Meta wouldn't hand over the leads.";

    await db.leadForm.update({ where: { id: leadFormId }, data: { metaError: message } });
    return { ok: false, error: message, needsReview: permission };
  }
}

/**
 * Meta's answers, mapped back onto the keys MAIRO stores against.
 *
 * A prefilled question comes back under Meta's own name rather than a key
 * MAIRO chose, because MAIRO never sent one — toMetaQuestion deliberately
 * sends only the type for those, so Meta can fill them in. So they are matched
 * by type, and everything else by the key it was created with.
 */
export function answersFrom(lead: MetaLead, fields: LeadField[]): Record<string, string> {
  const byMetaName = new Map<string, string>();
  for (const entry of lead.field_data ?? []) {
    const value = entry.values?.[0]?.trim();
    if (value) byMetaName.set(entry.name.toLowerCase(), value);
  }

  // Meta's names for the details it fills in itself.
  const STANDARD: Partial<Record<LeadField["type"], string[]>> = {
    FULL_NAME: ["full_name", "name"],
    EMAIL: ["email"],
    PHONE: ["phone_number", "phone"],
    CITY: ["city"],
    ZIP: ["zip", "post_code", "postal_code"],
  };

  const answers: Record<string, string> = {};
  for (const field of fields) {
    const candidates = STANDARD[field.type] ?? [];
    const value =
      byMetaName.get(field.key.toLowerCase()) ??
      candidates.map((c) => byMetaName.get(c)).find(Boolean);
    if (value) answers[field.key] = value;
  }
  return answers;
}

/**
 * Pulls submissions for every native form there is.
 *
 * A native form does not notify MAIRO — Meta holds the leads until somebody
 * asks. Without this, a business running the better-converting form would see
 * an empty Enquiries page and conclude the ads were not working, which is the
 * worst possible failure for the thing that is supposed to be the upgrade.
 *
 * Bounded and sequential, like the other sweeps: each form is a Graph call,
 * and a hundred of them at once is how a nightly job turns into a rate limit.
 */
export async function syncAllMetaLeads(limit = 25): Promise<{
  forms: number;
  added: number;
  failed: number;
}> {
  const forms = await db.leadForm.findMany({
    where: { metaFormId: { not: null } },
    orderBy: { metaSyncedAt: { sort: "asc", nulls: "first" } },
    take: limit,
    select: { id: true },
  });

  let added = 0;
  let failed = 0;

  for (const form of forms) {
    const result = await syncMetaLeads(form.id);
    if (result.ok) added += result.added;
    else failed++;
  }

  return { forms: forms.length, added, failed };
}
