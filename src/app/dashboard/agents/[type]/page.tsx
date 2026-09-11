import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { findOrCreateThread, loadThreadMessages } from "@/lib/ai/threads";
import { AGENT_LABELS } from "@/lib/ai/agents";
import type { AgentType } from "@/generated/prisma/enums";
import { PageHeader } from "@/components/ui";
import { ChatClient } from "./chat-client";
import { activeOrganizationId } from "@/lib/active-org";
import { db } from "@/lib/db";
import { hasActivePlan } from "@/lib/readiness";
import { PlanLock } from "@/components/plan-lock";

const CLIENT_AGENT_TYPES: AgentType[] = ["STRATEGIST", "CREATIVE", "SUPPORT"];

export default async function AgentChatPage({
  params,
}: {
  params: Promise<{ type: string }>;
}) {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");

  const organizationId =
    (await activeOrganizationId()) ?? session.user.organizationId;

  const { type } = await params;
  const agentType = type.toUpperCase() as AgentType;
  if (!CLIENT_AGENT_TYPES.includes(agentType)) notFound();

  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { subscriptionTier: true, subscriptionStatus: true },
  });
  if (!org || !hasActivePlan(org)) {
    return (
      <div>
        <PageHeader title={`${AGENT_LABELS[agentType]} agent`} />
        <PlanLock
          title="This one comes with a plan"
          body="The specialists read your real account — your budget, your campaigns, what actually sold — rather than answering in general. That needs a plan."
        />
      </div>
    );
  }

  const thread = await findOrCreateThread(
    session.user.id,
    organizationId,
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
