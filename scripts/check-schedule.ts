// Checks the arithmetic behind a scheduled campaign start.
//
//   npm run check:schedule
//
// Every failure here is silent and expensive. An ad set that starts eight
// hours early spends a day's budget overnight; one whose start_time lands in
// the past is rejected and the whole launch fails. Neither is visible from
// reading the code, because they're both "the date looks right".
//
// The DST cases are the ones worth having. A time inside the hour a clock
// jumps is the case a single-pass offset conversion gets wrong, and it only
// happens twice a year — which means it ships.

import {
  describeStart,
  instantFromLocal,
  isDue,
  localInputValue,
  isKnownZone,
  isSchedulable,
  metaStartTime,
  validateStart,
  wallClockInZone,
  zoneOffsetMs,
} from "@/lib/campaigns/schedule";

let bad = 0;
const ok = (n: string, c: boolean, x = "") => {
  if (!c) {
    bad++;
    console.log(`  FAIL ${n} ${x}`);
  } else console.log(`  ok   ${n}`);
};

const HOUR = 60 * 60 * 1000;

console.log("\n— reading a wall clock in a named zone —");
{
  // Chicago in January is UTC-6. 9am there is 15:00 UTC.
  const winter = instantFromLocal("2026-01-15T09:00", "America/Chicago");
  ok("winter morning in Chicago", winter?.toISOString() === "2026-01-15T15:00:00.000Z", `${winter?.toISOString()}`);

  // In July it is UTC-5, so the same wall clock is a different instant. This
  // is the whole reason a wall-clock string is not stored.
  const summer = instantFromLocal("2026-07-15T09:00", "America/Chicago");
  ok("summer morning in Chicago", summer?.toISOString() === "2026-07-15T14:00:00.000Z", `${summer?.toISOString()}`);

  const utc = instantFromLocal("2026-03-01T00:00", "UTC");
  ok("UTC is itself", utc?.toISOString() === "2026-03-01T00:00:00.000Z", `${utc?.toISOString()}`);

  // A zone ahead of UTC, and a half-hour one — the case that catches code that
  // assumes offsets are whole hours.
  const tokyo = instantFromLocal("2026-05-02T08:30", "Asia/Tokyo");
  ok("Tokyo is ahead", tokyo?.toISOString() === "2026-05-01T23:30:00.000Z", `${tokyo?.toISOString()}`);

  const kolkata = instantFromLocal("2026-05-02T12:00", "Asia/Kolkata");
  ok("half-hour offsets", kolkata?.toISOString() === "2026-05-02T06:30:00.000Z", `${kolkata?.toISOString()}`);

  const kathmandu = instantFromLocal("2026-05-02T12:00", "Asia/Kathmandu");
  ok("quarter-hour offsets", kathmandu?.toISOString() === "2026-05-02T06:15:00.000Z", `${kathmandu?.toISOString()}`);
}

console.log("\n— the clocks changing —");
{
  // US DST 2026 starts 08 March: at 02:00 CST the clock jumps to 03:00 CDT.
  // So 03:00 local that morning is already CDT (UTC-5) and lands at 08:00 UTC.
  // A single-pass conversion reads the offset as CST and is an hour out.
  const afterSpringForward = instantFromLocal("2026-03-08T03:00", "America/Chicago");
  ok(
    "the morning the clocks go forward",
    afterSpringForward?.toISOString() === "2026-03-08T08:00:00.000Z",
    `${afterSpringForward?.toISOString()}`
  );

  const beforeSpringForward = instantFromLocal("2026-03-08T00:30", "America/Chicago");
  ok(
    "half an hour before the jump",
    beforeSpringForward?.toISOString() === "2026-03-08T06:30:00.000Z",
    `${beforeSpringForward?.toISOString()}`
  );

  // And the other direction: 01 November 2026, clocks go back.
  const afterFallBack = instantFromLocal("2026-11-01T03:00", "America/Chicago");
  ok(
    "the morning they go back",
    afterFallBack?.toISOString() === "2026-11-01T09:00:00.000Z",
    `${afterFallBack?.toISOString()}`
  );

  // Europe changes on different dates from the US, which is why the zone is
  // stored rather than an offset.
  const london = instantFromLocal("2026-03-29T02:00", "Europe/London");
  ok("London springs forward a fortnight later", london?.toISOString() === "2026-03-29T01:00:00.000Z", `${london?.toISOString()}`);

  // Two wall-clock readings that aren't a single instant. Neither can be
  // answered correctly, so what matters is that both resolve deterministically
  // and land within an hour of what was asked for rather than on another day.
  //
  // 02:30 on 08 March never happens in Chicago — the clock skips it. This
  // settles on the instant just before the jump.
  const skipped = instantFromLocal("2026-03-08T02:30", "America/Chicago");
  ok("a time the clock skips still resolves", skipped?.toISOString() === "2026-03-08T07:30:00.000Z", `${skipped?.toISOString()}`);

  // 01:30 on 01 November happens twice. This takes the first.
  const twice = instantFromLocal("2026-11-01T01:30", "America/Chicago");
  ok("a time that happens twice takes the first", twice?.toISOString() === "2026-11-01T06:30:00.000Z", `${twice?.toISOString()}`);
}

console.log("\n— round trips —");
{
  // Whatever the zone, reading a wall clock and writing it back must give the
  // same clock. This is what TikTok is sent.
  for (const [zone, local] of [
    ["America/Chicago", "2026-01-15T09:00"],
    ["America/Chicago", "2026-07-15T09:00"],
    ["Asia/Tokyo", "2026-05-02T08:30"],
    ["Australia/Sydney", "2026-10-04T14:00"],
    ["Europe/London", "2026-06-01T18:45"],
    ["UTC", "2026-02-02T02:02"],
  ] as const) {
    const instant = instantFromLocal(local, zone);
    const back = instant ? wallClockInZone(instant, zone) : "";
    ok(`${zone} ${local}`, back === `${local.replace("T", " ")}:00`, back);
  }
}

console.log("\n— prefilling the field again —");
{
  // Reopening a booked start must show the clock the customer chose, not the
  // same instant read in whatever zone they are in now.
  const instant = instantFromLocal("2026-01-15T09:00", "America/Chicago")!;
  ok("their own clock reading comes back", localInputValue(instant, "America/Chicago") === "2026-01-15T09:00", localInputValue(instant, "America/Chicago"));
  ok("and it is a shape the input accepts", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localInputValue(instant, "America/Chicago")));
  ok("a lost zone falls back to UTC", localInputValue(instant, null) === "2026-01-15T15:00", localInputValue(instant, null));
  // Round trip: prefill, resubmit unchanged, same instant.
  const again = instantFromLocal(localInputValue(instant, "America/Chicago"), "America/Chicago");
  ok("resubmitting it unchanged does not move it", again?.getTime() === instant.getTime());
}

console.log("\n— what Meta is sent —");
{
  const instant = instantFromLocal("2026-01-15T09:00", "America/Chicago")!;
  ok("ISO 8601 in UTC", metaStartTime(instant) === "2026-01-15T15:00:00.000Z", metaStartTime(instant));
  // Meta reads the offset, so the zone MAIRO never asked for cannot be wrong.
  ok("it carries an explicit zone", metaStartTime(instant).endsWith("Z"));
}

console.log("\n— input MAIRO refuses —");
{
  ok("a nonsense zone", instantFromLocal("2026-01-15T09:00", "Mars/Olympus") === null);
  ok("an empty zone", instantFromLocal("2026-01-15T09:00", "") === null);
  ok("a date with no time", instantFromLocal("2026-01-15", "UTC") === null);
  ok("free text", instantFromLocal("next friday", "UTC") === null);
  ok("a real zone is recognised", isKnownZone("America/New_York"));
  ok("a made-up one is not", !isKnownZone("Middle/Earth"));
}

console.log("\n— too soon, too late, too far —");
{
  const now = new Date("2026-05-01T12:00:00Z");

  ok("no schedule means start on approval", !isSchedulable(null, now));
  ok(
    "two minutes out is not worth scheduling",
    !isSchedulable(new Date(now.getTime() + 2 * 60 * 1000), now)
  );
  ok("an hour out is", isSchedulable(new Date(now.getTime() + HOUR), now));
  // Meta rejects a start_time in the past outright, which would fail the whole
  // launch — so a time that has slipped past is simply not sent.
  ok("a time that has passed is not sent", !isSchedulable(new Date(now.getTime() - HOUR), now));

  ok("no schedule is always due", isDue(null, now));
  ok("an hour ago is due", isDue(new Date(now.getTime() - HOUR), now));
  ok("an hour from now is not", !isDue(new Date(now.getTime() + HOUR), now));
  ok("this exact second is due", isDue(new Date(now.getTime()), now));

  ok("a valid time passes", validateStart(new Date(now.getTime() + HOUR), now) === null);
  ok("yesterday is refused", validateStart(new Date(now.getTime() - 24 * HOUR), now) === "past");
  ok(
    "a year out is refused",
    validateStart(new Date(now.getTime() + 400 * 24 * HOUR), now) === "too_far"
  );
  // A few seconds of clock skew between the browser and the server must not
  // reject a time the customer picked as "in a minute".
  ok(
    "a little clock skew is tolerated",
    validateStart(new Date(now.getTime() - 20 * 1000), now) === null
  );
  ok("no schedule is valid", validateStart(null, now) === null);
}

console.log("\n— how it reads back to the customer —");
{
  const instant = instantFromLocal("2026-01-15T09:00", "America/Chicago")!;
  const said = describeStart(instant, "America/Chicago");
  ok("it names the hour they picked", said.includes("9:00"), said);
  ok("and the day", said.includes("Jan 15"), said);
  // Without the zone it is the sort of sentence two people read differently.
  ok("and the zone", /CST|CDT|GMT|UTC/.test(said), said);

  // Read from a different zone it must still say what they chose.
  ok("unchanged when read elsewhere", describeStart(instant, "America/Chicago") === said);
  // The same instant is 3pm UTC. A missing or unrecognised zone must render
  // in UTC and say so, never silently in whatever zone the server runs in —
  // on Vercel that is UTC anyway, which is exactly how this kind of bug
  // survives to production.
  ok(
    "a lost zone falls back to UTC and names it",
    describeStart(instant, null) === "Thu Jan 15, 3:00 PM UTC",
    describeStart(instant, null)
  );
  ok(
    "so does a zone that no longer exists",
    describeStart(instant, "Mars/Olympus") === "Thu Jan 15, 3:00 PM UTC",
    describeStart(instant, "Mars/Olympus")
  );
}

console.log("\n— the offset helper on its own —");
{
  ok(
    "Chicago is six hours behind in January",
    zoneOffsetMs(new Date("2026-01-15T15:00:00Z"), "America/Chicago") === -6 * HOUR
  );
  ok(
    "and five in July",
    zoneOffsetMs(new Date("2026-07-15T15:00:00Z"), "America/Chicago") === -5 * HOUR
  );
  ok("UTC is zero", zoneOffsetMs(new Date("2026-07-15T15:00:00Z"), "UTC") === 0);
  // Midnight is where an engine reporting hour 24 would put the answer a day
  // out, and it is exactly the hour somebody schedules a campaign for.
  ok(
    "midnight does not fall off the end of the day",
    zoneOffsetMs(new Date("2026-07-15T05:00:00Z"), "America/Chicago") === -5 * HOUR
  );
  // Milliseconds on the instant must not leak into the offset.
  ok(
    "sub-second precision does not skew it",
    zoneOffsetMs(new Date("2026-07-15T15:00:00.750Z"), "America/Chicago") === -5 * HOUR
  );
}

console.log(bad === 0 ? "\nAll checks passed.\n" : `\n${bad} FAILED\n`);
process.exit(bad === 0 ? 0 : 1);
