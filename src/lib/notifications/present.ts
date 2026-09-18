import type { Notification } from "@/generated/prisma/client";
import type { BellItem } from "@/components/mairo/notification-bell";

// Turning rows into something the bell can render.
//
// Its own module because two screens need the same shape — the bell and the
// full centre — and because a Date crossing into a client component has to
// become a string somewhere. Doing it here means one format, rather than each
// screen inventing its own and the two disagreeing about what "2 hours ago"
// means.

/** How long ago, in the shortest form that is still unambiguous. */
export function whenLabel(date: Date, now = new Date()): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
  if (seconds < 90) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? "day" : "days"} ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function toBellItem(row: Notification, now = new Date()): BellItem {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    severity: row.severity,
    href: row.actionHref,
    actionLabel: row.actionLabel,
    createdAt: whenLabel(row.createdAt, now),
    read: row.readAt !== null,
  };
}
