import type { LeadStatus } from "@/generated/prisma/enums";
import { normalizePhone } from "@/lib/campaigns/destination";

// Leads from a spreadsheet: the ones a business already has (from a call log,
// an old CRM, an email inbox), checked row by row before anything is saved.
//
// A row needs a way to reach the person — an email or a phone number — so it
// can be followed up and so the same person isn't counted twice. Every other
// column is optional. A status MAIRO can't read, a date it can't read or one
// in the future, a value that isn't money: the row is refused with the reason,
// never guessed at. Duplicates inside the file are merged into the first row
// for that person; duplicates of leads already in MAIRO are matched on the
// server, by the hashed contact.
//
// Pure — the browser previews with exactly what the server then re-checks.
// Pinned by scripts/check-lead-import.ts.

export const MAX_ROWS = 2000;
export const MAX_BYTES = 1_000_000;

export type ImportField = "name" | "firstName" | "lastName" | "email" | "phone" | "status" | "value" | "date" | "notes";

/** The headers each column is recognised by, lower-cased with spaces and punctuation removed. */
const HEADERS: Record<ImportField, string[]> = {
  name: ["name", "fullname", "contact", "contactname", "customer", "customername", "client", "clientname"],
  firstName: ["firstname", "first", "givenname"],
  lastName: ["lastname", "last", "surname", "familyname"],
  email: ["email", "emailaddress", "mail"],
  phone: ["phone", "phonenumber", "mobile", "cell", "tel", "telephone", "mobilenumber"],
  status: ["status", "stage", "outcome", "leadstatus", "result"],
  value: ["value", "amount", "jobvalue", "dealvalue", "revenue", "paid", "sale", "salevalue", "invoice"],
  date: ["date", "created", "createdat", "received", "receivedat", "datereceived", "enquirydate", "leaddate", "submitted"],
  notes: ["notes", "note", "message", "comments", "comment", "details", "enquiry"],
};

const key = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The owner's words for each outcome, including MAIRO's own labels. */
const STATUS_WORDS: [RegExp, LeadStatus][] = [
  [/^(new|open|unread|received|lead|enquiry|inquiry)$/, "NEW"],
  [/^(contacted|called|emailed|replied|in ?touch|followed ?up|reached)$/, "CONTACTED"],
  [/^(qualified|good|good ?lead|hot|warm|interested|prospect)$/, "QUALIFIED"],
  [/^(booked|appointment|scheduled|visit ?booked|call ?booked|meeting)$/, "BOOKED"],
  [/^(estimate|estimate ?sent|quote|quoted|quote ?sent|proposal|proposal ?sent)$/, "ESTIMATE_SENT"],
  [/^(won|customer|paid|sold|closed ?won|converted|client|job ?done|completed)$/, "WON"],
  [/^(lost|not ?a ?fit|closed ?lost|declined|no|dead|cold|unqualified|no ?sale)$/, "LOST"],
  [/^(spam|junk|test|duplicate|fake)$/, "SPAM"],
];

export function statusFrom(raw: string): LeadStatus | null {
  const w = raw.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (!w) return "NEW";
  for (const [re, s] of STATUS_WORDS) if (re.test(w)) return s;
  return null;
}

/** RFC 4180 CSV: quoted fields, doubled quotes, commas, semicolons or tabs, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const delim = [",", ";", "\t"].map((d) => [d, (firstLine.match(new RegExp(d === "\t" ? "\\t" : d, "g")) ?? []).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === delim) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

export type ColumnMap = Partial<Record<ImportField, number>>;

export function mapColumns(header: string[]): { map: ColumnMap; unused: string[] } {
  const map: ColumnMap = {};
  const unused: string[] = [];
  header.forEach((h, i) => {
    const k = key(h);
    const field = (Object.keys(HEADERS) as ImportField[]).find((f) => HEADERS[f].includes(k));
    if (field && map[field] === undefined) map[field] = i;
    else if (h.trim()) unused.push(h.trim());
  });
  return { map, unused };
}

export type ImportedLead = {
  name: string;
  email: string | null;
  /** E.164, or null. */
  phone: string | null;
  status: LeadStatus;
  /** Only for customers (WON). */
  valueCents: number | null;
  receivedAt: Date | null;
  notes: string | null;
};

export type RowResult = { line: number; ok: true; lead: ImportedLead; duplicateOfLine: number | null } | { ok: false; line: number; problems: string[] };

function money(raw: string): number | null | "bad" {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t.replace(/[$£€,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0 || n > 10_000_000) return "bad";
  return Math.round(n * 100);
}

/** YYYY-MM-DD, optionally with a time. Day/month orders are ambiguous, so they're refused rather than guessed. */
function dateFrom(raw: string, now: Date): Date | null | "bad" | "future" {
  const t = raw.trim();
  if (!t) return null;
  if (!/^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(t)) return "bad";
  const d = new Date(t.length === 10 ? `${t}T12:00:00Z` : t.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return "bad";
  if (d.getTime() > now.getTime() + 24 * 3600_000) return "future";
  return d;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function checkRows(rows: string[][], now = new Date()): { header: string[]; map: ColumnMap; unused: string[]; results: RowResult[]; problems: string[] } {
  const problems: string[] = [];
  if (!rows.length) return { header: [], map: {}, unused: [], results: [], problems: ["The file is empty."] };
  const [header, ...body] = rows;
  const { map, unused } = mapColumns(header);
  if (map.email === undefined && map.phone === undefined) problems.push("MAIRO needs an email or phone column to tell people apart. Name a column “Email” or “Phone”.");
  if (body.length > MAX_ROWS) problems.push(`That's ${body.length} rows; import up to ${MAX_ROWS} at a time.`);
  if (problems.length) return { header, map, unused, results: [], problems };

  const cell = (r: string[], f: ImportField) => (map[f] === undefined ? "" : (r[map[f]!] ?? "").trim());
  const seen = new Map<string, number>();
  const results: RowResult[] = body.map((r, i) => {
    const line = i + 2;
    const errs: string[] = [];
    const rawEmail = cell(r, "email").toLowerCase();
    const email = rawEmail ? (EMAIL.test(rawEmail) ? rawEmail : null) : null;
    if (rawEmail && !email) errs.push(`“${rawEmail.slice(0, 60)}” isn't an email address.`);
    const rawPhone = cell(r, "phone");
    const phone = rawPhone ? normalizePhone(rawPhone) : null;
    if (rawPhone && !phone) errs.push("That phone number can't be read — include the country code if it's outside the US.");
    if (!email && !phone && !errs.length) errs.push("No email or phone, so this person can't be followed up or told apart from others.");
    const status = statusFrom(cell(r, "status"));
    if (!status) errs.push(`MAIRO doesn't know the status “${cell(r, "status").slice(0, 40)}”. Use New, Contacted, Good lead, Booked, Estimate sent, Customer, Not a fit or Spam.`);
    const value = money(cell(r, "value"));
    if (value === "bad") errs.push("The value isn't an amount of money.");
    const date = dateFrom(cell(r, "date"), now);
    if (date === "bad") errs.push("Write dates as YYYY-MM-DD (for example 2026-03-14), so the day and month can't be mixed up.");
    if (date === "future") errs.push("That date is in the future.");
    if (errs.length) return { ok: false, line, problems: errs };

    const name = (cell(r, "name") || [cell(r, "firstName"), cell(r, "lastName")].filter(Boolean).join(" ")).replace(/\s+/g, " ").slice(0, 120);
    const contact = email ?? phone!;
    const dup = seen.get(contact) ?? (email && phone ? seen.get(phone) : undefined) ?? null;
    if (email) seen.set(email, seen.get(email) ?? line);
    if (phone) seen.set(phone, seen.get(phone) ?? line);
    return {
      ok: true,
      line,
      duplicateOfLine: dup,
      lead: {
        name,
        email,
        phone,
        status: status!,
        // A value is what a job was worth, so only a customer has one.
        valueCents: status === "WON" && typeof value === "number" ? value : null,
        receivedAt: date as Date | null,
        notes: cell(r, "notes").slice(0, 2000) || null,
      },
    };
  });
  // A person on several rows becomes one lead: the later stage, the value, every note.
  const byLine = new Map(results.map((r) => [r.line, r]));
  for (const r of results) {
    if (!r.ok || r.duplicateOfLine === null) continue;
    const first = byLine.get(r.duplicateOfLine);
    if (!first || !first.ok) continue;
    const a = first.lead;
    const b = r.lead;
    a.status = mergedStatus(a.status, b.status);
    a.name = a.name || b.name;
    a.email = a.email ?? b.email;
    a.phone = a.phone ?? b.phone;
    a.valueCents = a.status === "WON" ? a.valueCents ?? b.valueCents : null;
    a.receivedAt = a.receivedAt && b.receivedAt ? (a.receivedAt < b.receivedAt ? a.receivedAt : b.receivedAt) : a.receivedAt ?? b.receivedAt;
    a.notes = [a.notes, b.notes].filter(Boolean).join("\n").slice(0, 2000) || null;
  }
  return { header, map, unused, results, problems };
}

export type ImportPreview = { rows: number; ready: number; duplicatesInFile: number; refused: { line: number; problems: string[] }[]; columns: { field: ImportField; header: string }[]; unused: string[]; problems: string[] };

export function previewImport(text: string, now = new Date()): ImportPreview {
  if (text.length > MAX_BYTES) return { rows: 0, ready: 0, duplicatesInFile: 0, refused: [], columns: [], unused: [], problems: ["That file is over 1MB. Split it and import the parts one at a time."] };
  const c = checkRows(parseCsv(text), now);
  const ok = c.results.filter((r): r is Extract<RowResult, { ok: true }> => r.ok);
  return {
    rows: c.results.length,
    ready: ok.filter((r) => r.duplicateOfLine === null).length,
    duplicatesInFile: ok.filter((r) => r.duplicateOfLine !== null).length,
    refused: c.results.filter((r): r is Extract<RowResult, { ok: false }> => !r.ok).map((r) => ({ line: r.line, problems: r.problems })),
    columns: (Object.entries(c.map) as [ImportField, number][]).map(([field, i]) => ({ field, header: c.header[i] })),
    unused: c.unused,
    problems: c.problems,
  };
}

/** Which way two records of the same person should merge: the later stage wins; spam and lost never overwrite progress. */
export function mergedStatus(existing: LeadStatus, incoming: LeadStatus): LeadStatus {
  const ORDER: LeadStatus[] = ["NEW", "CONTACTED", "QUALIFIED", "BOOKED", "ESTIMATE_SENT", "WON"];
  if (incoming === existing) return existing;
  if (incoming === "SPAM" || incoming === "LOST") return existing === "NEW" ? incoming : existing;
  if (existing === "SPAM" || existing === "LOST") return existing;
  return ORDER.indexOf(incoming) > ORDER.indexOf(existing) ? incoming : existing;
}
