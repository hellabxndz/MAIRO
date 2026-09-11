"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// Remembering that somebody has been shown around.
//
// Against the user row rather than the browser, because "show this once" means
// once per person and localStorage cannot know who is signed in. The old
// version got this wrong in both directions: the tour came back for the same
// person on a new device, in a private window, or after they cleared site
// data — and on a shared browser the second account to sign in inherited the
// first one's flag and was never shown it at all.

export async function completeTourAction(): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) return;

  await db.user
    .update({
      where: { id: session.user.id },
      // Only ever set once. Re-running the tour on purpose from the sidebar
      // should not move the date — it is a record of the first time, not the
      // last, and nothing should make the automatic offer come back.
      data: { tourCompletedAt: new Date() },
    })
    .catch(() => {
      // Losing this costs one extra offer of the tour on the next visit. Not
      // worth failing the interaction the customer is actually having.
    });
}

/** Whether this person has already been shown around. */
export async function hasSeenTour(): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) return true;

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { tourCompletedAt: true },
  });
  // An unreadable answer counts as seen. Somebody who has used MAIRO for
  // months being walked through the sidebar again is a worse failure than
  // a first-timer missing it.
  return Boolean(user?.tourCompletedAt);
}
