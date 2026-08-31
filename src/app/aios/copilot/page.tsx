import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { findOrCreateThread, loadThreadMessages } from "@/lib/ai/threads";
import { AGENT_LABELS } from "@/lib/ai/agents";
import { PageHeader } from "@/components/ui";
import { ChatClient } from "@/app/dashboard/agents/[type]/chat-client";

export default async function CopilotPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "OWNER") redirect("/sign-in");

  const thread = await findOrCreateThread(session.user.id, null, "OWNER_COPILOT");
  const initialMessages = await loadThreadMessages(thread.id);

  return (
    <div>
      <PageHeader title={AGENT_LABELS.OWNER_COPILOT} />
      <ChatClient
        threadId={thread.id}
        agentType="OWNER_COPILOT"
        initialMessages={initialMessages}
        agentLabel="AIOS Copilot"
      />
    </div>
  );
}
