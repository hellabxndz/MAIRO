// Meta's permission for MAIRO lasts about sixty days and can't be renewed
// without the business owner logging in again. Waiting for the first refused
// request to find out means a day or more where MAIRO can't read results or
// pause anything — while the ads keep spending. So it's said a week ahead.

export const EXPIRY_WARNING_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Notifications about one Meta connection's health; cleared on reconnect. */
export const META_CONNECTION_NOTICES = ["disconnected:META", "expiring:META"];

/** Whole days left, rounded up; null when there's no expiry or it has passed. */
export function daysLeft(expiresAt: Date | null | undefined, now = new Date()): number | null {
  if (!expiresAt) return null;
  const ms = expiresAt.getTime() - now.getTime();
  return ms > 0 ? Math.ceil(ms / DAY_MS) : null;
}

/** The warning to show, or null while there's more than a week left. */
export function expiryWarning(expiresAt: Date | null | undefined, now = new Date()): { days: number; text: string } | null {
  const days = daysLeft(expiresAt, now);
  if (days === null || days > EXPIRY_WARNING_DAYS) return null;
  const when = days <= 1 ? "within a day" : `in ${days} days`;
  return {
    days,
    text: `Meta's permission for MAIRO runs out ${when}. Reconnect to renew it — it takes a minute, and your campaigns and settings stay as they are.`,
  };
}
