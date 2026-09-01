import { cookies } from "next/headers";

// "Explore first" lets someone see the dashboard before connecting Meta.
//
// The funnel is still signup -> onboarding -> connect Meta: that is the path
// the app pushes everyone down, and nothing that spends money works without a
// real connection. This only lets a visitor look around first, which is also
// the only way someone without a role on the Meta app can see the product at
// all — Meta blocks the ad-account connection itself for anyone who is not a
// listed tester until App Review approves the app.
//
// It lives in a cookie rather than the database on purpose. It is a per-browser
// viewing preference, not a property of the business, and keeping it out of the
// schema means removing this feature later is deleting code, not migrating
// data.

const COOKIE = "mairo_explore";

export async function isExploring(): Promise<boolean> {
  return (await cookies()).get(COOKIE)?.value === "1";
}

export async function startExploring(): Promise<void> {
  (await cookies()).set(COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function stopExploring(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
