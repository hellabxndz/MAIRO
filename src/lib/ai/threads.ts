import type { UIMessage } from "ai";
import { db } from "@/lib/db";
import type { AgentType } from "@/generated/prisma/enums";

export async function findOrCreateThread(
  userId: string,
  organizationId: string | null,
  agentType: AgentType
) {
  // One conversation per person per business. Without the business in the
  // lookup, someone with two businesses got the first one's thread — and its
  // Business Brain — while working in the second. (organizationId null is the
  // owner's copilot, which has no business.)
  const existing = await db.agentThread.findFirst({
    where: { userId, agentType, organizationId },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;

  return db.agentThread.create({
    data: { userId, organizationId, agentType },
  });
}

/**
 * What of a conversation goes to the model: the most recent turns, starting
 * at something the person said. Long-term memory isn't the transcript — it's
 * the Business Brain, which every request carries — so a thread months long
 * neither grows the cost of each answer nor pushes the business's facts out.
 */
export const RECENT_TURNS = 40;
export function recentTurns<T extends { role: string }>(messages: T[], max = RECENT_TURNS): T[] {
  const recent = messages.slice(-max);
  const first = recent.findIndex((m) => m.role === "user");
  return first === -1 ? [] : recent.slice(first);
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
