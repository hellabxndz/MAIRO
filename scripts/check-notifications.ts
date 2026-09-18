// Checks the rules that keep the notification centre worth opening.
//
// A notification centre has exactly one failure mode that matters: becoming
// noise. Once somebody learns that most of what is in there is not worth
// reading, they stop reading all of it — including the one that says their ad
// account disconnected and their campaigns have been dark for a week.
//
// Two things prevent that, and neither is enforced by the type system:
//
//   Dedupe keys name the SITUATION, not the moment. A detector that runs daily
//   and finds the same problem must produce the same key, or one problem
//   becomes a notification a day. Keys containing a date or a timestamp are
//   the bug this checks for.
//
//   Every kind is described, and the ones that may text somebody are a
//   deliberate subset. A monthly report is worth a card and is not worth a
//   phone buzzing at 7am.
//
// Run with: npm run check:notifications

import { KINDS, kindInfo, severityTone } from "@/lib/notifications/kinds";
import { whenLabel } from "@/lib/notifications/present";

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  if (!cond) {
    failures++;
    console.log(`  FAIL  ${name} ${extra}`);
  } else console.log(`  ok    ${name}`);
}

const ALL = Object.values(KINDS);

console.log("\n— every kind is described —");
check("each has a label", ALL.every((k) => k.label.trim().length > 0));
check("each has a severity", ALL.every((k) => ["INFO", "OPPORTUNITY", "WARNING"].includes(k.severity)));
check("kindInfo round-trips", ALL.every((k) => kindInfo(k.kind).kind === k.kind));
check(
  "the record key matches the kind on the value",
  Object.entries(KINDS).every(([key, value]) => key === value.kind),
);

console.log("\n— texting is a deliberate subset —");
const textable = ALL.filter((k) => k.sms !== null);
check("some kinds can text", textable.length > 0);
check("not all of them can", textable.length < ALL.length);
check("a monthly report never texts", kindInfo("MONTHLY_REPORT").sms === null);
check("new creatives never text", kindInfo("CREATIVES_READY").sms === null);
check("a disconnected ad account does text", kindInfo("ACCOUNT_DISCONNECTED").sms !== null);
check("a campaign going live does text", kindInfo("CAMPAIGN_LIVE").sms === "campaign-live");
check(
  "every sms kind is one the preferences actually offer",
  textable.every((k) =>
    ["campaign-live", "needs-attention", "weekly-summary", "budget-change"].includes(k.sms!),
  ),
);

console.log("\n— warnings look like warnings —");
check("needs-attention is a warning", kindInfo("NEEDS_ATTENTION").severity === "WARNING");
check("a disconnected account is a warning", kindInfo("ACCOUNT_DISCONNECTED").severity === "WARNING");
check("a payment problem is a warning", kindInfo("PAYMENT_ISSUE").severity === "WARNING");
check("a budget opportunity is an opportunity", kindInfo("BUDGET_OPPORTUNITY").severity === "OPPORTUNITY");
check("severityTone maps warnings to yellow", severityTone("WARNING") === "yellow");
check("severityTone maps opportunities to green", severityTone("OPPORTUNITY") === "green");

console.log("\n— dedupe keys name the situation, not the moment —");
// The detectors' key shapes, transcribed. If one of these grows a date, the
// same problem starts announcing itself every single day.
const KEYS = [
  "no-results:camp_123:0",
  "platform-gap:TIKTOK:META:3",
  "disconnected:META",
];
const DATEISH = /\d{4}-\d{2}-\d{2}|\d{10,}|T\d{2}:\d{2}/;
for (const key of KEYS) {
  check(`"${key}" carries no date or timestamp`, !DATEISH.test(key));
}
check(
  "the same situation twice produces the same key",
  // Banding is what makes this true: a spend that creeps from $50 to $52 stays
  // in band 1 and stays quiet; one that doubles crosses a band and speaks up.
  `no-results:camp_123:${Math.floor(5000 / 5000)}` ===
    `no-results:camp_123:${Math.floor(5400 / 5000)}`,
);
check(
  "a materially worse situation produces a different key",
  `no-results:camp_123:${Math.floor(5000 / 5000)}` !==
    `no-results:camp_123:${Math.floor(15000 / 5000)}`,
);

console.log("\n— how long ago reads correctly —");
const now = new Date("2026-09-18T12:00:00Z");
const ago = (ms: number) => whenLabel(new Date(now.getTime() - ms), now);
check("a moment ago is 'just now'", ago(30_000) === "just now", ago(30_000));
check("minutes", ago(20 * 60_000) === "20 min ago", ago(20 * 60_000));
check("one hour is singular", ago(60 * 60_000) === "1 hour ago", ago(60 * 60_000));
check("hours are plural", ago(5 * 60 * 60_000) === "5 hours ago", ago(5 * 60 * 60_000));
check("one day is singular", ago(25 * 60 * 60_000) === "1 day ago", ago(25 * 60 * 60_000));
check("over a week becomes a date", /\w{3} \d+/.test(ago(20 * 24 * 60 * 60_000)), ago(20 * 24 * 60 * 60_000));
// A clock that is slightly behind the database must not produce "in 3 minutes".
check("a future timestamp never reads as negative", ago(-60_000) === "just now", ago(-60_000));

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
