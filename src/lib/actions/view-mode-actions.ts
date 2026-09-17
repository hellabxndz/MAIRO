"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { parseViewMode, VIEW_MODE_COOKIE } from "@/lib/view-mode";

/**
 * Switches between Simple and Advanced.
 *
 * Deliberately never throws. A server action's error is stripped in
 * production, so a thrown one reaches the customer as "an error occurred" with
 * nothing to act on — and this one cannot fail in a way worth reporting
 * anyway: the worst case is that the cookie does not stick and the interface
 * stays as it was.
 *
 * A year is long enough that nobody re-picks this, and it carries no personal
 * data, so it is not something a consent banner has to cover.
 */
export async function setViewMode(next: string): Promise<void> {
  const mode = parseViewMode(next);
  const jar = await cookies();
  jar.set(VIEW_MODE_COOKIE, mode, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: false,
  });
  // The layout reads the cookie during render, so every dashboard screen has
  // to be re-rendered rather than just the one the toggle was clicked on.
  revalidatePath("/dashboard", "layout");
}
