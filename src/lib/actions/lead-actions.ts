"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import {
  blankLeadForm,
  ensureLeadForm,
  submitLead,
  type SubmitOutcome,
} from "@/lib/leads/forms";
import { validateFields, type LeadField } from "@/lib/leads/fields";

/**
 * Takes a submission from the public form.
 *
 * Unauthenticated on purpose — this is called by a stranger who tapped an ad,
 * and requiring a session would defeat the entire feature. The slug is the
 * only thing identifying the form, which is why it is random rather than
 * derived from the business name, and why every answer is re-validated
 * server-side against the question that asked it.
 */
export async function submitLeadAction(input: {
  slug: string;
  values: Record<string, string>;
  clickId?: string | null;
}): Promise<SubmitOutcome> {
  return submitLead(input);
}

/** Rewrites a form's questions. Owner of the organization only. */
export async function saveLeadFormAction(
  leadFormId: string,
  patch: { headline?: string; description?: string; thankYou?: string }
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user?.organizationId) return { error: "Not signed in." };
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  const form = await db.leadForm.findFirst({
    where: { id: leadFormId, organizationId },
    select: { id: true },
  });
  if (!form) return { error: "Not found." };

  const clean = (value: string | undefined, max: number) =>
    value === undefined ? undefined : value.trim().slice(0, max);

  const headline = clean(patch.headline, 120);
  const description = clean(patch.description, 400);
  const thankYou = clean(patch.thankYou, 400);

  if (headline !== undefined && headline.length === 0) {
    return { error: "The headline is the first thing people read — it can't be empty." };
  }

  await db.leadForm.update({
    where: { id: leadFormId },
    data: { headline, description, thankYou },
  });

  revalidatePath("/dashboard/leads");
  return {};
}

/**
 * Writes this business's form, on request.
 *
 * Separate from the campaign path so somebody can look at the questions before
 * committing to a campaign — but still a deliberate act, because the result is
 * a public page carrying their business's name.
 */
export async function writeLeadFormAction(): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user?.organizationId) return { error: "Not signed in." };
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  const form = await ensureLeadForm(organizationId);
  if (!form) return { error: "MAIRO couldn't write your form just now." };

  revalidatePath("/dashboard/leads");
  return {};
}

/**
 * Replaces a form's questions with the ones somebody built.
 *
 * Every rule is enforced here rather than in the browser, because the browser
 * is where a form can be posted from a console and because the two rules that
 * matter most protect the business from itself: a form with no email or phone
 * collects enquiries nobody can answer, and a form with nothing required
 * collects empty ones. Both look like they are working.
 */
export async function saveLeadFieldsAction(
  leadFormId: string,
  fields: LeadField[]
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user?.organizationId) return { error: "Not signed in." };
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  const form = await db.leadForm.findFirst({
    where: { id: leadFormId, organizationId },
    select: { id: true },
  });
  if (!form) return { error: "Not found." };

  const checked = validateFields(fields);
  if (!checked.ok) return { error: checked.error };

  await db.leadForm.update({
    where: { id: leadFormId },
    data: { fieldsJson: JSON.stringify(checked.fields) },
  });

  revalidatePath("/dashboard/leads");
  return {};
}

/**
 * Starts a form the business will write itself.
 *
 * Seeded with a name and a way to reply rather than left empty: those two are
 * required on any form that works, so beginning with them is a head start
 * rather than a decision made on anybody's behalf.
 */
export async function startOwnLeadFormAction(): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user?.organizationId) return { error: "Not signed in." };
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  const form = await blankLeadForm(organizationId);
  if (!form) return { error: "MAIRO couldn't start your form just now." };

  revalidatePath("/dashboard/leads");
  return {};
}
