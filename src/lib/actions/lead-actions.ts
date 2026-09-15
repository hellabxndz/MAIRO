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
import { syncAllMetaLeads } from "@/lib/leads/meta-form";

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

/**
 * How recently a manual check counts as "just now".
 *
 * Meta's rate limit is per app, and the same budget pays for every campaign
 * launch — so somebody refreshing the page waiting for a test lead must not be
 * able to spend it. Short enough to be invisible to anyone pressing the button
 * once and reading the answer.
 */
const SYNC_FLOOR_MS = 10_000;

/**
 * Fetches this business's instant-form enquiries from Meta, on request.
 *
 * The nightly sweep exists and is what catches everything; this is for the
 * minute after somebody fills the form in. Waiting until tomorrow to see an
 * enquiry is a poor answer from a product whose job is enquiries, and it makes
 * the native form look broken the one time anybody tests it.
 *
 * Refusals are returned rather than thrown: a thrown error in a server action
 * reaches production as "a server error occurred", which would turn "Meta
 * hasn't approved this yet" into nonsense.
 */
export async function syncLeadsAction(): Promise<{
  added?: number;
  error?: string;
}> {
  const session = await auth();
  if (!session?.user?.organizationId) return { error: "Not signed in." };
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  const forms = await db.leadForm.findMany({
    where: { organizationId, metaFormId: { not: null } },
    select: { metaSyncedAt: true },
  });

  // Nothing to ask Meta about. The button is only rendered when a form is on
  // Meta, so this is the race where it was taken off in another tab.
  if (forms.length === 0) {
    return {
      error:
        "This form isn't on Meta, so there's nothing to fetch — enquiries from your own form appear here the moment somebody sends one.",
    };
  }

  const lastSync = forms
    .map((f) => f.metaSyncedAt?.getTime() ?? 0)
    .reduce((a, b) => Math.max(a, b), 0);

  if (lastSync > 0 && Date.now() - lastSync < SYNC_FLOOR_MS) {
    return {
      error:
        "Just checked. Meta can take a minute to hand a new enquiry over — try again shortly.",
    };
  }

  const result = await syncAllMetaLeads({ organizationId });

  // A failure with nothing gained is worth saying out loud, because the reason
  // is usually actionable — a permission still in review, a disconnected
  // account. Partial success is reported as success: the leads are in.
  if (result.error && result.added === 0) return { error: result.error };

  revalidatePath("/dashboard/leads");
  return { added: result.added };
}
