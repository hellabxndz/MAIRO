"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { activeOrganizationId } from "@/lib/active-org";
import { executionBlock } from "@/lib/billing/execution";
import { approveExperiment, cancelExperiment, checkExperiment, draftFromExperiment, type ExperimentView } from "@/lib/experiments/store";
import { deniedFor } from "@/lib/members/authorize";

// The owner's controls for a creative test. Each acts only on this business's
// own test; building the test campaign needs a subscription that can run
// campaigns, like any other campaign. Nothing here spends or launches —
// launching stays in the campaign builder.

type Fail = { ok: false; error: string };
const ID = z.string().min(5).max(40).regex(/^[a-z0-9]+$/i);

async function scope(): Promise<{ organizationId: string; userId: string } | null> {
  const session = await auth();
  if (!session?.user?.organizationId || !session.user.id) return null;
  return { organizationId: (await activeOrganizationId()) ?? session.user.organizationId, userId: session.user.id };
}

function done() {
  revalidatePath("/dashboard/creatives/suggested");
  revalidatePath("/dashboard/creatives");
}

export async function approveExperimentAction(id: string): Promise<{ ok: true } | Fail> {
  // Role check: campaign.edit (lib/members/roles.ts).
  const denied = await deniedFor("campaign.edit");
  if (denied) return { ok: false, error: denied };
  const s = await scope();
  if (!s) return { ok: false, error: "Not signed in." };
  const p = ID.safeParse(id);
  if (!p.success) return { ok: false, error: "That test wasn't valid." };
  const r = await approveExperiment(s.organizationId, s.userId, p.data);
  if (r.ok) done();
  return r;
}

export async function cancelExperimentAction(id: string): Promise<{ ok: true } | Fail> {
  // Role check: campaign.edit (lib/members/roles.ts).
  const denied = await deniedFor("campaign.edit");
  if (denied) return { ok: false, error: denied };
  const s = await scope();
  if (!s) return { ok: false, error: "Not signed in." };
  const p = ID.safeParse(id);
  if (!p.success) return { ok: false, error: "That test wasn't valid." };
  const r = await cancelExperiment(s.organizationId, p.data);
  if (r.ok) done();
  return r;
}

/** The test's campaign draft, opened in the builder. */
export async function buildExperimentCampaignAction(id: string): Promise<{ ok: true; href: string } | Fail> {
  // Role check: campaign.edit (lib/members/roles.ts).
  const denied = await deniedFor("campaign.edit");
  if (denied) return { ok: false, error: denied };
  const s = await scope();
  if (!s) return { ok: false, error: "Not signed in." };
  const p = ID.safeParse(id);
  if (!p.success) return { ok: false, error: "That test wasn't valid." };
  const blocked = await executionBlock(s.organizationId);
  if (blocked) return { ok: false, error: blocked };
  const r = await draftFromExperiment(s.organizationId, s.userId, p.data);
  if (!r.ok) return r;
  done();
  return { ok: true, href: `/dashboard/create/meta?draft=${r.draftId}` };
}

/** Read Meta's latest figures for a running test now, instead of waiting for the daily check. */
export async function checkExperimentAction(id: string): Promise<{ ok: true; view: ExperimentView } | Fail> {
  // Role check: reports.run (lib/members/roles.ts).
  const denied = await deniedFor("reports.run");
  if (denied) return { ok: false, error: denied };
  const s = await scope();
  if (!s) return { ok: false, error: "Not signed in." };
  const p = ID.safeParse(id);
  if (!p.success) return { ok: false, error: "That test wasn't valid." };
  const r = await checkExperiment(s.organizationId, p.data);
  if (r.ok) done();
  return r;
}
