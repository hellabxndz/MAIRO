"use client";

import { useState, useTransition } from "react";
import type { LeadStatus } from "@/generated/prisma/enums";
import { saveLeadDetailsAction, setLeadOutcomeAction } from "@/lib/actions/lead-actions";
import { LEAD_OUTCOMES } from "@/lib/leads/outcomes";
import { LOST_REASONS } from "@/lib/leads/details";

// What became of one enquiry, as the business records it: the stage (in the
// business's own words), and — one tap away — when they got in touch, the
// appointment, the next follow-up, what the job is expected to be worth, what
// it was worth, why it was lost, and private notes. Nothing is guessed.

export type LeadRecordProps = {
  leadId: string;
  status: LeadStatus;
  labels: Record<LeadStatus, string>;
  valueCents: number | null;
  estimatedValueCents: number | null;
  lostReason: string | null;
  notes: string | null;
  firstContactedAt: string | null;
  lastContactedAt: string | null;
  appointmentAt: string | null;
  nextFollowUpAt: string | null;
};

const dollars = (c: number | null) => (c === null ? "" : String(c / 100));
const parseDollars = (v: string) => (v.trim() === "" ? null : Number(v.replace(/[$,\s]/g, "")));
/** An ISO date for a datetime-local input, in the viewer's own time. */
const local = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const toIso = (v: string) => (v ? new Date(v).toISOString() : null);
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null);

const field = "rounded-lg border border-[color:var(--mairo-line)] bg-field px-2.5 py-1.5 text-[13px] text-white outline-none focus:border-[color:var(--mairo-line-lit)]";

export function LeadOutcome(props: LeadRecordProps) {
  const { leadId, labels } = props;
  const [current, setCurrent] = useState<LeadStatus>(props.status);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(dollars(props.valueCents));
  const [estimate, setEstimate] = useState(dollars(props.estimatedValueCents));
  const [lost, setLost] = useState(props.lostReason ?? "");
  const [notes, setNotes] = useState(props.notes ?? "");
  const [contacted, setContacted] = useState(local(props.lastContactedAt));
  const [appointment, setAppointment] = useState(local(props.appointmentAt));
  const [followUp, setFollowUp] = useState(local(props.nextFollowUpAt));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const done = (r: { ok: boolean; error?: string }, after?: () => void) => {
    if (!r.ok) return setError(r.error ?? "Couldn't save that.");
    after?.();
    setSaved(true);
  };

  const setStage = (next: LeadStatus) => {
    setError(null);
    setSaved(false);
    start(async () => {
      const r = await setLeadOutcomeAction(leadId, next, next === "WON" ? parseDollars(value) : null, next === "LOST" ? lost || null : null);
      done(r, () => {
        setCurrent(next);
        if (next === "CONTACTED" && !contacted) setContacted(local(new Date().toISOString()));
      });
    });
  };

  const saveDetails = () => {
    setError(null);
    setSaved(false);
    start(async () => {
      const r = await saveLeadDetailsAction(leadId, {
        ...(contacted !== local(props.lastContactedAt) ? { contactedAt: toIso(contacted) } : {}),
        appointmentAt: toIso(appointment),
        nextFollowUpAt: toIso(followUp),
        estimatedValueDollars: parseDollars(estimate),
        ...(current === "WON" ? { valueDollars: parseDollars(value) } : {}),
        lostReason: current === "LOST" ? lost || null : null,
        notes,
      });
      done(r, () => {
        if (contacted && current === "NEW") setCurrent("CONTACTED");
      });
    });
  };

  const summary = [
    props.firstContactedAt ? `First contacted ${when(props.firstContactedAt)}` : null,
    props.appointmentAt ? `Appointment ${when(props.appointmentAt)}` : null,
    props.nextFollowUpAt ? `Follow up ${when(props.nextFollowUpAt)}` : null,
  ].filter(Boolean);

  return (
    <div className="mt-4 border-t border-white/10 pt-3">
      <p className="mb-2 text-[12px] text-faint">Where is this lead now?</p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lead stage">
        {LEAD_OUTCOMES.filter((o) => o.status !== "NEW").map((o) => {
          const on = current === o.status;
          return (
            <button
              key={o.status}
              type="button"
              title={o.hint}
              aria-pressed={on}
              disabled={pending}
              onClick={() => setStage(on ? "NEW" : o.status)}
              className={`min-h-[34px] rounded-full border px-3.5 text-[12.5px] transition disabled:opacity-60 ${
                on
                  ? "border-transparent bg-[image:var(--mairo-ramp)] text-white"
                  : "border-[color:var(--mairo-line)] text-white/80 hover:border-[color:var(--mairo-line-lit)] hover:text-white"
              }`}
            >
              {labels[o.status]}
            </button>
          );
        })}
      </div>

      {summary.length > 0 && <p className="mt-2 text-[12px] text-muted">{summary.join(" · ")}</p>}

      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="mt-2 text-[12.5px] text-violet-bright hover:underline">
        {open ? "Hide details" : "Contact, appointment, value and notes"}
      </button>

      {open && (
        <form
          className="mt-3 grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            saveDetails();
          }}
        >
          <label className="grid gap-1 text-[12.5px] text-muted">
            Last contacted
            <span className="flex gap-2">
              <input id={`contacted-${leadId}`} type="datetime-local" value={contacted} onChange={(e) => setContacted(e.target.value)} className={`${field} min-w-0 flex-1`} />
              <button type="button" onClick={() => setContacted(local(new Date().toISOString()))} className="shrink-0 rounded-lg border border-[color:var(--mairo-line)] px-2.5 text-[12px] text-white/85 hover:text-white">
                Just now
              </button>
            </span>
          </label>
          <label className="grid gap-1 text-[12.5px] text-muted">
            Appointment
            <input id={`appointment-${leadId}`} type="datetime-local" value={appointment} onChange={(e) => setAppointment(e.target.value)} className={field} />
          </label>
          <label className="grid gap-1 text-[12.5px] text-muted">
            Next follow-up
            <input id={`followup-${leadId}`} type="datetime-local" value={followUp} onChange={(e) => setFollowUp(e.target.value)} className={field} />
          </label>
          <label className="grid gap-1 text-[12.5px] text-muted">
            Expected value <span className="text-faint">(your estimate, optional)</span>
            <input id={`estimate-${leadId}`} inputMode="decimal" placeholder="$" value={estimate} onChange={(e) => setEstimate(e.target.value)} className={field} />
          </label>
          {current === "WON" && (
            <label className="grid gap-1 text-[12.5px] text-muted">
              What the job was worth <span className="text-faint">(confirmed sale, optional)</span>
              <input id={`value-${leadId}`} inputMode="decimal" placeholder="$" value={value} onChange={(e) => setValue(e.target.value)} className={field} />
            </label>
          )}
          {current === "LOST" && (
            <label className="grid gap-1 text-[12.5px] text-muted">
              Why it didn&rsquo;t go anywhere
              <select id={`lost-${leadId}`} value={lost} onChange={(e) => setLost(e.target.value)} className={field}>
                <option value="">Not saying</option>
                {LOST_REASONS.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="grid gap-1 text-[12.5px] text-muted sm:col-span-2">
            Notes <span className="text-faint">(only your business sees these)</span>
            <textarea id={`notes-${leadId}`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={field} />
          </label>
          <div className="sm:col-span-2">
            <button type="submit" disabled={pending} className="rounded-full bg-[image:var(--mairo-ramp)] px-4 py-1.5 text-[12.5px] font-medium text-white disabled:opacity-60">
              Save details
            </button>
          </div>
        </form>
      )}

      <p className="mt-2 min-h-[16px] text-[12px]" aria-live="polite">
        {error ? <span className="text-red-300">{error}</span> : saved ? <span className="text-emerald-300">✓ Saved</span> : null}
      </p>
    </div>
  );
}
