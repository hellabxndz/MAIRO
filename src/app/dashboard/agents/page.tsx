import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader, Card } from "@/components/ui";
import { AGENT_LABELS, AGENT_DESCRIPTIONS } from "@/lib/ai/agents";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { hasActivePlan } from "@/lib/readiness";
import { PlanLock } from "@/components/plan-lock";
import type { AgentType } from "@/generated/prisma/enums";

const CLIENT_AGENT_TYPES: AgentType[] = ["STRATEGIST", "CREATIVE", "SUPPORT"];

export default async function AgentsIndexPage() {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");

  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { subscriptionTier: true, subscriptionStatus: true },
  });

  const unlocked = org ? hasActivePlan(org) : false;

  return (
    <div>
      <PageHeader
        title="AI specialists"
        description="Chat with an agent that knows your account and campaigns."
      />

      {/* Locked rather than hidden. Somebody who can see the three specialists
          and a padlock knows what they would be buying; somebody who sees an
          empty page assumes the product is thin. */}
      {!unlocked && (
        <div className="mb-8">
          <PlanLock
            title="The specialists come with a plan"
            body="A strategist who knows your numbers, a creative director who writes your ads, and someone to answer anything else — all of them looking at your actual account rather than guessing. Pick a plan and they open up straight away."
          />
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-3">
        {CLIENT_AGENT_TYPES.map((type) => {
          const card = (
            <Card
              className={`h-full ${unlocked ? "transition hover:border-white/30" : "opacity-60"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-medium">{AGENT_LABELS[type]}</h2>
                {!unlocked && (
                  <svg
                    viewBox="0 0 20 20"
                    className="mt-0.5 h-4 w-4 flex-none text-neutral-600"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    aria-label="Locked"
                  >
                    <rect x="4" y="8.5" width="12" height="8" rx="2" />
                    <path d="M7 8.5V6a3 3 0 0 1 6 0v2.5" strokeLinecap="round" />
                  </svg>
                )}
              </div>
              <p className="mt-2 text-sm text-neutral-400">{AGENT_DESCRIPTIONS[type]}</p>
            </Card>
          );

          return unlocked ? (
            <Link key={type} href={`/dashboard/agents/${type.toLowerCase()}`}>
              {card}
            </Link>
          ) : (
            <div key={type}>{card}</div>
          );
        })}
      </div>
    </div>
  );
}
