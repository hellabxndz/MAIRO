import { expect, test, type Browser, type Page } from "@playwright/test";
import { latestLink, onboard, PASSWORD, signIn, signUp, uniqueEmail } from "./helpers";

/*
 * Phase 1 end-to-end: real Supabase Auth (GoTrue), real PostgREST + RLS,
 * real emails (captured by the SMTP sink), the real Next.js app.
 */

const owner = { name: "Olivia Owner", email: uniqueEmail("owner") };
const agent = { name: "Sam Support", email: uniqueEmail("agent") };
const rival = { name: "Rick Rival", email: uniqueEmail("rival") };
let inviteUrl = "";

async function newPage(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext();
  return ctx.newPage();
}

test.describe.serial("Phase 1", () => {
  test("landing page renders every section and the demo uses sample data", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Your Business Never Stops.");
    await expect(page.getByRole("heading", { name: /Neither Should Your AI Employee/ })).toBeVisible();
    for (const id of ["what-is", "features", "how-it-works", "demo", "pricing", "faq"]) {
      await expect(page.locator(`#${id}`)).toBeAttached();
    }
    for (const price of ["$149", "$299", "$499", "From $999"]) {
      await expect(page.locator("#pricing")).toContainText(price);
    }
    await expect(page.getByText("Your Next Employee")).toBeVisible();
    await expect(page.getByRole("link", { name: /Hire Your AI Employee/ })).toBeVisible();

    await page.getByRole("button", { name: "“Do you have these jeans in size 32?”" }).click();
    await expect(page.getByText("Let me check that for you.")).toBeVisible();
    await expect(page.getByText("Classic Straight Jean", { exact: true })).toBeVisible({ timeout: 8000 });
    await expect(page.locator("#demo")).toContainText("sample data");
    await expect(page.locator("#demo")).toContainText("not real merchant inventory");
    await page.screenshot({ path: "test-results/desktop-landing.png", fullPage: true });
  });

  test("signed-out users are sent to login", async ({ page }) => {
    await page.goto("/dashboard/team");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%2Fteam/);
  });

  test("owner signs up, verifies email and completes onboarding", async ({ page }) => {
    await signUp(page, owner.name, owner.email);
    await expect(page).toHaveURL(/\/onboarding/);
    await onboard(page, "Acme Denim");

    await expect(page.getByText("Welcome back, Olivia")).toBeVisible();
    await expect(page.getByText("Nova isn't live yet.")).toBeVisible();
    // An untested assistant can't be switched on.
    await expect(page.getByRole("button", { name: "Activate AI" })).toBeDisabled();
    // Real zeros, and an honest empty activity feed.
    await expect(page.getByText("No activity yet")).toBeVisible();
    await expect(page.locator('[aria-label="Key metrics"]')).toContainText("0");
    await page.screenshot({ path: "test-results/desktop-dashboard.png", fullPage: true });
  });

  test("onboarding progress is saved and resumable", async ({ page }) => {
    await signIn(page, owner.email);
    await page.goto("/onboarding?step=6");
    await expect(page.getByLabel("Shipping policy")).toHaveValue("We ship in 3-5 business days.");
    await expect(page.getByLabel("Instructions for your AI employee")).toHaveValue("Speak casually. Do not invent shipping dates.");
    await page.goto("/dashboard/knowledge");
    await expect(page.getByRole("row").filter({ hasText: "Shipping policy" })).toHaveCount(1);
    await expect(page.getByRole("row").filter({ hasText: "Return policy" })).toHaveCount(1);
    // Refunds were left empty, so no document was created for them.
    await expect(page.getByRole("row").filter({ hasText: "Refund policy" })).toHaveCount(0);
  });

  test("view preference, settings and AI employee page", async ({ page }) => {
    await signIn(page, owner.email);
    await expect(page).toHaveURL(/\/dashboard/);
    await page.getByRole("radio", { name: "advanced" }).click();
    await expect(page.getByText("System status")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("radio", { name: "advanced" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText("System status")).toBeVisible();
    await page.getByRole("radio", { name: "simple" }).click();
    await expect(page.getByText("System status")).toBeHidden();

    await page.goto("/dashboard/settings");
    await page.getByLabel("Customer support email").fill("help@acme.example");
    await page.getByLabel("Keep conversations for (days)").fill("10");
    await page.getByRole("button", { name: "Save support settings" }).click();
    await expect(page.getByText("At least 30 days")).toBeVisible();
    await page.getByLabel("Keep conversations for (days)").fill("180");
    await page.getByRole("button", { name: "Save support settings" }).click();
    await expect(page.getByText("Support settings saved.")).toBeVisible();

    await page.goto("/dashboard/ai-employee");
    await expect(page.getByRole("heading", { name: "Nova" })).toBeVisible();
    await expect(page.getByText("Speak casually. Do not invent shipping dates.")).toBeVisible();
  });

  test("owner invites a support agent", async ({ page }) => {
    await signIn(page, owner.email);
    await page.goto("/dashboard/team");
    await page.getByLabel("Email").fill(agent.email);
    await page.getByLabel("Role").selectOption("support_agent");
    await page.getByRole("button", { name: "Send invite" }).click();
    const code = page.locator("code", { hasText: "/invite/" });
    await expect(code).toBeVisible();
    inviteUrl = (await code.textContent())!.trim();
    expect(inviteUrl).toMatch(/^http:\/\/localhost:3100\/invite\/[A-Za-z0-9_-]{40,}$/);
    await expect(page.getByText("Pending invitations")).toBeVisible();
  });

  test("a different account cannot use someone else's invitation", async ({ browser }) => {
    const page = await newPage(browser);
    await signUp(page, rival.name, rival.email);
    await onboard(page, "Rival Goods");
    await page.goto(new URL(inviteUrl).pathname);
    await page.getByRole("button", { name: "Accept invitation" }).click();
    await expect(page.getByText("sent to a different email address")).toBeVisible();
    // Rival still only sees its own business.
    await page.goto("/dashboard");
    await expect(page.getByRole("button", { name: /Rival Goods/ })).toBeVisible();
    await page.getByRole("button", { name: /Rival Goods/ }).click();
    await expect(page.getByRole("option")).toHaveCount(1);
  });

  test("agent joins through the invitation and is limited to support functions", async ({ browser }) => {
    const page = await newPage(browser);
    const path = new URL(inviteUrl).pathname;
    await signUp(page, agent.name, agent.email, path);
    await expect(page).toHaveURL(new RegExp(path));
    await page.getByRole("button", { name: "Accept invitation" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("button", { name: /Acme Denim/ })).toContainText("Support Agent");

    const nav = page.getByRole("navigation", { name: "Dashboard" }).first();
    await expect(nav.getByRole("link", { name: "AI Inbox" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Customers" })).toBeVisible();
    for (const hidden of ["Billing", "Settings", "Team", "Analytics", "Integrations"]) {
      await expect(nav.getByRole("link", { name: hidden, exact: true })).toHaveCount(0);
    }
    // No activation control for agents, and no analytics-derived metrics.
    await expect(page.getByRole("button", { name: /Activate AI|Pause AI|Resume AI/ })).toHaveCount(0);
    await expect(page.getByText("AI-assisted revenue")).toHaveCount(0);

    // Direct URL access is refused server-side.
    for (const url of ["/dashboard/billing", "/dashboard/settings", "/dashboard/team", "/dashboard/analytics"]) {
      await page.goto(url);
      await expect(page).toHaveURL(/\/dashboard\?denied=1/);
    }
    const res = await page.request.get("/dashboard/analytics/export?range=30d");
    expect(res.status()).toBe(403);
  });

  test("owner changes the agent's role and the change applies immediately", async ({ page, browser }) => {
    await signIn(page, owner.email);
    await page.goto("/dashboard/team");
    const row = page.getByRole("listitem").filter({ hasText: agent.email });
    await row.getByLabel("Role").selectOption("admin");
    await expect(row.getByText("Role updated.")).toBeVisible();

    const agentPage = await newPage(browser);
    await signIn(agentPage, agent.email);
    await agentPage.goto("/dashboard/analytics");
    await expect(agentPage.getByRole("heading", { name: "Analytics" })).toBeVisible();
    await agentPage.goto("/dashboard/billing");
    await expect(agentPage.getByRole("heading", { name: "Billing" })).toBeVisible();
    // Admins still can't manage the team.
    await agentPage.goto("/dashboard/team");
    await expect(agentPage.getByRole("heading", { name: "Invite a teammate" })).toHaveCount(0);

    await page.reload();
    await page.getByRole("listitem").filter({ hasText: agent.email }).getByRole("button", { name: "Remove" }).click();
    await page.getByRole("button", { name: "Confirm remove" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: agent.email })).toHaveCount(0);

    await agentPage.goto("/dashboard");
    await expect(agentPage).toHaveURL(/\/onboarding/);
  });

  test("the last owner cannot leave or be demoted", async ({ page }) => {
    await signIn(page, owner.email);
    await page.goto("/dashboard/team");
    const me = page.getByRole("listitem").filter({ hasText: "(you)" });
    await me.getByRole("button", { name: "Leave business" }).click();
    await expect(page.getByText("You're the only owner")).toBeVisible();
  });

  test("password change, sign out and sign back in", async ({ page }) => {
    await signIn(page, owner.email);
    await page.goto("/account");
    await page.getByLabel("Current password").fill("wrong-password-1");
    await page.getByLabel("New password", { exact: true }).fill("brand-new-pass-77");
    await page.getByLabel("Confirm new password").fill("brand-new-pass-77");
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByText("That isn't your current password.")).toBeVisible();

    await page.getByLabel("Current password").fill(PASSWORD);
    await page.getByLabel("New password", { exact: true }).fill("brand-new-pass-77");
    await page.getByLabel("Confirm new password").fill("brand-new-pass-77");
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByText("Password changed.")).toBeVisible();
    await expect(page.getByText("This device")).toBeVisible();

    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Sign out" }).first().click();
    await expect(page).toHaveURL(/\/login\?notice=signed-out/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);

    await signIn(page, owner.email, PASSWORD, false);
    await expect(page.getByText("Incorrect email or password.")).toBeVisible();
    await signIn(page, owner.email, "brand-new-pass-77");
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("forgot password sends a working reset link", async ({ page }) => {
    const started = Date.now();
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(owner.email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText("If an account exists for that email")).toBeVisible();

    await page.goto(await latestLink(owner.email, { after: started, match: /type=recovery/ }));
    await expect(page).toHaveURL(/\/reset-password/);
    await page.getByLabel("New password", { exact: true }).fill("reset-pass-2026");
    await page.getByLabel("Confirm new password").fill("reset-pass-2026");
    await page.getByRole("button", { name: "Set new password" }).click();
    await expect(page).toHaveURL(/\/dashboard\?notice=password-updated/);
    await expect(page.getByText("Your password was updated")).toBeVisible();
  });

  test("an expired or reused email link is rejected", async ({ page }) => {
    await page.goto("/auth/confirm?token_hash=not-a-real-token&type=recovery");
    await expect(page).toHaveURL(/\/login\?error=link-expired/);
    await expect(page.getByText("That link has expired or was already used.")).toBeVisible();
  });

  test("a forged active-business cookie cannot switch tenants", async ({ page, context }) => {
    await signIn(page, rival.email);
    await expect(page).toHaveURL(/\/dashboard/);
    // Point the cookie at a business the rival does not belong to.
    await context.addCookies([{ name: "ma_business", value: "00000000-0000-0000-0000-000000000000", url: "http://localhost:3100" }]);
    await page.goto("/dashboard/settings");
    await expect(page.getByLabel("Business name")).toHaveValue("Rival Goods");
  });

  test("mobile layout: landing and dashboard", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto("/");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: "test-results/mobile-landing.png", fullPage: false });

    await signIn(page, rival.email);
    await expect(page).toHaveURL(/\/dashboard/);
    await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(page.getByRole("dialog", { name: "Navigation" }).getByRole("link", { name: "AI Inbox" })).toBeVisible();
    await page.screenshot({ path: "test-results/mobile-dashboard-nav.png" });
    await page.getByRole("dialog", { name: "Navigation" }).getByRole("button", { name: "Close navigation" }).click();
    const dashOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(dashOverflow).toBeLessThanOrEqual(0);
    await ctx.close();
  });
});
