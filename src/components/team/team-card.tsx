import Link from "next/link";
import { AGENT } from "@/lib/team/agents";
import type { TeamView } from "@/lib/team/store";
import { AgentIcon } from "./agent-ui";

// The Overview's AI Team card: the welcome line and the last few things the
// team really did. Opens the AI Team screen.

const time = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export function TeamCard({ team }: { team: TeamView }) {
  const recent = team.feed.filter((f) => f.status !== "RUNNING").slice(0, 3);
  return (
    <section aria-labelledby="ai-team" className="rounded-[28px] p-6 sm:p-7" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.015))" }}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="ai-team" className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-bright">Your AI Team</h2>
        <Link href="/dashboard/team" className="text-[13px] text-muted hover:text-white">Meet your team →</Link>
      </div>
      <p className="mt-3 text-[14.5px] leading-relaxed text-white/85">{team.welcome}</p>
      {recent.length > 0 && (
        <ul className="mt-4 space-y-3">
          {recent.map((f) => (
            <li key={f.id} className="flex items-start gap-3">
              <AgentIcon role={f.agent} size={28} />
              <p className="min-w-0 text-[13.5px] leading-relaxed text-white/80">
                <span className="text-white">{AGENT[f.agent].name}</span>
                <span className="text-faint"> · {time(f.at)}</span>
                <br />
                {f.summary}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
