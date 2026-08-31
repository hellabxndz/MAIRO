import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { findOrCreateThread, loadThreadMessages } from "@/lib/ai/threads";
import { AGENT_LABELS } from "@/lib/ai/agents";
import type { AgentType } from "@/generated/prisma/enums";
import { PageHeader } from "@/components/ui";
import { ChatClient } from "./chat-client";

const CLIENT_AGENT_TYPES: AgentType[] = ["STRATEGIST", "CREATIVE", "SUPPORT"];

export default async function AgentChatPage({
  params,
}: {
  params: Promise<{ type: string }>;
}) {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");

  const { type } = await params;
  const agentType = type.toUpperCase() as AgentType;
  if (!CLIENT_AGENT_TYPES.includes(agentType)) notFound();

  const thread = await findOrCreateThread(
    session.user.id,
    session.user.organizationId,
    agentType
  );
  const initialMessages = await loadThreadMessages(thread.id);

  return (
    <div>
      <PageHeader title={`${AGENT_LABELS[agentType]} agent`} />
      <ChatClient
        threadId={thread.id}
        agentType={agentType}
        initialMessages={initialMessages}
        agentLabel={AGENT_LABELS[agentType]}
      />
    </div>
  );
}
