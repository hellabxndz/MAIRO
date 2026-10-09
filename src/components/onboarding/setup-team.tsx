import { AGENT } from "@/lib/team/agents";
import type { SetupWork } from "@/lib/onboarding/team";
import { nextUp } from "@/lib/onboarding/team";
import type { StepId } from "@/lib/onboarding/progress";
import { AgentIcon } from "@/components/team/agent-ui";

// "Your AI team so far": each line is a recorded piece of work on this
// business's setup. Below it, who takes the next step — said as what will
// happen, not as activity.

const time = (d: Date, tz?: string) => d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz });

export function SetupTeam({ work, focus, timeZone }: { work: SetupWork[]; focus: StepId | null; timeZone?: string }) {
  const next = nextUp(focus);
  return (
    <section aria-labelledby="setup-team" className="rounded-2xl border border-white/[0.07] bg-field/80 p-5">
      <h2 id="setup-team" className="text-[15px] font-semibold text-white">Your AI team so far</h2>
      {work.length === 0 ? (
        <p className="mt-2 text-[13px] text-muted">Nothing yet. Each specialist&rsquo;s work on your setup shows here as it happens.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {work.map((w) => (
            <li key={w.id} className="flex gap-3" data-run={w.task}>
              <AgentIcon role={w.agent} size={28} />
              <p className="min-w-0 text-[13px] leading-relaxed">
                <span className="text-faint">
                  {AGENT[w.agent].name} · {w.status === "RUNNING" ? "working on it now" : time(w.at, timeZone)}
                  {w.status === "FAILED" ? " · didn't finish" : ""}
                </span>
                <br />
                <span className={w.status === "FAILED" ? "text-alert" : "text-white/85"}>{w.summary ?? "Working on it."}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
      {next && (
        <div className="mt-4 border-t border-white/[0.06] pt-3">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-faint">What happens next</p>
          <p className="mt-1 text-[13px] text-white/85">{next.text}</p>
        </div>
      )}
    </section>
  );
}
