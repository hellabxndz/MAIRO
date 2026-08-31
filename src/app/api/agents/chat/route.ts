import { streamText, convertToModelMessages, type UIMessage } from "ai";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { agentModel } from "@/lib/ai/model";
import { systemPromptFor } from "@/lib/ai/agents";
import type { AgentType } from "@/generated/prisma/enums";

function lastUserText(messages: UIMessage[]): string | null {
  const last = [...messages].reverse().find((m) => m.role === "user");
  if (!last) return null;
  return last.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n");
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { messages, threadId, agentType } = (await req.json()) as {
    messages: UIMessage[];
    threadId: string;
    agentType: AgentType;
  };

  const thread = await db.agentThread.findUnique({ where: { id: threadId } });
  if (!thread || thread.userId !== session.user.id) {
    return new Response("Not found", { status: 404 });
  }

  const userText = lastUserText(messages);
  if (userText) {
    await db.agentMessage.create({
      data: { threadId, role: "USER", content: userText },
    });
  }

  const result = streamText({
    model: agentModel,
    system: systemPromptFor(agentType),
    messages: convertToModelMessages(messages),
    onFinish: async ({ text }) => {
      await db.agentMessage.create({
        data: { threadId, role: "ASSISTANT", content: text },
      });
      await db.agentThread.update({
        where: { id: threadId },
        data: { updatedAt: new Date() },
      });
    },
  });

  return result.toUIMessageStreamResponse();
}
