import Link from "next/link";
import { PageHeader, Card } from "@/components/ui";
import { AGENT_LABELS, AGENT_DESCRIPTIONS } from "@/lib/ai/agents";
import type { AgentType } from "@/generated/prisma/enums";

const CLIENT_AGENT_TYPES: AgentType[] = ["STRATEGIST", "CREATIVE", "SUPPORT"];

export default function AgentsIndexPage() {
  return (
    <div>
      <PageHeader
        title="AI specialists"
        description="Chat with an agent that knows your account and campaigns."
      />
      <div className="grid gap-6 sm:grid-cols-3">
        {CLIENT_AGENT_TYPES.map((type) => (
          <Link key={type} href={`/dashboard/agents/${type.toLowerCase()}`}>
            <Card className="h-full transition hover:border-white/30">
              <h2 className="font-medium">{AGENT_LABELS[type]}</h2>
              <p className="mt-2 text-sm text-neutral-400">{AGENT_DESCRIPTIONS[type]}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
