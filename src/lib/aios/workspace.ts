import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import type { FounderItemKind, FounderProjectStatus } from "@/generated/prisma/enums";

// The founder's workspace: projects and what's filed under them (tasks,
// milestones, notes, docs, ideas), and the activity log every change writes.
// Staff only. The role is read again from the database on each write — a
// session that outlived a demotion can't change anything here.

export const ITEM_KINDS = ["TASK", "MILESTONE", "NOTE", "DOC", "IDEA"] as const satisfies readonly FounderItemKind[];
export const PROJECT_STATUSES = ["IDEA", "ACTIVE", "PAUSED", "DONE"] as const satisfies readonly FounderProjectStatus[];

export const KIND_LABEL: Record<FounderItemKind, string> = { TASK: "Task", MILESTONE: "Milestone", NOTE: "Note", DOC: "Doc", IDEA: "Idea" };
export const STATUS_LABEL: Record<FounderProjectStatus, string> = { IDEA: "Idea", ACTIVE: "Active", PAUSED: "Paused", DONE: "Done" };

/** Who is asking, if they are MAIRO staff right now. */
export async function staffUser(): Promise<{ id: string; name: string | null } | null> {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "OWNER") return null;
  const user = await db.user.findUnique({ where: { id: session.user.id }, select: { id: true, name: true, role: true } });
  return user?.role === "OWNER" ? { id: user.id, name: user.name } : null;
}

export async function logActivity(actorUserId: string, action: string, target: string | null, detail: string | null, via: "assistant" | null = null) {
  await db.founderActivity.create({ data: { actorUserId, action, target, detail: detail?.slice(0, 2000) ?? null, via } });
}

// --- the shapes a change can take, checked on the server ---------------------

const title = z.string().trim().min(1, "Give it a title.").max(200);
// Both accept their own parsed output (null body, absent due): a proposal is
// parsed when the assistant makes it and again when the person confirms it.
const body = z.string().trim().max(20_000).nullish().transform((v) => v || null);
const day = z.preprocess(
  (v) => (v === "" || v === null ? undefined : v),
  z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-11-04.").optional(),
);

export const projectInput = z.object({ name: title, summary: body });
export const itemInput = z.object({ kind: z.enum(ITEM_KINDS), title, body, projectId: z.string().min(1).optional().nullable(), due: day });

/** What the assistant may propose. Nothing here spends, emails or touches a customer. */
export const proposalInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("create_project"), name: title, summary: body }),
  z.object({ kind: z.literal("add_item"), itemKind: z.enum(ITEM_KINDS), title, body, projectId: z.string().min(1).optional().nullable(), due: day }),
  z.object({ kind: z.literal("complete_item"), itemId: z.string().min(1) }),
]);
export type Proposal = z.infer<typeof proposalInput>;

const dueDate = (d: string | undefined) => (d ? new Date(`${d}T12:00:00Z`) : null);

export async function createProject(actorId: string, input: z.infer<typeof projectInput>, via: "assistant" | null = null) {
  const p = await db.founderProject.create({ data: { name: input.name, summary: input.summary, createdByUserId: actorId } });
  await logActivity(actorId, "project.create", p.id, p.name, via);
  return p;
}

export async function addItem(actorId: string, input: z.infer<typeof itemInput>, via: "assistant" | null = null) {
  if (input.projectId && !(await db.founderProject.findUnique({ where: { id: input.projectId }, select: { id: true } }))) throw new Error("That project doesn't exist.");
  const item = await db.founderItem.create({
    data: { kind: input.kind, title: input.title, body: input.body, projectId: input.projectId ?? null, dueAt: dueDate(input.due), createdByUserId: actorId },
  });
  await logActivity(actorId, `${input.kind.toLowerCase()}.create`, item.id, item.title, via);
  return item;
}

export async function setItemDone(actorId: string, itemId: string, done: boolean, via: "assistant" | null = null) {
  const item = await db.founderItem.findUnique({ where: { id: itemId } });
  if (!item) throw new Error("That item doesn't exist.");
  if (item.kind !== "TASK" && item.kind !== "MILESTONE") throw new Error("Only tasks and milestones can be ticked off.");
  await db.founderItem.update({ where: { id: itemId }, data: { doneAt: done ? new Date() : null } });
  await logActivity(actorId, done ? `${item.kind.toLowerCase()}.done` : `${item.kind.toLowerCase()}.reopen`, item.id, item.title, via);
  return item;
}

/** Carries out a proposal the person confirmed. Validated again here — the browser sent it back. */
export async function applyProposal(actorId: string, proposal: Proposal): Promise<string> {
  if (proposal.kind === "create_project") {
    const p = await createProject(actorId, { name: proposal.name, summary: proposal.summary }, "assistant");
    return `Project "${p.name}" created.`;
  }
  if (proposal.kind === "add_item") {
    const i = await addItem(actorId, { kind: proposal.itemKind, title: proposal.title, body: proposal.body, projectId: proposal.projectId, due: proposal.due }, "assistant");
    return `${KIND_LABEL[i.kind]} "${i.title}" added.`;
  }
  const i = await setItemDone(actorId, proposal.itemId, true, "assistant");
  return `"${i.title}" marked done.`;
}

/** The sentence a confirmation card shows: exactly what pressing Confirm does. */
export function describeProposal(p: Proposal, projectName?: string | null): string {
  if (p.kind === "create_project") return `Create the project "${p.name}"${p.summary ? ` — ${p.summary}` : ""}.`;
  if (p.kind === "add_item") return `Add the ${KIND_LABEL[p.itemKind].toLowerCase()} "${p.title}"${projectName ? ` to ${projectName}` : " to your inbox"}${p.due ? `, due ${p.due}` : ""}.`;
  return "Mark this item done.";
}
