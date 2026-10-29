"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { addItem, applyProposal, createProject, itemInput, logActivity, projectInput, proposalInput, PROJECT_STATUSES, setItemDone, staffUser } from "@/lib/aios/workspace";

// The founder workspace's presses (app/aios). Staff only, checked against the
// database each time; every change lands in the activity log.

export type FounderResult = { ok: true; message: string; id?: string } | { ok: false; error: string };

const DENIED: FounderResult = { ok: false, error: "MAIRO staff only." };

function refresh(projectId?: string | null) {
  revalidatePath("/aios");
  revalidatePath("/aios/projects");
  revalidatePath("/aios/activity");
  if (projectId) revalidatePath(`/aios/projects/${projectId}`);
}

const fail = (e: unknown): FounderResult => ({ ok: false, error: e instanceof Error ? e.message : "That didn't save. Try again." });

export async function createProjectAction(_: FounderResult | null, form: FormData): Promise<FounderResult> {
  const me = await staffUser();
  if (!me) return DENIED;
  const parsed = projectInput.safeParse({ name: form.get("name"), summary: (form.get("summary") as string | null) || undefined });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  try {
    const p = await createProject(me.id, parsed.data);
    refresh(p.id);
    return { ok: true, message: "Project created.", id: p.id };
  } catch (e) {
    return fail(e);
  }
}

export async function addItemAction(_: FounderResult | null, form: FormData): Promise<FounderResult> {
  const me = await staffUser();
  if (!me) return DENIED;
  const parsed = itemInput.safeParse({
    kind: form.get("kind"),
    title: form.get("title"),
    body: (form.get("body") as string | null) || undefined,
    projectId: (form.get("projectId") as string) || null,
    due: (form.get("due") as string | null) || undefined,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  try {
    const i = await addItem(me.id, parsed.data);
    refresh(i.projectId);
    return { ok: true, message: "Added.", id: i.id };
  } catch (e) {
    return fail(e);
  }
}

export async function setItemDoneAction(itemId: string, done: boolean): Promise<FounderResult> {
  const me = await staffUser();
  if (!me) return DENIED;
  try {
    const i = await setItemDone(me.id, itemId, done);
    refresh(i.projectId);
    return { ok: true, message: done ? "Done." : "Reopened." };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteItemAction(itemId: string): Promise<FounderResult> {
  const me = await staffUser();
  if (!me) return DENIED;
  const item = await db.founderItem.findUnique({ where: { id: itemId } });
  if (!item) return { ok: false, error: "Already gone." };
  await db.founderItem.delete({ where: { id: itemId } });
  await logActivity(me.id, `${item.kind.toLowerCase()}.delete`, item.id, item.title);
  refresh(item.projectId);
  return { ok: true, message: "Deleted." };
}

export async function setProjectStatusAction(projectId: string, status: string): Promise<FounderResult> {
  const me = await staffUser();
  if (!me) return DENIED;
  const next = PROJECT_STATUSES.find((s) => s === status);
  if (!next) return { ok: false, error: "Unknown status." };
  const p = await db.founderProject.update({ where: { id: projectId }, data: { status: next } }).catch(() => null);
  if (!p) return { ok: false, error: "That project doesn't exist." };
  await logActivity(me.id, "project.status", p.id, `${p.name} → ${next}`);
  refresh(p.id);
  return { ok: true, message: "Saved." };
}

/** The assistant's proposal, after the person pressed Confirm on it. */
export async function confirmProposalAction(proposal: unknown): Promise<FounderResult> {
  const me = await staffUser();
  if (!me) return DENIED;
  const parsed = proposalInput.safeParse(proposal);
  if (!parsed.success) return { ok: false, error: "That proposal couldn't be checked. Reload the page and ask again." };
  try {
    const message = await applyProposal(me.id, parsed.data);
    refresh(parsed.data.kind === "add_item" ? parsed.data.projectId : null);
    return { ok: true, message };
  } catch (e) {
    return fail(e);
  }
}
