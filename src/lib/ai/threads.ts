import type { UIMessage } from "ai";
import { db } from "@/lib/db";
import type { AgentType } from "@/generated/prisma/enums";

export async function findOrCreateThread(
  userId: string,
  organizationId: string | null,
  agentType: AgentType
) {
  const existing = await db.agentThread.findFirst({
    where: { userId, agentType },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;

  return db.agentThread.create({
    data: { userId, organizationId, agentType },
  });
}

export async function loadThreadMessages(threadId: string): Promise<UIMessage[]> {
  const messages = await db.agentMessage.findMany({
    where: { threadId },
    orderBy: { createdAt: "asc" },
  });

  return messages.map((m) => ({
    id: m.id,
    role: m.role.toLowerCase() as "user" | "assistant" | "system",
    parts: [{ type: "text" as const, text: m.content }],
  }));
}
