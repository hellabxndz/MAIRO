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

/** The form this business already has, if any. Writes nothing. */
export async function existingLeadForm(organizationId: string) {
  return db.leadForm.findFirst({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * The questions MAIRO would ask, without creating anything.
 *
 * So the campaign form can show what picking "fill in a form" actually gets
 * you before you pick it. Looking at a screen is not a request for a public
 * page, and writing one for everybody who looks would leave most businesses
 * with a form they never wanted and a URL they cannot explain.
 */
export async function previewLeadForm(organizationId: string): Promise<string[]> {
  const chosen = await nicheAndName(organizationId);
  if (!chosen) return [];
  return templateFor(chosen.nicheId, chosen.name).fields.map((f) => f.label);
}

async function nicheAndName(
  organizationId: string
): Promise<{ nicheId: string; name: string } | null> {
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
  return {
    nicheId: profile?.nicheId ?? classifyNiche(organization.industry).id,
    name: organization.name,
  };
}

/**
 * The organization's form, written from its trade if it does not have one yet.
 *
 * Called when somebody actually chooses to collect enquiries this way — not on
 * a page render. Idempotent, so choosing it twice reuses the first form rather
 * than making a second with a different address.
 */
export async function ensureLeadForm(organizationId: string) {
  const existing = await existingLeadForm(organizationId);
  if (existing) return existing;

  const organization = await db.organization.findUnique({
    where: { id: organizationId },
    select: { name: true, industry: true },
  });
  if (!organization) return null;

  const chosen = await nicheAndName(organizationId);
  if (!chosen) return null;
  const template = templateFor(chosen.nicheId, chosen.name);

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
