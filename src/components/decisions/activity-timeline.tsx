import type { ActivityEntry } from "@/lib/activity/log";

// Mairo Activity: every action MAIRO took, newest first, with the reason.
//
//   10:42 AM  Mairo reduced "Spring sale" from $40/day to $30/day.
//             Reason: cost per purchase was over your target three days running.

function when(at: Date, now = new Date()): { day: string; time: string } {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((day(now) - day(at)) / 86_400_000);
  return {
    day: diff <= 0 ? "Today" : diff === 1 ? "Yesterday" : at.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    time: at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
  };
}

export function ActivityTimeline({ entries, compact = false }: { entries: ActivityEntry[]; compact?: boolean }) {
  if (entries.length === 0) {
    return (
      <p className="text-[13px] leading-relaxed text-muted">
        Mairo hasn&rsquo;t changed anything yet. Every change it makes — whether you approved it or it acted inside your
        limits — shows up here with the reason.
      </p>
    );
  }
  const days = entries.map((e) => when(e.at));
  return (
    <ol className="relative space-y-4 border-l pl-5" style={{ borderColor: "var(--mairo-line)" }}>
      {entries.map((e, i) => {
        const w = days[i];
        const showDay = i === 0 || days[i - 1].day !== w.day;
        return (
          <li key={e.id} className="relative">
            <span
              aria-hidden
              className="absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full"
              style={{ background: e.automatic ? "var(--mairo-ramp)" : "#94a3b8", backgroundImage: e.automatic ? "var(--mairo-ramp)" : undefined }}
            />
            {showDay && !compact && <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.16em] text-faint">{w.day}</p>}
            <p className="text-[11.5px] text-faint">
              {compact ? `${w.day}, ${w.time}` : w.time} · {e.automatic ? "Mairo, within your limits" : e.source === "protection" ? "You" : "You approved"}
            </p>
            <p className="mt-0.5 text-[13.5px] text-white">{e.summary}</p>
            {!compact && (
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
                <span className="text-faint">Reason: </span>
                {e.reason}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
