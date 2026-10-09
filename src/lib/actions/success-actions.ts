"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import type { FeedbackStatus, SupportChannel } from "@/generated/prisma/enums";

// The MAIRO team's customer-success actions (AIOS). Owner only, like every
// AIOS action: these touch any business.

async function owner(): Promise<string | null> {
  const session = await auth();
  if (!session?.user || session.user.role !== "OWNER") throw new Error("Owner access required");
  return session.user.id ?? null;
}

const refresh = (organizationId: string) => {
  revalidatePath("/aios/customers");
  revalidatePath(`/aios/organizations/${organizationId}`);
};

const CHANNELS: SupportChannel[] = ["CALL", "EMAIL", "CHAT", "MEETING", "NOTE"];
const STATUSES: FeedbackStatus[] = ["OPEN", "IN_PROGRESS", "RESOLVED"];

/** Into or out of the Founding Customer Program. */
export async function setFoundingAction(organizationId: string, formData: FormData): Promise<void> {
  await owner();
  const on = formData.get("founding") === "on";
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { foundingSince: true } });
  if (!org) return;
  await db.organization.update({
    where: { id: organizationId },
    data: { foundingCustomer: on, foundingSince: on ? (org.foundingSince ?? new Date()) : org.foundingSince },
  });
  refresh(organizationId);
}

/** A record of talking to the business — internal, never shown to them. */
export async function addSupportNoteAction(organizationId: string, formData: FormData): Promise<void> {
  const authorId = await owner();
  const text = String(formData.get("text") ?? "").trim().slice(0, 8000);
  const channel = String(formData.get("channel") ?? "NOTE") as SupportChannel;
  if (!text || !CHANNELS.includes(channel)) return;
  const exists = await db.organization.count({ where: { id: organizationId } });
  if (!exists) return;
  await db.supportNote.create({ data: { organizationId, authorId, channel, text } });
  refresh(organizationId);
}

/** Moves a problem report, idea or confusion along: open → in progress → resolved. */
export async function updateFeedbackAction(feedbackId: string, formData: FormData): Promise<void> {
  await owner();
  const status = String(formData.get("status") ?? "") as FeedbackStatus;
  const note = formData.get("internalNote");
  const row = await db.customerFeedback.findUnique({ where: { id: feedbackId }, select: { organizationId: true } });
  if (!row || !STATUSES.includes(status)) return;
  await db.customerFeedback.update({
    where: { id: feedbackId },
    data: {
      status,
      resolvedAt: status === "RESOLVED" ? new Date() : null,
      ...(typeof note === "string" ? { internalNote: note.trim().slice(0, 4000) || null } : {}),
    },
  });
  refresh(row.organizationId);
}
