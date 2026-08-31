"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { currentMonthKey } from "@/lib/utils/month";

const requestSchema = z.object({
  type: z.enum(["IMAGE", "VIDEO", "COPY", "CAROUSEL"]),
  brief: z.string().min(5, "Give us a bit more detail"),
});

export type CreativeActionState = { error?: string } | undefined;

export async function requestCreativeAction(
  _prevState: CreativeActionState,
  formData: FormData
): Promise<CreativeActionState> {
  const session = await auth();
  if (!session?.user?.organizationId) return { error: "Not authenticated" };

  const parsed = requestSchema.safeParse({
    type: formData.get("type"),
    brief: formData.get("brief"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await db.creativeRequest.create({
    data: {
      organizationId: session.user.organizationId,
      month: currentMonthKey(),
      type: parsed.data.type,
      brief: parsed.data.brief,
    },
  });

  revalidatePath("/dashboard/creatives");
  return undefined;
}
