// Turning "Friday at 9am" into something a network will accept.
//
// A start time is the one piece of input in MAIRO where getting the arithmetic
// slightly wrong is invisible in testing and expensive in production: an ad
// set that starts eight hours early spends a day's budget overnight, and the
// customer's only evidence is a charge.
//
// So the rules here are narrow and deliberate.
//
// What is stored is an absolute instant, never a wall-clock string. "9am" is
// not a time; "9am in America/Chicago" is. The zone is kept alongside it only
// so every screen can echo back the time they actually picked rather than
// re-rendering it in whatever zone the current device happens to be in — a
// customer who books a launch from their laptop and checks it on holiday
// should not see a different hour.
//
// Nothing here calls a network or touches the database, which is what makes it
// testable — see scripts/check-schedule.ts.

/** A wall-clock time as an <input type="datetime-local"> produces it. */
const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * How far ahead of UTC a zone was at a given instant, in milliseconds.
 *
 * Derived by asking Intl what the wall clock read there and comparing it to
 * what it read in UTC. Doing it this way rather than from a table means DST is
 * handled by the platform's own tz database and stays right when the rules
 * change — several countries move their clocks by political decision at a few
 * months' notice.
 */
export function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  // Some engines render midnight as hour 24 with hour12:false. Left unhandled
  // this makes one hour a day land on the wrong date.
  const hour = get("hour") % 24;

  const wallAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    hour,
    get("minute"),
    get("second")
  );
  // Whole seconds on both sides, so the instant's milliseconds don't leak into
  // the offset and make it a few hundred off a round number.
  return wallAsUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * Reads a wall-clock time in a named zone as an absolute instant.
 *
 * Two passes, because the offset depends on the answer: the first guess uses
 * the offset at the same clock reading in UTC, which is wrong by an hour for
 * times within a day of a DST change. Re-reading the offset at the corrected
 * instant fixes it.
 *
 * Returns null for anything it cannot read, including an unknown zone. A
 * refused start time is a form error; a guessed one is a campaign that starts
 * at the wrong hour.
 */
export function instantFromLocal(local: string, timeZone: string): Date | null {
  const m = LOCAL_RE.exec(local.trim());
  if (!m) return null;

  const [, y, mo, d, h, mi, sec] = m;
  const wallAsUtc = Date.UTC(+y, +mo - 1, +d, +h, +mi, sec ? +sec : 0);
  if (!Number.isFinite(wallAsUtc)) return null;

  if (!isKnownZone(timeZone)) return null;

  const firstGuess = new Date(wallAsUtc - zoneOffsetMs(new Date(wallAsUtc), timeZone));
  const settled = new Date(wallAsUtc - zoneOffsetMs(firstGuess, timeZone));
  return Number.isFinite(settled.getTime()) ? settled : null;
}

/** Whether the platform's tz database recognises this zone. */
export function isKnownZone(timeZone: string): boolean {
  if (!timeZone || typeof timeZone !== "string") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/**
 * The same instant written as a wall clock in a zone, as networks want it.
 *
 * TikTok takes "YYYY-MM-DD HH:MM:SS" with no offset, read in the advertiser's
 * own timezone. Meta takes ISO 8601 and is given UTC instead — see
 * `metaStartTime` below.
 */
export function wallClockInZone(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  const hour = String(Number(get("hour")) % 24).padStart(2, "0");
  return `${get("year")}-${get("month")}-${get("day")} ${hour}:${get("minute")}:${get("second")}`;
}

/**
 * The same instant as an <input type="datetime-local"> value.
 *
 * Used to prefill the field when somebody reopens a booked start, so it shows
 * the clock reading they originally chose rather than the same instant
 * translated into whatever zone they happen to be in today.
 */
export function localInputValue(instant: Date, timeZone: string | null): string {
  const zone = timeZone && isKnownZone(timeZone) ? timeZone : "UTC";
  // "2026-01-15 09:00:00" -> "2026-01-15T09:00"
  return wallClockInZone(instant, zone).replace(" ", "T").slice(0, 16);
}

/**
 * What Meta is sent as an ad set's start_time.
 *
 * ISO 8601 in UTC, with the Z. Meta accepts an offset and converts into the ad
 * account's own timezone itself, which is safer than MAIRO guessing what that
 * timezone is — get that wrong and every scheduled campaign is hours out.
 */
export function metaStartTime(instant: Date): string {
  return instant.toISOString();
}

/**
 * How long before a start time is too close to be worth scheduling.
 *
 * Meta rejects a start_time in the past, and a campaign being built takes a
 * few seconds of round trips, so a time that has already arrived by the time
 * the ad set is created would fail the whole launch over something the
 * customer meant as "now".
 */
export const TOO_SOON_MS = 5 * 60 * 1000;

/**
 * Whether this start time is far enough out to send to a network.
 *
 * False means "start it as soon as it is approved", which is both what the
 * customer asked for and what the networks do by default.
 */
export function isSchedulable(
  startAt: Date | null | undefined,
  now: Date = new Date()
): startAt is Date {
  if (!startAt) return false;
  return startAt.getTime() - now.getTime() > TOO_SOON_MS;
}

/** Whether a scheduled start has arrived. Null — no schedule — is always due. */
export function isDue(startAt: Date | null | undefined, now: Date = new Date()): boolean {
  if (!startAt) return true;
  return startAt.getTime() <= now.getTime();
}

/**
 * The chosen start, written the way the customer would say it.
 *
 * Rendered in the zone they picked it in rather than the reader's, and the
 * zone is named, because "Friday 9:00 AM" with no zone is exactly the sort of
 * thing two people read differently.
 */
export function describeStart(startAt: Date, timeZone: string | null): string {
  const zone = timeZone && isKnownZone(timeZone) ? timeZone : "UTC";
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(startAt);
  // Intl puts a comma between the date and the time; the sentence reads better
  // without the one after the weekday.
  return formatted.replace(/^(\w{3}),/, "$1");
}

/**
 * How far out a customer may schedule.
 *
 * Six months, which is past any campaign anyone plans this way and short
 * enough that a typo in the year is caught rather than silently accepted as a
 * campaign that starts in 2087.
 */
export const MAX_AHEAD_MS = 183 * 24 * 60 * 60 * 1000;

export type ScheduleProblem = "unreadable" | "past" | "too_far";

/** Checks a requested start and says what is wrong with it, if anything. */
export function validateStart(
  startAt: Date | null,
  now: Date = new Date()
): ScheduleProblem | null {
  if (!startAt) return null;
  if (!Number.isFinite(startAt.getTime())) return "unreadable";
  if (startAt.getTime() < now.getTime() - 60 * 1000) return "past";
  if (startAt.getTime() > now.getTime() + MAX_AHEAD_MS) return "too_far";
  return null;
}

export const SCHEDULE_PROBLEM_MESSAGE: Record<ScheduleProblem, string> = {
  unreadable: "MAIRO couldn't read that start time. Pick a date and time again.",
  past: "That start time has already passed. Pick one in the future, or let it start as soon as Meta approves it.",
  too_far: "That's more than six months out. Pick something sooner.",
};
