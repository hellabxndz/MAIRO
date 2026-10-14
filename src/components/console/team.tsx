"use client";

import type { AgentRole } from "@/generated/prisma/enums";
import { AGENT } from "@/lib/team/agents";
import { AgentIcon } from "@/components/team/agent-ui";
import { Go, Panel, Pill, type PillTone } from "./kit";

// The AI team in one place: the eight specialties of one AI system, each with
// its verified state from the run records — nothing animated, nothing that
// suggests work that isn't recorded.

export type TeamMemberData = { role: AgentRole; state: string; tone: PillTone; line: string | null; href?: string | null };

export function TeamPanel({ members, intro, allHref }: { members: TeamMemberData[]; intro: string; allHref?: string | null }) {
  return (
    <Panel id="team-panel" title="Your AI advertising team" action={{ href: allHref, label: "Open AI Team" }}>
      <p className="-mt-1 max-w-[720px] text-[13.5px] leading-relaxed text-white/75">{intro}</p>
      <ul className="mt-4 grid grid-cols-1 gap-2 @md:grid-cols-2 @4xl:grid-cols-4">
        {members.map((m) => (
          <li key={m.role}>
            <Go href={m.href} className="flex h-full items-start gap-3 rounded-2xl border border-[color:var(--mairo-line)] p-3 transition hover:border-[color:var(--mairo-line-lit)]">
              <AgentIcon role={m.role} size={30} />
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium text-white">{AGENT[m.role].name}</span>
                <span className="mt-1 block">
                  <Pill tone={m.tone} dot>
                    {m.state}
                  </Pill>
                </span>
                {m.line && <span className="mt-1.5 block text-[11.5px] leading-snug text-faint">{m.line}</span>}
              </span>
            </Go>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
