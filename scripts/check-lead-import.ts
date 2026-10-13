// Checks lead import, manual entry and lead history:
//
//   - the CSV reader copes with quotes, commas in fields, CRLF, a BOM and
//     semicolons, and finds columns by their usual names;
//   - each row is refused with its reason, never guessed: no contact, an
//     address that isn't an email, an unknown status, an ambiguous or future
//     date, a value that isn't money;
//   - the same person twice in a file is one lead, with the later stage;
//   - the same person already in MAIRO is updated, not duplicated, and a
//     stage set in MAIRO is never moved backwards; importing twice changes
//     nothing the second time;
//   - every change is in the history, which holds no contact details or note
//     text;
//   - imported and hand-added leads are never counted as results of ads;
//   - one business's import never touches another's leads.
//
//   npm run check:lead-import   (needs the local database)

import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { checkRows, mapColumns, mergedStatus, parseCsv, previewImport, statusFrom, MAX_ROWS } from "../src/lib/leads/import";
import { addLeadManually, describeLeadEvent, importLeads, recordLeadEvent } from "../src/lib/leads/history";
import { fromAds } from "../src/lib/leads/outcomes";
import { hashEmail } from "../src/lib/tracking/hash";

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const TAG = "zz-lim";
const A = `${TAG}-a`;
const B = `${TAG}-b`;
const NOW = new Date("2026-10-13T12:00:00Z");

async function cleanup() {
  await db.organization.deleteMany({ where: { id: { startsWith: TAG } } });
}

async function main() {
  await cleanup();

  console.log("— reading the file —");
  await check("quotes, commas inside fields, doubled quotes, CRLF and a BOM", () => {
    const rows = parseCsv('﻿Name,Email,Notes\r\n"Smith, Jo",jo@example.com,"Said ""call after 5"""\r\nAl,al@example.com,\r\n');
    assert.deepEqual(rows, [["Name", "Email", "Notes"], ["Smith, Jo", "jo@example.com", 'Said "call after 5"'], ["Al", "al@example.com", ""]]);
  });
  await check("semicolon-separated files (common outside the US) and blank lines", () => {
    assert.deepEqual(parseCsv("Name;Phone\n\nAl;+447700900123\n"), [["Name", "Phone"], ["Al", "+447700900123"]]);
  });
  await check("columns found by their usual names; others listed as unused", () => {
    const { map, unused } = mapColumns(["Full Name", "E-mail Address", "Mobile", "Stage", "Job value", "Date received", "Comments", "Favourite colour"]);
    assert.deepEqual(map, { name: 0, email: 1, phone: 2, status: 3, value: 4, date: 5, notes: 6 });
    assert.deepEqual(unused, ["Favourite colour"]);
  });
  await check("the owner's words for each stage", () => {
    assert.equal(statusFrom(""), "NEW");
    assert.equal(statusFrom("Customer"), "WON");
    assert.equal(statusFrom("closed-won"), "WON");
    assert.equal(statusFrom("Quote sent"), "ESTIMATE_SENT");
    assert.equal(statusFrom("Good lead"), "QUALIFIED");
    assert.equal(statusFrom("Not a fit"), "LOST");
    assert.equal(statusFrom("junk"), "SPAM");
    assert.equal(statusFrom("maybe later?"), null);
  });

  console.log("— checking each row —");
  const csv = [
    "Name,Email,Phone,Status,Value,Date,Notes",
    "Jo Smith,jo@example.com,(555) 123-4567,Customer,\"$1,200.00\",2026-09-01,Kitchen leak",
    "No Contact,,,New,,2026-09-02,",
    "Bad Email,not-an-email,,New,,2026-09-02,",
    "Odd Status,x@example.com,,Maybe,,2026-09-02,",
    "US Date,y@example.com,,New,,09/02/2026,",
    "Future,z@example.com,,New,,2027-01-01,",
    "Bad Value,v@example.com,,Customer,lots,2026-09-02,",
    "Jo Again,JO@example.com,,Booked,,2026-08-20,Asked about boiler",
    "Phone Only,,+44 7700 900123,Contacted,,,",
    "Value not won,w@example.com,,Booked,500,2026-09-03,",
  ].join("\n");
  const checked = checkRows(parseCsv(csv), NOW);
  const byLine = (n: number) => checked.results.find((r) => r.line === n)!;
  await check("each refused row says why — nothing is guessed", () => {
    const why = (n: number) => { const r = byLine(n); return r.ok ? "" : r.problems.join(" "); };
    assert.match(why(3), /No email or phone/);
    assert.match(why(4), /isn't an email/);
    assert.match(why(5), /doesn't know the status/);
    assert.match(why(6), /YYYY-MM-DD/);
    assert.match(why(7), /in the future/);
    assert.match(why(8), /isn't an amount of money/);
  });
  await check("good rows are read exactly: money, E.164 phone, the date", () => {
    const r = byLine(2);
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal(r.lead.phone, "+15551234567");
    assert.equal(r.lead.email, "jo@example.com");
    assert.equal(r.lead.valueCents, 120000);
    const solo = byLine(11);
    assert.ok(solo.ok && solo.lead.receivedAt?.toISOString().slice(0, 10) === "2026-09-03");
    const p = byLine(10);
    assert.ok(p.ok && p.lead.phone === "+447700900123" && p.lead.status === "CONTACTED");
  });
  await check("a value is only kept for a customer", () => {
    const r = byLine(11);
    assert.ok(r.ok && r.lead.valueCents === null);
  });
  await check("the same person twice in a file is one lead, keeping the later stage, the earlier date and both notes", () => {
    const dup = byLine(9);
    assert.ok(dup.ok && dup.duplicateOfLine === 2);
    const first = byLine(2);
    assert.ok(first.ok);
    if (!first.ok) return;
    assert.equal(first.lead.status, "WON", "customer is later than booked");
    assert.equal(first.lead.receivedAt?.toISOString().slice(0, 10), "2026-08-20");
    assert.match(first.lead.notes ?? "", /Kitchen leak[\s\S]*boiler/);
    const pre = previewImport(csv, NOW);
    assert.equal(pre.ready, 3);
    assert.equal(pre.duplicatesInFile, 1);
    assert.equal(pre.refused.length, 6);
  });
  await check("a file with no email or phone column, or too many rows, is refused whole", () => {
    assert.match(previewImport("Name,Notes\nAl,hi").problems[0], /email or phone column/);
    const big = ["Email", ...Array.from({ length: MAX_ROWS + 1 }, (_, i) => `p${i}@example.com`)].join("\n");
    assert.match(previewImport(big).problems[0], /up to 2000/);
    assert.match(previewImport("x".repeat(1_000_001)).problems[0], /over 1MB/);
  });
  await check("merging never moves a stage backwards, and lost or spam never overwrite progress", () => {
    assert.equal(mergedStatus("BOOKED", "CONTACTED"), "BOOKED");
    assert.equal(mergedStatus("CONTACTED", "WON"), "WON");
    assert.equal(mergedStatus("BOOKED", "LOST"), "BOOKED");
    assert.equal(mergedStatus("NEW", "SPAM"), "SPAM");
    assert.equal(mergedStatus("LOST", "WON"), "LOST");
  });

  console.log("— saving —");
  await db.organization.create({ data: { id: A, name: "Import Co" } });
  await db.organization.create({ data: { id: B, name: "Other Co" } });
  // Someone who already came in through the form, and was marked lost.
  const existing = await db.lead.create({ data: { organizationId: A, source: "MAIRO_FORM", answersJson: "{}", hashedEmail: hashEmail("jo@example.com"), status: "LOST", contactKey: hashEmail("jo@example.com") } });
  // B has the same person; A's import must not touch B's lead.
  const bLead = await db.lead.create({ data: { organizationId: B, source: "MAIRO_FORM", answersJson: "{}", hashedEmail: hashEmail("jo@example.com"), status: "NEW" } });

  const good = ["Name,Email,Phone,Status,Value,Date,Notes", "Jo Smith,jo@example.com,,Customer,1200,2026-09-01,Kitchen leak", "Phone Only,,+44 7700 900123,Contacted,,,", "Ann,ann@example.com,,Booked,,2026-09-05,"].join("\n");
  await check("new people become leads marked as imported; the person already in MAIRO is matched, and MAIRO's stage is kept", async () => {
    const r = await importLeads(A, "user-a", good, "old-crm.csv");
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal(r.created, 2);
    assert.equal(r.merged, 1);
    assert.equal(r.kept, 1);
    const jo = await db.lead.findUniqueOrThrow({ where: { id: existing.id } });
    assert.equal(jo.status, "LOST", "a stage set in MAIRO isn't overwritten by a spreadsheet");
    const imported = await db.lead.findMany({ where: { organizationId: A, source: "CSV_IMPORT" } });
    assert.equal(imported.length, 2);
    assert.ok(imported.every((l) => l.contactKey && l.sourceRef?.startsWith("old-crm.csv, row")));
    assert.equal(await db.lead.count({ where: { organizationId: A } }), 3);
  });
  await check("importing the same file again adds no one", async () => {
    const r = await importLeads(A, "user-a", good, "old-crm.csv");
    assert.ok(r.ok && r.created === 0 && r.merged === 3);
    assert.equal(await db.lead.count({ where: { organizationId: A } }), 3);
  });
  await check("a later stage in a new file moves the person on, and says so in their history", async () => {
    const r = await importLeads(A, "user-a", "Email,Status\nann@example.com,Customer\n", "update.csv");
    assert.ok(r.ok && r.mergedChanged === 1);
    const ann = await db.lead.findFirstOrThrow({ where: { organizationId: A, hashedEmail: hashEmail("ann@example.com") }, include: { events: { orderBy: { createdAt: "asc" } } } });
    assert.equal(ann.status, "WON");
    const lines = ann.events.map((e) => describeLeadEvent(e));
    assert.match(lines[0], /^Imported \(row 4\) as Booked/);
    assert.match(lines.at(-1)!, /moved to Customer/);
  });
  await check("the history holds no email, phone or note text", async () => {
    const events = await db.leadEvent.findMany({ where: { organizationId: A } });
    const text = JSON.stringify(events);
    for (const secret of ["jo@example.com", "ann@example.com", "7700", "Kitchen leak"]) assert.ok(!text.includes(secret), secret);
    assert.equal(describeLeadEvent({ kind: "note", fromStatus: null, toStatus: null, field: null, before: null, after: null, note: null }), "Notes changed");
  });
  await check("adding someone by hand who's already a lead is refused, naming when they came in", async () => {
    const r = await addLeadManually(A, "user-a", { name: "Ann", email: "ANN@example.com", phone: "", status: "NEW", valueDollars: "", notes: "", receivedOn: "" });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /already a lead/);
    const ok = await addLeadManually(A, "user-a", { name: "Walk In", email: "", phone: "555 222 3333", status: "QUALIFIED", valueDollars: "", notes: "Came by the shop", receivedOn: "2026-10-01" });
    assert.ok(ok.ok);
    if (!ok.ok) return;
    const lead = await db.lead.findUniqueOrThrow({ where: { id: ok.leadId }, include: { events: true } });
    assert.equal(lead.source, "MANUAL");
    assert.equal(lead.status, "QUALIFIED");
    assert.match(describeLeadEvent(lead.events[0]), /Added by hand as Good lead/);
  });
  await check("imported and hand-added leads are never counted as results of ads", async () => {
    const all = await db.lead.count({ where: { organizationId: A } });
    const ads = await db.lead.count({ where: { organizationId: A, ...fromAds } });
    assert.equal(all, 4);
    assert.equal(ads, 1);
  });
  await check("another business's lead for the same person is untouched", async () => {
    const b = await db.lead.findUniqueOrThrow({ where: { id: bLead.id } });
    assert.equal(b.status, "NEW");
    assert.equal(await db.leadEvent.count({ where: { organizationId: B } }), 0);
    const rB = await importLeads(B, "user-b", "Email,Status\nann@example.com,New\n", "b.csv");
    assert.ok(rB.ok && rB.created === 1, "B's import makes B's own lead, never matching A's");
  });
  await check("a status change is recorded with before and after", async () => {
    await recordLeadEvent({ organizationId: A, leadId: existing.id, kind: "status", actorLabel: "You", fromStatus: "LOST", toStatus: "QUALIFIED" });
    const e = await db.leadEvent.findFirstOrThrow({ where: { leadId: existing.id, kind: "status" } });
    assert.equal(describeLeadEvent(e), "Not a fit → Good lead");
  });

  await cleanup();
  console.log(`\nLead import: ${passed} checks passed.`);
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await cleanup().catch(() => {});
  process.exit(1);
});
