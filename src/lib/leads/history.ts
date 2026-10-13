import type { LeadStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { hashEmail, hashPhone } from "@/lib/tracking/hash";
import { OUTCOME_LABEL } from "./outcomes";
import { mergedStatus, previewImport, checkRows, parseCsv, MAX_BYTES, type ImportedLead } from "./import";

// Every change to a lead, kept: who made it (you, Meta, a CSV import,
// MAIRO), what it was before and after, and when. The history holds the
// stage, value and date changes the owner makes — never the person's contact
// details or the text of private notes, which live on the lead only.
//
// Also the two ways a lead arrives without a form: typed in by hand, and
// imported from a spreadsheet. Both find the same person already in MAIRO by
// their hashed email or phone and add to that record rather than making a
// second one.

type Tx = Prisma.TransactionClient | typeof db;

export type LeadEventInput = {
  organizationId: string;
  leadId: string;
  kind: "created" | "imported" | "status" | "value" | "note" | "corrected" | "merged";
  actorUserId?: string | null;
  actorLabel: string;
  fromStatus?: LeadStatus | null;
  toStatus?: LeadStatus | null;
  field?: string | null;
  before?: string | null;
  after?: string | null;
  note?: string | null;
};

export async function recordLeadEvent(e: LeadEventInput, tx: Tx = db): Promise<void> {
  await tx.leadEvent.create({
    data: {
      organizationId: e.organizationId,
      leadId: e.leadId,
      kind: e.kind,
      actorUserId: e.actorUserId ?? null,
      actorLabel: e.actorLabel.slice(0, 60),
      fromStatus: e.fromStatus ?? null,
      toStatus: e.toStatus ?? null,
      field: e.field ?? null,
      before: e.before?.slice(0, 200) ?? null,
      after: e.after?.slice(0, 200) ?? null,
      note: e.note?.slice(0, 300) ?? null,
    },
  });
}

/** A history line, in words. Pure. */
export function describeLeadEvent(e: { kind: string; fromStatus: LeadStatus | null; toStatus: LeadStatus | null; field: string | null; before: string | null; after: string | null; note: string | null }, labels: Record<LeadStatus, string> = OUTCOME_LABEL): string {
  const s = (x: LeadStatus | null) => (x ? labels[x] ?? x : "—");
  switch (e.kind) {
    case "created":
      return e.note ?? "Came in";
    case "imported":
      return `Imported${e.note ? ` (${e.note})` : ""}${e.toStatus ? ` as ${s(e.toStatus)}` : ""}`;
    case "status":
      return `${s(e.fromStatus)} → ${s(e.toStatus)}`;
    case "merged":
      return `Matched in an import${e.note ? `: ${e.note}` : ""}`;
    case "value":
      return `${FIELD_WORDS[e.field ?? ""] ?? "Value"}: ${e.before ?? "none"} → ${e.after ?? "none"}`;
    case "note":
      return "Notes changed";
    case "corrected":
      return `${FIELD_WORDS[e.field ?? ""] ?? "Details"} ${e.after ? `set to ${e.after}` : "cleared"}`;
    default:
      return e.note ?? e.kind;
  }
}

const FIELD_WORDS: Record<string, string> = {
  valueCents: "What the job was worth",
  estimatedValueCents: "Expected value",
  appointmentAt: "Appointment",
  nextFollowUpAt: "Next follow-up",
  lastContactedAt: "Contacted",
  lostReason: "Why it was lost",
};

export const dollars = (c: number | null | undefined) => (c === null || c === undefined ? null : `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`);

export async function leadHistory(organizationId: string, leadIds: string[]) {
  if (!leadIds.length) return new Map<string, { at: Date; who: string; kind: string; fromStatus: LeadStatus | null; toStatus: LeadStatus | null; field: string | null; before: string | null; after: string | null; note: string | null }[]>();
  const rows = await db.leadEvent.findMany({ where: { organizationId, leadId: { in: leadIds } }, orderBy: { createdAt: "desc" }, take: 2000 });
  const map = new Map<string, { at: Date; who: string; kind: string; fromStatus: LeadStatus | null; toStatus: LeadStatus | null; field: string | null; before: string | null; after: string | null; note: string | null }[]>();
  for (const r of rows) {
    const list = map.get(r.leadId) ?? [];
    list.push({ at: r.createdAt, who: r.actorLabel, kind: r.kind, fromStatus: r.fromStatus, toStatus: r.toStatus, field: r.field, before: r.before, after: r.after, note: r.note });
    map.set(r.leadId, list);
  }
  return map;
}

// --- Arriving without a form ---------------------------------------------------------

const contactOf = (l: Pick<ImportedLead, "email" | "phone">) => ({ hashedEmail: hashEmail(l.email), hashedPhone: hashPhone(l.phone) });

async function findSamePerson(organizationId: string, h: { hashedEmail: string | null; hashedPhone: string | null }, tx: Tx = db) {
  const or = [h.hashedEmail ? { hashedEmail: h.hashedEmail } : null, h.hashedPhone ? { hashedPhone: h.hashedPhone } : null, h.hashedEmail ? { contactKey: h.hashedEmail } : null, h.hashedPhone ? { contactKey: h.hashedPhone } : null].filter((x): x is NonNullable<typeof x> => x !== null);
  if (!or.length) return null;
  return tx.lead.findFirst({ where: { organizationId, OR: or }, orderBy: { createdAt: "asc" }, select: { id: true, status: true, valueCents: true, notes: true, createdAt: true, hashedEmail: true, hashedPhone: true } });
}

const answersFor = (l: ImportedLead) => JSON.stringify(Object.fromEntries(Object.entries({ name: l.name, email: l.email, phone: l.phone, message: l.notes }).filter(([, v]) => v)));

export type ManualResult = { ok: true; leadId: string } | { ok: false; error: string; duplicateOf?: { id: string; since: Date } };

/** A lead typed in by the owner — a phone call, a walk-in, an email. Refused if that person is already a lead, with which one. */
export async function addLeadManually(organizationId: string, userId: string | null, input: { name: string; email: string; phone: string; status: string; valueDollars: string; notes: string; receivedOn: string }): Promise<ManualResult> {
  const check = checkRows([["Name", "Email", "Phone", "Status", "Value", "Date", "Notes"], [input.name, input.email, input.phone, input.status, input.valueDollars, input.receivedOn, input.notes]]);
  if (check.problems.length) return { ok: false, error: check.problems[0] };
  const row = check.results[0];
  if (!row || !row.ok) return { ok: false, error: row && !row.ok ? row.problems[0] : "Check the details." };
  const l = row.lead;
  const h = contactOf(l);
  const same = await findSamePerson(organizationId, h);
  if (same) return { ok: false, error: `This person is already a lead, from ${same.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}. Update that one instead.`, duplicateOf: { id: same.id, since: same.createdAt } };
  const lead = await db.$transaction(async (tx) => {
    const created = await tx.lead.create({
      data: { organizationId, source: "MANUAL", answersJson: answersFor(l), ...h, contactKey: h.hashedEmail ?? h.hashedPhone, status: l.status, valueCents: l.valueCents, statusChangedAt: l.status === "NEW" ? null : new Date(), createdAt: l.receivedAt ?? undefined, notes: l.notes, sourceRef: "Added by hand" },
      select: { id: true },
    });
    await recordLeadEvent({ organizationId, leadId: created.id, kind: "created", actorUserId: userId, actorLabel: "You", toStatus: l.status, note: `Added by hand${l.status !== "NEW" ? ` as ${OUTCOME_LABEL[l.status]}` : ""}` }, tx);
    return created;
  });
  return { ok: true, leadId: lead.id };
}

export type ImportSummary = { ok: true; created: number; merged: number; mergedChanged: number; duplicatesInFile: number; refused: { line: number; problems: string[] }[]; kept: number } | { ok: false; error: string };

/**
 * Imports a spreadsheet the owner already previewed. Re-checked here from the
 * text itself, never from the browser's preview. The same person already in
 * MAIRO is updated, not duplicated: a later stage moves them on, a value fills
 * a missing one, and their MAIRO status is never moved backwards.
 */
export async function importLeads(organizationId: string, userId: string | null, text: string, fileName: string): Promise<ImportSummary> {
  if (text.length > MAX_BYTES) return { ok: false, error: "That file is over 1MB. Split it and import the parts one at a time." };
  const pre = previewImport(text);
  if (pre.problems.length) return { ok: false, error: pre.problems[0] };
  const { results } = checkRows(parseCsv(text));
  const label = `CSV import${fileName ? ` · ${fileName.slice(0, 60)}` : ""}`;
  let created = 0;
  let merged = 0;
  let mergedChanged = 0;
  let kept = 0;
  for (const r of results) {
    if (!r.ok || r.duplicateOfLine !== null) continue;
    const l = r.lead;
    const h = contactOf(l);
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`lead-contact:${organizationId}:${h.hashedEmail ?? h.hashedPhone}`}))`;
      const same = await findSamePerson(organizationId, h, tx);
      if (!same) {
        const lead = await tx.lead.create({
          data: { organizationId, source: "CSV_IMPORT", answersJson: answersFor(l), ...h, contactKey: h.hashedEmail ?? h.hashedPhone, status: l.status, valueCents: l.valueCents, statusChangedAt: l.status === "NEW" ? null : new Date(), createdAt: l.receivedAt ?? undefined, notes: l.notes, sourceRef: `${fileName.slice(0, 80) || "CSV"}, row ${r.line}` },
          select: { id: true },
        });
        await recordLeadEvent({ organizationId, leadId: lead.id, kind: "imported", actorUserId: userId, actorLabel: label, toStatus: l.status, note: `row ${r.line}` }, tx);
        created++;
        return;
      }
      merged++;
      const status = mergedStatus(same.status, l.status);
      const value = same.valueCents ?? (status === "WON" ? l.valueCents : null);
      const changedStatus = status !== same.status;
      const changedValue = value !== same.valueCents;
      if (!changedStatus && l.status !== same.status) kept++;
      if (changedStatus || changedValue) {
        mergedChanged++;
        await tx.lead.update({ where: { id: same.id }, data: { status, valueCents: value, ...(changedStatus ? { statusChangedAt: new Date() } : {}), hashedEmail: same.hashedEmail ?? h.hashedEmail, hashedPhone: same.hashedPhone ?? h.hashedPhone } });
      }
      await recordLeadEvent({ organizationId, leadId: same.id, kind: "merged", actorUserId: userId, actorLabel: label, fromStatus: same.status, toStatus: status, note: `row ${r.line}${changedStatus ? `, moved to ${OUTCOME_LABEL[status]}` : l.status !== same.status ? `; kept ${OUTCOME_LABEL[same.status]} rather than ${OUTCOME_LABEL[l.status]}` : ""}` }, tx);
      if (changedValue) await recordLeadEvent({ organizationId, leadId: same.id, kind: "value", actorUserId: userId, actorLabel: label, field: "valueCents", before: dollars(same.valueCents), after: dollars(value) }, tx);
    });
  }
  return { ok: true, created, merged, mergedChanged, duplicatesInFile: pre.duplicatesInFile, refused: pre.refused, kept };
}
