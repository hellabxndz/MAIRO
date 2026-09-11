import { streamText, convertToModelMessages, type UIMessage } from "ai";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasActivePlan, readinessBrief, readinessFor } from "@/lib/readiness";
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
  // A thread with no organization cannot be checked against a plan or read for
  // readiness, so it is not a thread this endpoint will serve.
  if (!thread || thread.userId !== session.user.id || !thread.organizationId) {
    return new Response("Not found", { status: 404 });
  }
  const threadOrgId = thread.organizationId;

  // The plan gate, enforced here rather than only on the page. A locked card
  // somebody can walk around by opening the URL is decoration, and this
  // endpoint costs real money to serve.
  const org = await db.organization.findUnique({
    where: { id: threadOrgId },
    select: { subscriptionTier: true, subscriptionStatus: true },
  });
  if (!org || !hasActivePlan(org)) {
    return new Response(
      "The AI specialists come with a plan. Choose one in Settings and they open up straight away.",
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

  const userText = lastUserText(messages);
  if (userText) {
    await db.agentMessage.create({
      data: { threadId, role: "USER", content: userText },
    });
  }

  const result = streamText({
    model: agentModel,
    system: `${systemPromptFor(agentType)}\n\n${readinessBrief(readiness)}`,
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
