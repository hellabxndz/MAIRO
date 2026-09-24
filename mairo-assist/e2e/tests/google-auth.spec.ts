import { expect, test } from "@playwright/test";

/*
 * "Continue with Google": the app hands off to Supabase Auth (GoTrue), which
 * redirects to Google with our client ID and its own callback. Google itself
 * is intercepted here — the real consent screen can't run in tests.
 */

test.use({ extraHTTPHeaders: { "x-forwarded-for": "10.30.0.3" } });

test("sign-up and sign-in offer Google, and the hand-off goes to Google via Supabase", async ({ page }) => {
  await page.goto("/signup");
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();

  await page.goto("/login?next=%2Fdashboard%2Fteam");
  // Redirect targets can't be intercepted, so watch for the request instead.
  const toGoogle = page.waitForRequest((req) => req.url().startsWith("https://accounts.google.com/"));
  await page.getByRole("button", { name: "Continue with Google" }).click();
  const url = new URL((await toGoogle).url());

  expect(url.searchParams.get("client_id")).toBe("e2e-google-client");
  expect(url.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:54321/auth/v1/callback");
  expect(url.searchParams.get("prompt")).toBe("select_account");
  expect(url.searchParams.get("state")).toBeTruthy();
});

test("cancelling on Google's screen, or a bad code, returns to sign-in with a clear message", async ({ page }) => {
  await page.goto("/auth/callback?error=access_denied&error_description=user+cancelled");
  await expect(page).toHaveURL(/\/login\?error=oauth-cancelled/);
  await expect(page.getByText("Google sign-in was cancelled.")).toBeVisible();

  await page.goto("/auth/callback?code=not-a-real-code");
  await expect(page).toHaveURL(/\/login\?error=oauth-failed/);
  await expect(page.getByText("We couldn't sign you in with Google.")).toBeVisible();

  // An open redirect through `next` is refused.
  await page.goto("/auth/callback?error=server_error&next=https://evil.example");
  await expect(page).toHaveURL(/\/login\?error=oauth-failed/);
});
