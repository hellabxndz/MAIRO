import { streamText, convertToModelMessages, type UIMessage } from "ai";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasActivePlan, readinessBrief, readinessFor } from "@/lib/readiness";
import { agentModel } from "@/lib/ai/model";
import { systemPromptFor } from "@/lib/ai/agents";
import { memoryBrief, memoryProfile } from "@/lib/memory/profile";
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

  const { messages, threadId } = (await req.json()) as {
    messages: UIMessage[];
    threadId: string;
  };

  const thread = await db.agentThread.findUnique({ where: { id: threadId } });
  if (!thread || thread.userId !== session.user.id) {
    return new Response("Not found", { status: 404 });
  }

  // Which prompt to run comes from the thread row, not from the request body.
  // It used to be a field the browser sent, which meant anybody could ask for
  // OWNER_COPILOT — the internal prompt written for whoever runs MAIRO, with
  // every client account in scope — simply by changing one string in devtools.
  // The thread's own type cannot be picked that way: it is set when the thread
  // is created, on the server, from who is asking.
  const agentType: AgentType = thread.agentType;

  // The owner's copilot is a different shape of request and always was: it has
  // no organization, so there is no plan to check and no account readiness to
  // read. It was being rejected by the organization check below, which meant
  // the internal copilot answered nothing at all. Gated on the role instead,
  // which is what actually governs it.
  if (agentType === "OWNER_COPILOT") {
    if (session.user.role !== "OWNER") {
      return new Response("Not found", { status: 404 });
    }
    if (!process.env.ANTHROPIC_API_KEY?.trim()) {
      return new Response(
        "The AI isn't configured on this deployment. Add ANTHROPIC_API_KEY in your hosting environment variables and redeploy — /aios/setup shows whether it's set.",
        { status: 503 }
      );
    }
    await recordUserMessage(threadId, messages);
    return stream(threadId, systemPromptFor("OWNER_COPILOT"), messages);
  }

  // Everything else is a customer's assistant, and it cannot be served without
  // an organization to check a plan against or read readiness from.
  if (!thread.organizationId) {
    return new Response("Not found", { status: 404 });
  }
  const threadOrgId = thread.organizationId;

  // The plan gate, enforced here rather than only on the page. A locked card
  // somebody can walk around by opening the URL is decoration, and this
  // endpoint costs real money to serve.
  const org = await db.organization.findUnique({
    where: { id: threadOrgId },
    select: {
      name: true,
      assistantName: true,
      subscriptionTier: true,
      subscriptionStatus: true,
    },
  });
  if (!org || !hasActivePlan(org)) {
    return new Response(
      "Your assistant comes with a plan. Choose one in Settings and it opens up straight away.",
      { status: 402 }
    );
  }

  // Only now whether this deployment can talk to a model at all. Checked here
  // rather than left to fail inside the provider, because a missing key
  // otherwise surfaces as a stream that ends with no text — which reads as
  // "the agent is ignoring me" rather than "this deployment isn't configured".
  //
  // After the plan gate, so an unpaid customer is told the truth about why
  // they cannot use this rather than being handed an operator's problem.
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return new Response(
      "The AI isn't configured on this deployment. Add ANTHROPIC_API_KEY in your hosting environment variables and redeploy — /aios/setup shows whether it's set.",
      { status: 503 }
    );
  }

  // What the account still has to do, so the agent's answer matches the
  // dashboard. A customer asking "why isn't my ad running" and getting two
  // different answers is worse than the agent saying nothing.
  //
  // Funding is checked for real here, at the cost of one Graph call per
  // message. Without it every answer would round to "add a card to your Meta
  // account", including for the customers who already have — which is exactly
  // the kind of confidently wrong reply that stops people trusting it.
  const readiness = await readinessFor(threadOrgId, { checkFunding: true });

  // What MAIRO knows about this business, and — the part that matters — what
  // it does not. An assistant that has not been told its own blind spots fills
  // them in confidently, and a confident guess about somebody's own business
  // is the fastest way to lose them.
  const memory = await memoryProfile(threadOrgId);

  await recordUserMessage(threadId, messages);

  // The assistant answers as whatever this business named it, about this
  // business by name. Both are read from the organization rather than sent by
  // the browser — a prompt field the client controls is a prompt field the
  // client can rewrite.
  const system = `${systemPromptFor(agentType, {
    assistantName: org.assistantName,
    businessName: org.name,
  })}\n\n${readinessBrief(readiness)}\n\n${memoryBrief(memory)}`;

  return stream(threadId, system, messages);
}

/** Store what they just asked, so the thread survives a reload. */
async function recordUserMessage(threadId: string, messages: UIMessage[]) {
  const userText = lastUserText(messages);
  if (!userText) return;
  await db.agentMessage.create({ data: { threadId, role: "USER", content: userText } });
}

/** The model call and the reply row, shared by both kinds of thread. */
function stream(threadId: string, system: string, messages: UIMessage[]) {
  const result = streamText({
    model: agentModel,
    system,
    messages: convertToModelMessages(messages),
    onFinish: async ({ text }) => {
      // An empty completion isn't worth a row, and storing one makes the
      // thread look like the agent replied with silence next time it loads.
      if (!text.trim()) return;
      await db.agentMessage.create({
        data: { threadId, role: "ASSISTANT", content: text },
      });
      await db.agentThread.update({
        where: { id: threadId },
        data: { updatedAt: new Date() },
      });
    },
  });

  return result.toUIMessageStreamResponse({
    // Without this the SDK masks every streaming failure as the string
    // "An error occurred", which tells the person at the keyboard nothing.
    onError: (error) => {
      console.error("Agent chat failed:", error);
      const message = error instanceof Error ? error.message : String(error);
      if (/api[_ -]?key|authentication|401/i.test(message)) {
        return "The AI provider rejected our API key. Check ANTHROPIC_API_KEY in your environment variables.";
      }
      if (/rate.?limit|429/i.test(message)) {
        return "The AI provider is rate limiting us. Wait a moment and try again.";
      }
      if (/credit|balance|quota|billing/i.test(message)) {
        return "The Anthropic account is out of credit. Top it up at console.anthropic.com and try again.";
      }
      return `The agent couldn't reply: ${message}`;
    },
  });
}
