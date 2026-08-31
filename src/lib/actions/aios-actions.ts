"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import type { CreativeStatus } from "@/generated/prisma/enums";

async function requireOwner() {
  const session = await auth();
  if (!session?.user || session.user.role !== "OWNER") {
    throw new Error("Owner access required");
  }
  return session;
}

export async function updateCreativeStatusAction(
  requestId: string,
  organizationId: string,
  formData: FormData
) {
  await requireOwner();
  const status = formData.get("status") as CreativeStatus;
  await db.creativeRequest.update({ where: { id: requestId }, data: { status } });
  revalidatePath("/aios/creatives");
  revalidatePath(`/aios/organizations/${organizationId}`);
}

export async function updatePlanStatusAction(
  planId: string,
  organizationId: string,
  formData: FormData
) {
  await requireOwner();
  const status = formData.get("status") as import("@/generated/prisma/enums").PlanStatus;
  await db.monthlyPlan.update({ where: { id: planId }, data: { status } });
  revalidatePath(`/aios/organizations/${organizationId}`);
}
