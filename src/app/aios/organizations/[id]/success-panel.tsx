import { db } from "@/lib/db";
import { Badge, Card } from "@/components/ui";
import { successAccount } from "@/lib/success/accounts";
import { addSupportNoteAction, setFoundingAction, updateFeedbackAction } from "@/lib/actions/success-actions";

// One business, for the MAIRO team: how its first month is going, whether
// it's struggling and why, what it has told MAIRO, and what the team has
// discussed with it. Internal only.

const TONE = { struggling: "red", watch: "yellow", healthy: "green", cancelled: "neutral" } as const;
const LEVEL = { struggling: "Struggling", watch: "Watch", healthy: "On track", cancelled: "Cancelled" } as const;
const EASIER = { YES: "Yes", SOMEWHAT: "Somewhat", NO: "Not yet" } as const;
const KIND = { PROBLEM: "Problem", CONFUSING: "Confusing", IDEA: "Idea", CANCELLATION: "Cancelling", PULSE: "Pulse" } as const;
const field = "rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2 text-sm text-white";
const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export async function SuccessPanel({ organizationId }: { organizationId: string }) {
  const [account, feedback, notes, org] = await Promise.all([
    successAccount(organizationId),
    db.customerFeedback.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: 30 }),
    db.supportNote.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: 30 }),
    db.organization.findUnique({ where: { id: organizationId }, select: { foundingSince: true, caseStudyConsentAt: true } }),
  ]);
  if (!account) return null;

  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-medium">Customer success</h2>
          <p className="mt-1 text-sm text-neutral-400">
            Day {account.journey.day} · {account.journey.done}/{account.journey.total} first-month steps ·{" "}
            {account.daysToFirstCampaign === null ? "no campaign approved yet" : `first campaign approved on day ${account.daysToFirstCampaign}`} · last visit{" "}
            {account.lastActiveAt ? day(account.lastActiveAt) : "never"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone={TONE[account.health.level]}>{LEVEL[account.health.level]}</Badge>
            {account.health.flags.map((f) => (
              <span key={f} className="text-[13px] text-neutral-300">· {f}</span>
            ))}
          </div>
          <p className="mt-2 text-[12px] text-neutral-500">
            Case study: {org?.caseStudyConsentAt ? `consented ${day(org.caseStudyConsentAt)} (anonymized only)` : "no consent — don't share their results"}
          </p>
        </div>
        <form action={setFoundingAction.bind(null, organizationId)} className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input type="checkbox" name="founding" defaultChecked={account.founding} className="h-4 w-4" />
            Founding customer{org?.foundingSince ? ` since ${day(org.foundingSince)}` : ""}
          </label>
          <button type="submit" className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-neutral-300 hover:text-white">Save</button>
        </form>
      </div>

      <ol className="mt-5 grid gap-2 sm:grid-cols-5">
        {account.journey.stages.map((s) => (
          <li key={s.key} className={`rounded-xl border px-3 py-2.5 ${s.state === "current" ? "border-white/30" : "border-white/10"}`}>
            <p className="text-[11px] text-neutral-500">{s.when} · {s.state}</p>
            <p className="text-sm text-white">{s.title}</p>
            <ul className="mt-1.5 space-y-0.5">
              {s.items.map((i) => (
                <li key={i.label} className={`text-[12px] ${i.done ? "text-emerald-300/80" : "text-neutral-500"}`}>
                  {i.done ? "✓" : "○"} {i.label}{i.optional ? " (optional)" : ""}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-medium text-neutral-300">What they&rsquo;ve told MAIRO</h3>
          {feedback.length === 0 ? (
            <p className="text-[13px] text-neutral-500">Nothing yet.</p>
          ) : (
            <ul className="space-y-2">
              {feedback.map((f) => (
                <li key={f.id} className="rounded-xl border border-white/10 p-3">
                  <p className="text-[12px] text-neutral-500">
                    {KIND[f.kind]}{f.easier ? ` · easier? ${EASIER[f.easier]}` : ""} · {day(f.createdAt)}{f.page ? ` · ${f.page}` : ""}
                  </p>
                  {f.text && <p className="mt-1 whitespace-pre-wrap text-[13px] text-neutral-200">{f.text}</p>}
                  {f.kind !== "PULSE" && (
                    <form action={updateFeedbackAction.bind(null, f.id)} className="mt-2 flex flex-wrap items-center gap-2">
                      <select name="status" defaultValue={f.status} className={field} aria-label="Status">
                        <option value="OPEN">Open</option>
                        <option value="IN_PROGRESS">In progress</option>
                        <option value="RESOLVED">Resolved</option>
                      </select>
                      <input name="internalNote" defaultValue={f.internalNote ?? ""} placeholder="Internal note" className={`${field} min-w-0 flex-1`} aria-label="Internal note" />
                      <button type="submit" className="rounded-lg border border-white/15 px-3 py-2 text-xs text-neutral-300 hover:text-white">Save</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="mb-2 text-sm font-medium text-neutral-300">Support log</h3>
          <form action={addSupportNoteAction.bind(null, organizationId)} className="mb-3 space-y-2">
            <div className="flex gap-2">
              <select name="channel" defaultValue="CALL" className={field} aria-label="Channel">
                <option value="CALL">Call</option>
                <option value="EMAIL">Email</option>
                <option value="CHAT">Chat</option>
                <option value="MEETING">Meeting</option>
                <option value="NOTE">Note</option>
              </select>
              <button type="submit" className="rounded-lg border border-white/15 px-3 py-2 text-xs text-neutral-300 hover:text-white">Add</button>
            </div>
            <textarea name="text" rows={3} required placeholder="What was discussed, what was promised, what's next" className={`${field} w-full`} aria-label="Note" />
          </form>
          {notes.length === 0 ? (
            <p className="text-[13px] text-neutral-500">No conversations logged yet.</p>
          ) : (
            <ul className="space-y-2">
              {notes.map((n) => (
                <li key={n.id} className="rounded-xl border border-white/10 p-3">
                  <p className="text-[12px] text-neutral-500">{n.channel.toLowerCase()} · {day(n.createdAt)}</p>
                  <p className="mt-1 whitespace-pre-wrap text-[13px] text-neutral-200">{n.text}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}
