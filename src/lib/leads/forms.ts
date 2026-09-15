import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { hashEmail, hashPhone } from "@/lib/tracking/hash";
import { classifyNiche } from "@/lib/tracking/niches";
import { contactFrom, validateAnswer, type LeadField } from "@/lib/leads/fields";
import { templateFor } from "@/lib/leads/templates";
import { normalizePhone } from "@/lib/campaigns/destination";

// Reading, creating and filling in a lead form.
//
// The form exists so a business can collect enquiries from an ad without
// owning a website, building anything, or being sent into Facebook's form
// builder. MAIRO writes the questions from the trade it already classified
// them into, hosts the page, takes the answers and shows them on the
// dashboard.

/** Parsed fields, with a bad row treated as no fields rather than a crash. */
export function parseFields(raw: string): LeadField[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LeadField[]) : [];
  } catch {
    return [];
  }
}

/**
 * A slug that cannot be guessed from the business's name.
 *
 * Deliberately random. A readable slug leaks who MAIRO's customers are — the
 * form is a public page anybody can fetch — and it breaks a live ad the moment
 * somebody renames their business. Twelve hex characters is far more than
 * enough to stop enumeration and still short enough to read out loud.
 */
function newSlug(): string {
  return randomBytes(6).toString("hex");
}

/**
 * The organization's form, written from its trade if it does not have one yet.
 *
 * Idempotent, so it is safe to call from a page render: the second call
 * returns the first call's form rather than making another.
 */
export async function ensureLeadForm(organizationId: string) {
  const existing = await db.leadForm.findFirst({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing;

  const organization = await db.organization.findUnique({
    where: { id: organizationId },
    select: { name: true, industry: true },
  });
  if (!organization) return null;

  const profile = await db.trackingProfile.findUnique({
    where: { organizationId },
    select: { nicheId: true },
  });

  // The niche the business was already classified into, so the questions match
  // the trade without asking them anything they have not been asked before.
  const nicheId = profile?.nicheId ?? classifyNiche(organization.industry).id;
  const template = templateFor(nicheId, organization.name);

  return db.leadForm.create({
    data: {
      organizationId,
      slug: newSlug(),
      name: `${organization.name} enquiries`,
      headline: template.headline,
      description: template.description,
      thankYou: template.thankYou,
      fieldsJson: JSON.stringify(template.fields),
    },
  });
}

/** The public URL an ad should point at. */
export function leadFormUrl(slug: string, appUrl: string): string {
  return `${appUrl.replace(/\/+$/, "")}/f/${slug}`;
}

export type SubmitOutcome =
  | { ok: true; thankYou: string }
  | { ok: false; errors: Record<string, string> };

/**
 * Records a submission.
 *
 * Every answer is checked against the question that asked it — a select is not
 * to be trusted just because it was rendered as one — and the contact details
 * are hashed on the way in. MAIRO keeps the answers the business needs to act
 * on and the fingerprint the ad networks need to attribute the conversion; it
 * does not keep a stranger's email address in the clear to do that.
 */
export async function submitLead(input: {
  slug: string;
  values: Record<string, string>;
  clickId?: string | null;
}): Promise<SubmitOutcome> {
  const form = await db.leadForm.findUnique({ where: { slug: input.slug } });
  if (!form) return { ok: false, errors: { _form: "This form is no longer available." } };

  const fields = parseFields(form.fieldsJson);
  const errors: Record<string, string> = {};
  const answers: Record<string, string> = {};

  for (const field of fields) {
    const check = validateAnswer(field, input.values[field.key] ?? null);
    if (check.ok) {
      if (check.value.length > 0) answers[field.key] = check.value;
    } else {
      errors[field.key] = check.error;
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  // A form where every question is optional and nobody typed anything is not a
  // lead, it is a bot pressing a button.
  if (Object.keys(answers).length === 0) {
    return { ok: false, errors: { _form: "Fill in at least one answer." } };
  }

  const contact = contactFrom(fields, answers);

  // Normalized to E.164 before hashing, because hashPhone drops a number that
  // carries no country code rather than guessing one — correctly, since a wrong
  // guess matches nobody while looking exactly like a right one. People type
  // "(555) 123-4567", so without this the phone on a form whose only contact
  // detail IS the phone hashes to nothing, and the lead can never be matched
  // back to the ad that produced it.
  const phone = contact.phone ? normalizePhone(contact.phone) : null;

  await db.lead.create({
    data: {
      organizationId: form.organizationId,
      leadFormId: form.id,
      source: "MAIRO_FORM",
      answersJson: JSON.stringify(answers),
      hashedEmail: hashEmail(contact.email),
      hashedPhone: hashPhone(phone),
      clickId: input.clickId?.slice(0, 512) ?? null,
    },
  });

  return { ok: true, thankYou: form.thankYou };
}
