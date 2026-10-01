import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { missionGoal } from "@/lib/mission/goals";
import { activeMission, missionActivity, missionLearned, missionRecommendations, missionResults, proposedMission } from "@/lib/mission/store";
import { PlanView } from "@/components/mission/plan-view";
import { DoingNow, GoalResults, Learned, MissionHeadline, NextActions } from "@/components/mission/mission-status";
import { ApproveBar, ChangeGoalButton, EndNote, GoalPicker, SecondaryGoal, TellMairo } from "./mission-client";

// The MAIRO Mission: the business says what it wants; MAIRO plans it,
// the owner approves, MAIRO runs it, measures it, learns, and plans the next
// step. Everything else in MAIRO serves the mission on this page.

export const maxDuration = 60;

const NOTE_LABEL: Record<string, string> = { PROMOTION: "Promotion", UNAVAILABLE: "Unavailable", LAUNCH: "Launch", INFO: "Note" };

export default async function MissionPage() {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  const [mission, proposal, notes] = await Promise.all([
    activeMission(organizationId),
    proposedMission(organizationId),
    db.missionNote.findMany({ where: { organizationId, active: true }, orderBy: { createdAt: "desc" }, take: 12 }),
  ]);
  const results = mission ? await missionResults(organizationId, mission.primaryGoal, 7).catch(() => null) : null;

  return (
    <div className="mx-auto max-w-[1180px]">
      <header className="mb-6">
        <h1 className="text-[clamp(24px,3vw,32px)] font-semibold tracking-[-0.02em] text-white">Your MAIRO Mission</h1>
        <p className="mt-1.5 max-w-[700px] text-[14.5px] text-muted">You run the business. MAIRO runs the marketing — toward the goal you set, with your approval.</p>
      </header>

      {proposal && (
        <section className="mb-8">
          <div className="mb-4 rounded-2xl border border-violet/35 bg-violet/[0.07] p-5">
            <p className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-violet-bright">MAIRO created a plan</p>
            <h2 className="mt-1 text-[22px] font-semibold text-white">🎯 {proposal.title}</h2>
            <p className="mt-1 text-[14px] text-white/80">{proposal.plan.mission}</p>
            {mission && mission.primaryGoal !== proposal.primaryGoal && (
              <p className="mt-2 text-[13px] text-amber-200/90">This replaces your current mission, &ldquo;{mission.title}&rdquo;, once you approve it.</p>
            )}
            {!proposal.aiUsed && <p className="mt-2 text-[12px] text-faint">Built from MAIRO&rsquo;s playbook (AI wasn&rsquo;t available just now).</p>}
          </div>
          <PlanView plan={proposal.plan} />
          <div className="mt-5"><ApproveBar missionId={proposal.id} scale={proposal.plan.scale} /></div>
        </section>
      )}

      {!mission && !proposal && <GoalPicker />}

      {mission && (
        <section className="space-y-4">
          <div className="rounded-2xl border border-white/[0.07] bg-[#0b1122]/80 p-5">
            <MissionHeadline
              title={mission.title}
              sentence={mission.plan.mission}
              strategy={mission.plan.strategy}
              secondary={mission.secondaryGoal ? missionGoal(mission.secondaryGoal).label : null}
              confidence={results?.confidence ?? null}
            />
            <div className="mt-4 flex flex-wrap gap-2">
              <ChangeGoalButton />
              <SecondaryGoal current={mission.secondaryGoal} primary={mission.primaryGoal} />
              {mission.campaignDraftId && (
                <Link href={`/dashboard/create/meta?draft=${mission.campaignDraftId}`} className="inline-flex min-h-[44px] items-center rounded-lg border border-white/12 px-4 text-[14px] text-white/85 hover:border-white/30">
                  Open the planned campaign
                </Link>
              )}
            </div>
          </div>
          <ActiveMission organizationId={organizationId} mission={mission} results={results} />
          <section className="rounded-2xl border border-white/[0.07] bg-[#0b1122]/80 p-5">
            <h3 className="text-[16px] font-semibold text-white">Tell MAIRO something new</h3>
            <p className="mb-3 mt-0.5 text-[13px] text-muted">A promotion, a launch, something sold out, a new goal. MAIRO works out what to change.</p>
            <TellMairo />
            {notes.length > 0 && (
              <ul className="mt-4 space-y-2">
                {notes.map((n) => (
                  <li key={n.id} className="flex items-start justify-between gap-3 rounded-lg bg-white/[0.03] px-3 py-2 text-[13px]">
                    <span className="min-w-0 text-white/85"><span className="mr-2 text-[11px] uppercase tracking-[0.12em] text-faint">{NOTE_LABEL[n.kind] ?? "Note"}</span>{n.text}</span>
                    <EndNote id={n.id} label={n.kind === "UNAVAILABLE" ? "Back in stock" : n.kind === "PROMOTION" ? "It's over" : "No longer true"} />
                  </li>
                ))}
              </ul>
            )}
          </section>
          <details className="rounded-2xl border border-white/[0.07] bg-[#0b1122]/80 p-5">
            <summary className="cursor-pointer text-[15px] font-semibold text-white">The full plan</summary>
            <div className="mt-4"><PlanView plan={mission.plan} /></div>
          </details>
        </section>
      )}
    </div>
  );
}

async function ActiveMission({ organizationId, mission, results }: { organizationId: string; mission: NonNullable<Awaited<ReturnType<typeof activeMission>>>; results: Awaited<ReturnType<typeof missionResults>> | null }) {
  const [activity, learned, next] = await Promise.all([
    missionActivity(organizationId),
    missionLearned(organizationId),
    missionRecommendations(organizationId, mission),
  ]);
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <DoingNow activity={activity} />
        <GoalResults tiles={results?.tiles ?? []} days={7} hasData={results?.hasData ?? false} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Learned items={learned} />
        <NextActions items={next} fallback={`MAIRO keeps working on "${mission.title}" and checks the results every day.`} />
      </div>
    </>
  );
}
